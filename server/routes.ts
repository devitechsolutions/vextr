import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
// Use Vtiger storage singleton which extends database storage and includes sync functionality
import { vtigerStorage as storage, VtigerStorage } from "./storage-vtiger";
import { z } from "zod";
import { 
  insertCandidateSchema, 
  insertClientSchema, 
  insertVacancySchema, 
  insertTodoSchema, 
  insertKpiTargetsSchema,
  insertInterviewSchema,
  insertCandidateStatusSchema,
  insertCandidateNoteSchema,
  insertPlacementSchema,
  InsertCandidate,
  CandidateStatus,
  syncMetadata
} from "@shared/schema";
import { db } from "./db";
import { desc } from "drizzle-orm";
import OpenAI from "openai";
import { vtigerRouter } from "./vtiger-api";
import { vtigerSyncRouter } from "./sync/vtiger-controller";
import { cvParserRouter } from "./cv-parser";
import { vacancyParserRouter } from "./vacancy-parser";
import { inviteAuthRouter } from "./invite-auth-routes";
import { debugVtigerContact } from "./debug-vtiger";
import { authenticateToken, optionalAuthentication, requireRole } from "./auth-middleware";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";
import path from "path";
import { 
  ObjectStorageService, 
  ObjectNotFoundError 
} from "./objectStorage";
import { DashboardService } from "./services/dashboard-service";
import { aiClientEnhancer } from "./services/ai-client-enhancer";
import { PlacementService } from "./services/placement-service";
import { priorityEngine } from "./services/priority-engine";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000 // 30 second timeout to prevent hanging requests
    })
  : null;

// Initialize placement service
const placementService = new PlacementService(storage);

// Removed unused vacancyUpload - now handled by vacancyParserRouter

export async function registerRoutes(app: Express): Promise<Server> {
  // Debug endpoint to test routing
  app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working!', timestamp: new Date().toISOString() });
  });

  // Debug auth endpoint to confirm authentication is working
  app.get('/api/auth/debug', authenticateToken, (req, res) => {
    res.json({
      hasCookie: Boolean(req.cookies?.['token']),
      cookies: req.cookies,
      user: req.user ?? null,
      message: 'Authentication working correctly'
    });
  });

  // Debug endpoint to check cookies without auth requirement
  app.get('/api/debug/cookies', (req, res) => {
    res.json({
      cookies: req.cookies,
      headers: {
        cookie: req.headers.cookie,
        authorization: req.headers.authorization
      }
    });
  });

  // API routes - protected with authentication
  app.get("/api/candidates", optionalAuthentication, async (req, res) => {
    try {
      const candidates = await storage.getCandidates();
      console.log(`[FIELD-FIX-DEBUG] API: Returning ${candidates.length} candidates to frontend`);
      
      // Check specific candidates we know have data from database
      const candidatesWith52 = candidates.find(c => c.id === 52);
      if (candidatesWith52) {
        console.log(`[FIELD-FIX-DEBUG] Candidate ID 52 (Juan Romero): titleDescription="${candidatesWith52.titleDescription}", profileSummary="${candidatesWith52.profileSummary}"`);
      }
      
      const candidatesWith94 = candidates.find(c => c.id === 94);
      if (candidatesWith94) {
        console.log(`[FIELD-FIX-DEBUG] Candidate ID 94 (Guillaume): titleDescription="${candidatesWith94.titleDescription}", profileSummary="${candidatesWith94.profileSummary}"`);
      }
      
      res.json(candidates);
    } catch (error) {
      console.error("API candidates error:", error);
      res.status(500).json({ message: "Failed to get candidates" });
    }
  });
  
  app.get("/api/candidates/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const candidate = await storage.getCandidate(id);
      if (!candidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      res.json(candidate);
    } catch (error) {
      res.status(500).json({ message: "Failed to get candidate" });
    }
  });
  
  // Get candidate vacancy assignments
  app.get("/api/candidates/:id/vacancy-assignments", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      console.log(`[VACANCY-ASSIGNMENT-DEBUG] API: Fetching assignments for candidate ID ${candidateId}`);
      const assignments = await storage.getCandidateVacancyAssignments(candidateId);
      console.log(`[VACANCY-ASSIGNMENT-DEBUG] API: Found ${assignments.length} assignments for candidate ID ${candidateId}`);
      res.json(assignments);
    } catch (error) {
      console.error("Failed to get candidate vacancy assignments:", error);
      res.status(500).json({ message: "Failed to get candidate vacancy assignments" });
    }
  });

  // Create candidate vacancy assignment
  app.post("/api/candidates/:id/vacancy-assignments", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const { vacancyId, status = 'assigned' } = req.body;
      
      if (!vacancyId) {
        return res.status(400).json({ message: "vacancyId is required" });
      }
      
      // Create the assignment using candidate status system
      const assignmentData = {
        candidateId,
        vacancyId: parseInt(vacancyId),
        status,
        userId: req.user?.id || 1
      };
      
      const assignment = await storage.createCandidateStatus(assignmentData);
      res.status(201).json(assignment);
    } catch (error) {
      console.error("Failed to create candidate vacancy assignment:", error);
      res.status(500).json({ message: "Failed to create candidate vacancy assignment" });
    }
  });

  // Remove candidate vacancy assignment
  app.delete("/api/candidates/:candidateId/vacancy-assignments/:vacancyId", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.candidateId);
      const vacancyId = parseInt(req.params.vacancyId);
      
      const success = await storage.deleteCandidateStatus(candidateId, vacancyId);
      if (!success) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      res.json({ message: "Assignment removed successfully" });
    } catch (error) {
      console.error("Failed to remove candidate vacancy assignment:", error);
      res.status(500).json({ message: "Failed to remove candidate vacancy assignment" });
    }
  });

  // Batch assign vacancy to multiple candidates
  app.post("/api/batch/vacancy-assignments", authenticateToken, async (req, res) => {
    try {
      const { candidateIds, vacancyId, status = 'assigned' } = req.body;
      
      if (!candidateIds || !Array.isArray(candidateIds) || !vacancyId) {
        return res.status(400).json({ message: "candidateIds (array) and vacancyId are required" });
      }
      
      const assignments = [];
      const userId = req.user?.id || 1;
      
      // Process all assignments
      for (const candidateId of candidateIds) {
        try {
          const assignmentData = {
            candidateId: parseInt(candidateId),
            vacancyId: parseInt(vacancyId),
            status,
            userId
          };
          
          const assignment = await storage.createCandidateStatus(assignmentData);
          assignments.push(assignment);
        } catch (error) {
          console.error(`Failed to assign candidate ${candidateId} to vacancy ${vacancyId}:`, error);
          // Continue with other assignments even if one fails
        }
      }
      
      res.status(201).json({ 
        message: `Successfully assigned ${assignments.length} candidates to vacancy`,
        assignments 
      });
    } catch (error) {
      console.error("Failed to batch assign candidates to vacancy:", error);
      res.status(500).json({ message: "Failed to batch assign candidates to vacancy" });
    }
  });

  // Batch remove vacancy assignments from multiple candidates
  app.delete("/api/batch/vacancy-assignments", authenticateToken, async (req, res) => {
    try {
      const { candidateIds, vacancyId } = req.body;
      
      if (!candidateIds || !Array.isArray(candidateIds) || !vacancyId) {
        return res.status(400).json({ message: "candidateIds (array) and vacancyId are required" });
      }
      
      let successCount = 0;
      
      // Process all removals
      for (const candidateId of candidateIds) {
        try {
          const success = await storage.deleteCandidateStatus(parseInt(candidateId), parseInt(vacancyId));
          if (success) {
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to remove assignment for candidate ${candidateId} from vacancy ${vacancyId}:`, error);
          // Continue with other removals even if one fails
        }
      }
      
      res.json({ 
        message: `Successfully removed ${successCount} candidate assignments from vacancy`,
        successCount 
      });
    } catch (error) {
      console.error("Failed to batch remove candidate assignments:", error);
      res.status(500).json({ message: "Failed to batch remove candidate assignments" });
    }
  });
  
  // REMOVED: Candidate creation endpoint
  // The platform should ONLY display candidates from VTiger CRM
  // Local candidate creation is not allowed
  
  app.put("/api/candidates/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Log the incoming data for debugging
      console.log("Updating candidate:", id, "with data:", req.body);
      
      // For status updates, we'll be more lenient with validation
      const updateData: Partial<InsertCandidate> = {};
      
      // Handle status update specifically
      if (req.body.status) {
        updateData.status = req.body.status;
      }
      
      // Handle skills conversion from string to array if needed
      if (req.body.skills) {
        if (typeof req.body.skills === 'string') {
          updateData.skills = req.body.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        } else if (Array.isArray(req.body.skills)) {
          updateData.skills = req.body.skills;
        }
      }
      
      // Copy other fields that might be updated
      const allowedFields = [
        'firstName', 'lastName', 'email', 'phone', 'jobTitle', 'titleDescription', 
        'profileSummary', 'company', 'companyLocation', 'branche', 'location',
        'durationCurrentRole', 'durationAtCompany', 'pastEmployer', 'pastRoleTitle',
        'pastExperienceDuration', 'currentTitle', 'targetRole', 'education',
        'availability', 'resume', 'cvUrl', 'linkedinUrl', 'notes', 'source',
        'salaryRangeMin', 'salaryRangeMax', 'salaryCurrency'
      ];
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          (updateData as any)[field] = req.body[field];
        }
      }
      
      const updatedCandidate = await storage.updateCandidate(id, updateData);
      if (!updatedCandidate) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      
      // Check if candidate was placed and create placement record automatically
      if (req.body.status === "Placed" && req.body.vacancyId && req.user?.id) {
        try {
          console.log(`🎉 Candidate ${updatedCandidate.id} was placed! Creating placement record...`);
          
          const placementResult = await placementService.createPlacementFromCandidateStatus(
            updatedCandidate.id,
            parseInt(req.body.vacancyId),
            req.user.id,
            {
              employmentType: req.body.employmentType || "permanent",
              startDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
              notes: req.body.placementNotes || `Placement created automatically from candidate status change to "Placed"`
            }
          );
          
          console.log(`✅ Created placement ${placementResult.placement.id} and revenue tracking todo ${placementResult.revenueTrackingTodo.id}`);
        } catch (placementError) {
          console.error("Error creating placement record:", placementError);
          // Don't fail the candidate update if placement creation fails
        }
      }
      
      console.log("Successfully updated candidate:", updatedCandidate.id, "with status:", updatedCandidate.status);
      res.json(updatedCandidate);
    } catch (error) {
      console.error("Failed to update candidate:", error);
      res.status(500).json({ message: "Failed to update candidate", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Search candidates by name endpoint
  app.get("/api/candidates/search", authenticateToken, async (req, res) => {
    try {
      const { q: searchQuery } = req.query;
      
      if (!searchQuery || typeof searchQuery !== 'string') {
        return res.status(400).json({ error: "Search query is required" });
      }
      
      const allCandidates = await storage.getCandidates();
      const query = searchQuery.toLowerCase();
      
      // Search candidates by first name, last name, or full name
      const matchedCandidates = allCandidates.filter(candidate => {
        const firstName = (candidate.firstName || '').toLowerCase();
        const lastName = (candidate.lastName || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        
        return firstName.includes(query) || 
               lastName.includes(query) || 
               fullName.includes(query);
      }).slice(0, 10); // Limit to 10 results
      
      res.json(matchedCandidates);
    } catch (error) {
      console.error("Error searching candidates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/candidates/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteCandidate(id);
      if (!success) {
        return res.status(404).json({ message: "Candidate not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete candidate" });
    }
  });

  // CV viewing endpoint - serves CV files properly for viewing
  app.get("/api/candidates/:id/cv", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const candidate = await storage.getCandidate(candidateId);
      
      if (!candidate || !candidate.cvUrl) {
        return res.status(404).json({ error: "CV not found" });
      }

      // Get the CV file from object storage and stream it
      const objectStorageService = new ObjectStorageService();
      try {
        const objectPath = objectStorageService.normalizeObjectEntityPath(candidate.cvUrl);
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        
        // Stream the file directly to the response
        objectStorageService.downloadObject(objectFile, res);
      } catch (error) {
        console.error("Error fetching CV:", error);
        res.status(404).json({ error: "CV file not accessible" });
      }
    } catch (error) {
      console.error("Error serving CV:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Formatted CV viewing endpoint - serves formatted CV files for viewing
  app.get("/api/candidates/:id/formatted-cv", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const candidate = await storage.getCandidate(candidateId);

      if (!candidate || !candidate.formattedCvUrl) {
        return res.status(404).json({ error: "Formatted CV not found" });
      }

      // Get the formatted CV file from object storage and stream it
      const objectStorageService = new ObjectStorageService();
      try {
        const objectPath = objectStorageService.normalizeObjectEntityPath(candidate.formattedCvUrl);
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        objectStorageService.downloadObject(objectFile, res);
      } catch (storageError) {
        console.error("Error fetching formatted CV:", storageError);
        res.status(404).json({ error: "Formatted CV file not accessible" });
      }
    } catch (error) {
      console.error("Error serving formatted CV:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // CV deletion endpoint - removes CV file and clears the cvUrl field
  app.delete("/api/candidates/:id/cv", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const candidate = await storage.getCandidate(candidateId);
      
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      if (!candidate.cvUrl) {
        return res.status(400).json({ error: "No CV found to delete" });
      }

      // Delete the CV file from object storage
      const objectStorageService = new ObjectStorageService();
      try {
        const objectPath = objectStorageService.normalizeObjectEntityPath(candidate.cvUrl);
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        
        // Delete the file from object storage
        await objectFile.delete();
      } catch (error) {
        console.error("Error deleting CV file:", error);
        // Continue even if file deletion fails - we'll still clear the URL
      }

      // Clear the cvUrl field in the database
      const updatedCandidate = await storage.updateCandidate(candidateId, { cvUrl: null });
      
      res.json({ success: true, message: "CV deleted successfully", candidate: updatedCandidate });
    } catch (error) {
      console.error("Error deleting CV:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Candidate Notes API routes
  app.get("/api/candidates/:candidateId/notes", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.candidateId);
      const notes = await storage.getCandidateNotes(candidateId);
      res.json(notes);
    } catch (error) {
      console.error("Failed to get candidate notes:", error);
      res.status(500).json({ message: "Failed to get candidate notes" });
    }
  });

  app.post("/api/candidates/:candidateId/notes", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.candidateId);
      const userId = req.user?.id || 1;
      
      console.log("🔍 [NOTES DEBUG] Received data:", {
        candidateId,
        userId,
        body: req.body
      });
      
      const noteData = insertCandidateNoteSchema.parse({
        ...req.body,
        candidateId,
        userId,
      });
      
      console.log("✅ [NOTES DEBUG] Parsed data:", noteData);
      
      const note = await storage.createCandidateNote(noteData);
      res.status(201).json(note);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("❌ [NOTES DEBUG] Zod validation errors:", error.errors);
        res.status(400).json({ message: "Invalid note data", errors: error.errors });
      } else {
        console.error("❌ [NOTES DEBUG] Failed to create candidate note:", error);
        res.status(500).json({ message: "Failed to create candidate note" });
      }
    }
  });

  app.put("/api/candidate-notes/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const noteUpdate = insertCandidateNoteSchema.partial().parse(req.body);
      
      const note = await storage.updateCandidateNote(id, noteUpdate);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      res.json(note);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid note data", errors: error.errors });
      } else {
        console.error("Failed to update candidate note:", error);
        res.status(500).json({ message: "Failed to update candidate note" });
      }
    }
  });

  app.delete("/api/candidate-notes/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteCandidateNote(id);
      if (!success) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete candidate note:", error);
      res.status(500).json({ message: "Failed to delete candidate note" });
    }
  });

  // Candidate Status Tracking Routes
  app.get("/api/candidate-statuses/:vacancyId", authenticateToken, async (req, res) => {
    try {
      const vacancyId = parseInt(req.params.vacancyId);
      const statuses = await storage.getCandidateStatuses(vacancyId);
      res.json(statuses);
    } catch (error) {
      console.error("Failed to get candidate statuses:", error);
      res.status(500).json({ message: "Failed to get candidate statuses" });
    }
  });

  app.post("/api/candidate-statuses", authenticateToken, async (req, res) => {
    try {
      // Add userId to the request body before validation
      const requestBodyWithUserId = {
        ...req.body,
        userId: req.user?.id || 1 // Fallback to user ID 1 if no authenticated user
      };
      
      const result = insertCandidateStatusSchema.safeParse(requestBodyWithUserId);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid status data", errors: result.error.errors });
      }
      
      const status = await storage.createCandidateStatus(result.data);
      res.status(201).json(status);
    } catch (error) {
      console.error("Failed to create candidate status:", error);
      res.status(500).json({ message: "Failed to create candidate status" });
    }
  });

  app.put("/api/candidate-statuses/:candidateId/:vacancyId", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.candidateId);
      const vacancyId = parseInt(req.params.vacancyId);
      const { status, notes } = req.body;
      
      const updatedStatus = await storage.updateCandidateStatus(candidateId, vacancyId, {
        status,
        notes,
        userId: req.user.id
      });
      
      res.json(updatedStatus);
    } catch (error) {
      console.error("Failed to update candidate status:", error);
      res.status(500).json({ message: "Failed to update candidate status" });
    }
  });
  
  app.get("/api/clients", authenticateToken, async (req, res) => {
    try {
      const clients = await storage.getClients();
      res.json(clients);
    } catch (error) {
      res.status(500).json({ message: "Failed to get clients" });
    }
  });
  
  app.get("/api/clients/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const client = await storage.getClient(id);
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json(client);
    } catch (error) {
      res.status(500).json({ message: "Failed to get client" });
    }
  });
  
  app.post("/api/clients", async (req, res) => {
    try {
      const result = insertClientSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid client data", errors: result.error.errors });
      }
      
      // Create client first
      const client = await storage.createClient(result.data);
      
      // Check for missing contact person and create admin todos in background
      setTimeout(async () => {
        try {
          const { ClientContactService } = await import("./services/client-contact-service");
          const clientContactService = new ClientContactService(storage);
          await clientContactService.createContactPersonTodos(client.id);
        } catch (error) {
          console.error("Error creating contact person todos:", error);
        }
      }, 1000);
      
      // Enhance client data with AI in background (don't block response)
      setTimeout(async () => {
        try {
          console.log(`🤖 Starting AI enhancement for client: ${client.name}`);
          const enhancement = await aiClientEnhancer.enhanceClientData(client.name, client.website || undefined);
          
          if (enhancement.confidence > 50) {
            // Update client with enhanced data
            const updateData: any = {};
            
            if (enhancement.industry && !client.industry) updateData.industry = enhancement.industry;
            if (enhancement.description && !client.description) updateData.description = enhancement.description;
            if (enhancement.website && !client.website) updateData.website = enhancement.website;
            if (enhancement.location && !client.location) updateData.location = enhancement.location;
            if (enhancement.logoUrl) updateData.logoUrl = enhancement.logoUrl;
            
            if (Object.keys(updateData).length > 0) {
              await storage.updateClient(client.id, updateData);
              console.log(`✅ Enhanced client ${client.name} with:`, enhancement.enhancedFields);
            }
          }
          
          // Check for missing information and create notifications
          const updatedClient = await storage.getClient(client.id);
          if (updatedClient) {
            aiClientEnhancer.checkClientDataCompleteness(updatedClient);
          }
        } catch (enhancementError) {
          console.error(`❌ Client enhancement failed for ${client.name}:`, enhancementError);
        }
      }, 100);
      
      res.status(201).json(client);
    } catch (error) {
      console.error('Client creation error:', error);
      res.status(500).json({ message: "Failed to create client" });
    }
  });
  
  app.put("/api/clients/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertClientSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid client data", errors: result.error.errors });
      }
      
      const updatedClient = await storage.updateClient(id, result.data);
      if (!updatedClient) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Check if contact person information was updated and complete any related todos
      setTimeout(async () => {
        try {
          const { ClientContactService } = await import("./services/client-contact-service");
          const clientContactService = new ClientContactService(storage);
          await clientContactService.completeContactPersonTodo(id);
        } catch (error) {
          console.error("Error completing contact person todos:", error);
        }
      }, 500);
      
      res.json(updatedClient);
    } catch (error) {
      res.status(500).json({ message: "Failed to update client" });
    }
  });
  
  app.delete("/api/clients/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if client has any vacancies
      const vacancies = await storage.getVacancies();
      const clientVacancies = vacancies.filter(v => v.clientId === id);
      
      if (clientVacancies.length > 0) {
        return res.status(400).json({ 
          message: `Cannot delete client. This client has ${clientVacancies.length} active ${clientVacancies.length === 1 ? 'vacancy' : 'vacancies'}. Please remove all vacancies first.` 
        });
      }
      
      const success = await storage.deleteClient(id);
      if (!success) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // Endpoint to bulk enhance existing clients
  app.post("/api/clients/bulk-enhance", authenticateToken, async (req, res) => {
    try {
      const { aiClientEnhancer } = await import("./services/ai-client-enhancer");
      
      // Get all clients that need enhancement (missing location, description, or logo)
      const allClients = await storage.getClients();
      const clientsNeedingEnhancement = allClients.filter(client => 
        !client.location || !client.description || !client.logoUrl || !client.website
      );

      console.log(`Found ${clientsNeedingEnhancement.length} clients needing enhancement`);

      const enhancementResults = [];
      for (const client of clientsNeedingEnhancement) {
        try {
          console.log(`Enhancing client: ${client.name}`);
          const enhancedData = await aiClientEnhancer.enhanceClientData(client.name);
          
          // Update the client with enhanced data
          const updateData: any = {};
          if (enhancedData.location && !client.location) updateData.location = enhancedData.location;
          if (enhancedData.description && !client.description) updateData.description = enhancedData.description;
          if (enhancedData.website && !client.website) updateData.website = enhancedData.website;
          if (enhancedData.logoUrl && !client.logoUrl) updateData.logoUrl = enhancedData.logoUrl;

          if (Object.keys(updateData).length > 0) {
            await storage.updateClient(client.id, updateData);
            enhancementResults.push({
              clientId: client.id,
              clientName: client.name,
              enhanced: true,
              fieldsUpdated: Object.keys(updateData)
            });
          } else {
            enhancementResults.push({
              clientId: client.id,
              clientName: client.name,
              enhanced: false,
              reason: "No new data found"
            });
          }
        } catch (error) {
          console.error(`Failed to enhance client ${client.name}:`, error);
          enhancementResults.push({
            clientId: client.id,
            clientName: client.name,
            enhanced: false,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      res.json({
        totalClientsProcessed: clientsNeedingEnhancement.length,
        results: enhancementResults
      });
    } catch (error) {
      console.error("Error in bulk client enhancement:", error);
      res.status(500).json({ error: "Failed to enhance clients" });
    }
  });
  
  // Endpoint for admins to check all clients for missing contact persons and create todos
  app.post("/api/clients/check-contact-persons", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const { ClientContactService } = await import("./services/client-contact-service");
      const clientContactService = new ClientContactService(storage);
      
      const result = await clientContactService.checkAllClientsForMissingContactPersons();
      
      res.json({
        success: true,
        message: `Contact person check completed. Found ${result.clientsWithMissingContact} clients missing contact information out of ${result.totalClients} total clients. Created ${result.todosCreated} todos for admin users.`,
        ...result
      });
    } catch (error) {
      console.error("Error checking client contact persons:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to check client contact persons" 
      });
    }
  });
  
  // Users endpoints - returns only recruiters
  app.get("/api/users", authenticateToken, async (req, res) => {
    try {
      const users = await storage.getUsers();
      console.log("All users fetched:", users.map(u => ({ id: u.id, fullName: u.fullName, role: u.role })));
      
      // Filter to only return recruiters, not admins
      const recruiters = users.filter(user => user.role === 'recruiter');
      console.log("Filtered recruiters:", recruiters.map(r => ({ id: r.id, fullName: r.fullName, role: r.role })));
      
      res.json(recruiters);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to get users" });
    }
  });
  
  app.get("/api/vacancies", authenticateToken, async (req, res) => {
    try {
      const vacancies = await storage.getVacancies();
      const users = await storage.getUsers();
      
      // Enrich vacancies with owner names
      const enrichedVacancies = vacancies.map(vacancy => ({
        ...vacancy,
        ownerName: users.find(u => u.id === vacancy.ownerId)?.fullName || "Unassigned"
      }));
      
      res.json(enrichedVacancies);
    } catch (error) {
      res.status(500).json({ message: "Failed to get vacancies" });
    }
  });
  
  app.get("/api/vacancies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const vacancy = await storage.getVacancy(id);
      if (!vacancy) {
        return res.status(404).json({ message: "Vacancy not found" });
      }
      
      res.json(vacancy);
    } catch (error) {
      res.status(500).json({ message: "Failed to get vacancy" });
    }
  });
  
  // Enhanced client creation/lookup with extracted company info
  app.post("/api/create-client-with-info", async (req, res) => {
    try {
      const { clientName, extractedCompanyInfo } = req.body;
      
      if (!clientName) {
        return res.status(400).json({ message: "Client name is required" });
      }
      
      // First, try to find existing client by name
      const clients = await storage.getClients();
      let existingClient = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
      
      if (!existingClient) {
        // Create new client with manual name but enhanced with extracted info
        const newClient = await storage.createClient({
          name: clientName, // Use manual input as primary
          companyName: clientName,
          email: "",
          phone: "",
          website: extractedCompanyInfo?.website || "",
          industry: extractedCompanyInfo?.industry || "",
          description: extractedCompanyInfo?.description || null
        });
        
        console.log(`Created client "${clientName}" with enhanced info (ID: ${newClient.id})`);
        return res.json({ client: newClient, created: true });
      } else {
        // Update existing client with any missing extracted information
        const updateData: any = {};
        if (!existingClient.website && extractedCompanyInfo?.website) {
          updateData.website = extractedCompanyInfo.website;
        }
        if (!existingClient.industry && extractedCompanyInfo?.industry) {
          updateData.industry = extractedCompanyInfo.industry;
        }
        if (!existingClient.description && extractedCompanyInfo?.description) {
          updateData.description = extractedCompanyInfo.description;
        }
        
        if (Object.keys(updateData).length > 0) {
          await storage.updateClient(existingClient.id, updateData);
          console.log(`Enhanced existing client "${clientName}" with extracted info`);
        }
        
        return res.json({ client: existingClient, created: false });
      }
    } catch (error) {
      console.error("Enhanced client creation error:", error);
      res.status(500).json({ message: "Failed to create/enhance client", error: String(error) });
    }
  });

  app.post("/api/vacancies", async (req, res) => {
    try {
      const { clientName, ...vacancyData } = req.body;
      
      // If clientName is provided instead of clientId, handle client creation/lookup
      if (clientName && !vacancyData.clientId) {
        try {
          // First, try to find existing client by name
          const clients = await storage.getClients();
          let existingClient = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
          
          if (!existingClient) {
            // Create new client if not found
            const newClient = await storage.createClient({
              name: clientName,
              companyName: clientName,
              email: "",
              phone: "",
              website: "",
              industry: ""
            });
            vacancyData.clientId = newClient.id;
          } else {
            vacancyData.clientId = existingClient.id;
          }
        } catch (clientError) {
          console.error("Client creation/lookup error:", clientError);
          return res.status(500).json({ message: "Failed to create/find client", error: String(clientError) });
        }
      }
      
      const result = insertVacancySchema.safeParse(vacancyData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid vacancy data", errors: result.error.errors });
      }
      
      const vacancy = await storage.createVacancy(result.data);
      res.status(201).json(vacancy);
    } catch (error) {
      res.status(500).json({ message: "Failed to create vacancy" });
    }
  });
  
  app.put("/api/vacancies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { clientName, ...vacancyData } = req.body;
      
      // If clientName is provided, handle client creation/lookup during update
      if (clientName && !vacancyData.clientId) {
        try {
          // First, try to find existing client by name
          const clients = await storage.getClients();
          let existingClient = clients.find(c => c.name.toLowerCase() === clientName.toLowerCase());
          
          if (!existingClient) {
            // Create new client if not found
            const newClient = await storage.createClient({
              name: clientName,
              companyName: clientName,
              email: "",
              phone: "",
              website: "",
              industry: ""
            });
            vacancyData.clientId = newClient.id;
            console.log(`Created new client "${clientName}" (ID: ${newClient.id}) during vacancy update`);
          } else {
            vacancyData.clientId = existingClient.id;
            console.log(`Found existing client "${clientName}" (ID: ${existingClient.id}) during vacancy update`);
          }
        } catch (clientError) {
          console.error("Client creation/lookup error during update:", clientError);
          return res.status(500).json({ message: "Failed to create/find client during update", error: String(clientError) });
        }
      }
      
      const result = insertVacancySchema.partial().safeParse(vacancyData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid vacancy data", errors: result.error.errors });
      }
      
      const updatedVacancy = await storage.updateVacancy(id, result.data);
      if (!updatedVacancy) {
        return res.status(404).json({ message: "Vacancy not found" });
      }
      
      res.json(updatedVacancy);
    } catch (error) {
      console.error("Failed to update vacancy:", error);
      res.status(500).json({ message: "Failed to update vacancy" });
    }
  });
  
  app.delete("/api/vacancies/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteVacancy(id);
      if (!success) {
        return res.status(404).json({ message: "Vacancy not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete vacancy" });
    }
  });
  
  app.get("/api/todos", authenticateToken, async (req, res) => {
    try {
      // Get user ID from authenticated user token
      const userId = req.user.id;
      const todos = await storage.getTodos(userId);
      res.json(todos);
    } catch (error) {
      console.error("Error getting todos:", error);
      res.status(500).json({ message: "Failed to get todos" });
    }
  });
  
  app.post("/api/todos", authenticateToken, async (req, res) => {
    try {
      // Convert string dates to Date objects before validation
      const requestData = { ...req.body };
      if (requestData.dueDate && typeof requestData.dueDate === 'string') {
        requestData.dueDate = new Date(requestData.dueDate);
      }
      
      const result = insertTodoSchema.safeParse(requestData);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid todo data", errors: result.error.errors });
      }
      
      const todo = await storage.createTodo(result.data);
      res.status(201).json(todo);
    } catch (error) {
      console.error("Error creating todo:", error);
      res.status(500).json({ message: "Failed to create todo" });
    }
  });
  
  app.put("/api/todos/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Convert string dates to Date objects before validation
      const requestData = { ...req.body };
      if (requestData.dueDate && typeof requestData.dueDate === 'string') {
        requestData.dueDate = new Date(requestData.dueDate);
      }
      
      const result = insertTodoSchema.partial().safeParse(requestData);
      if (!result.success) {
        console.error("Todo update validation failed:", result.error.errors);
        return res.status(400).json({ message: "Invalid todo data", errors: result.error.errors });
      }
      
      const updatedTodo = await storage.updateTodo(id, result.data);
      if (!updatedTodo) {
        return res.status(404).json({ message: "Todo not found" });
      }
      
      res.json(updatedTodo);
    } catch (error) {
      console.error("Error updating todo:", error);
      res.status(500).json({ message: "Failed to update todo" });
    }
  });
  
  app.delete("/api/todos/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deleteTodo(id);
      if (!success) {
        return res.status(404).json({ message: "Todo not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting todo:", error);
      res.status(500).json({ message: "Failed to delete todo" });
    }
  });

  // Get KPI targets
  app.get("/api/dashboard/kpi-targets", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      const recruiterId = req.query.recruiterId ? parseInt(req.query.recruiterId as string) : null;
      const targetUserId = req.user?.role === 'admin' && recruiterId ? recruiterId : userId;
      
      // Get user-specific or default KPI targets
      const targets = await storage.getKpiTargets(targetUserId);
      res.json(targets);
    } catch (error) {
      console.error("Error fetching KPI targets:", error);
      res.status(500).json({ success: false, error: "Failed to fetch KPI targets" });
    }
  });

  // Update KPI targets
  app.put("/api/dashboard/kpi-targets", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      const recruiterId = req.query.recruiterId ? parseInt(req.query.recruiterId as string) : null;
      const targetUserId = req.user?.role === 'admin' && recruiterId ? recruiterId : userId;
      
      if (!req.user?.role || (req.user.role !== 'admin' && targetUserId !== userId)) {
        return res.status(403).json({ success: false, error: "Unauthorized to update KPI targets" });
      }
      
      const result = insertKpiTargetsSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ success: false, error: "Invalid KPI targets data", errors: result.error.errors });
      }
      
      const updatedTargets = await storage.updateKpiTargets(targetUserId, result.data);
      res.json(updatedTargets);
    } catch (error) {
      console.error("Error updating KPI targets:", error);
      res.status(500).json({ success: false, error: "Failed to update KPI targets" });
    }
  });

  // Get todos by timeframe for dashboard
  app.get("/api/dashboard/tasks/:timeframe", authenticateToken, async (req, res) => {
    try {
      const { timeframe } = req.params;
      const userId = req.user?.id;
      
      // Calculate date ranges
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      endOfWeek.setHours(23, 59, 59, 999);
      
      const nextWeekStart = new Date(endOfWeek);
      nextWeekStart.setDate(endOfWeek.getDate() + 1);
      nextWeekStart.setHours(0, 0, 0, 0);
      
      const nextWeekEnd = new Date(nextWeekStart);
      nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
      nextWeekEnd.setHours(23, 59, 59, 999);
      
      let startDate: Date, endDate: Date;
      
      if (timeframe === 'thisweek') {
        startDate = startOfWeek;
        endDate = endOfWeek;
      } else if (timeframe === 'nextweek') {
        startDate = nextWeekStart;
        endDate = nextWeekEnd;
      } else {
        return res.status(400).json({ success: false, error: "Invalid timeframe. Use 'thisweek' or 'nextweek'" });
      }
      
      // Get all todos and filter by date range and user access
      const allTodos = await storage.getTodos(userId);
      const filteredTodos = allTodos.filter(todo => {
        // Show user's own todos or admin can see all high-priority system tasks
        const hasAccess = todo.userId === userId || 
                         (req.user?.role === 'admin' && ['high', 'urgent'].includes(todo.priority));
        
        if (!hasAccess) return false;
        
        // Filter by due date
        if (!todo.dueDate) return false;
        const dueDate = new Date(todo.dueDate);
        return dueDate >= startDate && dueDate <= endDate && todo.status !== 'completed';
      });
      
      // Sort by priority and due date
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
      filteredTodos.sort((a, b) => {
        const priorityDiff = (priorityOrder[b.priority as keyof typeof priorityOrder] || 2) - 
                           (priorityOrder[a.priority as keyof typeof priorityOrder] || 2);
        if (priorityDiff !== 0) return priorityDiff;
        
        return new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime();
      });
      
      res.json({
        timeframe,
        startDate,
        endDate,
        tasks: filteredTodos.slice(0, 5), // Limit to 5 most important tasks
        totalCount: filteredTodos.length
      });
    } catch (error) {
      console.error("Error fetching tasks by timeframe:", error);
      res.status(500).json({ success: false, error: "Failed to fetch tasks" });
    }
  });

  // Placement endpoints
  app.get("/api/placements", authenticateToken, async (req, res) => {
    try {
      const placements = await storage.getPlacements();
      res.json(placements);
    } catch (error) {
      console.error("Error getting placements:", error);
      res.status(500).json({ message: "Failed to get placements" });
    }
  });

  app.get("/api/placements/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const placement = await storage.getPlacement(id);
      if (!placement) {
        return res.status(404).json({ message: "Placement not found" });
      }
      res.json(placement);
    } catch (error) {
      console.error("Error getting placement:", error);
      res.status(500).json({ message: "Failed to get placement" });
    }
  });

  app.post("/api/placements", authenticateToken, async (req, res) => {
    try {
      const result = insertPlacementSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid placement data", errors: result.error.errors });
      }
      
      const placementResult = await placementService.createPlacementWithRevenueTracking(result.data);
      res.status(201).json(placementResult);
    } catch (error) {
      console.error("Error creating placement:", error);
      res.status(500).json({ message: "Failed to create placement" });
    }
  });

  app.put("/api/placements/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // If this is a revenue update, use the placement service
      if (req.body.sellRate || req.body.buyRate || req.body.margin) {
        const updatedPlacement = await placementService.updatePlacementRevenue(id, req.body);
        if (!updatedPlacement) {
          return res.status(404).json({ message: "Placement not found" });
        }
        res.json(updatedPlacement);
      } else {
        // Regular placement update
        const result = insertPlacementSchema.partial().safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ message: "Invalid placement data", errors: result.error.errors });
        }
        
        const updatedPlacement = await storage.updatePlacement(id, result.data);
        if (!updatedPlacement) {
          return res.status(404).json({ message: "Placement not found" });
        }
        res.json(updatedPlacement);
      }
    } catch (error) {
      console.error("Error updating placement:", error);
      res.status(500).json({ message: "Failed to update placement" });
    }
  });

  app.delete("/api/placements/:id", authenticateToken, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const success = await storage.deletePlacement(id);
      if (!success) {
        return res.status(404).json({ message: "Placement not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting placement:", error);
      res.status(500).json({ message: "Failed to delete placement" });
    }
  });
  
  app.get("/api/activities", async (req, res) => {
    try {
      const activities = await storage.getActivities();
      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to get activities" });
    }
  });
  
  app.get("/api/interviews", async (req, res) => {
    try {
      const interviews = await storage.getInterviews();
      res.json(interviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to get interviews" });
    }
  });
  
  app.post("/api/interviews", async (req, res) => {
    try {
      const result = insertInterviewSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid interview data", errors: result.error.errors });
      }
      
      const interview = await storage.createInterview(result.data);
      res.status(201).json(interview);
    } catch (error) {
      res.status(500).json({ message: "Failed to create interview" });
    }
  });
  
  app.get("/api/pipeline/:vacancyId", async (req, res) => {
    try {
      const vacancyId = parseInt(req.params.vacancyId);
      const stages = await storage.getPipelineStages(vacancyId);
      res.json(stages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get pipeline stages" });
    }
  });
  
  app.get("/api/match/:vacancyId", async (req, res) => {
    try {
      const vacancyId = parseInt(req.params.vacancyId);
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = (page - 1) * limit;
      const search = req.query.search as string;
      
      console.log(`Matching candidates for vacancy ID: ${vacancyId}, page: ${page}, limit: ${limit}${search ? `, search: "${search}"` : ''}`);
      const result = await storage.matchCandidatesToVacancy(vacancyId, limit, offset, search);
      console.log(`Found ${result.candidates.length} candidates for page ${page}, total: ${result.total}`);
      
      res.json({
        candidates: result.candidates,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit)
      });
    } catch (error) {
      console.error("Error matching candidates:", error);
      res.status(500).json({ message: "Failed to match candidates" });
    }
  });
  
  // Job description generator
  app.post("/api/job-description/generate", async (req, res) => {
    try {
      const { title, skills, experience } = req.body;
      
      if (!title) {
        return res.status(400).json({ message: "Job title is required" });
      }
      
      try {
        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a professional recruiter tasked with creating compelling job descriptions. Generate a detailed job description for the provided role, focusing on responsibilities, requirements, and qualifications. Format the response as JSON with the fields: {description, responsibilities, requirements, qualifications, benefits}.`
            },
            {
              role: "user",
              content: `Create a job description for a ${title} role${skills ? ` with skills in ${skills.join(', ')}` : ''}${experience ? ` and ${experience} years of experience` : ''}.`
            }
          ],
          response_format: { type: "json_object" }
        });
        
        const result = JSON.parse(response.choices[0].message.content || "{}");
        res.json(result);
      } catch (error) {
        // No fallback data is permitted - only authentic OpenAI generated content
        res.status(503).json({ 
          message: "OpenAI API is currently unavailable. Mock or fallback job descriptions are not permitted.",
          error: "Service temporarily unavailable"
        });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to generate job description" });
    }
  });
  


  // Authentication routes - Invite-based authentication system
  // Mount on both paths to support different reverse proxy configurations
  app.use("/api/auth", inviteAuthRouter);
  
  // Test email endpoint for debugging SMTP issues
  app.post("/api/test-email", async (req, res) => {
    try {
      const { to, subject, message } = req.body;
      
      if (!to || !subject || !message) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: to, subject, message"
        });
      }

      console.log(`=== STEP 1: Testing basic SMTP delivery to: ${to} ===`);
      
      const { sendEmailViaGraph } = await import("./graph-email-service");
      const result = await sendEmailViaGraph({
        to,
        subject,
        html: `<p>${message}</p>`,
        text: message
      });

      res.json({
        success: result,
        message: result ? "Test email sent successfully" : "Failed to send test email"
      });
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while sending test email"
      });
    }
  });
  
  // Vtiger CRM integration - Using environment variables (protected)
  app.use("/api/vtiger", optionalAuthentication, vtigerRouter);

  // Vtiger CRM bidirectional synchronization (protected)
  app.use("/api/sync/vtiger", optionalAuthentication, vtigerSyncRouter);

  // Sync metadata endpoints
  app.get("/api/sync-metadata/latest", authenticateToken, async (req, res) => {
    try {
      const metadata = await storage.getLatestSyncMetadata();
      res.json(metadata);
    } catch (error) {
      console.error("Error fetching latest sync metadata:", error);
      res.status(500).json({ error: "Failed to fetch sync metadata" });
    }
  });

  app.get("/api/sync-metadata", authenticateToken, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const metadata = await storage.getAllSyncMetadata(limit);
      res.json(metadata);
    } catch (error) {
      console.error("Error fetching sync metadata:", error);
      res.status(500).json({ error: "Failed to fetch sync metadata" });
    }
  });

  
  // Parse CV from candidate endpoint
  app.post("/api/cv-parser/parse-candidate-cv/:candidateId", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.candidateId);
      const candidate = await storage.getCandidate(candidateId);
      
      if (!candidate || !candidate.cvUrl) {
        return res.status(404).json({ error: "Candidate or CV not found" });
      }

      // Get the CV file from object storage
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(candidate.cvUrl);
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      
      // Download CV as buffer
      const chunks: Buffer[] = [];
      const stream = objectFile.createReadStream();
      
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          
          // Save to temporary file for CV parser
          const tempDir = path.join(process.cwd(), "uploads/temp");
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          const tempFilePath = path.join(tempDir, `candidate-${candidateId}-cv.pdf`);
          fs.writeFileSync(tempFilePath, buffer);
          
          // Use the existing CV parser logic
          // Note: We'll implement proper CV parsing later, for now use candidate data
          
          // For now, return basic candidate data as parsed CV data
          const parsedData = {
            firstName: candidate.firstName || '',
            lastName: candidate.lastName || '',
            currentTitle: candidate.jobTitle || candidate.currentTitle || '',
            email: candidate.email || '',
            phone: candidate.phone || '',
            location: candidate.location || '',
            professionalSummary: candidate.profileSummary || '',
            skills: candidate.skills || [''],
            workExperience: [{
              title: candidate.jobTitle || '',
              company: candidate.company || '',
              dates: candidate.durationCurrentRole || '',
              responsibilities: [candidate.titleDescription || '']
            }],
            education: [{
              degree: '',
              institution: '',
              dates: ''
            }],
            languages: [{
              language: '',
              proficiency: ''
            }],
            courses: [{
              courseName: '',
              institution: '',
              completionDate: '',
              certificateNumber: ''
            }],
            detected_language: 'english',
            noticePeriod: '',
            noticePeriodUnit: 'Month(s)'
          };
          
          // Clean up temp file
          fs.unlinkSync(tempFilePath);
          
          res.json(parsedData);
        } catch (parseError) {
          console.error("Error parsing candidate CV:", parseError);
          res.status(500).json({ error: "Failed to parse CV" });
        }
      });
      
      stream.on('error', (error) => {
        console.error("Error downloading CV:", error);
        res.status(500).json({ error: "Failed to download CV" });
      });
    } catch (error) {
      console.error("Error parsing candidate CV:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // CV parsing service using OpenAI
  app.use("/api/cv-parser", cvParserRouter);
  
  // Vacancy file processing API
  app.use("/api", vacancyParserRouter);
  
  app.post("/api/vtiger/query", (req, res) => {
    const { module, query } = req.body;
    
    if (!module) {
      return res.status(400).json({
        success: false,
        message: "Module name is required"
      });
    }
    
    // This endpoint should only return data from live Vtiger CRM
    // No mock data is permitted
    res.status(501).json({
      success: false,
      message: "This endpoint requires live Vtiger CRM integration. Mock data is not permitted.",
      note: "Please use the proper Vtiger API endpoints for real data."
    });
  });
  
  
  // Sync candidates from Vtiger
  app.post("/api/vtiger/sync/candidates", authenticateToken, async (req, res) => {
    try {
      console.log('🚀 Starting VTiger candidates sync...');
      
      // Check if a sync is already running
      const metadata = await storage.getAllSyncMetadata();
      const runningSync = metadata.find((m: any) => m.status === 'running' && m.entityType === 'candidates');
      
      if (runningSync) {
        return res.status(409).json({
          success: false,
          message: 'A sync is already in progress'
        });
      }
      
      // Cast storage to VtigerStorage to access sync methods
      const vtigerStorage = storage as VtigerStorage;
      
      // Create progress handler
      const progressHandler = {
        onStart: (total?: number) => {
          console.log(`📊 Starting candidate sync: ${total} total candidates`);
        },
        onBatch: (batchProcessed: number, totalProcessed: number, total?: number) => {
          const percentage = total ? Math.round((totalProcessed / total) * 100) : 0;
          console.log(`📈 Progress: ${totalProcessed}/${total || '?'} (${percentage}%)`);
        },
        onComplete: () => {
          console.log(`✅ Candidate sync completed successfully`);
        },
        onError: (error: Error) => {
          console.error(`❌ Candidate sync error:`, error);
        }
      };
      
      // Start the sync
      await vtigerStorage.syncWithVtiger(progressHandler);
      
      res.json({
        success: true,
        message: "Sync completed successfully"
      });
      
    } catch (error) {
      console.error('❌ Error syncing candidates:', error);
      res.status(500).json({
        success: false,
        message: "Failed to sync candidates",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/vtiger/sync/clients", (req, res) => {
    // This endpoint only works with authentic Vtiger CRM integration
    res.status(501).json({
      success: false,
      message: "Mock data is not permitted. This endpoint requires live Vtiger CRM integration with authentic client data."
    });
  });
  
  app.get("/api/vtiger/import/contacts", (req, res) => {
    // This endpoint only works with authentic Vtiger CRM integration
    res.status(501).json({
      success: false,
      message: "Mock data is not permitted. This endpoint requires live Vtiger CRM integration with authentic contact data."
    });
  });
  
  app.get("/api/vtiger/import/accounts", (req, res) => {
    // This endpoint only works with authentic Vtiger CRM integration
    res.status(501).json({
      success: false,
      message: "Mock data is not permitted. This endpoint requires live Vtiger CRM integration with authentic account data."
    });
  });

  // Debug endpoint for Vtiger field mapping
  app.get("/api/debug/vtiger-contact", debugVtigerContact);
  
  // Debug endpoint to find Mark de Jonge's Title Description field
  app.get("/api/debug/mark-de-jonge", async (req, res) => {
    try {
      const candidates = await storage.getCandidates();
      const markDeJonge = candidates.find(c => 
        c.firstName?.toLowerCase() === 'mark' && 
        c.lastName?.toLowerCase() === 'de jonge'
      );
      
      if (!markDeJonge) {
        return res.json({ error: "Mark de Jonge not found in database" });
      }
      
      return res.json({
        success: true,
        candidate: {
          name: `${markDeJonge.firstName} ${markDeJonge.lastName}`,
          titleDescription: markDeJonge.titleDescription,
          allFields: markDeJonge
        }
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Force sync endpoint to manually trigger Vtiger sync
  app.post("/api/candidates/force-sync", optionalAuthentication, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const userName = (req as any).user?.email || 'System/Cron';
      console.log(`🔄 Manual sync triggered by ${userName} (ID: ${userId || 'N/A'})`);
      
      if (typeof storage.syncWithVtiger === 'function') {
        await storage.syncWithVtiger(undefined, userId);
        res.json({ success: true, message: "Sync completed successfully" });
      } else {
        res.status(501).json({ error: "Sync function not available in current storage implementation" });
      }
    } catch (error) {
      console.error("Manual sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel sync endpoint to stop a running sync (with optional authentication to track who cancelled)
  app.post("/api/candidates/cancel-sync", optionalAuthentication, async (req, res) => {
    try {
      const userId = (req as any).user?.id;
      const userName = (req as any).user?.email || 'Unknown user';
      console.log(`⛔ Cancel sync requested by ${userName} (ID: ${userId || 'N/A'})`);
      
      // Find any running sync and mark it as failed
      const runningSyncs = await storage.getAllSyncMetadata(10);
      const runningSync = runningSyncs.find((sync: any) => sync.status === 'running');
      
      if (!runningSync) {
        return res.json({ success: false, message: "No sync is currently running" });
      }
      
      // Mark the running sync as cancelled/failed with user tracking
      await storage.updateSyncMetadata(runningSync.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: `Sync cancelled by ${userName}`,
        cancelledByUserId: userId,
        cancelReason: 'Manual cancellation via UI'
      });
      
      console.log(`✅ Cancelled sync #${runningSync.id} by ${userName}`);
      res.json({ success: true, message: "Sync cancelled successfully" });
    } catch (error) {
      console.error("Cancel sync error:", error);
      res.status(500).json({ error: error.message || "Failed to cancel sync" });
    }
  });

  // AI-powered vacancy field generation
  app.post("/api/generate-vacancy-fields", async (req, res) => {
    try {
      const { title, clientName } = req.body;
      
      if (!title || !clientName) {
        return res.status(400).json({ message: "Job title and client name are required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ message: "OpenAI API key not configured" });
      }
      
      const { default: OpenAI } = await import('openai');
      const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000 // 30 second timeout to prevent hanging requests
    })
  : null;

      const prompt = `You are an expert recruiter creating a comprehensive job vacancy for the position "${title}" at "${clientName}". 

Generate realistic and professional content for the following fields. Return only valid JSON with these exact field names:

{
  "organization": "Brief description of the company culture and working environment (2-3 sentences as a single string)",
  "function": "Detailed description of the role, main responsibilities, and key tasks (as a single paragraph string with bullet points using • symbols)",
  "jobRequirements": "Required qualifications, skills, experience, and competencies (as a single paragraph string with bullet points using • symbols)", 
  "offer": "What the company offers including benefits, growth opportunities, and compensation range (as a single paragraph string with bullet points using • symbols)",
  "location": "Work location (city, country or remote/hybrid options)",
  "employmentType": "full-time, part-time, contract, or internship",
  "experienceLevel": "entry-level, mid-level, senior-level, or executive",
  "educationLevel": "high-school, bachelor, master, or phd",
  "salaryRangeMin": numeric_value_in_euros,
  "salaryRangeMax": numeric_value_in_euros,
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5"]
}

IMPORTANT: All text fields except skills must be single strings, not arrays. Use bullet points within the strings using • symbols. Make the content specific to the role and industry. Use professional language and realistic salary ranges for the position level and location.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      });

      const generatedFields = JSON.parse(response.choices[0].message.content);
      res.json(generatedFields);
    } catch (error) {
      console.error("AI generation error:", error);
      res.status(500).json({ message: "Failed to generate fields with AI" });
    }
  });

  // Removed duplicate /api/extract-vacancy-from-file endpoint - now handled securely by vacancyParserRouter

  // URL scraping for vacancy extraction
  app.post("/api/scrape-vacancy-from-url", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ message: "OpenAI API key not configured" });
      }
      
      console.log(`Attempting to scrape URL: ${url}`);

      let html = '';
      let fetchSucceeded = false;
      
      // First, try with puppeteer-like headers
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
          },
          redirect: 'follow'
        });

        if (response.ok) {
          html = await response.text();
          fetchSucceeded = true;
        } else {
          console.log(`First fetch attempt failed with status ${response.status}`);
        }
      } catch (error) {
        console.log('First fetch attempt failed:', error);
      }
      
      // If first attempt failed, try with axios
      if (!fetchSucceeded) {
        try {
          const axios = (await import('axios')).default;
          const axiosResponse = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'DNT': '1',
            },
            maxRedirects: 5,
            timeout: 15000,
            validateStatus: function (status) {
              return status < 500; // Accept any status code less than 500
            }
          });
          
          if (axiosResponse.status === 200) {
            html = axiosResponse.data;
            fetchSucceeded = true;
          } else {
            console.log(`Axios attempt returned status ${axiosResponse.status}`);
          }
        } catch (axiosError) {
          console.error('Axios attempt failed:', axiosError);
        }
      }
      
      // If both attempts failed or returned Cloudflare challenge, return a user-friendly error
      if (!fetchSucceeded || html.includes('cf-chl-bypass') || html.includes('cf_challenge') || html.includes('Enable JavaScript and cookies to continue')) {
        console.log('URL appears to be protected by Cloudflare or similar service');
        return res.status(400).json({ 
          message: "Unable to access this URL automatically. The website appears to be protected. Please copy and paste the job description text directly instead of using the URL.",
          suggestion: "Try using the 'Upload File' option with a saved copy of the job description, or manually fill in the fields."
        });
      }
      
      if (!html || html.trim().length < 100) {
        return res.status(400).json({ 
          message: "Could not extract content from the URL. Please try copying the job description text directly."
        });
      }
      
      // Extract text content from HTML (improved extraction)
      const textContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      
      console.log(`Extracted text length: ${textContent.length} characters`);

      // Use OpenAI to extract structured vacancy data
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ 
        apiKey: process.env.OPENAI_API_KEY!,
        timeout: 30000 // 30 second timeout to prevent hanging requests
      });

      const prompt = `Extract job vacancy information from the following webpage content and return structured data as JSON:

Content: "${textContent.substring(0, 8000)}" // Limit content length

Return only valid JSON with these exact field names:
{
  "organization": "Brief description of the company culture and working environment (2-3 sentences as a single string)",
  "function": "Detailed description of the role, main responsibilities, and key tasks (as a single paragraph string with bullet points using • symbols)",
  "jobRequirements": "Required qualifications, skills, experience, and competencies (as a single paragraph string with bullet points using • symbols)", 
  "offer": "What the company offers including benefits, growth opportunities, and compensation range (as a single paragraph string with bullet points using • symbols)",
  "location": "Work location (city, country or remote/hybrid options)",
  "employmentType": "full-time, part-time, contract, or internship",
  "experienceLevel": "entry-level, mid-level, senior-level, or executive",
  "educationLevel": "high-school, bachelor, master, or phd",
  "salaryRangeMin": numeric_value_in_euros_or_null,
  "salaryRangeMax": numeric_value_in_euros_or_null,
  "skills": ["skill1", "skill2", "skill3", "skill4", "skill5"],
  "companyName": "Exact company/organization name as mentioned in the webpage",
  "companyIndustry": "Industry or business sector of the company",
  "companyDescription": "Brief description of what the company does (1-2 sentences)",
  "companyWebsite": "Company website URL if mentioned",
  "companyAddress": "Company address or location if mentioned"
}

Extract only information that is explicitly mentioned in the content. Use null for missing values.`;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 2000,
      });

      const extractedData = JSON.parse(aiResponse.choices[0].message.content);
      
      // Don't auto-create client here - let frontend handle client selection
      // Just return the extracted company information for manual client handling
      res.json({
        ...extractedData,
        // Include company info for manual client creation/lookup if needed
        extractedCompanyInfo: {
          name: extractedData.companyName,
          industry: extractedData.companyIndustry,
          description: extractedData.companyDescription,
          website: extractedData.companyWebsite,
          address: extractedData.companyAddress
        }
      });
    } catch (error) {
      console.error("URL scraping error:", error);
      res.status(500).json({ message: "Failed to scrape data from URL" });
    }
  });

  // Object storage endpoints for CV uploads
  app.get("/objects/:objectPath(*)", authenticateToken, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", authenticateToken, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Update candidate CV endpoint
  app.put("/api/candidates/:id/cv", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const { cvUrl } = req.body;

      if (!candidateId || !cvUrl) {
        return res.status(400).json({ error: "candidateId and cvUrl are required" });
      }

      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(cvUrl);
      
      // Update the candidate record with the CV path
      await storage.updateCandidate(candidateId, { 
        cvUrl: normalizedPath 
      });

      res.json({ success: true, cvPath: normalizedPath });
    } catch (error) {
      console.error("Error setting candidate CV:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update candidate formatted CV endpoint
  app.put("/api/candidates/:id/formatted-cv", authenticateToken, async (req, res) => {
    try {
      const candidateId = parseInt(req.params.id);
      const { formattedCvUrl } = req.body;

      if (!candidateId || !formattedCvUrl) {
        return res.status(400).json({ error: "candidateId and formattedCvUrl are required" });
      }

      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(formattedCvUrl);
      
      // Update the candidate record with the formatted CV path
      await storage.updateCandidate(candidateId, { 
        formattedCvUrl: normalizedPath 
      });

      res.json({ success: true, formattedCvPath: normalizedPath });
    } catch (error) {
      console.error("Error setting candidate formatted CV:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Dashboard API Routes
  const dashboardService = new DashboardService();

  // Get consolidated dashboard summary
  app.get("/api/dashboard/summary", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }

      const scope = req.query.scope as "recruiter" | "field_manager" || "recruiter";
      const summary = await dashboardService.getDashboardSummary(userId, scope);
      
      res.json(summary);
    } catch (error) {
      console.error("Error getting dashboard summary:", error);
      res.status(500).json({ error: "Failed to get dashboard summary" });
    }
  });

  // Enhanced Dashboard Routes
  
  // Get enhanced dashboard data for new dashboard
  app.get("/api/dashboard/enhanced", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      const recruiterId = req.query.recruiterId ? parseInt(req.query.recruiterId as string) : null;
      const isAdmin = req.user?.role === 'admin';
      
      console.log(`[DASHBOARD-ENHANCED] API called by user ${userId} (${req.user?.full_name}), recruiterId param: ${recruiterId}, isAdmin: ${isAdmin}`);
      
      // If not admin, can only view own data
      const targetUserId = isAdmin && recruiterId ? recruiterId : userId;
      
      // Get real data from database
      const activities = await storage.getActivities();
      const candidates = await storage.getCandidates();
      const vacancies = await storage.getVacancies();
      
      console.log(`[DEBUG] Total candidates: ${candidates.length}, Total vacancies: ${vacancies.length}`);
      if (candidates.length > 0) {
        const candidateStatuses = [...new Set(candidates.map(c => c.status))];
        console.log(`[DEBUG] Candidate statuses found: ${candidateStatuses.join(', ')}`);
      }
      
      // Calculate today's start (midnight)
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      
      // Filter activities for today and target user
      const todayActivities = activities.filter(a => 
        a.userId === targetUserId && 
        new Date(a.createdAt) >= startOfToday && 
        new Date(a.createdAt) < endOfToday
      );
      
      // Calculate real metrics
      const callsMade = todayActivities.filter(a => a.type === 'phone_call' || a.type === 'call').length;
      const candidatesContacted = todayActivities.filter(a => a.type === 'contact' || a.type === 'email' || a.type === 'phone_call').length;
      const interviewsScheduled = todayActivities.filter(a => a.type === 'interview_scheduled').length;
      const cvsSubmitted = todayActivities.filter(a => a.type === 'cv_submitted').length;
      
      // Get intelligently prioritized call list from cached match scores
      console.log(`[CALL-QUEUE] Loading call queue from cached match scores for recruiter ${targetUserId}`);
      
      const topMatches = await storage.getTopMatchesForRecruiter(targetUserId, 30);
      console.log(`[CALL-QUEUE] Loaded ${topMatches.length} cached top matches`);
      
      let callList = topMatches.map(match => {
        const candidate = match.candidate;
        const vacancy = match.vacancy;
        const matchScore = Math.round(match.matchScore);
        
        // Determine priority label based on match score
        let priority: "urgent" | "high" | "medium" | "low" = "medium";
        if (matchScore >= 80) priority = "urgent";
        else if (matchScore >= 70) priority = "high";
        else if (matchScore >= 50) priority = "medium";
        else priority = "low";
        
        return {
          id: candidate.id,
          name: `${candidate.firstName} ${candidate.lastName}`,
          title: candidate.jobTitle || 'No title',
          company: candidate.company || 'Unknown',
          phone: candidate.phone || 'No phone',
          email: candidate.email || 'No email',
          priority,
          vacancyTitle: vacancy.title,
          status: candidate.status || 'not_contacted',
          lastContact: 'No contact', // We can enhance this later with contactAttempts
          matchScore,
          linkedinUrl: candidate.linkedinUrl
        };
      });
      
      // FALLBACK: If no cached scores exist, use priority engine for real-time calculation
      if (callList.length === 0 && targetUserId) {
        console.log(`[CALL-QUEUE] No cached scores found, falling back to priority engine`);
        const priorityActions = await priorityEngine.generateCallQueue(targetUserId, 30);
        
        callList = priorityActions.map(action => {
          const matchScore = Math.round(action.priorityScore * 100); // Priority engine uses 0-1 scale, convert to 0-100
          let priority: "urgent" | "high" | "medium" | "low" = "medium";
          if (matchScore >= 80) priority = "urgent";
          else if (matchScore >= 70) priority = "high";
          else if (matchScore >= 50) priority = "medium";
          else priority = "low";
          
          return {
            id: action.candidate.id,
            name: `${action.candidate.firstName} ${action.candidate.lastName}`,
            title: action.candidate.jobTitle || 'No title',
            company: action.candidate.company || 'Unknown',
            phone: action.candidate.phone || 'No phone',
            email: action.candidate.email || 'No email',
            priority,
            vacancyTitle: action.vacancy.title,
            status: 'not_contacted',
            lastContact: 'No contact',
            matchScore,
            linkedinUrl: action.candidate.linkedinUrl
          };
        });
        
        console.log(`[CALL-QUEUE] Fallback generated ${callList.length} candidates from priority engine`);
      }
      
      const enhancedData = {
        todayMetrics: {
          callsMade,
          candidatesContacted,
          interviewsScheduled,
          cvsSubmitted,
        },
        morningCheckCompleted: callsMade > 0,
        callListPrioritized: callList.length > 0 && callList.some(c => c.matchScore && c.matchScore > 0),
        callList: callList // Return all 30 candidates
      };
      
      res.json(enhancedData);
    } catch (error) {
      console.error("Error getting enhanced dashboard data:", error);
      res.status(500).json({ error: "Failed to get enhanced dashboard data" });
    }
  });

  // Get team status for admin users
  app.get("/api/dashboard/team-status", authenticateToken, async (req, res) => {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Get all active users with their current status (exclude admins as they don't make calls)
      const users = await storage.getUsers();
      
      const recruiters = users.filter(u => u.role === 'user' || u.role === 'recruiter');
      
      // Get only OPEN vacancies and their assignments
      let allVacancies = (await storage.getVacancies()).filter(v => v.status === 'open');
      const allCandidates = await storage.getCandidates();
      
      // Reassign vacancies from admin users to recruiters if needed
      const adminUsers = users.filter(u => u.role === 'admin');
      if (adminUsers.length > 0 && recruiters.length > 0) {
        const adminOwnedVacancies = allVacancies.filter(v => 
          adminUsers.some(admin => admin.id === v.ownerId)
        );
        
        if (adminOwnedVacancies.length > 0) {
          // Distribute vacancies evenly among recruiters
          for (let i = 0; i < adminOwnedVacancies.length; i++) {
            const vacancy = adminOwnedVacancies[i];
            const newOwner = recruiters[i % recruiters.length];
            await storage.updateVacancy(vacancy.id, { ownerId: newOwner.id });
          }
          // Refresh vacancy list after reassignment
          allVacancies = await storage.getVacancies();
        }
      }
      
      // Build team status with real vacancy and candidate data
      const teamStatus = await Promise.all(recruiters.map(async (recruiter) => {
        // Get recruiter's assigned vacancies
        const assignedVacancies = allVacancies.filter(v => v.ownerId === recruiter.id);
        
        // Calculate target calls based on vacancy count
        let targetCallsPerVacancy;
        if (assignedVacancies.length === 0) {
          targetCallsPerVacancy = 0;
        } else if (assignedVacancies.length === 1) {
          targetCallsPerVacancy = 30;
        } else if (assignedVacancies.length === 2) {
          targetCallsPerVacancy = 15;
        } else if (assignedVacancies.length === 3) {
          targetCallsPerVacancy = 10;
        } else {
          targetCallsPerVacancy = Math.max(5, Math.floor(30 / assignedVacancies.length));
        }
        
        const totalTargetCalls = 30; // Always 30 calls per recruiter
        
        // Get candidate assignments for this recruiter (30 total per recruiter, not per vacancy)
        const candidatesToContact = [];
        const usedCandidateIds = new Set();
        
        // First, collect all assigned candidates from all vacancies (no duplicates)
        for (const vacancy of assignedVacancies) {
          const vacancyStatuses = await storage.getCandidateStatuses(vacancy.id);
          
          // Add already assigned candidates
          for (const status of vacancyStatuses) {
            // Skip duplicates
            if (usedCandidateIds.has(status.candidateId)) continue;
            
            usedCandidateIds.add(status.candidateId);
            
            const candidate = allCandidates.find(c => c.id === status.candidateId);
            if (candidate) {
              // Calculate real match score for assigned candidates
              let realMatchScore = 75; // fallback for assigned candidates
              try {
                const { VacancyMatcher } = await import('./services/matcher-service');
                const matchResult = VacancyMatcher.calculateMatchScore(candidate, vacancy);
                realMatchScore = matchResult.totalScore;
              } catch (error) {
                console.warn(`Failed to calculate match score for assigned candidate ${candidate.id}:`, error);
              }
              
              candidatesToContact.push({
                candidateId: candidate.id,
                candidateName: `${candidate.firstName} ${candidate.lastName}`,
                vacancyId: vacancy.id,
                vacancyTitle: vacancy.title,
                matchScore: realMatchScore,
                status: status.status
              });
            }
          }
          
          // If we don't have enough candidates yet, add some unassigned candidates
          const candidatesNeeded = Math.max(0, totalTargetCalls - candidatesToContact.length);
          if (candidatesNeeded > 0) {
            const availableCandidates = allCandidates
              .filter(c => !usedCandidateIds.has(c.id))
              .filter(c => c.status === 'active' || c.status === 'Uncontacted' || c.status === 'Not Contacted')
              .slice(0, candidatesNeeded);
            
            for (const match of availableCandidates) {
              // Calculate real match score using the matching algorithm
              let realMatchScore = 50; // fallback
              try {
                const { VacancyMatcher } = await import('./services/matcher-service');
                const matchResult = VacancyMatcher.calculateMatchScore(match, vacancy);
                realMatchScore = matchResult.totalScore;
              } catch (error) {
                console.warn(`Failed to calculate match score for candidate ${match.id}:`, error);
              }
              
              candidatesToContact.push({
                candidateId: match.id,
                candidateName: `${match.firstName} ${match.lastName}`,
                vacancyId: vacancy.id,
                vacancyTitle: vacancy.title,
                matchScore: realMatchScore,
                status: 'to_contact'
              });
              
              usedCandidateIds.add(match.id);
            }
          }
        }
        
        // Sort candidates by match score (high to low)
        candidatesToContact.sort((a, b) => b.matchScore - a.matchScore);
        
        // Calculate real metrics from activities and database data
        const activities = await storage.getActivities();
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const recruiterTodayActivities = activities.filter(a => 
          a.userId === recruiter.id && 
          new Date(a.createdAt) >= startOfToday
        );
        
        // Get real metrics from activities
        let callsMade = recruiterTodayActivities.filter(a => a.type === 'phone_call' || a.type === 'call').length;
        let candidatesContacted = recruiterTodayActivities.filter(a => a.type === 'contact' || a.type === 'email' || a.type === 'phone_call').length;
        let interviewsScheduled = recruiterTodayActivities.filter(a => a.type === 'interview_scheduled').length;
        let cvsSubmitted = recruiterTodayActivities.filter(a => a.type === 'cv_submitted').length;
        
        // Show real metrics only - no mock data
        
        return {
          id: recruiter.id,
          name: recruiter.fullName || recruiter.email,
          avatar: null,
          currentActivity: "Working",
          currentPhase: "morning_calls",
          assignedVacancies: await Promise.all(assignedVacancies.map(async (v) => {
            const client = await storage.getClient(v.clientId);
            return {
              id: v.id,
              title: v.title,
              clientName: client?.name || 'Unknown Client'
            };
          })),
          candidatesToContact: candidatesToContact, // Show all candidates (already limited to 30)
          dailyProgress: {
            calls: callsMade,
            targetCalls: totalTargetCalls,
            candidatesContacted,
            interviewsScheduled,
            cvsSubmitted,
          },
          isActive: recruiter.isActive,
          lastActivity: null
        };
      }));
      
      res.json(teamStatus);
    } catch (error) {
      console.error("Error getting team status:", error);
      res.status(500).json({ error: "Failed to get team status" });
    }
  });

  // Get priority call queue for recruiter  
  app.get("/api/dashboard/call-queue", authenticateToken, async (req, res) => {
    try {
      const recruiterId = req.user?.id;
      if (!recruiterId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const targetSize = parseInt(req.query.limit as string) || 30;
      console.log(`🎯 API: Generating call queue for recruiter ${recruiterId}, size: ${targetSize}`);
      
      const callQueue = await priorityEngine.generateCallQueue(recruiterId, targetSize);
      
      res.json({
        success: true,
        dailyTarget: targetSize,
        currentProgress: 0, // Will be calculated based on completed actions
        queue: callQueue
      });
    } catch (error) {
      console.error("Error generating call queue:", error);
      res.status(500).json({ error: "Failed to generate call queue" });
    }
  });

  // Log call outcome with Priority Engine integration
  app.post("/api/dashboard/log-call", authenticateToken, async (req, res) => {
    try {
      const { candidateId, vacancyId, method, outcome, notes } = req.body;
      const recruiterId = req.user?.id;
      
      if (!recruiterId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      console.log(`📞 API: Logging call - Candidate: ${candidateId}, Method: ${method}, Outcome: ${outcome}`);

      // Use Priority Engine to log the attempt and schedule follow-ups
      const contactAttempt = await priorityEngine.logContactAttempt(
        candidateId,
        vacancyId || 1, // Default vacancy if not provided
        recruiterId,
        method || 'phone',
        outcome,
        notes
      );

      // Also create legacy activity record for reporting
      const activity = {
        type: 'call',
        description: `${method || 'Phone'} contact with candidate #${candidateId} - ${notes || `Outcome: ${outcome}`}`,
        relatedType: 'candidate',
        relatedId: candidateId,
        userId: recruiterId,
      };
      
      await storage.createActivity(activity);
      
      // Update candidate last contact date
      await storage.updateCandidate(candidateId, {
        updatedAt: new Date(),
      });
      
      res.json({ 
        success: true, 
        contactAttemptId: contactAttempt.id,
        message: "Contact logged and follow-up scheduled"
      });
    } catch (error) {
      console.error("Error logging call:", error);
      res.status(500).json({ error: "Failed to log call" });
    }
  });

  // Move candidate between pipeline phases
  app.post("/api/dashboard/move-candidate", authenticateToken, async (req, res) => {
    try {
      const { candidateId, fromPhase, toPhase } = req.body;
      
      // Map phase to status
      const statusMap: Record<string, string> = {
        not_contacted: "New",
        contacted: "Contacted",
        screening: "Screening",
        introduced: "Submitted",
        interviews: "Interview",
        contracting: "Offer",
        placed: "Placed",
        rejected: "Rejected"
      };
      
      const newStatus = statusMap[toPhase] || toPhase;
      
      await storage.updateCandidate(candidateId, {
        status: newStatus,
      });
      
      // Log the pipeline movement as an activity
      await storage.createActivity({
        type: 'status_change',
        description: `Moved candidate to ${newStatus} - Pipeline phase changed from ${fromPhase} to ${toPhase}`,
        relatedType: 'candidate',
        relatedId: candidateId,
        userId: req.user!.id,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error moving candidate:", error);
      res.status(500).json({ error: "Failed to move candidate" });
    }
  });

  // Get KPI data
  app.get("/api/dashboard/kpis", authenticateToken, async (req, res) => {
    try {
      const userId = req.user?.id;
      const recruiterId = req.query.recruiterId ? parseInt(req.query.recruiterId as string) : null;
      const isAdmin = req.user?.role === 'admin';
      
      const targetUserId = isAdmin && recruiterId ? recruiterId : userId;
      
      // Calculate real KPI data from database
      const activities = await storage.getActivities();
      const candidates = await storage.getCandidates();
      
      // Calculate time periods
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const startOfWeek = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      // Filter activities by target user and time periods
      const userActivities = activities.filter(a => a.userId === targetUserId);
      const todayActivities = userActivities.filter(a => new Date(a.createdAt) >= startOfToday);
      const weekActivities = userActivities.filter(a => new Date(a.createdAt) >= startOfWeek);
      const monthActivities = userActivities.filter(a => new Date(a.createdAt) >= startOfMonth);
      
      // Calculate metrics for each period
      const calculateMetrics = (activities) => ({
        callsMade: activities.filter(a => a.type === 'phone_call' || a.type === 'call').length,
        candidatesContacted: activities.filter(a => a.type === 'contact' || a.type === 'email' || a.type === 'phone_call').length,
        newCandidatesAdded: activities.filter(a => a.type === 'candidate_added').length,
        interviewsScheduled: activities.filter(a => a.type === 'interview_scheduled').length,
        cvsSubmitted: activities.filter(a => a.type === 'cv_submitted').length,
        introsSent: activities.filter(a => a.type === 'intro_sent').length,
        placementsMade: activities.filter(a => a.type === 'placement').length,
      });
      
      const dailyMetrics = calculateMetrics(todayActivities);
      const weeklyMetrics = calculateMetrics(weekActivities);
      const monthlyMetrics = calculateMetrics(monthActivities);
      
      // Calculate conversion rates and additional metrics
      const weeklyConversionRate = weeklyMetrics.candidatesContacted > 0 
        ? Math.round((weeklyMetrics.interviewsScheduled / weeklyMetrics.candidatesContacted) * 100)
        : 0;
      const monthlyConversionRate = monthlyMetrics.candidatesContacted > 0
        ? Math.round((monthlyMetrics.interviewsScheduled / monthlyMetrics.candidatesContacted) * 100)
        : 0;
      
      // Generate trends for the last 5 days
      const trends = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      for (let i = 4; i >= 0; i--) {
        const date = new Date(today.getTime() - (i * 24 * 60 * 60 * 1000));
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const dayActivities = userActivities.filter(a => {
          const activityDate = new Date(a.createdAt);
          return activityDate >= dayStart && activityDate < dayEnd;
        });
        
        trends.push({
          date: dayNames[date.getDay()],
          calls: dayActivities.filter(a => a.type === 'phone_call' || a.type === 'call').length,
          contacts: dayActivities.filter(a => a.type === 'contact' || a.type === 'email' || a.type === 'phone_call').length,
          interviews: dayActivities.filter(a => a.type === 'interview_scheduled').length,
          placements: dayActivities.filter(a => a.type === 'placement').length
        });
      }
      
      // Get KPI targets from database
      const kpiTargets = await storage.getKpiTargets(targetUserId);

      const kpiData = {
        daily: dailyMetrics,
        weekly: {
          ...weeklyMetrics,
          conversionRate: weeklyConversionRate,
          avgTimeToFill: 0, // Would need more complex calculation
          clientSatisfaction: 0, // Would need client feedback data
        },
        monthly: {
          ...monthlyMetrics,
          conversionRate: monthlyConversionRate,
          avgTimeToFill: 0, // Would need more complex calculation
          clientSatisfaction: 0, // Would need client feedback data
          revenue: 0, // Would need revenue tracking
          costPerHire: 0, // Would need cost tracking
          qualityOfHire: 0, // Would need performance tracking
        },
        targets: kpiTargets,
        trends,
      };
      
      res.json(kpiData);
    } catch (error) {
      console.error("Error getting KPI data:", error);
      res.status(500).json({ error: "Failed to get KPI data" });
    }
  });

  // Get pipeline data with filters
  app.get("/api/dashboard/pipeline", authenticateToken, async (req, res) => {
    try {
      // Get VTiger total count from sync_metadata (much faster and more reliable than querying VTiger)
      let vtigerTotalCount = 0;
      try {
        // Get latest sync metadata which contains the authoritative VTiger total
        const latestSync = await db
          .select()
          .from(syncMetadata)
          .orderBy(desc(syncMetadata.startedAt))
          .limit(1);
        
        if (latestSync.length > 0 && latestSync[0].vtigerTotal) {
          vtigerTotalCount = latestSync[0].vtigerTotal;
          console.log(`📊 Pipeline Health showing VTiger total from sync_metadata: ${vtigerTotalCount}`);
        } else {
          // Fallback to database count if no sync metadata exists
          const candidates = await storage.getCandidates();
          vtigerTotalCount = candidates.length;
          console.log(`📊 No sync metadata found, using database count: ${vtigerTotalCount}`);
        }
      } catch (error) {
        console.error("Failed to get VTiger total count from sync_metadata:", error);
        // Fallback to database count on error
        const candidates = await storage.getCandidates();
        vtigerTotalCount = candidates.length;
      }
      
      // Get ALL candidates from VTiger - no filtering
      // Pipeline Health should show total VTiger count and all stages should add up to it
      const candidates = await storage.getCandidates();
      
      // Map candidate statuses to pipeline stages - extended for actual Vtiger statuses
      const statusMap: { [key: string]: string } = {
        'Uncontacted': 'not_contacted',
        'Not Contacted': 'not_contacted', 
        'Enriching': 'not_contacted',
        'Contacted': 'contacted',
        'First Call': 'contacted',
        'Screened': 'first_screening',
        'First Screening': 'first_screening',
        'Qualified': 'first_screening',
        'Introduced': 'introduced',
        'Client Review': 'introduced',
        'Interview Scheduled': 'interviews',
        'Interviewing': 'interviews',
        'Final Interview': 'interviews',
        'Had 1st Interview': 'interviews',
        'Had 2nd Interview': 'interviews', 
        'Had 3rd Interview': 'interviews',
        'Had 4th Interview': 'interviews',
        'Contract': 'contracting',
        'Contracting': 'contracting',
        'Negotiating': 'contracting',
        'Offer Made': 'contracting',
        'Placed': 'placed',
        'Started': 'placed',
        'Rejected': 'rejected',
        'Rejected (Client)': 'rejected',
        'Rejected (JO)': 'rejected',
        'Declined': 'rejected',
        'Not Suitable': 'rejected',
        'Blacklist': 'rejected'
      };
      
      // Count candidates by pipeline stage
      const pipelineCounts = {
        not_contacted: 0,
        contacted: 0,
        first_screening: 0,
        introduced: 0,
        interviews: 0,
        contracting: 0,
        placed: 0,
        rejected: 0
      };
      
      // Track unique statuses for debugging
      const uniqueStatuses = new Set();
      
      candidates.forEach(candidate => {
        const originalStatus = candidate.status || 'Uncontacted';
        uniqueStatuses.add(originalStatus);
        const stage = statusMap[originalStatus] || 'not_contacted';
        pipelineCounts[stage]++;
      });
      
      console.log(`[PIPELINE-DEBUG] Found ${uniqueStatuses.size} unique statuses:`, Array.from(uniqueStatuses));
      console.log(`[PIPELINE-DEBUG] Status breakdown:`, Object.fromEntries(
        Array.from(uniqueStatuses).map(status => [
          status, 
          candidates.filter(c => (c.status || 'Uncontacted') === status).length
        ])
      ));
      
      // Add blacklist count
      const blacklistCount = candidates.filter(c => (c.status || 'Uncontacted') === 'Blacklist').length;
      
      // Calculate total from all pipeline stages for verification
      const calculatedTotal = pipelineCounts.not_contacted + pipelineCounts.contacted + pipelineCounts.first_screening + pipelineCounts.introduced + pipelineCounts.interviews + pipelineCounts.contracting + pipelineCounts.placed + pipelineCounts.rejected;
      
      console.log(`[PIPELINE-TOTAL-DEBUG] VTiger total: ${vtigerTotalCount}, Candidates in DB: ${candidates.length}, Sum of stages: ${calculatedTotal}`);
      
      // Verify sync status
      if (calculatedTotal !== candidates.length) {
        console.warn(`⚠️ MISMATCH: Sum of pipeline stages (${calculatedTotal}) doesn't match candidate count (${candidates.length})`);
      }
      
      // Create pipeline data that matches the frontend structure exactly
      // Pipeline Health always shows VTiger total (authoritative count)
      // Note: After full sync completes, calculatedTotal will equal vtigerTotalCount
      const pipelineData = {
        totalActive: pipelineCounts.not_contacted + pipelineCounts.contacted + pipelineCounts.first_screening + pipelineCounts.introduced + pipelineCounts.interviews + pipelineCounts.contracting,
        totalCandidates: vtigerTotalCount, // Always show VTiger authoritative total (23,365)
        syncedCandidates: calculatedTotal, // How many are actually synced to platform
        totalExcluded: 0,
        allCandidates: candidates.map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        notContacted: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'not_contacted').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        contacted: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'contacted').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        first_screening: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'first_screening').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        introduced: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'introduced').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        interviews: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'interviews').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        contracting: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'contracting').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        placed: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'placed').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        rejected: candidates.filter(c => statusMap[c.status || 'Uncontacted'] === 'rejected').map(c => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          status: c.status || 'Uncontacted',
          company: c.company || 'Unknown',
          priority: 'medium',
          daysInPhase: 0,
          lastActivity: new Date()
        })),
        stages: {
          not_contacted: {
            count: pipelineCounts.not_contacted,
            label: 'Not Contacted',
            percentage: Math.round((pipelineCounts.not_contacted / candidates.length) * 100) || 0
          },
          contacted: {
            count: pipelineCounts.contacted,
            label: 'Contacted', 
            percentage: Math.round((pipelineCounts.contacted / candidates.length) * 100) || 0
          },
          first_screening: {
            count: pipelineCounts.first_screening,
            label: 'First Screening',
            percentage: Math.round((pipelineCounts.first_screening / candidates.length) * 100) || 0
          },
          introduced: {
            count: pipelineCounts.introduced,
            label: 'Introduced',
            percentage: Math.round((pipelineCounts.introduced / candidates.length) * 100) || 0
          },
          interviews: {
            count: pipelineCounts.interviews,
            label: 'Interviews',
            percentage: Math.round((pipelineCounts.interviews / candidates.length) * 100) || 0
          },
          contracting: {
            count: pipelineCounts.contracting,
            label: 'Contracting',
            percentage: Math.round((pipelineCounts.contracting / candidates.length) * 100) || 0
          },
          placed: {
            count: pipelineCounts.placed,
            label: 'Placed',
            percentage: Math.round((pipelineCounts.placed / candidates.length) * 100) || 0
          },
          rejected: {
            count: pipelineCounts.rejected,
            label: 'Rejected',
            percentage: Math.round((pipelineCounts.rejected / candidates.length) * 100) || 0
          },
        }
      };
      
      console.log(`[DEBUG] Pipeline data: ${JSON.stringify(pipelineCounts)}`);
      
      res.json(pipelineData);
    } catch (error) {
      console.error("Error getting pipeline data:", error);
      res.status(500).json({ error: "Failed to get pipeline data" });
    }
  });

  // Get cadence due list for role
  app.get("/api/dashboard/cadence", authenticateToken, async (req, res) => {
    try {
      const role = req.query.role as "recruiter" | "field_manager" || "recruiter";
      const cadenceItems = await dashboardService.getCadenceDueList(role);
      
      res.json(cadenceItems);
    } catch (error) {
      console.error("Error getting cadence items:", error);
      res.status(500).json({ error: "Failed to get cadence items" });
    }
  });

  // Client notifications API
  app.get("/api/notifications/client-updates", authenticateToken, async (req, res) => {
    try {
      const notifications = aiClientEnhancer.getNotifications(false);
      res.json(notifications);
    } catch (error) {
      console.error("Failed to fetch client notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/:id/resolve", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const success = aiClientEnhancer.markNotificationResolved(id);
      if (success) {
        res.json({ success: true });
      } else {
        res.status(404).json({ message: "Notification not found" });
      }
    } catch (error) {
      console.error("Failed to resolve notification:", error);
      res.status(500).json({ message: "Failed to resolve notification" });
    }
  });

  // Completeness audit endpoint to show field coverage statistics
  app.get("/api/vtiger/completeness-audit", authenticateToken, async (req, res) => {
    try {
      const vtigerStorage = storage as VtigerStorage;
      
      console.log('🔍 Starting completeness audit for all candidates...');
      
      // Get all candidates for analysis
      const candidates = await vtigerStorage.getCandidatesForBackfill();
      
      const fieldStats = {
        total: candidates.length,
        coverage: {
          titleDescription: 0,
          profileSummary: 0,
          company: 0,
          companyLocation: 0,
          branche: 0,
          location: 0,
          durationCurrentRole: 0,
          durationAtCompany: 0,
          pastEmployer: 0,
          pastRoleTitle: 0,
          pastExperienceDuration: 0,
          linkedinUrl: 0,
          scrapedOn: 0,
          salaryRangeMin: 0,
          salaryRangeMax: 0,
          salaryCurrency: 0
        },
        percentages: {} as any
      };
      
      // Analyze field completeness
      for (const candidate of candidates) {
        if (candidate.titleDescription && candidate.titleDescription.trim() !== "") {
          fieldStats.coverage.titleDescription++;
        }
        if (candidate.profileSummary && candidate.profileSummary.trim() !== "") {
          fieldStats.coverage.profileSummary++;
        }
        if (candidate.company && candidate.company.trim() !== "") {
          fieldStats.coverage.company++;
        }
        if (candidate.companyLocation && candidate.companyLocation.trim() !== "") {
          fieldStats.coverage.companyLocation++;
        }
        if (candidate.branche && candidate.branche.trim() !== "") {
          fieldStats.coverage.branche++;
        }
        if (candidate.location && candidate.location.trim() !== "") {
          fieldStats.coverage.location++;
        }
        if (candidate.durationCurrentRole && candidate.durationCurrentRole.trim() !== "") {
          fieldStats.coverage.durationCurrentRole++;
        }
        if (candidate.durationAtCompany && candidate.durationAtCompany.trim() !== "") {
          fieldStats.coverage.durationAtCompany++;
        }
        if (candidate.pastEmployer && candidate.pastEmployer.trim() !== "") {
          fieldStats.coverage.pastEmployer++;
        }
        if (candidate.pastRoleTitle && candidate.pastRoleTitle.trim() !== "") {
          fieldStats.coverage.pastRoleTitle++;
        }
        if (candidate.pastExperienceDuration && candidate.pastExperienceDuration.trim() !== "") {
          fieldStats.coverage.pastExperienceDuration++;
        }
        if (candidate.linkedinUrl && candidate.linkedinUrl.trim() !== "") {
          fieldStats.coverage.linkedinUrl++;
        }
        if (candidate.scrapedOn && candidate.scrapedOn.trim() !== "") {
          fieldStats.coverage.scrapedOn++;
        }
        if (candidate.salaryRangeMin && candidate.salaryRangeMin > 0) {
          fieldStats.coverage.salaryRangeMin++;
        }
        if (candidate.salaryRangeMax && candidate.salaryRangeMax > 0) {
          fieldStats.coverage.salaryRangeMax++;
        }
        if (candidate.salaryCurrency && candidate.salaryCurrency.trim() !== "") {
          fieldStats.coverage.salaryCurrency++;
        }
      }
      
      // Calculate percentages
      for (const field in fieldStats.coverage) {
        const count = fieldStats.coverage[field as keyof typeof fieldStats.coverage];
        fieldStats.percentages[field] = ((count / fieldStats.total) * 100).toFixed(1);
      }
      
      console.log('✅ Completeness audit complete:', {
        totalCandidates: fieldStats.total,
        topFields: {
          profileSummary: `${fieldStats.coverage.profileSummary} (${fieldStats.percentages.profileSummary}%)`,
          linkedinUrl: `${fieldStats.coverage.linkedinUrl} (${fieldStats.percentages.linkedinUrl}%)`,
          titleDescription: `${fieldStats.coverage.titleDescription} (${fieldStats.percentages.titleDescription}%)`
        }
      });
      
      res.json(fieldStats);
    } catch (error) {
      console.error('❌ Error in completeness audit:', error);
      res.status(500).json({ error: 'Failed to perform completeness audit', details: error.message });
    }
  });

  // Systematic backfill API to update ALL candidates with complete field mapping
  app.post("/api/vtiger/backfill-candidates", authenticateToken, async (req, res) => {
    try {
      const vtigerStorage = storage as VtigerStorage;
      const { batchSize = 50, startFromId = 0 } = req.body;
      
      console.log(`[BACKFILL] Starting systematic backfill from candidate ID ${startFromId} with batch size ${batchSize}`);
      
      // Get all candidates that need backfilling (have vtigerId but incomplete data)
      const candidatesNeedingBackfill = await vtigerStorage.getCandidatesForBackfill(startFromId, batchSize);
      
      if (candidatesNeedingBackfill.length === 0) {
        return res.json({
          success: true,
          message: "No candidates need backfilling",
          processed: 0,
          completed: true
        });
      }
      
      console.log(`[BACKFILL] Found ${candidatesNeedingBackfill.length} candidates to backfill`);
      
      // Process each candidate with unified mapping
      let processedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];
      
      for (const candidate of candidatesNeedingBackfill) {
        try {
          if (!candidate.vtigerId) {
            continue; // Skip candidates without Vtiger ID
          }
          
          // Fetch fresh data from Vtiger for this candidate
          const vtigerData = await vtigerStorage.fetchVtigerContactById(candidate.vtigerId);
          
          if (vtigerData) {
            // Apply unified field mapping to get complete data
            const { mapVtigerContactUnified } = require('./unified-vtiger-field-mapping');
            const completeData = mapVtigerContactUnified(vtigerData);
            
            // Update candidate with complete data, preserving existing fields that shouldn't be overwritten
            const updateData = {
              ...completeData,
              vtigerId: candidate.vtigerId,
              lastSyncedAt: new Date()
            };
            
            // Remove fields that should not be updated during backfill
            delete updateData.id;
            delete updateData.createdAt;
            delete updateData.source; // Preserve original source
            
            await vtigerStorage.updateCandidate(candidate.id, updateData);
            processedCount++;
            
            console.log(`[BACKFILL] Updated candidate ${candidate.id} (${candidate.firstName} ${candidate.lastName})`);
          } else {
            console.warn(`[BACKFILL] No Vtiger data found for candidate ${candidate.id} with vtigerId ${candidate.vtigerId}`);
          }
        } catch (error) {
          errorCount++;
          const errorMsg = `Failed to backfill candidate ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.error(`[BACKFILL] ${errorMsg}`);
        }
      }
      
      const nextStartId = candidatesNeedingBackfill.length > 0 ? 
        candidatesNeedingBackfill[candidatesNeedingBackfill.length - 1].id + 1 : 
        startFromId;
      
      console.log(`[BACKFILL] Batch complete: ${processedCount} processed, ${errorCount} errors`);
      
      res.json({
        success: true,
        message: `Backfill batch completed`,
        processed: processedCount,
        errors: errorCount,
        errorDetails: errors.slice(0, 10), // Return first 10 errors
        nextStartId,
        completed: candidatesNeedingBackfill.length < batchSize
      });
      
    } catch (error) {
      console.error("Error during candidate backfill:", error);
      res.status(500).json({
        success: false,
        message: "Backfill process failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

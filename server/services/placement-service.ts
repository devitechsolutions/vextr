import { eq } from "drizzle-orm";
import { DatabaseStorage } from "../storage";
import { InsertPlacement, InsertTodo, users } from "@shared/schema";
import { db } from "../db";

export class PlacementService {
  private storage: DatabaseStorage;

  constructor(storage: DatabaseStorage) {
    this.storage = storage;
  }

  /**
   * Creates a placement record and automatically generates a revenue tracking todo for admins
   */
  async createPlacementWithRevenueTracking(placementData: InsertPlacement): Promise<{
    placement: any;
    revenueTrackingTodo: any;
  }> {
    try {
      // Create the placement record
      const placement = await this.storage.createPlacement(placementData);
      
      // Get all admin users to assign the revenue tracking todo
      const adminUsers = await this.getAdminUsers();
      
      if (adminUsers.length === 0) {
        throw new Error("No admin users found to assign revenue tracking todo");
      }

      // Get candidate and vacancy details for the todo description
      const candidate = await this.storage.getCandidate(placement.candidateId);
      const vacancy = await this.storage.getVacancy(placement.vacancyId);
      const client = await this.storage.getClient(placement.clientId);

      const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown Candidate';
      const vacancyTitle = vacancy ? vacancy.title : 'Unknown Position';
      const clientName = client ? client.name : 'Unknown Client';

      // Create todo for the first admin user (or you could create one for each admin)
      const adminUser = adminUsers[0];
      
      const todoData: InsertTodo = {
        userId: adminUser.id,
        title: `💰 Input Revenue for Placement: ${candidateName}`,
        description: `Please input the revenue details for the placement of ${candidateName} in the ${vacancyTitle} position at ${clientName}.\n\n` +
                    `Placement Details:\n` +
                    `• Candidate: ${candidateName}\n` +
                    `• Position: ${vacancyTitle}\n` +
                    `• Client: ${clientName}\n` +
                    `• Employment Type: ${placement.employmentType}\n` +
                    `• Start Date: ${placement.startDate.toDateString()}\n\n` +
                    `Please update this placement with:\n` +
                    `• Buy Rate (what we pay candidate)\n` +
                    `• Sell Rate (what client pays us)\n` +
                    `• Calculated margin and percentage\n\n` +
                    `This will help track accurate revenue in our KPIs.`,
        priority: "high",
        status: "pending",
        relatedType: "placement",
        relatedId: placement.id,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Due in 24 hours
      };

      const revenueTrackingTodo = await this.storage.createTodo(todoData);

      console.log(`✅ Created placement ${placement.id} and revenue tracking todo ${revenueTrackingTodo.id} for admin ${adminUser.email}`);

      return {
        placement,
        revenueTrackingTodo
      };
    } catch (error) {
      console.error("Error creating placement with revenue tracking:", error);
      throw error;
    }
  }

  /**
   * Creates a placement from a candidate status change to "Placed"
   */
  async createPlacementFromCandidateStatus(
    candidateId: number, 
    vacancyId: number, 
    placedByUserId: number,
    additionalData: {
      employmentType?: string;
      startDate?: Date;
      notes?: string;
    } = {}
  ): Promise<{ placement: any; revenueTrackingTodo: any; }> {
    try {
      // Get candidate and vacancy to determine client
      const candidate = await this.storage.getCandidate(candidateId);
      const vacancy = await this.storage.getVacancy(vacancyId);

      if (!candidate) {
        throw new Error(`Candidate ${candidateId} not found`);
      }
      if (!vacancy) {
        throw new Error(`Vacancy ${vacancyId} not found`);
      }

      // Create placement data
      const placementData: InsertPlacement = {
        candidateId,
        vacancyId,
        clientId: vacancy.clientId,
        placedBy: placedByUserId,
        startDate: additionalData.startDate || new Date(),
        employmentType: additionalData.employmentType || "permanent",
        sellRate: 0, // Will be filled in by admin via the todo
        currency: "EUR",
        status: "active",
        notes: additionalData.notes || `Placement created from candidate status change`
      };

      return await this.createPlacementWithRevenueTracking(placementData);
    } catch (error) {
      console.error("Error creating placement from candidate status:", error);
      throw error;
    }
  }

  /**
   * Get all users with admin role
   */
  private async getAdminUsers() {
    try {
      const adminUsers = await db
        .select()
        .from(users)
        .where(eq(users.role, "admin"));
      
      return adminUsers;
    } catch (error) {
      console.error("Error fetching admin users:", error);
      return [];
    }
  }

  /**
   * Updates placement with revenue information and marks the related todo as completed
   */
  async updatePlacementRevenue(
    placementId: number,
    revenueData: {
      buyRate?: number;
      sellRate: number;
      margin?: number;
      marginPercentage?: number;
    }
  ): Promise<any> {
    try {
      // Calculate margin if not provided
      let margin = revenueData.margin;
      let marginPercentage = revenueData.marginPercentage;
      
      if (revenueData.buyRate && revenueData.sellRate) {
        margin = revenueData.sellRate - revenueData.buyRate;
        marginPercentage = Math.round((margin / revenueData.sellRate) * 100);
      }

      // Update the placement
      const updatedPlacement = await this.storage.updatePlacement(placementId, {
        ...revenueData,
        margin,
        marginPercentage
      });

      // Find and complete the related revenue tracking todo
      const todos = await this.storage.getTodos(1); // Get admin todos
      const relatedTodo = todos.find(todo => 
        todo.relatedType === "placement" && 
        todo.relatedId === placementId && 
        !todo.completed
      );

      if (relatedTodo) {
        await this.storage.updateTodo(relatedTodo.id, {
          status: "completed",
          completed: true
        });
        console.log(`✅ Marked revenue tracking todo ${relatedTodo.id} as completed`);
      }

      console.log(`✅ Updated placement ${placementId} with revenue data`);
      return updatedPlacement;
    } catch (error) {
      console.error("Error updating placement revenue:", error);
      throw error;
    }
  }
}
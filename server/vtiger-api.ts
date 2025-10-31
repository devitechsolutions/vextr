/**
 * Vtiger API Integration
 * 
 * This module provides integration with Vtiger CRM using environment variables
 * to automatically connect as the company's default CRM backend.
 */
import { Router, Request, Response } from "express";
import axios from "axios";
import { createVtigerAPI } from "../client/src/lib/vtiger-api";

// Create router
export const vtigerRouter = Router();

// Check if Vtiger environment variables are available
const hasVtigerCredentials = () => {
  return process.env.VTIGER_BASE_URL && 
         process.env.VTIGER_USERNAME && 
         process.env.VTIGER_ACCESS_KEY;
};

// Create a Vtiger API client using environment variables
// STRICT MODE: No fallbacks - throws error if credentials missing
const createVtigerClient = () => {
  if (!hasVtigerCredentials()) {
    throw new Error("Vtiger credentials are required but missing. This application requires a live Vtiger CRM connection.");
  }
  
  return createVtigerAPI(
    process.env.VTIGER_BASE_URL as string,
    process.env.VTIGER_USERNAME as string,
    process.env.VTIGER_ACCESS_KEY as string
  );
};

// Get environment configuration
vtigerRouter.get("/env-config", (req: Request, res: Response) => {
  const hasCredentials = hasVtigerCredentials();
  
  res.json({
    hasCredentials,
    serverUrl: hasCredentials ? process.env.VTIGER_BASE_URL : null,
    username: hasCredentials ? process.env.VTIGER_USERNAME : null,
  });
});

// Verify connection
vtigerRouter.get("/verify-connection", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    const isConnected = await vtigerClient.verifyConnection();
    
    res.json({
      success: isConnected,
      message: isConnected 
        ? "Successfully connected to Vtiger CRM" 
        : "Failed to connect to Vtiger CRM"
    });
  } catch (error) {
    console.error("Vtiger connection verification error:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying Vtiger connection",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get modules
vtigerRouter.get("/modules", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    const modules = await vtigerClient.getModules();
    
    res.json({
      success: true,
      modules
    });
  } catch (error) {
    console.error("Error fetching Vtiger modules:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Vtiger modules",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Sync candidates
vtigerRouter.post("/sync/candidates", async (req: Request, res: Response) => {
  try {
    const { candidates } = req.body;
    
    if (!candidates || !Array.isArray(candidates)) {
      return res.status(400).json({
        success: false,
        message: "Invalid candidates data"
      });
    }
    
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    const result = await vtigerClient.syncCandidates(candidates);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error("Error syncing candidates with Vtiger:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing candidates with Vtiger",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Sync clients
vtigerRouter.post("/sync/clients", async (req: Request, res: Response) => {
  try {
    const { clients } = req.body;
    
    if (!clients || !Array.isArray(clients)) {
      return res.status(400).json({
        success: false,
        message: "Invalid clients data"
      });
    }
    
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    const result = await vtigerClient.syncClients(clients);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error("Error syncing clients with Vtiger:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing clients with Vtiger",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get extraction status endpoint - connects to actual sync service and database
vtigerRouter.get("/extraction-status", async (req: Request, res: Response) => {
  try {
    // Get the sync service instance
    const { syncService } = await import('./sync/vtiger-controller');
    let status = syncService.getSyncStatus();
    
    // If service shows not running, check database for active syncs
    if (!status.isRunning) {
      const { db } = await import('./db');
      const { syncMetadata } = await import('@shared/schema');
      const { desc } = await import('drizzle-orm');
      
      // Get latest sync metadata from database
      const latestSync = await db
        .select()
        .from(syncMetadata)
        .orderBy(desc(syncMetadata.startedAt))
        .limit(1);
      
      if (latestSync.length > 0 && latestSync[0].status === 'running') {
        const syncData = latestSync[0];
        const processed = syncData.fetchedCount || 0;
        const total = syncData.vtigerTotal || 0;
        const startedAt = syncData.startedAt;
        
        // Calculate rate from database data
        let rate = 0;
        if (startedAt && processed > 0) {
          const elapsedSeconds = (Date.now() - new Date(startedAt).getTime()) / 1000;
          rate = Math.round(processed / elapsedSeconds);
        }
        
        // Override status with database data
        status = {
          ...status,
          isRunning: true,
          processedCandidates: processed,
          totalCandidates: total,
          progressPercentage: total > 0 ? Math.round((processed / total) * 100) : 0,
          rate: Math.max(0, rate),
          message: 'Syncing candidates from Vtiger...'
        };
      }
    }
    
    // Return real progress data
    res.json({
      success: true,
      status: {
        isRunning: status.isRunning,
        progressPercentage: status.progressPercentage,
        processedCandidates: status.processedCandidates,
        totalCandidates: status.totalCandidates,
        rate: status.rate,
        message: status.message
      },
      message: status.isRunning ? 'Extraction in progress' : 'Ready'
    });
  } catch (error) {
    console.error("Extraction status error:", error);
    res.status(500).json({
      success: false,
      error: "Cannot check extraction status"
    });
  }
});

// Import contacts
vtigerRouter.get("/import/contacts", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    const contacts = await vtigerClient.importContacts();
    
    res.json({
      success: true,
      contacts
    });
  } catch (error) {
    console.error("Error importing contacts from Vtiger:", error);
    res.status(500).json({
      success: false,
      message: "Error importing contacts from Vtiger",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Import accounts (organizations)
vtigerRouter.get("/import/accounts", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    const accounts = await vtigerClient.importAccounts();
    
    res.json({
      success: true,
      accounts
    });
  } catch (error) {
    console.error("Error importing accounts from Vtiger:", error);
    res.status(500).json({
      success: false,
      message: "Error importing accounts from Vtiger",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Test connection with detailed debugging
vtigerRouter.get("/test-connection", async (req: Request, res: Response) => {
  try {
    const serverUrl = process.env.VTIGER_BASE_URL;
    const username = process.env.VTIGER_USERNAME;
    const accessKey = process.env.VTIGER_ACCESS_KEY;
    
    if (!serverUrl || !username || !accessKey) {
      return res.json({
        success: false,
        message: "Missing credentials",
        details: {
          hasServerUrl: !!serverUrl,
          hasUsername: !!username,
          hasAccessKey: !!accessKey
        }
      });
    }
    
    // Test basic connectivity first
    const baseUrl = serverUrl.endsWith('/') ? serverUrl : serverUrl + '/';
    const testUrl = `${baseUrl}webservice.php`;
    
    try {
      // Test with the actual username from environment
      const challengeResponse = await axios.get(`${testUrl}?operation=getchallenge&username=${encodeURIComponent(username)}`);
      
      res.json({
        success: true,
        message: "Connection test results",
        details: {
          serverUrl: serverUrl,
          username: username,
          challengeResponse: challengeResponse.data,
          testUrl: testUrl
        }
      });
    } catch (error: any) {
      res.json({
        success: false,
        message: "Connection failed",
        details: {
          serverUrl: serverUrl,
          username: username,
          error: error.response?.data || error.message,
          testUrl: testUrl
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Test connection error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Raw query endpoint for diagnostics
vtigerRouter.post("/raw-query", async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        message: "Query is required"
      });
    }
    
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    const result = await vtigerClient.query(query);
    
    res.json({
      success: true,
      query: query,
      result: result
    });
  } catch (error) {
    console.error("Raw query error:", error);
    res.status(500).json({
      success: false,
      message: "Error executing raw query",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// User info endpoint for diagnostics
vtigerRouter.get("/user-info", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }
    
    await vtigerClient.login();
    
    // Try to get user info through a basic query
    try {
      const userInfo = await vtigerClient.query("SELECT * FROM Users LIMIT 1;");
      res.json({
        success: true,
        userInfo: userInfo
      });
    } catch (queryError) {
      // If direct query fails, try alternative approach
      res.json({
        success: false,
        message: "Cannot access user information",
        error: queryError instanceof Error ? queryError.message : String(queryError)
      });
    }
  } catch (error) {
    console.error("User info error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user info",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Bulk extract fields endpoint
vtigerRouter.post("/bulk-extract-fields", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }

    // Start bulk field extraction process in the background
    // Use the same sync service instance as the controller for proper status tracking
    const syncProcess = vtigerClient.login().then(async () => {
      // Get the shared sync service instance
      const { syncService } = await import('./sync/vtiger-controller');
      
      // Trigger candidate sync to extract/update fields
      return await syncService.syncAll();
    });

    // Don't wait for completion - respond immediately
    syncProcess.catch(error => {
      console.error('Bulk field extraction error:', error);
    });

    res.json({
      success: true,
      message: "Bulk field extraction started"
    });
  } catch (error) {
    console.error("Bulk extract fields error:", error);
    res.status(500).json({
      success: false,
      message: "Error starting bulk field extraction",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// SAFE TEST: Test organization creation in VTiger (ISOLATED from candidates)
vtigerRouter.post("/test-organization-create", async (req: Request, res: Response) => {
  try {
    const vtigerClient = createVtigerClient();
    
    if (!vtigerClient) {
      return res.status(400).json({
        success: false,
        message: "Vtiger credentials not available"
      });
    }

    // Login to VTiger
    await vtigerClient.login();
    
    // Test 1: Check if we can access Accounts module
    console.log("🔍 Testing VTiger Accounts module access...");
    
    let existingAccounts = null;
    let testResults = {
      moduleAccess: "FAILED",
      createOperation: "FAILED",
      cleanup: "N/A"
    };
    
    try {
      // Query existing accounts to test read access
      existingAccounts = await vtigerClient.query("SELECT accountname FROM Accounts LIMIT 1;");
      console.log("✅ Accounts module read access: SUCCESS");
      testResults.moduleAccess = "SUCCESS";
      
      // Test 2: Try to create a test organization
      console.log("🔍 Testing organization creation...");
      
      const testOrgName = `DC_People_Test_${Date.now()}`;
      const testOrg = {
        accountname: testOrgName,
        website: "https://test.dcpeople.nl", 
        phone: "+31-20-1234567",
        email1: "test@dcpeople.nl",
        industry: "IT Services"
      };
      
      // Attempt to create organization
      const createResult = await vtigerClient.query(`
        INSERT INTO Accounts (accountname, website, phone, email1, industry) 
        VALUES ('${testOrg.accountname}', '${testOrg.website}', '${testOrg.phone}', '${testOrg.email1}', '${testOrg.industry}');
      `);
      
      console.log("✅ Organization creation via SQL: SUCCESS");
      console.log("Create result:", createResult);
      testResults.createOperation = "SUCCESS";
      
      // Test 3: Clean up test data
      console.log("🔍 Cleaning up test data...");
      await vtigerClient.query(`DELETE FROM Accounts WHERE accountname = '${testOrgName}';`);
      console.log("✅ Test cleanup: SUCCESS");
      testResults.cleanup = "SUCCESS";
      
      res.json({
        success: true,
        message: "VTiger organization creation test PASSED",
        testResults,
        confidenceScore: 95,
        details: {
          canReadAccounts: true,
          canCreateAccounts: true,
          canDeleteAccounts: true,
          testOrgCreated: testOrgName,
          apiFieldMapping: testOrg
        }
      });
      
    } catch (createError: any) {
      console.error("❌ Organization creation test failed:", createError);
      
      res.json({
        success: false,
        message: "VTiger organization creation test FAILED",
        testResults,
        confidenceScore: 25,
        error: createError.message,
        details: {
          canReadAccounts: !!existingAccounts,
          canCreateAccounts: false,
          errorType: createError.name,
          restriction: "Likely API permissions or field validation issue"
        }
      });
    }
    
  } catch (error: any) {
    console.error("❌ VTiger test connection failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to connect to VTiger for testing",
      confidenceScore: 0,
      error: error.message,
      details: {
        connectionFailed: true,
        possibleCauses: ["Network issues", "Authentication problems", "VTiger server down"]
      }
    });
  }
});
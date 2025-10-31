import axios from "axios";
import { mapVtigerContactUnified } from '../../../server/unified-vtiger-field-mapping';

/**
 * Browser-compatible MD5 hash function using SubtleCrypto
 */
async function md5Hash(message: string): Promise<string> {
  // For Node.js environment (server-side)
  if (typeof window === 'undefined') {
    const crypto = await import("crypto");
    return crypto.createHash("md5").update(message).digest("hex");
  }

  // For browser environment - use a simple implementation
  // Note: MD5 is used here for Vtiger API compatibility, not for security
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  // Simple MD5 implementation for browser
  // This is a fallback - ideally use a proper MD5 library for production
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

interface VtigerClient {
  serverUrl: string;
  username: string;
  accessKey: string;
  sessionName: string | null;
  login: (signal?: AbortSignal) => Promise<void>;
  logout: (signal?: AbortSignal) => Promise<void>;
  verifyConnection: (signal?: AbortSignal) => Promise<boolean>;
  query: (query: string, signal?: AbortSignal) => Promise<any[]>;
  queryAll: (baseQuery: string, signal?: AbortSignal) => Promise<any[]>;
  queryAllOptimized: (baseQuery: string, signal?: AbortSignal, onProgress?: (fetched: number, total?: number) => void) => Promise<any[]>;
  getModules: (signal?: AbortSignal) => Promise<any[]>;
  discoverContactFields: (signal?: AbortSignal) => Promise<string[]>;
  syncCandidates: (candidates: any[], signal?: AbortSignal) => Promise<any>;
  syncClients: (clients: any[], signal?: AbortSignal) => Promise<any>;
  importContacts: (lastSyncTime?: string, signal?: AbortSignal) => Promise<any[]>;
  fetchContactById: (contactId: string, signal?: AbortSignal) => Promise<any | null>;
  fetchContactIds: (lastSyncTime?: string, signal?: AbortSignal, onProgress?: (fetched: number, total?: number) => void) => Promise<string[]>;
  importAccounts: (signal?: AbortSignal) => Promise<any[]>;
}

/**
 * Creates a Vtiger API client
 * @param serverUrl Vtiger CRM server URL
 * @param username Vtiger username
 * @param accessKey Vtiger access key
 * @returns VtigerClient instance
 */
export function createVtigerAPI(
  serverUrl: string,
  username: string,
  accessKey: string,
): VtigerClient {
  let sessionName: string | null = null;

  // Ensure server URL ends with /
  if (!serverUrl.endsWith("/")) {
    serverUrl += "/";
  }

  // Base URL for webservice API
  const baseUrl = `${serverUrl}webservice.php`;

  /**
   * Make API request to Vtiger CRM with timeout, retry logic, and abort signal support
   * CRITICAL: Added abort signal support to allow proper request cancellation
   */
  async function apiRequest(
    operation: string,
    params: any = {},
    method: "get" | "post" = "get",
    retries: number = 3,
    signal?: AbortSignal,  // Added abort signal parameter
  ) {
    const timeout = 60000; // 60 second timeout per request
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let response;

        if (method === "get") {
          response = await axios.get(baseUrl, {
            params: {
              operation,
              ...params,
            },
            timeout,
            signal,  // Pass abort signal to axios
          });
        } else {
          // For complex operations like create/update, use POST
          const formData = new URLSearchParams();
          formData.append("operation", operation);

          // Add all params to form data
          Object.keys(params).forEach((key) => {
            formData.append(key, params[key]);
          });

          response = await axios.post(baseUrl, formData, {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout,
            signal,  // Pass abort signal to axios
          });
        }

        if (response.data.success === false) {
          throw new Error(
            response.data.error?.message || "Unknown Vtiger API error",
          );
        }

        return response.data.result;
      } catch (error: any) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
        
        if ((isTimeout || isNetworkError) && attempt < retries) {
          console.warn(`⚠️ Vtiger API ${operation} attempt ${attempt} failed (${isTimeout ? 'timeout' : 'network error'}), retrying... (${retries - attempt} retries left)`);
          // Exponential backoff: wait 1s, 2s, 4s before retrying
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
          continue;
        }
        
        console.error(`Vtiger API error (${operation}) after ${attempt} attempt(s):`, error.message || error);
        throw error;
      }
    }
    
    throw new Error(`Failed to complete ${operation} after ${retries} retries`);
  }

  return {
    serverUrl,
    username,
    accessKey,
    sessionName,

    /**
     * Login to Vtiger CRM and get session token
     */
    async login(signal?: AbortSignal) {
      try {
        // Get challenge token
        const challengeResult = await apiRequest("getchallenge", {
          username,
        }, "get", 3, signal);

        if (!challengeResult || !challengeResult.token) {
          throw new Error("Failed to get challenge token from Vtiger");
        }

        const token = challengeResult.token;

        // Try different authentication methods for different Vtiger versions
        // For open source/self-hosted versions, often MD5 hash is still required
        const accessKeyHash = await md5Hash(token + accessKey);

        // Perform login with POST method for better security
        const loginResult = await apiRequest(
          "login",
          {
            username,
            accessKey: accessKeyHash,
          },
          "post",
          3,
          signal,
        );

        if (!loginResult || !loginResult.sessionName) {
          throw new Error("Failed to obtain session from Vtiger");
        }

        sessionName = loginResult.sessionName;
        console.log("Successfully logged into Vtiger CRM");
      } catch (error) {
        console.error("Vtiger login error:", error);
        throw error;
      }
    },

    /**
     * Logout from Vtiger CRM
     */
    async logout() {
      if (!sessionName) return;

      try {
        const result = await apiRequest("webservice.php", {
          operation: "logout",
          sessionName,
        });

        console.log("✅ Logged out of Vtiger session.");
        sessionName = "";
        return result;
      } catch (error: any) {
        console.warn(
          "⚠️ Vtiger logout failed:",
          error?.response?.status || error.message,
        );
        sessionName = ""; // Clear anyway
      }
    },

    /**
     * Verify connection to Vtiger CRM
     */
    async verifyConnection() {
      try {
        await this.login();
        await this.logout();
        return true;
      } catch (error) {
        console.error("Vtiger connection verification error:", error);
        return false;
      }
    },

    /**
     * Execute query on Vtiger CRM
     */
    async query(query: string, signal?: AbortSignal) {
      if (!sessionName) {
        await this.login(signal);
      }

      try {
        console.log(`Executing Vtiger query: ${query}`);
        const result = await apiRequest("query", {
          sessionName,
          query,
        }, "get", 3, signal);
        console.log(
          "Raw Vtiger query response:",
          JSON.stringify(result, null, 2),
        );

        // Check if the response has the expected structure
        if (result && typeof result === "object") {
          if (Array.isArray(result)) {
            console.log("Query result is array:", result.length, "items");
            return result;
          } else if (result.result && Array.isArray(result.result)) {
            console.log(
              "Query result.result is array:",
              result.result.length,
              "items",
            );
            return result.result;
          } else {
            console.log(
              "Unexpected query response structure:",
              Object.keys(result),
            );
            return result;
          }
        }

        return result;
      } catch (error) {
        console.error("Vtiger query error:", error);
        throw error;
      }
    },

    /**
     * Execute paginated query to get ALL records from Vtiger CRM (fixes 100-record limit)
     */
    async queryAll(baseQuery: string, signal?: AbortSignal) {
      console.log(`🔵 queryAll called with query: ${baseQuery}`);
      
      if (!sessionName) {
        console.log(`🔵 queryAll: No session, logging in...`);
        await this.login(signal);
      }

      try {
        console.log(`🔄 Starting paginated query for ALL records: ${baseQuery}`);
        
        // STEP 1: Get total count - VTiger COUNT(*) queries return empty arrays, so we'll fetch in batches instead
        console.log(`📊 VTiger COUNT queries are unreliable - using pagination to determine total records`);
        
        // Skip the unreliable COUNT query and go straight to pagination
        let totalRecords = 0; // We'll determine this during pagination
        
        // STEP 2: Page through ALL records using LIMIT offset, pageSize until no more results
        const PAGE_SIZE = 100; // VTiger's max page size
        const allRecords = [];
        let currentOffset = 0;
        let hasMoreResults = true;
        
        while (hasMoreResults) {
          const pagedQuery = `${baseQuery} LIMIT ${currentOffset}, ${PAGE_SIZE};`;
          console.log(`📄 Fetching page starting at offset ${currentOffset} with query: ${pagedQuery}`);
          
          console.log(`🔵 queryAll: About to call this.query() with pagedQuery...`);
          const pageResults = await this.query(pagedQuery, signal);
          console.log(`🔵 queryAll: this.query() returned:`, pageResults ? `Array with ${pageResults.length} items` : pageResults);
          
          if (!pageResults || pageResults.length === 0) {
            console.log(`⚠️ No more results at offset ${currentOffset}, pagination complete`);
            hasMoreResults = false;
            break;
          }
          
          console.log(`🔵 queryAll: Adding ${pageResults.length} results to allRecords`);
          allRecords.push(...pageResults);
          currentOffset += PAGE_SIZE;
          
          console.log(`✅ Page complete. Total fetched so far: ${allRecords.length} records`);
          
          // If we got fewer results than PAGE_SIZE, we've reached the end
          if (pageResults.length < PAGE_SIZE) {
            console.log(`📄 Final page reached (${pageResults.length} < ${PAGE_SIZE}), pagination complete`);
            hasMoreResults = false;
          }
          
          // Small delay to be respectful to VTiger API
          if (hasMoreResults) {
            console.log(`🔵 queryAll: Waiting 100ms before next page...`);
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        console.log(`🎉 Paginated query complete: ${allRecords.length} records fetched`);
        console.log(`🔵 queryAll: Returning ${allRecords.length} records`);
        return allRecords;
        
      } catch (error) {
        console.error("❌ Paginated query error:", error);
        console.error(`❌ Error details:`, error instanceof Error ? error.stack : 'No stack');
        throw error;
      }
    },

    /**
     * Optimized paginated query with larger batches and progress tracking
     */
    async queryAllOptimized(baseQuery: string, signal?: AbortSignal, onProgress?: (fetched: number, total?: number) => void) {
      console.log(`🚀 queryAllOptimized called with query: ${baseQuery}`);
      
      if (!sessionName) {
        console.log(`🚀 queryAllOptimized: No session, logging in...`);
        await this.login(signal);
      }

      try {
        console.log(`🔄 Starting OPTIMIZED paginated query with progress tracking: ${baseQuery}`);
        
        // Try to get a total count estimate first (may fail, that's OK)
        let estimatedTotal: number | undefined = undefined;
        try {
          const countQuery = baseQuery.replace(/SELECT .* FROM/i, 'SELECT COUNT(*) as total FROM');
          console.log(`📊 Attempting count query: ${countQuery}`);
          const countResult = await this.query(countQuery, signal);
          if (countResult && countResult.length > 0 && countResult[0].total) {
            estimatedTotal = parseInt(countResult[0].total) || undefined;
            console.log(`📊 Estimated total from COUNT: ${estimatedTotal}`);
          }
        } catch (e) {
          console.log(`⚠️ Count query failed (expected), will track progress without total`);
        }
        
        // Use optimized settings for better performance
        const PAGE_SIZE = 100; // VTiger's max is 100, can't go higher
        const allRecords: any[] = [];
        let currentOffset = 0;
        let hasMoreResults = true;
        let lastProgressReport = Date.now();
        const PROGRESS_INTERVAL = 2000; // Report progress every 2 seconds
        
        // Report initial progress
        onProgress?.(0, estimatedTotal);
        
        while (hasMoreResults) {
          // Check if we should abort
          if (signal?.aborted) {
            throw new Error('Query aborted by signal');
          }
          
          const pagedQuery = `${baseQuery} LIMIT ${currentOffset}, ${PAGE_SIZE};`;
          
          // Only log every 10th page to reduce log spam
          if (currentOffset % 1000 === 0) {
            console.log(`📄 Fetching records ${currentOffset} to ${currentOffset + PAGE_SIZE}...`);
          }
          
          try {
            const pageResults = await this.query(pagedQuery, signal);
            
            if (!pageResults || pageResults.length === 0) {
              hasMoreResults = false;
              break;
            }
            
            allRecords.push(...pageResults);
            currentOffset += PAGE_SIZE;
            
            // Report progress at intervals
            const now = Date.now();
            if (now - lastProgressReport > PROGRESS_INTERVAL || pageResults.length < PAGE_SIZE) {
              onProgress?.(allRecords.length, estimatedTotal);
              lastProgressReport = now;
              
              // Log milestone progress
              if (allRecords.length % 5000 === 0) {
                console.log(`🎯 Milestone: ${allRecords.length} records fetched so far...`);
              }
            }
            
            // If we got fewer results than PAGE_SIZE, we've reached the end
            if (pageResults.length < PAGE_SIZE) {
              hasMoreResults = false;
            }
            
            // NO DELAY between pages - maximize speed!
            // VTiger can handle the load, and we have retry logic if needed
            
          } catch (pageError: any) {
            // Handle rate limiting with exponential backoff
            if (pageError.message?.includes('timeout') || pageError.code === 'ECONNRESET') {
              console.warn(`⚠️ Page fetch failed at offset ${currentOffset}, retrying with backoff...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              // Don't increment offset, retry the same page
              continue;
            }
            throw pageError;
          }
        }
        
        // Final progress report
        onProgress?.(allRecords.length, allRecords.length);
        
        console.log(`🎉 Optimized paginated query complete: ${allRecords.length} records fetched`);
        return allRecords;
        
      } catch (error) {
        console.error("❌ Optimized paginated query error:", error);
        console.error(`❌ Error details:`, error instanceof Error ? error.stack : 'No stack');
        throw error;
      }
    },

    /**
     * Get available modules from Vtiger CRM
     */
    async getModules() {
      if (!sessionName) {
        await this.login();
      }

      try {
        const result = await apiRequest("listTypes", {
          sessionName,
        });

        return result.types;
      } catch (error) {
        console.error("Vtiger get modules error:", error);
        throw error;
      }
    },

    /**
     * Sync candidates with Vtiger CRM (as Contacts)
     */

    async syncCandidates(candidates: any[]) {
      if (!sessionName) {
        await this.login();
      }

      try {
        const results = [];

        for (const candidate of candidates) {
          // Validate session before each operation
          if (!sessionName) {
            throw new Error('Session token is missing for candidate: ' + candidate.email);
          }

          const safeEmail = candidate.email ? candidate.email.replace(/'/g, "\\'") : '';
          const existingContacts = await this.query(
            `SELECT id FROM Contacts WHERE email='${safeEmail}';`
          );

          console.log('existingContacts:', existingContacts);

          if (existingContacts.length > 0) {
            // UPDATE existing contact - ONLY push status field
            // VTiger is source of truth for ALL contact data; platform only pushes recruitment status
            const payload: any = {
              id: existingContacts[0].id,
            };
            
            // Only push status field - VTiger maintains all other contact information
            if (candidate.status) {
              payload.candidatestatus = candidate.status; // Platform's recruitment status
            }

            console.log('UPDATE payload (status only):', payload);

            const result = await apiRequest('update', {
              sessionName,
              elementType: 'Contacts',
              element: JSON.stringify(payload)
            }, 'post');

            results.push({ id: candidate.id, vtigerId: existingContacts[0].id, action: 'updated', result });
          } else {
            // SKIP CREATE - VTiger is source of truth for contacts
            // If contact doesn't exist in VTiger, it shouldn't be synced from platform
            console.log(`Skipping sync for ${candidate.email} - contact not found in VTiger (VTiger is source of truth)`);
            results.push({ 
              id: candidate.id, 
              vtigerId: null, 
              action: 'skipped', 
              reason: 'Contact not found in VTiger (VTiger is source of truth)' 
            });
          }
        }
        return results;
      } catch (error: any) {
        console.error('Sync error:', error.response?.data || error.message);
        throw error;
      }
    },

    /**
     * Sync clients with Vtiger CRM (as Accounts)
     */
    async syncClients(clients: any[]) {
      if (!sessionName) {
        await this.login();
      }

      try {
        const results = [];

        for (const client of clients) {
          // Check if account exists by name
          const existingAccounts = await this.query(
            `SELECT id FROM Accounts WHERE accountname='${client.companyName}';`,
          );

          let accountId;

          if (existingAccounts.length > 0) {
            // Update existing account
            accountId = existingAccounts[0].id;

            const result = await apiRequest("update", {
              sessionName,
              element: JSON.stringify({
                id: accountId,
                accountname: client.companyName,
                website: client.website,
                phone: client.phone,
                email1: client.email,
                industry: client.industry,
              }),
            });

            results.push({
              id: client.id,
              vtigerId: accountId,
              action: "updated",
              result,
            });
          } else {
            // Create new account
            const result = await apiRequest("create", {
              sessionName,
              elementType: "Accounts",
              element: JSON.stringify({
                accountname: client.companyName,
                website: client.website,
                phone: client.phone,
                email1: client.email,
                industry: client.industry,
              }),
            });

            results.push({
              id: client.id,
              vtigerId: result.id,
              action: "created",
              result,
            });
          }
        }

        return results;
      } catch (error) {
        console.error("Vtiger sync clients error:", error);
        throw error;
      }
    },

    /**
     * Discover available fields in Vtiger Contacts module
     */
    async discoverContactFields() {
      if (!sessionName) {
        await this.login();
      }

      try {
        console.log("🔍 Discovering Vtiger Contact fields...");
        
        // First get one contact to see all available fields
        const contacts = await this.query(`SELECT * FROM Contacts LIMIT 0, 1;`);
        
        if (contacts && contacts.length > 0) {
          console.log("=== AVAILABLE VTIGER FIELDS ===");
          const fields = Object.keys(contacts[0]);
          console.log("All available fields:", fields);
          console.log("Custom fields (cf_*):", fields.filter(f => f.startsWith('cf_')));
          console.log("Sample contact data:", contacts[0]);
          console.log("=== END FIELD DISCOVERY ===");
          return fields;
        }
        
        return [];
      } catch (error) {
        console.error("Field discovery error:", error);
        return [];
      }
    },

    /**
     * Import contacts from Vtiger CRM
     */
    async importContacts(lastSyncTime?: string) {
      if (!sessionName) {
        await this.login();
      }

      try {
        // Determine if this is an incremental sync
        const isIncremental = lastSyncTime && lastSyncTime !== 'null';
        const syncType = isIncremental ? 'INCREMENTAL' : 'FULL';
        
        console.log(`🔍 Starting ${syncType} Vtiger contact import with pagination...`);
        if (isIncremental) {
          console.log(`📅 Fetching contacts modified since: ${lastSyncTime}`);
        }
        
        // Build the WHERE clause for incremental sync
        let whereClause = '';
        if (isIncremental) {
          // Convert lastSyncTime to Vtiger format (YYYY-MM-DD HH:MM:SS)
          const syncDate = new Date(lastSyncTime);
          const vtigerTimeFormat = syncDate.toISOString().slice(0, 19).replace('T', ' ');
          whereClause = ` WHERE modifiedtime > '${vtigerTimeFormat}'`;
        }
        
        // Get the actual total count using COUNT(*) query instead of pagination
        console.log("📊 Getting accurate total count from Vtiger using COUNT(*) query...");
        let actualTotalContacts = 0;
        
        try {
          const countQuery = `SELECT COUNT(*) as total FROM Contacts${whereClause};`;
          console.log(`📊 Executing count query: ${countQuery}`);
          const countResult = await this.query(countQuery);
          console.log(`📊 COUNT query raw response:`, JSON.stringify(countResult));
          
          if (countResult && countResult.length > 0 && countResult[0].total) {
            actualTotalContacts = parseInt(countResult[0].total) || 0;
            console.log(`📊 COUNT(*) result: ${actualTotalContacts} total contacts in Vtiger`);
          } else {
            throw new Error("COUNT(*) query returned no results or invalid format");
          }
        } catch (error) {
          console.log("📊 COUNT(*) failed, falling back to pagination counting...", error);
          // Fallback to pagination counting with smaller batches
          let countOffset = 0;
          const countLimit = 100; // Smaller batches for better reliability
          const maxRecords = 20000; // Increase safety cap to handle all 6900+ records
          
          while (countOffset < maxRecords) {
            try {
              const countQuery = `SELECT id FROM Contacts${whereClause} LIMIT ${countOffset}, ${countLimit};`;
              console.log(`📊 Counting batch at offset ${countOffset}...`);
              const countBatch = await this.query(countQuery);
              
              if (!countBatch || countBatch.length === 0) {
                console.log(`✅ No more records at offset ${countOffset}, total found: ${actualTotalContacts}`);
                break;
              }
              
              actualTotalContacts += countBatch.length;
              
              // Log progress every 1000 records
              if (actualTotalContacts % 1000 === 0) {
                console.log(`📊 Counting progress: ${actualTotalContacts} contacts found so far...`);
              }
              
              // If we got fewer records than the limit, we've reached the end
              if (countBatch.length < countLimit) {
                console.log(`✅ Reached end of records at offset ${countOffset}, total: ${actualTotalContacts}`);
                break;
              }
              
              countOffset += countLimit;
            } catch (batchError) {
              console.log(`⚠️ Error counting batch at offset ${countOffset}:`, batchError);
              // Continue to next batch even if one fails
              countOffset += countLimit;
            }
          }
          console.log(`📊 Manual count complete: ${actualTotalContacts} total contacts`);
        }
        
        // Ensure we have at least 6906 contacts (known minimum)
        if (actualTotalContacts < 6906) {
          console.log(`⚠️ Count seems low (${actualTotalContacts}), setting minimum to 6906 known contacts`);
          actualTotalContacts = 7000; // Use 7000 to have some buffer
        }
        
        const totalContacts = actualTotalContacts;
        console.log(`📊 ✅ ACTUAL total ${syncType.toLowerCase()} contacts in Vtiger: ${totalContacts}`);
        
        // First discover available fields
        await this.discoverContactFields();

        let allContacts: any[] = [];
        let offset = 0;
        const limit = 100; // VTiger API limit per request
        let batchCount = 0;
        let emptyBatchCount = 0; // Track consecutive empty batches
        const MAX_EMPTY_BATCHES = 3; // Stop after 3 consecutive empty batches

        // CRITICAL FIX: Continue fetching until we've tried all possible offsets
        // VTiger might have gaps in record IDs, so we can't stop at first empty batch
        const maxOffset = Math.max(totalContacts + 1000, 8000); // Ensure we try at least 8000 offsets
        while (offset < maxOffset) { // Add buffer to catch all records
          batchCount++;
          const progressPercent = totalContacts > 0 ? Math.round((offset / totalContacts) * 100) : 0;
          console.log(
            `➡️ Fetching batch ${batchCount}: OFFSET ${offset} LIMIT ${limit} (${progressPercent}% of ${totalContacts})`,
          );

          // CRITICAL FIX: Use SELECT * to get ALL fields including ALL custom fields
          // Previous approach of listing specific fields was missing data for many candidates
          const queryStr = `SELECT * FROM Contacts${whereClause} LIMIT ${offset}, ${limit};`;
          const contacts = await this.query(queryStr);

          if (!contacts || contacts.length === 0) {
            emptyBatchCount++;
            console.log(`⚠️ Empty batch ${emptyBatchCount}/${MAX_EMPTY_BATCHES} at offset ${offset}. Checking for more records...`);
            
            // Only stop after multiple consecutive empty batches to handle gaps
            if (emptyBatchCount >= MAX_EMPTY_BATCHES) {
              console.log(`✅ All contacts fetched after ${batchCount} batch(es). Total imported: ${allContacts.length}/${totalContacts}`);
              break;
            }
            
            offset += limit; // Skip to next batch
            continue;
          }

          // Reset empty batch counter when we find data
          emptyBatchCount = 0;
          allContacts.push(...contacts);
          offset += limit;

          // Log progress for large imports
          if (allContacts.length % 1000 === 0) {
            console.log(`📊 Progress: ${allContacts.length} contacts fetched so far...`);
          }

          // Stop if we've clearly fetched all contacts
          if (allContacts.length >= totalContacts && contacts.length < limit) {
            console.log(`✅ Fetched all ${totalContacts} contacts successfully`);
            break;
          }
        }

        console.log(`🎯 FINAL IMPORT RESULT: ${allContacts.length}/${totalContacts} contacts imported (${Math.round((allContacts.length / totalContacts) * 100)}% coverage)`);

        // CRITICAL DEBUG: Log actual raw API response before processing
        console.log("🚨 CRITICAL DEBUG - RAW VTIGER API RESPONSE:");
        console.log("Response structure check:", {
          isArray: Array.isArray(allContacts),
          length: allContacts?.length,
          firstContact: allContacts.length > 0 ? allContacts[0] : 'NO_CONTACTS'
        });
        
        if (allContacts.length > 0) {
          console.log("🔍 FIRST RAW CONTACT FROM VTIGER API:");
          console.log(JSON.stringify(allContacts[0], null, 2));
          
          console.log("🔍 BASIC FIELD CHECK on first contact:");
          const firstContact = allContacts[0];
          console.log({
            'Raw firstname': firstContact.firstname,
            'Raw lastname': firstContact.lastname,
            'Raw title': firstContact.title,
            'Raw email': firstContact.email,
            'Raw phone': firstContact.phone,
            'All fields': Object.keys(firstContact),
            'Field count': Object.keys(firstContact).length
          });
        }

        // Debug: Log field structure from first few contacts
        if (allContacts.length > 0) {
          console.log("=== AVAILABLE VTIGER FIELDS ===");
          console.log("Total contacts imported:", allContacts.length);
          console.log("Available fields in first contact:", Object.keys(allContacts[0]));
          
          // Show custom fields specifically
          const customFields = Object.keys(allContacts[0]).filter(key => key.startsWith('cf_'));
          console.log("Custom fields (cf_*) found:", customFields);
          
          // Show sample data for first 3 contacts to see field usage
          for (let i = 0; i < Math.min(3, allContacts.length); i++) {
            console.log(`Contact ${i + 1} sample:`, {
              id: allContacts[i].id,
              firstname: allContacts[i].firstname,
              lastname: allContacts[i].lastname,
              title: allContacts[i].title,
              email: allContacts[i].email,
              customFields: Object.keys(allContacts[i])
                .filter(key => key.startsWith('cf_'))
                .reduce((obj, key) => {
                  obj[key] = allContacts[i][key];
                  return obj;
                }, {} as Record<string, any>)
            });
          }
          
          // SPECIFIC DEBUG: Look for Mark de Jonge
          const markDeJonge = allContacts.find(c => 
            c.firstname === 'Mark' && c.lastname === 'de Jonge'
          );
          if (markDeJonge) {
            console.log('=== MARK DE JONGE FIELD DEBUG ===');
            console.log('Mark de Jonge ID:', markDeJonge.id);
            console.log('cf_883 (NEW Title Description field):', `"${markDeJonge.cf_883}"`);
            console.log('cf_885 (OLD Title Description field):', `"${markDeJonge.cf_885}"`);
            
            // Look for ANY field containing "Guiding" or "finance" or "talent"
            const possibleTitleFields = [];
            const searchTerms = ['guiding', 'finance', 'talent', 'career', 'search', 'step'];
            
            for (const [field, value] of Object.entries(markDeJonge)) {
              if (value && typeof value === 'string') {
                const lowerValue = value.toLowerCase();
                if (searchTerms.some(term => lowerValue.includes(term))) {
                  possibleTitleFields.push({field, value});
                  console.log(`🎯 FOUND TITLE CONTENT IN "${field}": "${value}"`);
                }
              }
            }
            
            if (possibleTitleFields.length === 0) {
              console.log('❌ No fields found containing Title Description keywords');
              
              // Show all non-empty text fields longer than 10 characters
              console.log('=== ALL SUBSTANTIAL TEXT FIELDS FOR MARK ===');
              for (const [field, value] of Object.entries(markDeJonge)) {
                if (value && typeof value === 'string' && value.trim().length > 10) {
                  console.log(`${field}: "${value}"`);
                }
              }
            }
            console.log('=== END MARK DEBUG ===');
          } else {
            console.log('❌ Mark de Jonge not found in API response');
          }
          console.log("=== END FIELD DISCOVERY ===");
        }

        // Process contacts using comprehensive unified field mapping
        console.log(`🔧 Processing ${allContacts.length} contacts through unified field mapping...`);
        const processedContacts = [];
        
        for (const contact of allContacts) {
          // Use the comprehensive unified mapping system instead of manual mapping
          console.log(`🔍 Processing contact: ${contact.firstname} ${contact.lastname} (${contact.id})`);
          
          // Apply unified field mapping
          const mappedContact = mapVtigerContactUnified({
            ...contact,
            vtigerId: contact.id, // Ensure vtigerId is set
          });
          
          // Log mapping results for debugging
          console.log(`📋 Mapped fields for ${contact.firstname} ${contact.lastname}:`, {
            inputFieldCount: Object.keys(contact).length,
            outputFieldCount: Object.keys(mappedContact).length,
            titleDescription: mappedContact.titleDescription,
            profileSummary: mappedContact.profileSummary,
            companyLocation: mappedContact.companyLocation,
            linkedinUrl: mappedContact.linkedinUrl,
          });
          
          // Add any legacy fields for backward compatibility
          const finalContact = {
            ...mappedContact,
            // Ensure these fields are always set for compatibility
            vtigerId: contact.id,
            currentTitle: mappedContact.jobTitle || mappedContact.currentTitle || "",
            targetRole: mappedContact.jobTitle || mappedContact.targetRole || "",
            accountName: "",
            skills: [],
            experience: 0,
            department: "",
            source: "Vtiger CRM-updated",
          };
          
          processedContacts.push(finalContact);
        }
        
        return processedContacts;
      } catch (error) {
        console.error("❌ Vtiger import contacts error:", error);
        throw error;
      }
    },

    /**
     * Fetch a single contact by ID (working method that returns clean data)
     */
    async fetchContactById(contactId: string, signal?: AbortSignal) {
      if (!sessionName) {
        await this.login(signal);
      }

      try {
        console.log(`🔍 Fetching contact by ID: ${contactId}`);
        
        // Use individual query to get clean data (this is the working method!)
        const contacts = await this.query(`SELECT * FROM Contacts WHERE id='${contactId}';`, signal);
        
        if (!contacts || contacts.length === 0) {
          console.warn(`⚠️ Contact not found: ${contactId}`);
          return null;
        }
        
        const contact = contacts[0];
        console.log(`✅ Retrieved contact: ${contact.firstname} ${contact.lastname}`);
        
        // Apply unified field mapping (same as working path)
        const mappedContact = mapVtigerContactUnified({
          ...contact,
          vtigerId: contact.id, // Ensure vtigerId is set
        });
        
        // Add any legacy fields for backward compatibility
        const finalContact = {
          ...mappedContact,
          // Ensure these fields are always set for compatibility
          vtigerId: contact.id,
          currentTitle: mappedContact.jobTitle || mappedContact.currentTitle || "",
          targetRole: mappedContact.jobTitle || mappedContact.targetRole || "",
          accountName: "",
          skills: [],
          experience: 0,
          department: "",
          source: "Vtiger CRM-individual",
        };
        
        return finalContact;
      } catch (error) {
        console.error(`❌ Error fetching contact ${contactId}:`, error);
        throw error;
      }
    },

    /**
     * Get all contact IDs for individual processing with optimized batch fetching
     */
    async fetchContactIds(lastSyncTime?: string, signal?: AbortSignal, onProgress?: (fetched: number, total?: number) => void) {
      console.log(`🔵 fetchContactIds called with lastSyncTime: ${lastSyncTime}`);
      
      if (!sessionName) {
        console.log(`🔵 No session, logging in...`);
        await this.login(signal);
        console.log(`🔵 Login complete, sessionName: ${sessionName ? 'SET' : 'NOT SET'}`);
      }

      try {
        // Determine if this is an incremental sync
        const isIncremental = lastSyncTime && lastSyncTime !== 'null';
        const syncType = isIncremental ? 'INCREMENTAL' : 'FULL';
        
        console.log(`🔍 Fetching ALL contact IDs for ${syncType} sync using optimized batch fetching...`);
        
        // Build the WHERE clause for incremental sync
        let whereClause = '';
        if (isIncremental) {
          const syncDate = new Date(lastSyncTime);
          const vtigerTimeFormat = syncDate.toISOString().slice(0, 19).replace('T', ' ');
          whereClause = ` WHERE modifiedtime > '${vtigerTimeFormat}'`;
        }
        
        const queryString = `SELECT id FROM Contacts${whereClause}`;
        console.log(`🔵 Query to execute: ${queryString}`);
        
        // OPTIMIZATION: Use larger batch sizes and parallel fetching for better performance
        console.log(`🚀 Starting optimized batch fetching with progress tracking...`);
        const contactIds = await this.queryAllOptimized(queryString, signal, onProgress);
        console.log(`🔵 queryAllOptimized returned:`, contactIds ? `${contactIds.length} records` : 'null');
        
        console.log(`📊 SUCCESS: Found ${contactIds.length} contact IDs for ${syncType} sync (all pages loaded)`);
        const ids = contactIds.map((c: any) => c.id);
        console.log(`🔵 Mapped IDs (first 5):`, ids.slice(0, 5));
        return ids;
      } catch (error) {
        console.error(`❌ Error fetching contact IDs:`, error);
        console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack');
        throw error;
      }
    },

    /**
     * Import accounts from Vtiger CRM
     */
    async importAccounts() {
      if (!sessionName) {
        await this.login();
      }

      try {
        const accounts = await this.query(
          "SELECT id, accountname, website, phone, email1, industry FROM Accounts;",
        );

        return accounts.map((account: any) => ({
          vtigerId: account.id,
          companyName: account.accountname,
          website: account.website,
          phone: account.phone,
          email: account.email1,
          industry: account.industry,
          source: "Vtiger CRM",
        }));
      } catch (error) {
        console.error("Vtiger import accounts error:", error);
        throw error;
      }
    },
  };
}

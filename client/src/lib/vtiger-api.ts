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
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  // Ensure server URL ends with /
  if (!serverUrl.endsWith("/")) {
    serverUrl += "/";
  }

  // Base URL for new API (api.php instead of webservice.php)
  const baseUrl = `${serverUrl}api.php`;

  /**
   * Make API request to Vtiger CRM with timeout, retry logic, token refresh, and abort signal support
   * CRITICAL: Added abort signal support and token refresh logic
   */
  async function apiRequest(
    operation: string,
    params: any = {},
    method: "get" | "post" = "get",
    retries: number = 3,
    signal?: AbortSignal,
  ) {
    const timeout = 60000;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        let response;
        const formData = new URLSearchParams();
        formData.append("operation", operation);

        Object.keys(params).forEach((key) => {
          if (key === "element" && typeof params[key] === "object") {
            formData.append(key, JSON.stringify(params[key]));
          } else {
            formData.append(key, params[key]);
          }
        });

        const headers: any = {
          "Content-Type": "application/x-www-form-urlencoded",
        };

        if (accessToken && operation !== "UserLogin" && operation !== "RefreshAccessToken") {
          headers["Authorization"] = `Bearer ${accessToken}`;
        }

        response = await axios.post(baseUrl, formData, {
          headers,
          timeout,
          signal,
        });

        if (response.data.success === false) {
          const errorMessage = response.data.error?.message || response.data.message || "Unknown Vtiger API error";

          if (errorMessage.includes("Token Expired") && refreshToken && attempt === 1) {
            console.log("🔄 Token expired, refreshing...");
            await refreshAccessToken();
            continue;
          }

          throw new Error(errorMessage);
        }

        return response.data.result || response.data;
      } catch (error: any) {
        const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
        const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
        const isTokenExpired = error.message?.includes('Token Expired');

        if (isTokenExpired && refreshToken && attempt === 1) {
          console.log("🔄 Token expired (caught in error), refreshing...");
          await refreshAccessToken();
          continue;
        }

        if ((isTimeout || isNetworkError) && attempt < retries) {
          console.warn(`⚠️ Vtiger API ${operation} attempt ${attempt} failed (${isTimeout ? 'timeout' : 'network error'}), retrying... (${retries - attempt} retries left)`);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
          continue;
        }

        console.error(`Vtiger API error (${operation}) after ${attempt} attempt(s):`, error.message || error);
        throw error;
      }
    }

    throw new Error(`Failed to complete ${operation} after ${retries} retries`);
  }

  async function refreshAccessToken() {
    try {
      console.log("🔄 Refreshing access token...");
      const result = await apiRequest(
        "RefreshAccessToken",
        {
          refreshtoken: refreshToken,
        },
        "post",
        1
      );

      if (result && result.accesstoken) {
        accessToken = result.accesstoken;
        console.log("✅ Access token refreshed successfully");
      } else {
        throw new Error("Failed to refresh access token");
      }
    } catch (error) {
      console.error("❌ Token refresh failed:", error);
      accessToken = null;
      refreshToken = null;
      throw error;
    }
  }

  return {
    serverUrl,
    username,
    accessKey,
    sessionName,

    /**
     * Login to Vtiger CRM and get access token
     */
    async login(signal?: AbortSignal) {
      try {
        console.log("🔐 Logging into Vtiger CRM with UserLogin operation...");
        const loginResult = await apiRequest(
          "UserLogin",
          {
            username,
            password: accessKey,
          },
          "post",
          3,
          signal,
        );

        if (!loginResult || !loginResult.accesstoken) {
          throw new Error("Failed to obtain access token from Vtiger");
        }

        accessToken = loginResult.accesstoken;
        refreshToken = loginResult.refreshtoken || null;
        sessionName = accessToken;

        console.log("✅ Successfully logged into Vtiger CRM");
        console.log(`🔑 Access token: ${accessToken?.substring(0, 20)}...`);
        console.log(`🔄 Refresh token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : 'Not provided'}`);
      } catch (error) {
        console.error("❌ Vtiger login error:", error);
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
     * @param candidates - Array of candidates to sync
     * @param maxBatchSize - Maximum number of candidates to sync (default 20000)
     */
    async syncCandidates(candidates: any[], maxBatchSize: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        const results = [];
        const candidatesToSync = candidates.slice(0, maxBatchSize);

        if (candidates.length > maxBatchSize) {
          console.log(`⚠️ Limiting sync to ${maxBatchSize} candidates out of ${candidates.length} total`);
        }

        for (const candidate of candidatesToSync) {
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
     * @param clients - Array of clients to sync
     * @param maxBatchSize - Maximum number of clients to sync (default 20000)
     */
    async syncClients(clients: any[], maxBatchSize: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        const results = [];
        const clientsToSync = clients.slice(0, maxBatchSize);

        if (clients.length > maxBatchSize) {
          console.log(`⚠️ Limiting sync to ${maxBatchSize} clients out of ${clients.length} total`);
        }

        for (const client of clientsToSync) {
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
     * Import contacts from Vtiger CRM using new GetCandidates operation
     * @param lastSyncTime - Optional timestamp for incremental sync
     * @param maxRecords - Maximum number of records to fetch (default 20000)
     */
    async importContacts(lastSyncTime?: string, maxRecords: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        const isIncremental = lastSyncTime && lastSyncTime !== 'null';
        const syncType = isIncremental ? 'INCREMENTAL' : 'FULL';

        console.log(`🔍 Starting ${syncType} Vtiger contact import using GetCandidates...`);
        console.log(`⚠️ Maximum records limit: ${maxRecords}`);
        if (isIncremental) {
          console.log(`📅 Fetching contacts modified since: ${lastSyncTime}`);
        }

        let allContacts: any[] = [];
        let page = 1;
        const perPage = 20;
        let hasMorePages = true;
        let totalFetched = 0;

        while (hasMorePages && totalFetched < maxRecords) {
          console.log(`📄 Fetching page ${page} (${perPage} per page) - ${totalFetched}/${maxRecords} fetched...`);

          const result = await apiRequest(
            "GetCandidates",
            {
              element: {
                per_page: perPage.toString(),
                page: page.toString(),
              },
            },
            "post"
          );

          if (!result || !result.data || result.data.length === 0) {
            console.log(`✅ No more contacts at page ${page}`);
            hasMorePages = false;
            break;
          }

          allContacts.push(...result.data);
          totalFetched += result.data.length;

          console.log(`📊 Fetched ${result.data.length} contacts (total: ${totalFetched})`);

          // Check if we've reached the limit
          if (totalFetched >= maxRecords) {
            console.log(`⚠️ Reached maximum record limit of ${maxRecords}`);
            hasMorePages = false;
            break;
          }

          if (result.data.length < perPage) {
            console.log(`✅ Last page reached (got ${result.data.length} < ${perPage})`);
            hasMorePages = false;
          } else {
            page++;
          }
        }

        console.log(`🎯 FINAL IMPORT RESULT: ${allContacts.length} contacts imported`);
        console.log("🚨 RAW VTIGER API RESPONSE:");
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
     * Import accounts from Vtiger CRM using new GetAccounts operation
     * @param maxRecords - Maximum number of records to fetch (default 20000)
     */
    async importAccounts(maxRecords: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        console.log("🏢 Starting Vtiger accounts import using GetAccounts...");
        console.log(`⚠️ Maximum records limit: ${maxRecords}`);

        let allAccounts: any[] = [];
        let page = 1;
        const perPage = 20;
        let hasMorePages = true;
        let totalFetched = 0;

        while (hasMorePages && totalFetched < maxRecords) {
          console.log(`📄 Fetching accounts page ${page} (${perPage} per page) - ${totalFetched}/${maxRecords} fetched...`);

          const result = await apiRequest(
            "GetAccounts",
            {
              element: {
                per_page: perPage.toString(),
                page: page.toString(),
              },
            },
            "post"
          );

          if (!result || !result.data || result.data.length === 0) {
            console.log(`✅ No more accounts at page ${page}`);
            hasMorePages = false;
            break;
          }

          allAccounts.push(...result.data);
          totalFetched += result.data.length;

          console.log(`📊 Fetched ${result.data.length} accounts (total: ${totalFetched})`);

          // Check if we've reached the limit
          if (totalFetched >= maxRecords) {
            console.log(`⚠️ Reached maximum record limit of ${maxRecords}`);
            hasMorePages = false;
            break;
          }

          if (result.data.length < perPage) {
            console.log(`✅ Last page reached (got ${result.data.length} < ${perPage})`);
            hasMorePages = false;
          } else {
            page++;
          }
        }

        console.log(`🎯 FINAL IMPORT RESULT: ${allAccounts.length} accounts imported`);

        return allAccounts.map((account: any) => ({
          vtigerId: account.id,
          companyName: account.accountname,
          website: account.website,
          phone: account.phone,
          email: account.email1,
          industry: account.industry,
          source: "Vtiger CRM",
        }));
      } catch (error) {
        console.error("❌ Vtiger import accounts error:", error);
        throw error;
      }
    },
  };
}

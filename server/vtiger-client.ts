/**
 * Vtiger CRM API Client for Server-Side Use
 *
 * This is a standalone server-side implementation that works with the NEW Vtiger API.
 * It uses api.php endpoint with UserLogin operation and Bearer token authentication.
 */
import axios from "axios";
import { mapVtigerContactUnified } from './unified-vtiger-field-mapping';

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
        sessionName = "";
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
     * Execute paginated query to get ALL records from Vtiger CRM
     */
    async queryAll(baseQuery: string, signal?: AbortSignal) {
      console.log(`🔵 queryAll called with query: ${baseQuery}`);

      if (!sessionName) {
        console.log(`🔵 queryAll: No session, logging in...`);
        await this.login(signal);
      }

      try {
        console.log(`🔄 Starting paginated query for ALL records: ${baseQuery}`);

        const PAGE_SIZE = 100;
        const allRecords = [];
        let currentOffset = 0;
        let hasMoreResults = true;

        while (hasMoreResults) {
          const pagedQuery = `${baseQuery} LIMIT ${currentOffset}, ${PAGE_SIZE};`;
          console.log(`📄 Fetching page starting at offset ${currentOffset}`);

          const pageResults = await this.query(pagedQuery, signal);

          if (!pageResults || pageResults.length === 0) {
            console.log(`⚠️ No more results at offset ${currentOffset}`);
            hasMoreResults = false;
            break;
          }

          allRecords.push(...pageResults);
          currentOffset += PAGE_SIZE;

          console.log(`✅ Page complete. Total fetched: ${allRecords.length} records`);

          if (pageResults.length < PAGE_SIZE) {
            console.log(`📄 Final page reached`);
            hasMoreResults = false;
          }

          if (hasMoreResults) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        console.log(`🎉 Paginated query complete: ${allRecords.length} records`);
        return allRecords;

      } catch (error) {
        console.error("❌ Paginated query error:", error);
        throw error;
      }
    },

    /**
     * Optimized paginated query with progress tracking
     */
    async queryAllOptimized(baseQuery: string, signal?: AbortSignal, onProgress?: (fetched: number, total?: number) => void) {
      console.log(`🚀 queryAllOptimized called with query: ${baseQuery}`);

      if (!sessionName) {
        await this.login(signal);
      }

      try {
        console.log(`🔄 Starting OPTIMIZED paginated query: ${baseQuery}`);

        let estimatedTotal: number | undefined = undefined;
        try {
          const countQuery = baseQuery.replace(/SELECT .* FROM/i, 'SELECT COUNT(*) as total FROM');
          const countResult = await this.query(countQuery, signal);
          if (countResult && countResult.length > 0 && countResult[0].total) {
            estimatedTotal = parseInt(countResult[0].total) || undefined;
          }
        } catch (e) {
          console.log(`⚠️ Count query failed (expected)`);
        }

        const PAGE_SIZE = 100;
        const allRecords: any[] = [];
        let currentOffset = 0;
        let hasMoreResults = true;
        let lastProgressReport = Date.now();
        const PROGRESS_INTERVAL = 2000;

        onProgress?.(0, estimatedTotal);

        while (hasMoreResults) {
          if (signal?.aborted) {
            throw new Error('Query aborted by signal');
          }

          const pagedQuery = `${baseQuery} LIMIT ${currentOffset}, ${PAGE_SIZE};`;

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

            const now = Date.now();
            if (now - lastProgressReport > PROGRESS_INTERVAL || pageResults.length < PAGE_SIZE) {
              onProgress?.(allRecords.length, estimatedTotal);
              lastProgressReport = now;

              if (allRecords.length % 5000 === 0) {
                console.log(`🎯 Milestone: ${allRecords.length} records fetched`);
              }
            }

            if (pageResults.length < PAGE_SIZE) {
              hasMoreResults = false;
            }

          } catch (pageError: any) {
            if (pageError.message?.includes('timeout') || pageError.code === 'ECONNRESET') {
              console.warn(`⚠️ Page fetch failed at offset ${currentOffset}, retrying...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            throw pageError;
          }
        }

        onProgress?.(allRecords.length, allRecords.length);

        console.log(`🎉 Optimized query complete: ${allRecords.length} records`);
        return allRecords;

      } catch (error) {
        console.error("❌ Optimized paginated query error:", error);
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
    async syncCandidates(candidates: any[], maxBatchSize: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        const results = [];
        const candidatesToSync = candidates.slice(0, maxBatchSize);

        if (candidates.length > maxBatchSize) {
          console.log(`⚠️ Limiting sync to ${maxBatchSize} candidates`);
        }

        for (const candidate of candidatesToSync) {
          if (!sessionName) {
            throw new Error('Session token missing');
          }

          const safeEmail = candidate.email ? candidate.email.replace(/'/g, "\\'") : '';
          const existingContacts = await this.query(
            `SELECT id FROM Contacts WHERE email='${safeEmail}';`
          );

          if (existingContacts.length > 0) {
            const payload: any = {
              id: existingContacts[0].id,
            };

            if (candidate.status) {
              payload.candidatestatus = candidate.status;
            }

            const result = await apiRequest('update', {
              sessionName,
              elementType: 'Contacts',
              element: JSON.stringify(payload)
            }, 'post');

            results.push({ id: candidate.id, vtigerId: existingContacts[0].id, action: 'updated', result });
          } else {
            console.log(`Skipping ${candidate.email} - not in VTiger`);
            results.push({
              id: candidate.id,
              vtigerId: null,
              action: 'skipped',
              reason: 'Contact not found in VTiger'
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
    async syncClients(clients: any[], maxBatchSize: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        const results = [];
        const clientsToSync = clients.slice(0, maxBatchSize);

        if (clients.length > maxBatchSize) {
          console.log(`⚠️ Limiting sync to ${maxBatchSize} clients`);
        }

        for (const client of clientsToSync) {
          const existingAccounts = await this.query(
            `SELECT id FROM Accounts WHERE accountname='${client.companyName}';`,
          );

          let accountId;

          if (existingAccounts.length > 0) {
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
     * Discover available fields in Vtiger Contacts
     */
    async discoverContactFields() {
      if (!sessionName) {
        await this.login();
      }

      try {
        console.log("🔍 Discovering Vtiger Contact fields...");

        const contacts = await this.query(`SELECT * FROM Contacts LIMIT 0, 1;`);

        if (contacts && contacts.length > 0) {
          const fields = Object.keys(contacts[0]);
          console.log("Available fields:", fields);
          console.log("Custom fields:", fields.filter(f => f.startsWith('cf_')));
          return fields;
        }

        return [];
      } catch (error) {
        console.error("Field discovery error:", error);
        return [];
      }
    },

    /**
     * Import contacts from Vtiger CRM using GetCandidates operation
     */
    async importContacts(lastSyncTime?: string, maxRecords: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        const isIncremental = lastSyncTime && lastSyncTime !== 'null';
        const syncType = isIncremental ? 'INCREMENTAL' : 'FULL';

        console.log(`🔍 Starting ${syncType} import using GetCandidates...`);
        console.log(`⚠️ Max records: ${maxRecords}`);

        let allContacts: any[] = [];
        let page = 1;
        const perPage = 20;
        let hasMorePages = true;
        let totalFetched = 0;

        while (hasMorePages && totalFetched < maxRecords) {
          console.log(`📄 Fetching page ${page}...`);

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
            hasMorePages = false;
            break;
          }

          allContacts.push(...result.data);
          totalFetched += result.data.length;

          console.log(`📊 Fetched ${result.data.length} contacts (total: ${totalFetched})`);

          if (totalFetched >= maxRecords) {
            console.log(`⚠️ Reached max limit: ${maxRecords}`);
            hasMorePages = false;
            break;
          }

          if (result.data.length < perPage) {
            hasMorePages = false;
          } else {
            page++;
          }
        }

        console.log(`🎯 Import complete: ${allContacts.length} contacts`);

        const processedContacts = [];

        for (const contact of allContacts) {
          const mappedContact = mapVtigerContactUnified({
            ...contact,
            vtigerId: contact.id,
          });

          const finalContact = {
            ...mappedContact,
            vtigerId: contact.id,
            currentTitle: mappedContact.jobTitle || mappedContact.currentTitle || "",
            targetRole: mappedContact.jobTitle || mappedContact.targetRole || "",
            accountName: "",
            skills: [],
            experience: 0,
            department: "",
            source: "Vtiger CRM",
          };

          processedContacts.push(finalContact);
        }

        return processedContacts;
      } catch (error) {
        console.error("❌ Import contacts error:", error);
        throw error;
      }
    },

    /**
     * Fetch a single contact by ID
     */
    async fetchContactById(contactId: string, signal?: AbortSignal) {
      if (!sessionName) {
        await this.login(signal);
      }

      try {
        console.log(`🔍 Fetching contact by ID: ${contactId}`);

        const contacts = await this.query(`SELECT * FROM Contacts WHERE id='${contactId}';`, signal);

        if (!contacts || contacts.length === 0) {
          console.warn(`⚠️ Contact not found: ${contactId}`);
          return null;
        }

        const contact = contacts[0];
        console.log(`✅ Retrieved contact: ${contact.firstname} ${contact.lastname}`);

        const mappedContact = mapVtigerContactUnified({
          ...contact,
          vtigerId: contact.id,
        });

        const finalContact = {
          ...mappedContact,
          vtigerId: contact.id,
          currentTitle: mappedContact.jobTitle || mappedContact.currentTitle || "",
          targetRole: mappedContact.jobTitle || mappedContact.targetRole || "",
          accountName: "",
          skills: [],
          experience: 0,
          department: "",
          source: "Vtiger CRM",
        };

        return finalContact;
      } catch (error) {
        console.error(`❌ Error fetching contact ${contactId}:`, error);
        throw error;
      }
    },

    /**
     * Get all contact IDs with optimized batch fetching
     */
    async fetchContactIds(lastSyncTime?: string, signal?: AbortSignal, onProgress?: (fetched: number, total?: number) => void) {
      console.log(`🔵 fetchContactIds called`);

      if (!sessionName) {
        await this.login(signal);
      }

      try {
        const isIncremental = lastSyncTime && lastSyncTime !== 'null';
        const syncType = isIncremental ? 'INCREMENTAL' : 'FULL';

        console.log(`🔍 Fetching contact IDs for ${syncType} sync...`);

        let whereClause = '';
        if (isIncremental) {
          const syncDate = new Date(lastSyncTime);
          const vtigerTimeFormat = syncDate.toISOString().slice(0, 19).replace('T', ' ');
          whereClause = ` WHERE modifiedtime > '${vtigerTimeFormat}'`;
        }

        const queryString = `SELECT id FROM Contacts${whereClause}`;

        console.log(`🚀 Starting optimized batch fetching...`);
        const contactIds = await this.queryAllOptimized(queryString, signal, onProgress);

        console.log(`📊 Found ${contactIds.length} contact IDs`);
        const ids = contactIds.map((c: any) => c.id);
        return ids;
      } catch (error) {
        console.error(`❌ Error fetching contact IDs:`, error);
        throw error;
      }
    },

    /**
     * Import accounts from Vtiger CRM using GetAccounts
     */
    async importAccounts(maxRecords: number = 20000) {
      if (!accessToken) {
        await this.login();
      }

      try {
        console.log("🏢 Starting accounts import using GetAccounts...");
        console.log(`⚠️ Max records: ${maxRecords}`);

        let allAccounts: any[] = [];
        let page = 1;
        const perPage = 20;
        let hasMorePages = true;
        let totalFetched = 0;

        while (hasMorePages && totalFetched < maxRecords) {
          console.log(`📄 Fetching page ${page}...`);

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
            hasMorePages = false;
            break;
          }

          allAccounts.push(...result.data);
          totalFetched += result.data.length;

          console.log(`📊 Fetched ${result.data.length} accounts (total: ${totalFetched})`);

          if (totalFetched >= maxRecords) {
            console.log(`⚠️ Reached max limit: ${maxRecords}`);
            hasMorePages = false;
            break;
          }

          if (result.data.length < perPage) {
            hasMorePages = false;
          } else {
            page++;
          }
        }

        console.log(`🎯 Import complete: ${allAccounts.length} accounts`);

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
        console.error("❌ Import accounts error:", error);
        throw error;
      }
    },
  };
}

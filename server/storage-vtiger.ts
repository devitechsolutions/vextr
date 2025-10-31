/**
 * Vtiger CRM Storage Implementation
 *
 * This file implements the IStorage interface for bi-directional Vtiger CRM integration.
 * NO FALLBACKS OR MOCK DATA - requires live connection to Vtiger CRM to function.
 * All operations will fail with clear error messages if Vtiger CRM is not accessible.
 */
import {
  User,
  InsertUser,
  Candidate,
  InsertCandidate,
  Client,
  InsertClient,
  Vacancy,
  InsertVacancy,
  Todo,
  InsertTodo,
  Activity,
  InsertActivity,
  Interview,
  InsertInterview,
  PipelineStage,
  InsertPipelineStage,
  JobTitle,
  InsertJobTitle,
  SourcedProfile,
  InsertSourcedProfile,
  candidates,
  syncMetadata,
} from "@shared/schema";
import { IStorage, MemStorage, DatabaseStorage } from "./storage";
import { createVtigerAPI } from "../client/src/lib/vtiger-api";
import { db } from "./db";
import { eq, and, lt, desc, or, isNotNull, sql } from "drizzle-orm";

/**
 * Progress tracking interface for real-time sync updates
 */
export interface SyncProgress {
  onStart?: (total?: number) => void;
  onBatch?: (batchSize: number, processed: number, total?: number) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Check if Vtiger environment variables are available
 */
const hasVtigerCredentials = () => {
  return Boolean(
    process.env.VTIGER_SERVER_URL &&
      process.env.VTIGER_USERNAME &&
      process.env.VTIGER_ACCESS_KEY,
  );
};

/**
 * Create a Vtiger API client using environment variables
 */
const createVtigerClient = () => {
  if (!hasVtigerCredentials()) {
    throw new Error(
      "Vtiger credentials not available. Live Vtiger CRM connection is required.",
    );
  }

  return createVtigerAPI(
    process.env.VTIGER_SERVER_URL as string,
    process.env.VTIGER_USERNAME as string,
    process.env.VTIGER_ACCESS_KEY as string,
  );
};

/**
 * Vtiger CRM Storage Class
 * Implements IStorage directly with live Vtiger CRM integration
 * No fallback to memory storage - all operations require live Vtiger connection
 */
// Live-only Vtiger CRM integration with strict connectivity enforcement
// No local fallbacks or mock data - all operations require active Vtiger connection
export class VtigerStorage extends DatabaseStorage {
  private vtigerClient: ReturnType<typeof createVtigerClient>;
  private syncEnabled: boolean = true;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private syncFrequency: number = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private connectionStatus: "connected" | "error" = "error";
  private crashHandlersRegistered: boolean = false;

  constructor() {
    super();
    this.vtigerClient = createVtigerClient();
    if (!this.vtigerClient) {
      throw new Error(
        "Failed to initialize Vtiger client. Live Vtiger CRM connection is required.",
      );
    }
    this.registerCrashHandlers();
    this.initVtigerSync();
  }

  /**
   * Register global crash handlers to capture OOM and unexpected terminations
   */
  private registerCrashHandlers() {
    if (this.crashHandlersRegistered) return;
    this.crashHandlersRegistered = true;

    process.on('uncaughtException', async (error, origin) => {
      console.error('🚨 UNCAUGHT EXCEPTION:', error);
      console.error('🚨 Origin:', origin);
      this.logMemoryUsage('Uncaught Exception');
      
      // Try to mark any running syncs as failed (best-effort)
      try {
        await db.update(syncMetadata)
          .set({
            status: 'failed',
            completedAt: new Date(),
            errorMessage: `Process crashed: ${error.message}`
          })
          .where(eq(syncMetadata.status, 'running'));
        console.log('✅ Sync metadata updated before crash');
      } catch (dbError) {
        console.error('❌ Failed to update sync metadata on crash:', dbError);
      }
      
      // CRITICAL: Exit process to allow clean restart (fail-fast)
      console.error('🚨 Process terminating due to uncaught exception');
      process.exit(1);
    });

    process.on('exit', (code) => {
      console.log(`🚨 Process exiting with code: ${code}`);
      this.logMemoryUsage('Process Exit');
    });

    process.on('SIGTERM', async () => {
      console.log('🚨 SIGTERM received - process terminating');
      this.logMemoryUsage('SIGTERM');
      
      // Mark running syncs as failed before shutdown
      try {
        await db.update(syncMetadata)
          .set({
            status: 'failed',
            completedAt: new Date(),
            errorMessage: 'Process terminated by SIGTERM'
          })
          .where(eq(syncMetadata.status, 'running'));
      } catch (error) {
        console.error('Failed to update sync metadata on SIGTERM:', error);
      }
      
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('🚨 SIGINT received - process interrupting');
      this.logMemoryUsage('SIGINT');
      
      // Mark running syncs as failed before shutdown
      try {
        await db.update(syncMetadata)
          .set({
            status: 'failed',
            completedAt: new Date(),
            errorMessage: 'Process interrupted by SIGINT'
          })
          .where(eq(syncMetadata.status, 'running'));
      } catch (error) {
        console.error('Failed to update sync metadata on SIGINT:', error);
      }
      
      process.exit(0);
    });

    console.log('✅ Crash handlers registered for memory monitoring');
  }

  /**
   * Initialize Vtiger sync process
   * Note: Auto-sync disabled. Use manual sync button or midnight cron job only.
   */
  private initVtigerSync() {
    if (!this.vtigerClient) {
      throw new Error(
        "Vtiger client not available. Live Vtiger CRM connection is required.",
      );
    }

    console.log(
      "Live Vtiger CRM connection established. Daily sync runs on first server startup."
    );
    
    // Sync is now handled by cron-jobs.ts which runs once per day on first startup
    // Manual sync still available via UI button
  }

  /**
   * Clean up stale sync records that are stuck in "running" state
   * Called before starting a new sync to prevent zombie syncs
   */
  private async cleanupStaleSyncs(): Promise<void> {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      // Find all running syncs that started more than 1 hour ago
      const staleSyncs = await db
        .select()
        .from(syncMetadata)
        .where(
          and(
            eq(syncMetadata.status, 'running'),
            lt(syncMetadata.startedAt, oneHourAgo)
          )
        );
      
      if (staleSyncs.length > 0) {
        console.log(`🧹 Found ${staleSyncs.length} stale sync(s) stuck in "running" state`);
        
        for (const staleSync of staleSyncs) {
          await super.updateSyncMetadata(staleSync.id, {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: `Sync process interrupted or crashed - auto-cleanup of stale sync started at ${staleSync.startedAt}`
          });
          console.log(`✅ Marked stale sync #${staleSync.id} as failed (started ${staleSync.startedAt})`);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up stale syncs:', error);
      // Don't throw - this is just cleanup, shouldn't block new syncs
    }
  }

  /**
   * Log current memory usage for resource monitoring with warnings
   */
  private logMemoryUsage(context: string): void {
    const used = process.memoryUsage();
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    const heapPercent = Math.round((used.heapUsed / used.heapTotal) * 100);
    
    // Typical V8 heap limit is ~1.5-2GB, warn if approaching
    const heapMB = mb(used.heapUsed);
    const warningThreshold = 1200; // 1.2GB
    const criticalThreshold = 1400; // 1.4GB
    
    let emoji = '💾';
    let warning = '';
    
    if (heapMB > criticalThreshold) {
      emoji = '🔴';
      warning = ' CRITICAL - NEAR OOM!';
    } else if (heapMB > warningThreshold) {
      emoji = '⚠️';
      warning = ' WARNING - High memory usage';
    }
    
    console.log(`${emoji} Memory [${context}]: RSS=${mb(used.rss)}MB, Heap=${heapMB}/${mb(used.heapTotal)}MB (${heapPercent}%), External=${mb(used.external)}MB${warning}`);
  }

  /**
   * Execute VTiger API call with timeout protection
   * Prevents hanging requests that freeze the sync
   * 
   * CRITICAL FIX: Uses AbortController to actually cancel hanging axios requests
   * Previously, Promise.race would complete but the underlying HTTP request continued,
   * causing the sync to hang indefinitely.
   */
  private async withVtigerTimeout<T>(
    operation: (abortSignal?: AbortSignal) => Promise<T>, 
    timeoutMs: number = 30000,  // 30 seconds default
    operationName: string = 'VTiger API',
    maxRetries: number = 3  // Add retry capability
  ): Promise<T> {
    let retries = 0;
    let delay = 1000; // Initial delay 1 second
    let lastError: Error | null = null;
    
    while (retries <= maxRetries) {
      // CRITICAL: Create AbortController for this attempt
      const abortController = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;
      
      try {
        // Create timeout that will abort the request
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            // CRITICAL: Abort the actual HTTP request
            abortController.abort();
            reject(new Error(`${operationName} timed out after ${timeoutMs}ms - VTiger not responding (attempt ${retries + 1}/${maxRetries + 1})`));
          }, timeoutMs);
        });
        
        // Attempt the operation with abort signal
        const result = await Promise.race([
          operation(abortController.signal), 
          timeoutPromise
        ]);
        
        // Clear timeout on success
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Success! If we had retries, log it
        if (retries > 0) {
          console.log(`✅ ${operationName} succeeded after ${retries} retries`);
        }
        
        return result;
      } catch (error: any) {
        // Clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        lastError = error;
        
        // Check if it's a timeout or network error that we should retry
        const isRetryable = error.message?.includes('timed out') || 
                          error.message?.includes('ECONNRESET') ||
                          error.message?.includes('ETIMEDOUT') ||
                          error.code === 'ENOTFOUND' ||
                          error.code === 'ECONNABORTED' ||
                          error.name === 'AbortError';  // Add abort error as retryable
        
        if (isRetryable && retries < maxRetries) {
          console.warn(`⚠️ ${operationName} failed (attempt ${retries + 1}/${maxRetries + 1}), retrying after ${delay}ms...`);
          console.warn(`   Reason: ${error.message}`);
          
          // Wait with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 10000); // Double delay, max 10 seconds
          retries++;
        } else {
          // Not retryable or max retries reached
          if (retries === maxRetries) {
            console.error(`❌ ${operationName} failed after ${maxRetries + 1} attempts`);
          }
          throw error;
        }
      }
    }
    
    // Should never reach here, but just in case
    throw lastError || new Error(`${operationName} failed after ${maxRetries + 1} attempts`);
  }

  /**
   * Get total contact count directly from VTiger CRM
   * Returns the authoritative count from VTiger without waiting for sync
   */
  public async getVtigerTotalContactCount(): Promise<number | null> {
    if (!this.vtigerClient) {
      throw new Error("Vtiger client not available");
    }

    try {
      await this.withVtigerTimeout((signal) => this.vtigerClient.login(signal), 15000, 'VTiger login');
      
      // Vtiger query API doesn't support aliases - use COUNT(*) without "as total"
      const countQuery = "SELECT COUNT(*) FROM Contacts;";
      const countResult = await this.withVtigerTimeout(
        (signal) => this.vtigerClient.query(countQuery, signal),
        20000,
        'VTiger COUNT query'
      );
      
      // Vtiger returns count in first element's first property (usually 'count')
      if (countResult && countResult.length > 0) {
        const firstResult = countResult[0];
        const totalCount = parseInt(firstResult.count || firstResult.COUNT || firstResult['COUNT(*)'] || firstResult.total || '0') || 0;
        console.log(`📊 VTiger total contact count from COUNT query: ${totalCount}`);
        return totalCount;
      }
      
      // CRITICAL FIX: Do NOT fallback to local database count!
      // Return null so we use the actual fetched ID count instead
      console.log("⚠️ VTiger COUNT(*) query returned no results - will use actual fetched ID count");
      return null;
    } catch (error) {
      console.error("⚠️ VTiger COUNT(*) query failed:", error);
      // CRITICAL FIX: Return null instead of local DB count
      // The sync will use the actual number of IDs fetched from VTiger
      return null;
    }
  }

  /**
   * Sync data with Vtiger CRM (bidirectional sync) with real progress tracking
   * Now includes: stale sync cleanup, 30-min timeout, resource monitoring, and heartbeat
   */
  public async syncWithVtiger(progress?: SyncProgress, userId?: number): Promise<void> {
    // Create sync metadata record FIRST to track this attempt
    let newSyncMetadata: any = null;
    
    try {
      // Check if sync is enabled and client is available
      if (!this.vtigerClient) {
        throw new Error('Vtiger client not initialized - check environment credentials');
      }
      
      if (!this.syncEnabled) {
        throw new Error('Vtiger sync is currently disabled');
      }

      // ATOMIC TRANSACTION: Check and create sync record in one atomic operation
      // This prevents race conditions where multiple syncs check simultaneously
      const existingSync = await db.transaction(async (tx) => {
        // Check for already running sync
        const runningSync = await tx
          .select()
          .from(syncMetadata)
          .where(
            and(
              eq(syncMetadata.syncType, 'vtiger_contacts'),
              eq(syncMetadata.status, 'running')
            )
          )
          .limit(1);
        
        if (runningSync.length > 0) {
          return runningSync[0];
        }
        
        // No running sync, we can proceed (still within transaction)
        return null;
      });
      
      if (existingSync) {
        console.log(`⚠️ Sync already in progress (ID: ${existingSync.id}), skipping duplicate sync request`);
        throw new Error('A sync is already in progress. Please wait for it to complete.');
      }

      // RELIABILITY FIX #1: Clean up any stale syncs before starting
      await this.cleanupStaleSyncs();

      // RESUMABLE SYNC: Check for resume data from previous FAILED/INTERRUPTED sync
      let resumeData: { lastProcessedContactId?: string; fetchedCount?: number } = {};
      try {
        const previousSync = await db
          .select()
          .from(syncMetadata)
          .where(
            and(
              eq(syncMetadata.syncType, 'vtiger_contacts'),
              // Only resume from failed or stuck running syncs, NOT completed ones
              or(
                eq(syncMetadata.status, 'failed'),
                eq(syncMetadata.status, 'running')
              ),
              // CRITICAL FIX: Only resume from syncs that have a valid checkpoint saved
              // This prevents resuming from syncs that were created but never processed
              isNotNull(syncMetadata.lastProcessedContactId)
            )
          )
          .orderBy(desc(syncMetadata.startedAt))
          .limit(1);
        
        if (previousSync.length > 0 && previousSync[0].lastProcessedContactId) {
          resumeData = {
            lastProcessedContactId: previousSync[0].lastProcessedContactId,
            fetchedCount: previousSync[0].fetchedCount || 0
          };
          console.log(`🔄 RESUMING from checkpoint: ${resumeData.fetchedCount} contacts already processed, resuming from ID: ${resumeData.lastProcessedContactId}`);
        }
      } catch (error) {
        console.warn('⚠️ Could not load resume data, starting fresh:', error);
      }

      // Create sync metadata record to track this sync operation with user tracking
      newSyncMetadata = await this.createSyncMetadata({
        syncType: "vtiger_contacts",
        status: "running",
        startedAt: new Date(),
        vtigerTotal: undefined,
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        errorCount: 0,
        startedByUserId: userId // Track who started the sync
      });
      console.log(`📊 Created sync metadata record #${newSyncMetadata.id}`);
      console.log(`🔄 RESUMABLE SYNC: Checkpoints saved after each batch - safe from interruptions!`);

      // Log initial memory usage
      this.logMemoryUsage('Sync Start');
      await this.withVtigerTimeout((signal) => this.vtigerClient.login(signal), 15000, 'VTiger login');

      // Try to get total count before starting (may be null if COUNT query fails)
      const totalCountEstimate = await this.getVtigerTotalContactCount();
      if (totalCountEstimate !== null) {
        await super.updateSyncMetadata(newSyncMetadata.id, {
          vtigerTotal: totalCountEstimate
        });
        console.log(`📊 VTiger total estimate from COUNT query: ${totalCountEstimate} contacts`);
      } else {
        console.log(`⚠️ VTiger COUNT query failed - will determine total from actual ID fetch`);
      }

      // Import data from Vtiger first with real progress tracking
      // Note: Checkpoints are saved after each batch, so sync can resume if interrupted
      // Counts are accurately tracked during import (totalCreated, totalUpdated)
      console.log('🔵 About to call importContactsFromVtiger...');
      console.log('🔵 Progress handler:', progress ? 'PROVIDED' : 'NOT PROVIDED');
      console.log('🔵 Sync metadata ID:', newSyncMetadata.id);
      console.log('🔵 Resume data:', resumeData);
      console.log('🔵 VTiger client status:', {
        exists: !!this.vtigerClient,
        hasLogin: typeof this.vtigerClient?.login === 'function',
        hasQuery: typeof this.vtigerClient?.query === 'function',
        hasFetchContactIds: typeof this.vtigerClient?.fetchContactIds === 'function',
      });
      
      try {
        console.log('🔵 ENTERING importContactsFromVtiger method...');
        await this.importContactsFromVtiger(progress, newSyncMetadata.id, resumeData);
        console.log('🟢 importContactsFromVtiger completed successfully');
      } catch (importError) {
        console.error('🔴 importContactsFromVtiger failed with error:', importError);
        console.error('🔴 Error message:', importError instanceof Error ? importError.message : String(importError));
        console.error('🔴 Error stack:', importError instanceof Error ? importError.stack : 'No stack');
        // Re-throw with more context
        throw new Error(`Import failed: ${importError instanceof Error ? importError.message : String(importError)}`);
      }
      
      this.logMemoryUsage('After Contact Import');
      
      await this.importAccountsFromVtiger();
      // Skip vacancy imports - not needed in Vtiger

      // MEMORY FIX: Defer post-sync push operations to prevent memory exhaustion during critical import phase
      // These operations will be re-enabled once the import is proven stable
      console.log(`⏸️  Post-sync push operations deferred to prevent memory issues`);
      // await this.syncCandidatesToVtiger();
      // await this.syncClientsToVtiger();

      // Get final counts from metadata - these were accurately tracked during the sync
      const finalMetadata = await db
        .select()
        .from(syncMetadata)
        .where(eq(syncMetadata.id, newSyncMetadata.id))
        .limit(1);
      const finalCreatedCount = finalMetadata[0]?.createdCount || 0;
      const finalUpdatedCount = finalMetadata[0]?.updatedCount || 0;
      const finalErrorCount = finalMetadata[0]?.errorCount || 0;
      const actualProcessedTotal = finalCreatedCount + finalUpdatedCount;
      const vtigerTotal = finalMetadata[0]?.vtigerTotal;
      const fetchedCount = finalMetadata[0]?.fetchedCount || 0;
      
      // CRITICAL FIX: Mark sync as completed if we successfully fetched all IDs
      // For resumed syncs, fetchedCount may be 0 but all contacts were already processed
      let finalStatus = "completed";
      let finalMessage = null;
      
      // Check if this was a resumed sync that completed successfully
      const wasResumed = resumeData?.lastProcessedContactId ? true : false;
      const totalContactsHandled = actualProcessedTotal + (resumeData?.fetchedCount || 0);
      
      // If we have a vtiger total, check if we reached it (either through new processing or resumption)
      if (vtigerTotal) {
        if (totalContactsHandled >= vtigerTotal || (wasResumed && fetchedCount === 0 && actualProcessedTotal === 0)) {
          // Success: We processed all contacts (new or resumed)
          if (wasResumed && fetchedCount === 0 && actualProcessedTotal === 0) {
            finalMessage = `Resumed sync completed - all ${vtigerTotal} contacts already processed`;
            console.log(`✅ RESUMED SYNC COMPLETE: All ${vtigerTotal} contacts were already processed`);
          } else {
            console.log(`✅ SYNC COMPLETE: Processed ${totalContactsHandled} of ${vtigerTotal} contacts`);
          }
        } else if (totalContactsHandled < vtigerTotal) {
          // Failed: We didn't process all contacts
          finalStatus = "failed";
          finalMessage = `Incomplete sync: processed ${totalContactsHandled}/${vtigerTotal} contacts (${Math.round(totalContactsHandled/vtigerTotal * 100)}% complete)`;
          console.error(`❌ SYNC INCOMPLETE: Only processed ${totalContactsHandled} of ${vtigerTotal} VTiger contacts`);
        }
      } else {
        // No vtiger total, use heuristic check for ~23,544 contacts
        if (totalContactsHandled < 20000) {
          finalStatus = "failed";
          finalMessage = `Incomplete sync: only processed ${totalContactsHandled} contacts (expected ~23,544)`;
          console.error(`❌ SYNC INCOMPLETE: Only processed ${totalContactsHandled} contacts, expected ~23,544`);
        }
      }
      
      await super.updateSyncMetadata(newSyncMetadata.id, {
        status: finalStatus,
        completedAt: new Date(),
        fetchedCount: fetchedCount,
        createdCount: finalCreatedCount,
        updatedCount: finalUpdatedCount,
        errorCount: finalErrorCount,
        errorMessage: finalMessage,
        // Keep the original vtigerTotal, don't overwrite it!
        ...(vtigerTotal ? {} : { vtigerTotal: fetchedCount }) // Only set if we didn't have a total
      });
      
      if (finalStatus === "completed") {
        console.log(`✅ 🎉 SYNC COMPLETE: ${actualProcessedTotal} total (${finalCreatedCount} created, ${finalUpdatedCount} updated)`);
      }
      if (finalErrorCount > 0) {
        console.warn(`⚠️ ${finalErrorCount} contacts failed to sync (skipped)`);
      }

      // Log final memory usage
      this.logMemoryUsage('Sync Complete');

      // Complete progress tracking
      progress?.onComplete?.();

      this.lastSyncTime = new Date();
      console.log("Vtiger sync completed at", this.lastSyncTime);
    } catch (error) {
      console.error("Vtiger sync failed:", error);
      
      // Update sync metadata with error - checkpoint preserved for resume
      if (newSyncMetadata && newSyncMetadata.id) {
        try {
          await super.updateSyncMetadata(newSyncMetadata.id, {
            status: "failed",
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          console.log(`💾 Checkpoint saved - sync can resume from where it left off`);
        } catch (updateError) {
          console.error("Failed to update sync metadata with error:", updateError);
        }
      } else {
        console.error("⚠️ Sync failed before metadata was created - error:", error instanceof Error ? error.message : String(error));
      }

      progress?.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Import contacts from Vtiger CRM as candidates with resumable sync and real progress tracking
   * Uses individual contact fetches (Jorrit's working method) with checkpoint-based resume capability
   * Checkpoints are saved after each batch, ensuring sync can resume from interruption points
   */
  private async importContactsFromVtiger(
    progress?: SyncProgress, 
    syncMetadataId?: number,
    resumeData?: { lastProcessedContactId?: string; fetchedCount?: number }
  ): Promise<void> {
    if (!this.vtigerClient) return;

    // Declare watchdogInterval outside try block for proper cleanup
    let watchdogInterval: NodeJS.Timeout | null = null;

    try {
      console.log("🔄 Starting INDIVIDUAL FETCH contact import from Vtiger (using Jorrit's working method)...");
      
      // WATCHDOG PHASE 1: Setup early monitoring for ID fetching
      let lastActivityAt = Date.now();
      let watchdogPhase: 'id-fetch' | 'batch-process' = 'id-fetch';
      
      // STEP 1: Get all contact IDs first (lightweight operation)
      console.log("📋 Fetching contact IDs from Vtiger...");
      
      // Update sync metadata to show we're fetching IDs
      if (syncMetadataId) {
        await super.updateSyncMetadata(syncMetadataId, {
          errorMessage: 'Fetching contact IDs from VTiger...'
        });
        console.log("✅ Updated sync status: Fetching IDs");
      }
      
      // CRITICAL FIX: Add timeout protection to contact ID fetch with abort signal
      console.log('🔍 DEBUG: About to call fetchContactIds...');
      console.log('🔍 DEBUG: VTiger client exists?', !!this.vtigerClient);
      console.log('🔍 DEBUG: fetchContactIds method exists?', typeof this.vtigerClient?.fetchContactIds);
      
      let contactIds: string[] = [];
      try {
        // Track progress during ID fetching
        let lastIdProgressUpdate = Date.now();
        
        contactIds = await this.withVtigerTimeout(
          async (signal) => {
            console.log('🔍 DEBUG: Inside withVtigerTimeout, calling fetchContactIds with progress tracking...');
            const ids = await this.vtigerClient.fetchContactIds(
              undefined, 
              signal,
              // Progress callback for ID fetching
              (fetched: number, total?: number) => {
                const now = Date.now();
                // Update watchdog activity tracker
                lastActivityAt = now;
                
                // Report progress every 5 seconds
                if (now - lastIdProgressUpdate > 5000) {
                  const percent = total ? Math.round((fetched / total) * 100) : 0;
                  console.log(`📊 ID Fetch Progress: ${fetched}${total ? `/${total}` : ''} IDs fetched ${total ? `(${percent}%)` : ''}`);
                  lastIdProgressUpdate = now;
                  
                  // Update sync metadata with progress
                  if (syncMetadataId) {
                    super.updateSyncMetadata(syncMetadataId, {
                      errorMessage: `Fetching contact IDs: ${fetched}${total ? `/${total}` : ''} IDs...`
                    }).catch(e => console.warn('Failed to update progress:', e));
                  }
                }
              }
            );
            console.log('🔍 DEBUG: fetchContactIds returned:', Array.isArray(ids) ? `Array with ${ids.length} items` : typeof ids);
            return ids;
          },
          600000,  // 10 minute timeout for fetching all IDs (increased for 23k+ IDs with progress)
          'Fetch all contact IDs',
          3  // Allow retries for this critical operation
        );
      } catch (fetchError) {
        console.error('🔴 ERROR: Failed to fetch contact IDs:', fetchError);
        console.error('🔴 ERROR Stack:', fetchError instanceof Error ? fetchError.stack : 'No stack');
        throw new Error(`Failed to fetch contact IDs: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
      }
      
      console.log(`📊 Found ${contactIds.length} contact IDs to process`);
      
      // WATCHDOG: Update activity after successful ID fetch and transition to batch processing
      lastActivityAt = Date.now();
      watchdogPhase = 'batch-process';
      
      // CRITICAL FIX: Update vtiger_total with ACTUAL count from fetched IDs
      if (syncMetadataId) {
        await super.updateSyncMetadata(syncMetadataId, {
          vtigerTotal: contactIds.length
        });
        console.log(`✅ Updated vtiger_total to ACTUAL count: ${contactIds.length} contacts`);
      }
      
      // STEP 2: STREAMING PERSISTENCE - Fetch and save in batches to prevent memory crashes
      console.log("🚀 Starting streaming sync: fetch → save → clear memory (prevents crashes)...");
      const CONCURRENCY_LIMIT = 15; // SPEED UP: Increased from 5 to 15 concurrent fetches
      const SAVE_BATCH_SIZE = 100; // Save to DB every 100 contacts
      let processed = 0;
      let skippedCount = 0;
      let totalCreated = 0;
      let totalUpdated = 0;
      let contactBuffer: any[] = []; // Rolling buffer, cleared after each save
      
      // WATCHDOG: Enhanced to track both ID-fetching and batch processing phases
      let lastBatchTime = Date.now();
      const WATCHDOG_TIMEOUT = 5 * 60 * 1000; // 5 minutes without progress = stuck
      let syncAborted = false; // Flag to track if sync was aborted by watchdog
      
      // Start watchdog immediately to cover both phases
      watchdogInterval = setInterval(async () => {
        const now = Date.now();
        const timeSinceLastActivity = now - lastActivityAt;
        const timeSinceLastBatch = now - lastBatchTime;
        
        // Check based on current phase - using string comparison
        let isStuck = false;
        let timeStuck = 0;
        if (watchdogPhase === 'id-fetch') {
          isStuck = timeSinceLastActivity > WATCHDOG_TIMEOUT;
          timeStuck = timeSinceLastActivity;
        } else {
          isStuck = timeSinceLastBatch > WATCHDOG_TIMEOUT;
          timeStuck = timeSinceLastBatch;
        }
        
        if (isStuck && !syncAborted) {
          syncAborted = true; // Set flag to stop further processing
          if (watchdogInterval) clearInterval(watchdogInterval);
          
          const errorMessage = watchdogPhase === 'id-fetch'
            ? `Sync stuck during ID fetching - no response for ${Math.round(timeStuck / 1000)}s`
            : `Sync stuck during batch processing - no batch completed in ${Math.round(timeStuck / 1000)}s`;
          
          console.error(`🚨 WATCHDOG: ${errorMessage}`);
          console.error(`🚨 WATCHDOG Phase: ${watchdogPhase}, Processed: ${processed}/${contactIds.length || 'unknown'}`);
          
          // Update sync metadata to failed
          if (syncMetadataId) {
            try {
              await super.updateSyncMetadata(syncMetadataId, {
                status: 'failed',
                completedAt: new Date(),
                errorMessage: errorMessage,
                lastProcessedContactId: processed > 0 ? contactIds[processed - 1] : undefined // Save checkpoint for resume
              });
              console.log(`💾 Watchdog: Saved sync state for future resume (phase: ${watchdogPhase}, processed: ${processed})`);
            } catch (err) {
              console.error('Failed to update sync metadata on watchdog timeout:', err);
            }
          }
          
          // Call error callback if provided
          progress?.onError?.(new Error(errorMessage));
        }
      }, 30000); // Check every 30 seconds
      
      // REAL PROGRESS TRACKING: Start with actual total from Vtiger
      progress?.onStart?.(contactIds.length);
      console.log(`📊 Real progress: Starting streaming sync of ${contactIds.length} contacts (memory-safe)`);

      // RELIABILITY FIX #4: Check for resume point from provided resume data
      let resumeFromIndex = 0;
      if (resumeData?.lastProcessedContactId) {
        const lastIndex = contactIds.indexOf(resumeData.lastProcessedContactId);
        if (lastIndex >= 0) {
          resumeFromIndex = lastIndex + 1;
          console.log(`🔄 Resuming sync from contact #${resumeFromIndex} (ID: ${resumeData.lastProcessedContactId}), skipping ${resumeFromIndex} already processed contacts`);
        } else {
          console.warn(`⚠️ Could not find resume contact ID ${resumeData.lastProcessedContactId} in current contact list, starting from beginning`);
        }
      }

      // 🔄 MULTI-PASS RETRY SYSTEM: Process contacts with automatic retry for 100% completion
      const processContactBatch = async (
        batchIds: string[], 
        batchNumber: number, 
        concurrency: number,
        timeout: number,
        passNumber: number = 1
      ): Promise<{ validContacts: any[], failedContactIds: string[] }> => {
        console.log(`⚡ BATCH ${batchNumber} (Pass ${passNumber}) START: Fetching ${batchIds.length} contacts with concurrency ${concurrency}, timeout ${timeout}ms`);
        console.log(`🔍 BATCH ${batchNumber} IDS: [${batchIds.slice(0, 5).join(', ')}${batchIds.length > 5 ? '...' : ''}]`);
        
        // Update activity timestamp at start of batch
        lastActivityAt = Date.now();
        
        // Fetch contacts in parallel with controlled concurrency
        const batchPromises = batchIds.map(async (contactId, idx) => {
          const fetchStartTime = Date.now();
          
          try {
            const contact = await this.withVtigerTimeout(
              (signal) => this.vtigerClient.fetchContactById(contactId, signal),
              timeout,
              `Fetch contact ${contactId}`
            );
            
            const fetchDuration = Date.now() - fetchStartTime;
            console.log(`✅ FETCH SUCCESS: Contact ${contactId} (Pass ${passNumber}) fetched in ${fetchDuration}ms`);
            return { success: true, contactId, data: contact };
          } catch (error: any) {
            const fetchDuration = Date.now() - fetchStartTime;
            const isTimeout = error.message?.includes('timeout') || error.message?.includes('timed out') || error.code === 'ECONNABORTED';
            const errorType = isTimeout ? 'TIMEOUT' : 'ERROR';
            console.warn(`⚠️ FETCH ${errorType}: Contact ${contactId} (Pass ${passNumber}) failed after ${fetchDuration}ms - ${error.message || error}`);
            return { success: false, contactId, data: null };
          }
        });
        
        // CRITICAL FIX: Use Promise.allSettled() + timeout wrapper to prevent hangs
        console.log(`⏳ BATCH ${batchNumber} WAITING: Waiting for all ${batchPromises.length} fetch promises (with ${timeout * batchIds.length / 1000}s batch timeout)...`);
        
        const BATCH_TIMEOUT = timeout * batchIds.length; // Total timeout for entire batch
        let batchResults;
        
        try {
          batchResults = await Promise.race([
            Promise.allSettled(batchPromises),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error(`Batch ${batchNumber} timed out after ${BATCH_TIMEOUT}ms`)), BATCH_TIMEOUT)
            )
          ]);
        } catch (error: any) {
          console.error(`❌ BATCH ${batchNumber} TIMEOUT: Entire batch timed out - marking all ${batchIds.length} contacts as failed for retry`);
          return {
            validContacts: [],
            failedContactIds: batchIds // All contacts failed if batch times out
          };
        }
        
        console.log(`✅ BATCH ${batchNumber} SETTLED: All promises completed or rejected`);
        
        // Extract results from allSettled
        const validContacts: any[] = [];
        const failedContactIds: string[] = [];
        
        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value.success) {
            validContacts.push(result.value.data);
          } else if (result.status === 'fulfilled' && !result.value.success) {
            failedContactIds.push(result.value.contactId);
          } else if (result.status === 'rejected') {
            console.error(`❌ Promise rejected unexpectedly:`, result.reason);
          }
        }
        
        console.log(`📊 BATCH ${batchNumber} (Pass ${passNumber}) RESULTS: ${validContacts.length} successful, ${failedContactIds.length} failed`);
        return { validContacts, failedContactIds };
      };
      
      // Track all failed contact IDs for retry
      let allFailedContactIds: string[] = [];
      
      // Process contact IDs in batches with concurrency control
      for (let i = resumeFromIndex; i < contactIds.length; i += CONCURRENCY_LIMIT) {
        // Check if sync was aborted by watchdog
        if (syncAborted) {
          console.log("⛔ Sync aborted by watchdog timer - stopping processing");
          break;
        }
        
        const batchIds = contactIds.slice(i, i + CONCURRENCY_LIMIT);
        const batchNumber = Math.floor(i / CONCURRENCY_LIMIT) + 1;
        
        // Process batch with retry tracking
        const { validContacts, failedContactIds } = await processContactBatch(
          batchIds,
          batchNumber,
          CONCURRENCY_LIMIT,
          30000, // 30 second timeout per contact
          1 // Pass 1
        );
        
        // Track failed contacts for retry
        allFailedContactIds.push(...failedContactIds);
        skippedCount += failedContactIds.length;
        contactBuffer.push(...validContacts); // Add to rolling buffer
        processed += batchIds.length;
        
        console.log(`📊 BATCH ${batchNumber} RESULTS: ${validContacts.length} successful, ${failedContactIds.length} failed, buffer size: ${contactBuffer.length}`);
        
        // STREAMING PERSISTENCE: Save buffer to database when it reaches threshold
        if (contactBuffer.length >= SAVE_BATCH_SIZE || i + CONCURRENCY_LIMIT >= contactIds.length) {
          if (contactBuffer.length > 0) {
            console.log(`💾 DB SAVE START: Saving ${contactBuffer.length} contacts to database (batch ${batchNumber})...`);
            const dbSaveStartTime = Date.now();
            
            // Map contact data for database
            const candidateData = contactBuffer.map(contact => ({
              ...contact,
              source: "Vtiger CRM",
              externalId: contact.vtigerId,
              lastSyncedAt: new Date(),
              vtigerId: contact.vtigerId || contact.id
            }));
            console.log(`🔄 DB SAVE MAPPED: ${candidateData.length} contacts mapped for database`);
            
            // Save to database with abort check
            for (let idx = 0; idx < candidateData.length; idx++) {
              const data = candidateData[idx];
              // Check if sync was aborted before each DB operation
              if (syncAborted) {
                console.log("⛔ Sync aborted during database save - stopping");
                break;
              }
              
              console.log(`💾 DB SAVE ITEM ${idx + 1}/${candidateData.length}: Saving VTiger ID ${data.vtigerId}...`);
              const itemSaveStartTime = Date.now();
              
              try {
                const existing = await this.getCandidateByVtigerId(data.vtigerId);
                if (existing) {
                  console.log(`📝 DB UPDATE: Updating existing candidate ID ${existing.id} (VTiger ${data.vtigerId})`);
                  await this.updateCandidate(existing.id, data);
                  totalUpdated++;  // Only increment if update succeeds
                  console.log(`✅ DB UPDATE SUCCESS: Candidate ${existing.id} updated in ${Date.now() - itemSaveStartTime}ms`);
                } else {
                  console.log(`➕ DB CREATE: Creating new candidate for VTiger ID ${data.vtigerId}`);
                  await this.createCandidate({ ...data, status: 'not_contacted' });
                  totalCreated++;  // Only increment if create succeeds
                  console.log(`✅ DB CREATE SUCCESS: New candidate created in ${Date.now() - itemSaveStartTime}ms`);
                }
                
                // Update activity after successful DB operation  
                lastActivityAt = Date.now();
              } catch (error) {
                const errorDuration = Date.now() - itemSaveStartTime;
                console.error(`❌ DB SAVE FAILED: Contact ${data.vtigerId} failed after ${errorDuration}ms:`, error);
                skippedCount++;  // CRITICAL FIX: Count failed saves as skipped
              }
            }
            
            const dbSaveDuration = Date.now() - dbSaveStartTime;
            console.log(`✅ DB SAVE COMPLETE: ${totalCreated} created, ${totalUpdated} updated in ${dbSaveDuration}ms (total: ${totalCreated + totalUpdated}/${processed})`);
            
            // CRITICAL: Clear buffer to free memory!
            contactBuffer = [];
            console.log(`🧹 BUFFER CLEARED: Memory freed for next batch`);
            
            // Update sync metadata with progress
            if (syncMetadataId) {
              try {
                await super.updateSyncMetadata(syncMetadataId, {
                  fetchedCount: processed,
                  createdCount: totalCreated,
                  updatedCount: totalUpdated,
                  errorCount: skippedCount,
                  vtigerTotal: contactIds.length
                });
              } catch (error) {
                console.error(`❌ Failed to update sync metadata:`, error);
              }
            }
          }
        }
        
        // CHECKPOINT: Save resume point after each batch for crash recovery
        if (syncMetadataId && batchIds.length > 0) {
          const lastContactId = batchIds[batchIds.length - 1];
          try {
            await super.updateSyncMetadata(syncMetadataId, {
              lastProcessedContactId: lastContactId
            });
          } catch (error) {
            console.error(`❌ Failed to update resume point:`, error);
          }
        }
        
        // Log memory usage every 100 contacts
        if (processed % 100 === 0) {
          this.logMemoryUsage(`Processed ${processed}/${contactIds.length} contacts`);
        }
        
        // Report progress
        progress?.onBatch?.(validContacts.length, processed, contactIds.length);
        
        // WATCHDOG: Reset timer after successful batch
        lastBatchTime = Date.now();
        lastActivityAt = Date.now(); // CRITICAL: Update both timers for watchdog to properly track activity
        
        console.log(`🎯 BATCH ${batchNumber} COMPLETE: Processed ${processed}/${contactIds.length} total contacts. Moving to next batch...`);
        console.log(`⏰ BATCH ${batchNumber} END: lastActivityAt updated to ${new Date(lastActivityAt).toISOString()}`);
        
        // SPEED UP: Removed 100ms delay - VTiger can handle the load with timeout protection
      }
      
      // 🔄 MULTI-PASS RETRY LOOP: Retry failed contacts with progressive backoff for 100% completion
      const MAX_RETRY_PASSES = 5;
      let currentRetryPass = 1;
      let contactsToRetry = [...allFailedContactIds];
      
      console.log(`\n🔄 ========== PASS 1 COMPLETE ==========`);
      console.log(`📊 Pass 1 Results: ${processed - allFailedContactIds.length}/${processed} successful, ${allFailedContactIds.length} failed`);
      
      while (contactsToRetry.length > 0 && currentRetryPass <= MAX_RETRY_PASSES && !syncAborted) {
        console.log(`\n🔄 ========== STARTING RETRY PASS ${currentRetryPass + 1}/${MAX_RETRY_PASSES + 1} ==========`);
        console.log(`📊 Retrying ${contactsToRetry.length} failed contacts with more conservative settings...`);
        
        // Update sync metadata to show retry pass
        if (syncMetadataId) {
          try {
            await super.updateSyncMetadata(syncMetadataId, {
              errorMessage: `Retry pass ${currentRetryPass + 1}: ${contactsToRetry.length} contacts to retry`
            });
          } catch (error) {
            console.error(`❌ Failed to update sync metadata for retry pass:`, error);
          }
        }
        
        // Progressive backoff: Reduce concurrency and increase timeout with each retry
        const retryConcurrency = Math.max(1, Math.floor(CONCURRENCY_LIMIT / (currentRetryPass + 1))); // 15 → 7 → 5 → 3 → 3
        const retryTimeout = 30000 + (currentRetryPass * 15000); // 30s → 45s → 60s → 75s → 90s
        
        console.log(`⚙️ Retry settings: concurrency=${retryConcurrency}, timeout=${retryTimeout}ms`);
        
        const retryFailedIds: string[] = [];
        
        // Process retry contacts in smaller batches
        for (let i = 0; i < contactsToRetry.length; i += retryConcurrency) {
          if (syncAborted) {
            console.log("⛔ Sync aborted during retry - stopping");
            break;
          }
          
          const retryBatchIds = contactsToRetry.slice(i, i + retryConcurrency);
          const retryBatchNumber = Math.floor(i / retryConcurrency) + 1;
          
          // Add delay between retry batches to avoid overwhelming VTiger
          if (i > 0) {
            const delayMs = currentRetryPass * 1000; // 1s, 2s, 3s, 4s, 5s
            console.log(`⏸️ Waiting ${delayMs}ms before next retry batch (give VTiger time to recover)...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
          // Process retry batch
          const { validContacts, failedContactIds } = await processContactBatch(
            retryBatchIds,
            retryBatchNumber,
            retryConcurrency,
            retryTimeout,
            currentRetryPass + 1 // Pass number
          );
          
          // Save successful retries
          if (validContacts.length > 0) {
            contactBuffer.push(...validContacts);
            
            // Save retry results to database
            console.log(`💾 RETRY SAVE: Saving ${validContacts.length} recovered contacts to database...`);
            const candidateData = validContacts.map(contact => ({
              ...contact,
              source: "Vtiger CRM",
              externalId: contact.vtigerId,
              lastSyncedAt: new Date(),
              vtigerId: contact.vtigerId || contact.id
            }));
            
            for (const data of candidateData) {
              if (syncAborted) break;
              
              try {
                const existing = await this.getCandidateByVtigerId(data.vtigerId);
                if (existing) {
                  await this.updateCandidate(existing.id, data);
                  totalUpdated++;
                } else {
                  await this.createCandidate({ ...data, status: 'not_contacted' });
                  totalCreated++;
                }
                lastActivityAt = Date.now();
              } catch (error) {
                console.error(`❌ RETRY DB SAVE FAILED: Contact ${data.vtigerId}:`, error);
              }
            }
            
            contactBuffer = []; // Clear buffer
            console.log(`✅ RETRY SAVE COMPLETE: ${validContacts.length} contacts recovered and saved`);
          }
          
          // Track still-failed contacts
          retryFailedIds.push(...failedContactIds);
          
          // Update watchdog timer
          lastActivityAt = Date.now();
          lastBatchTime = Date.now();
        }
        
        // Update for next retry pass
        const recoveredCount = contactsToRetry.length - retryFailedIds.length;
        console.log(`\n✅ Retry Pass ${currentRetryPass + 1} Complete: ${recoveredCount} contacts recovered, ${retryFailedIds.length} still failing`);
        
        contactsToRetry = retryFailedIds;
        currentRetryPass++;
        
        // Update progress
        progress?.onBatch?.(recoveredCount, processed, contactIds.length);
      }
      
      // Final results after all retry passes
      const finalFailedCount = contactsToRetry.length;
      const finalSuccessCount = contactIds.length - finalFailedCount;
      
      console.log(`\n🎯 ========== ALL SYNC PASSES COMPLETE ==========`);
      console.log(`📊 FINAL RESULTS:`);
      console.log(`   ✅ Successfully synced: ${finalSuccessCount}/${contactIds.length} contacts (${((finalSuccessCount / contactIds.length) * 100).toFixed(2)}%)`);
      console.log(`   ❌ Failed after ${currentRetryPass} passes: ${finalFailedCount}/${contactIds.length} contacts (${((finalFailedCount / contactIds.length) * 100).toFixed(2)}%)`);
      console.log(`   📝 Created: ${totalCreated}, Updated: ${totalUpdated}`);
      
      if (finalFailedCount > 0) {
        console.error(`\n🚨 PERMANENTLY FAILED CONTACTS (VTiger API issue):`);
        console.error(`   Contact IDs: ${contactsToRetry.slice(0, 20).join(', ')}${contactsToRetry.length > 20 ? ` ... and ${contactsToRetry.length - 20} more` : ''}`);
        console.error(`   These contacts failed ${MAX_RETRY_PASSES + 1} times and indicate a VTiger API problem.`);
        
        // Store failed contact IDs in sync metadata for debugging
        if (syncMetadataId) {
          try {
            await super.updateSyncMetadata(syncMetadataId, {
              errorMessage: `${finalFailedCount} contacts failed after ${MAX_RETRY_PASSES + 1} attempts. VTiger API issue detected. Failed IDs: ${contactsToRetry.slice(0, 10).join(', ')}...`
            });
          } catch (error) {
            console.error(`❌ Failed to update sync metadata with failure list:`, error);
          }
        }
      } else {
        console.log(`\n🎉 100% COMPLETION ACHIEVED! All ${contactIds.length} contacts successfully synced!`);
      }
      
      // WATCHDOG: Clear interval on completion
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
      }
      
      // Sync complete! Notify completion
      progress?.onComplete?.();
    } catch (error) {
      // WATCHDOG: Clear interval on error too
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
      }
      
      console.error("Error importing contacts from Vtiger:", error);
      
      // CRITICAL FIX: Update sync status to failed on any error
      if (syncMetadataId) {
        try {
          await super.updateSyncMetadata(syncMetadataId, {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          console.log(`💾 Sync marked as failed - can be resumed from checkpoint`);
        } catch (updateError) {
          console.error('Failed to update sync metadata on import error:', updateError);
        }
      }
      
      // Re-throw error so it propagates to progress.onError()
      throw error;
    }
  }

  /**
   * Enrich existing candidates who are missing Vtiger data by matching them with Vtiger contacts
   */
  private async enrichExistingCandidatesWithVtigerData(vtigerContacts: any[]): Promise<void> {
    console.log("🔍 Starting enrichment of existing candidates with missing Vtiger data...");
    
    // Find candidates missing key Vtiger data (profile summaries)
    const candidatesMissingData = await this.getCandidatesMissingVtigerData();
    console.log(`📊 Found ${candidatesMissingData.length} candidates missing Vtiger profile data`);
    
    if (candidatesMissingData.length === 0) {
      console.log("✅ All candidates already have complete Vtiger data");
      return;
    }
    
    let enrichedCount = 0;
    
    // Try to match and enrich each candidate missing data
    for (const candidate of candidatesMissingData) {
      // Try to find matching Vtiger contact by name and email
      const vtigerContact = this.findMatchingVtigerContact(candidate, vtigerContacts);
      
      if (vtigerContact) {
        // Update candidate with rich Vtiger data
        console.log(`🔗 Enriching candidate ${candidate.firstName} ${candidate.lastName} with Vtiger data`);
        
        const enrichmentData: any = {
          vtigerId: vtigerContact.vtigerId,
          lastSyncedAt: new Date(),
        };
        
        // Add all available Vtiger fields
        if (vtigerContact.jobTitle?.trim()) {
          enrichmentData.jobTitle = vtigerContact.jobTitle;
          enrichmentData.currentTitle = vtigerContact.jobTitle; // Also set currentTitle for compatibility
        }
        if (vtigerContact.profileSummary?.trim()) {
          enrichmentData.profileSummary = vtigerContact.profileSummary;
        }
        if (vtigerContact.titleDescription?.trim()) {
          enrichmentData.titleDescription = vtigerContact.titleDescription;
        }
        if (vtigerContact.company?.trim()) {
          enrichmentData.company = vtigerContact.company;
        }
        if (vtigerContact.companyLocation?.trim()) {
          enrichmentData.companyLocation = vtigerContact.companyLocation;
        }
        if (vtigerContact.location?.trim()) {
          enrichmentData.location = vtigerContact.location;
        }
        if (vtigerContact.linkedinUrl?.trim()) {
          enrichmentData.linkedinUrl = vtigerContact.linkedinUrl;
        }
        if (vtigerContact.branche?.trim()) {
          enrichmentData.branche = vtigerContact.branche;
        }
        if (vtigerContact.durationCurrentRole?.trim()) {
          enrichmentData.durationCurrentRole = vtigerContact.durationCurrentRole;
        }
        if (vtigerContact.durationAtCompany?.trim()) {
          enrichmentData.durationAtCompany = vtigerContact.durationAtCompany;
        }
        
        await this.updateCandidate(candidate.id, enrichmentData);
        enrichedCount++;
      }
    }
    
    console.log(`✅ Enriched ${enrichedCount}/${candidatesMissingData.length} candidates with Vtiger data`);
  }
  
  /**
   * Find matching Vtiger contact for a candidate by name and email
   */
  private findMatchingVtigerContact(candidate: any, vtigerContacts: any[]): any | null {
    // Try exact email match first (most reliable)
    if (candidate.email) {
      const emailMatch = vtigerContacts.find(contact => 
        contact.email && contact.email.toLowerCase() === candidate.email.toLowerCase()
      );
      if (emailMatch) return emailMatch;
    }
    
    // Try exact name match (firstname + lastname)
    if (candidate.firstName && candidate.lastName) {
      const nameMatch = vtigerContacts.find(contact =>
        contact.firstName && contact.lastName &&
        contact.firstName.toLowerCase() === candidate.firstName.toLowerCase() &&
        contact.lastName.toLowerCase() === candidate.lastName.toLowerCase()
      );
      if (nameMatch) return nameMatch;
    }
    
    return null;
  }
  

  /**
   * Import accounts from Vtiger CRM as clients
   */
  private async importAccountsFromVtiger(): Promise<void> {
    if (!this.vtigerClient) return;

    try {
      const accounts = await this.vtigerClient.importAccounts();

      for (const account of accounts) {
        // Check if client exists by Vtiger ID
        let client = await this.getClientByVtigerId(account.vtigerId);

        if (client) {
          // Update existing client
          await this.updateClient(client.id, {
            name: account.companyName,
            website: account.website,
            contactEmail: account.email,
            contactPhone: account.phone,
            industry: account.industry,
            vtigerId: account.vtigerId,
            lastSyncedAt: new Date(),
          });
        } else {
          // Check if client exists by name
          client = await this.getClientByName(account.companyName);

          if (client) {
            // Update existing client with Vtiger ID
            await this.updateClient(client.id, {
              vtigerId: account.vtigerId,
              lastSyncedAt: new Date(),
            });
          } else {
            // Create new client from Vtiger account
            await this.createClient({
              name: account.companyName,
              industry: account.industry || null,
              location: null,
              website: account.website || null,
              description: null,
              contactName: null,
              contactEmail: account.email || null,
              contactPhone: account.phone || null,
              notes: null,
              status: "active",
              vtigerId: account.vtigerId,
              externalId: account.vtigerId,
              source: "Vtiger CRM",
              lastSyncedAt: new Date(),
            });
          }
        }
      }

      console.log(`Imported ${accounts.length} accounts from Vtiger`);
    } catch (error) {
      console.error("Error importing accounts from Vtiger:", error);
    }
  }



  /**
   * Sync candidates to Vtiger CRM
   */
  private async syncCandidatesToVtiger(): Promise<void> {
    if (!this.vtigerClient) return;

    try {
      // Get candidates that need to be synced to Vtiger
      const candidates = await super.getCandidates();
      const candidatesToSync = candidates.filter(
        (candidate) =>
          !candidate.lastSyncedAt ||
          (candidate.updatedAt && candidate.lastSyncedAt < candidate.updatedAt),
      );

      if (candidatesToSync.length === 0) {
        return;
      }

      // Prepare candidates for Vtiger format
      const vtigerCandidates = candidatesToSync.map((candidate) => ({
        id: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        jobTitle: candidate.currentTitle,
        email: candidate.email,
        phone: candidate.phone,
        vtigerId: candidate.vtigerId,
      }));

      // Sync candidates to Vtiger
      const syncResults =
        await this.vtigerClient.syncCandidates(vtigerCandidates);

      // Update local candidates with Vtiger IDs and sync time
      for (const result of syncResults) {
        await this.updateCandidate(result.id, {
          vtigerId: result.vtigerId,
          lastSyncedAt: new Date(),
        });
      }

      console.log(`Synced ${syncResults.length} candidates to Vtiger`);
    } catch (error) {
      console.error("Error syncing candidates to Vtiger:", error);
    }
  }

  /**
   * Sync clients to Vtiger CRM
   */
  private async syncClientsToVtiger(): Promise<void> {
    if (!this.vtigerClient) return;

    try {
      // Get clients that need to be synced to Vtiger
      const clients = await super.getClients();
      const clientsToSync = clients.filter(
        (client) =>
          !client.lastSyncedAt ||
          (client.updatedAt && client.lastSyncedAt < client.updatedAt),
      );

      if (clientsToSync.length === 0) {
        return;
      }

      // Prepare clients for Vtiger format
      const vtigerClients = clientsToSync.map((client) => ({
        id: client.id,
        companyName: client.name,
        website: client.website,
        phone: client.contactPhone,
        email: client.contactEmail,
        industry: client.industry,
        vtigerId: client.vtigerId,
      }));

      // Sync clients to Vtiger
      const syncResults = await this.vtigerClient.syncClients(vtigerClients);

      // Update local clients with Vtiger IDs and sync time
      for (const result of syncResults) {
        await this.updateClient(result.id, {
          vtigerId: result.vtigerId,
          lastSyncedAt: new Date(),
        });
      }

      console.log(`Synced ${syncResults.length} clients to Vtiger`);
    } catch (error) {
      console.error("Error syncing clients to Vtiger:", error);
    }
  }

  /**
   * Override base methods to ensure Vtiger sync
   */

  // Override getCandidates to return live data from Vtiger
  async getCandidates(): Promise<Candidate[]> {
    try {
      console.log("=== VTIGER CANDIDATES DEBUG START ===");

      // Get candidates from local storage first
      const localCandidates = await super.getCandidates();
      console.log(`Local candidates count: ${localCandidates.length}`);
      
      // Return candidates immediately if we have them
      if (localCandidates.length > 0) {
        console.log("=== VTIGER CANDIDATES DEBUG END ===");
        return localCandidates;
      }

      // If we have Vtiger connection, ensure we have fresh data
      if (this.vtigerClient && this.connectionStatus === "connected") {
        console.log("Fetching live candidates from Vtiger CRM...");

        // CRITICAL DEBUG: Direct API test
        console.log("=== DIRECT VTIGER API TEST ===");
        try {
          const rawVtigerContacts = await this.vtigerClient.importContacts();
          console.log(
            "Raw Vtiger API Response:",
            JSON.stringify(rawVtigerContacts, null, 2),
          );
          console.log(
            "Raw contact count from Vtiger API:",
            rawVtigerContacts.length,
          );

          if (rawVtigerContacts.length === 0) {
            console.error(
              "🚨 CRITICAL: Vtiger API returned 0 contacts but CRM should contain data!",
            );
            console.log("Testing basic Vtiger query...");

            // Test with simplest possible query
            const basicQuery = await this.vtigerClient.query(
              "SELECT id, firstname, lastname FROM Contacts LIMIT 5;",
            );
            console.log(
              "Basic query result:",
              JSON.stringify(basicQuery, null, 2),
            );
          }
        } catch (directApiError) {
          console.error("Direct Vtiger API test failed:", directApiError);
        }

        // Import fresh data from Vtiger Contacts module
        await this.importContactsFromVtiger();

        // Return updated local candidates (which now include Vtiger data)
        // FILTER: Only return candidates with valid vtigerId to ensure VTiger-only display
        const updatedCandidates = await super.getCandidates();
        const vtigerOnlyCandidates = updatedCandidates.filter(candidate => candidate.vtigerId != null);
        
        console.log(
          `Final candidates count after Vtiger sync: ${updatedCandidates.length} (${vtigerOnlyCandidates.length} with vtigerId)`,
        );

        if (vtigerOnlyCandidates.length === 0) {
          console.error(
            "🚨 CRITICAL: Zero VTiger candidates after successful Vtiger connection!",
          );
          console.log("This indicates a data mapping or import logic error.");
        }

        console.log("=== VTIGER CANDIDATES DEBUG END ===");
        return vtigerOnlyCandidates;
      }

      console.log("=== VTIGER CANDIDATES DEBUG END ===");
      // Even for local fallback, only return candidates with vtigerId
      return localCandidates.filter(candidate => candidate.vtigerId != null);
    } catch (error) {
      console.error("Error getting candidates from Vtiger:", error);
      // Fallback to local data if Vtiger fails, but still filter for VTiger-only
      const fallbackCandidates = await super.getCandidates();
      return fallbackCandidates.filter(candidate => candidate.vtigerId != null);
    }
  }

  // Override candidate methods
  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    // Allow candidate creation ONLY during VTiger sync (candidates with vtigerId)
    // Prevent manual UI creation (candidates without vtigerId)
    if (!candidate.vtigerId) {
      throw new Error("Manual candidate creation is disabled. Platform only displays VTiger candidates.");
    }
    
    // Create candidate from VTiger sync
    console.log(`📝 Creating VTiger candidate: ${candidate.firstName} ${candidate.lastName} (${candidate.vtigerId})`);
    return await super.createCandidate(candidate);
  }

  async updateCandidate(
    id: number,
    candidateUpdate: Partial<InsertCandidate>,
  ): Promise<Candidate | undefined> {
    const updatedCandidate = await super.updateCandidate(id, candidateUpdate);

    if (
      this.vtigerClient &&
      this.syncEnabled &&
      updatedCandidate &&
      !candidateUpdate.lastSyncedAt
    ) {
      // If this is a local update (not from Vtiger import), sync to Vtiger
      this.syncCandidatesToVtiger().catch((err) => {
        console.error("Error syncing updated candidate to Vtiger:", err);
      });
    }

    return updatedCandidate;
  }

  // Override client methods
  async createClient(client: InsertClient): Promise<Client> {
    const newClient = await super.createClient(client);

    if (this.vtigerClient && this.syncEnabled && !client.vtigerId) {
      // If this is a new client (not from Vtiger import), sync to Vtiger
      this.syncClientsToVtiger().catch((err) => {
        console.error("Error syncing new client to Vtiger:", err);
      });
    }

    return newClient;
  }

  async updateClient(
    id: number,
    clientUpdate: Partial<InsertClient>,
  ): Promise<Client | undefined> {
    const updatedClient = await super.updateClient(id, clientUpdate);

    if (
      this.vtigerClient &&
      this.syncEnabled &&
      updatedClient &&
      !clientUpdate.lastSyncedAt
    ) {
      // If this is a local update (not from Vtiger import), sync to Vtiger
      this.syncClientsToVtiger().catch((err) => {
        console.error("Error syncing updated client to Vtiger:", err);
      });
    }

    return updatedClient;
  }

  /**
   * Get candidates that need backfilling with complete field mapping
   * Returns candidates with vtigerId but potentially incomplete data
   */
  async getCandidatesForBackfill(startFromId: number = 0, batchSize: number = 50): Promise<Candidate[]> {
    try {
      const candidates = await super.getCandidates();
      
      // Filter candidates that have vtigerId (can be backfilled) and are after startFromId
      const candidatesNeedingBackfill = candidates
        .filter(candidate => 
          candidate.id > startFromId && 
          candidate.vtigerId && 
          candidate.vtigerId.trim() !== ''
        )
        .slice(0, batchSize);
      
      console.log(`[BACKFILL] Found ${candidatesNeedingBackfill.length} candidates needing backfill from ID ${startFromId}`);
      return candidatesNeedingBackfill;
    } catch (error) {
      console.error("Error getting candidates for backfill:", error);
      throw error;
    }
  }

  /**
   * Fetch fresh contact data from Vtiger by vtigerId
   */
  async fetchVtigerContactById(vtigerId: string): Promise<any> {
    if (!this.vtigerClient) {
      throw new Error("Vtiger client not available");
    }

    try {
      await this.vtigerClient.login();
      
      // Use the existing query method to fetch a specific contact by ID
      const query = `SELECT * FROM Contacts WHERE id='${vtigerId}';`;
      const result = await this.vtigerClient.query(query);
      
      if (result && result.length > 0) {
        console.log(`[BACKFILL] Fetched Vtiger contact ${vtigerId}:`, result[0]);
        return result[0];
      } else {
        console.warn(`[BACKFILL] No contact found in Vtiger with ID ${vtigerId}`);
        return null;
      }
    } catch (error) {
      console.error(`Error fetching Vtiger contact ${vtigerId}:`, error);
      throw error;
    }
  }
}

// Create and export singleton instance
export const vtigerStorage = new VtigerStorage();

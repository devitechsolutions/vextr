import cron from 'node-cron';
import { storage } from '../storage';
import { vtigerStorage } from '../storage-vtiger';
import { db } from '../db';
import { syncMetadata } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * Initialize cron jobs and run once-per-day sync on startup
 */
export async function initializeCronJobs() {
  console.log('🕐 Initializing daily sync and cron jobs...');

  // Check if sync has already run today (once per day on first startup)
  try {
    const lastSync = await db
      .select()
      .from(syncMetadata)
      .where(eq(syncMetadata.status, 'completed'))
      .orderBy(desc(syncMetadata.completedAt))
      .limit(1);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const hasRunToday = lastSync.length > 0 && 
      lastSync[0].completedAt && 
      new Date(lastSync[0].completedAt) >= today;
    
    // Helper function to recalculate match scores after sync completes
    async function recalculateMatchScores() {
      console.log('🎯 Starting match score recalculation after sync...');
      
      try {
        // Get all open vacancies
        const allVacancies = await storage.getVacancies();
        const openVacancies = allVacancies.filter(v => v.status === 'open');
        
        console.log(`📊 Found ${openVacancies.length} open vacancies to process`);
        
        let processedCount = 0;
        let errorCount = 0;
        
        for (const vacancy of openVacancies) {
          try {
            console.log(`🎯 Recalculating matches for vacancy: ${vacancy.title} (ID: ${vacancy.id})`);
            
            // Run the match calculation - this will automatically cache scores
            await storage.matchCandidatesToVacancy(vacancy.id);
            
            processedCount++;
            console.log(`✅ Completed vacancy ${vacancy.id} (${processedCount}/${openVacancies.length})`);
          } catch (error) {
            errorCount++;
            console.error(`❌ Error processing vacancy ${vacancy.id}:`, error);
          }
        }
        
        console.log(`
🎉 Match score recalculation complete!
✅ Processed: ${processedCount} vacancies
❌ Errors: ${errorCount} vacancies
        `);
      } catch (error) {
        console.error('❌ Fatal error in match score recalculation:', error);
      }
    }

    if (!hasRunToday) {
      console.log('🌅 First server start of the day - running daily VTiger sync...');
      console.log(`📅 Date: ${new Date().toLocaleDateString()}, Time: ${new Date().toLocaleTimeString()}`);
      
      // Run sync in background (don't block server startup)
      vtigerStorage.syncWithVtiger()
        .then(() => {
          console.log('✅ Daily startup VTiger sync completed successfully');
          // Run match score recalculation after sync completes
          return recalculateMatchScores();
        })
        .then(() => {
          console.log('✅ Daily sync and match score recalculation complete');
        })
        .catch((error: any) => {
          console.error('❌ Daily startup sync/match calculation failed:', error);
        });
    } else {
      const lastSyncTime = lastSync[0].completedAt ? new Date(lastSync[0].completedAt).toLocaleString() : 'unknown';
      console.log(`✓ VTiger sync already completed today at ${lastSyncTime}`);
      console.log('📝 Manual sync is available via the UI if needed');
    }
  } catch (error) {
    console.error('⚠️ Error checking last sync status:', error);
    // Don't run sync if we can't determine status - safer to wait for manual trigger
  }
}

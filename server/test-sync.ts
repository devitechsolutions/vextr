#!/usr/bin/env tsx
// Test script to manually trigger VTiger sync and debug issues

import { vtigerStorage } from './storage-vtiger';

async function testSync() {
  console.log('🔍 TEST: Starting manual VTiger sync test...');
  
  try {
    // Create progress handler to track sync
    const progressHandler = {
      onStart: (total?: number) => {
        console.log(`🔍 TEST: Sync started with ${total || 'unknown'} total contacts`);
      },
      onBatch: (batchProcessed: number, totalProcessed: number, total?: number) => {
        console.log(`🔍 TEST: Progress: ${totalProcessed}/${total || '?'} (${total ? Math.round((totalProcessed / total) * 100) : '?'}%)`);
      },
      onComplete: () => {
        console.log('🔍 TEST: Sync completed successfully');
      },
      onError: (error: Error) => {
        console.error('🔍 TEST: Sync failed with error:', error);
        console.error('🔍 TEST: Error stack:', error.stack);
      }
    };
    
    // Trigger the sync
    console.log('🔍 TEST: Triggering sync with VTiger...');
    await vtigerStorage.syncWithVtiger(progressHandler, 2); // Use user ID 2 (Nils Dekker)
    
    console.log('✅ TEST: Sync test completed successfully!');
  } catch (error) {
    console.error('❌ TEST: Sync test failed:', error);
    console.error('❌ TEST: Error stack:', error instanceof Error ? error.stack : 'No stack');
    process.exit(1);
  }
}

// Run the test
testSync();
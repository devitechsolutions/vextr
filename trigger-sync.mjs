// ES Module to trigger VTiger sync
import { vtigerStorage } from './server/storage-vtiger.js';

console.log('🔄 Starting manual VTiger sync #58...');
console.log('📅 Time:', new Date().toLocaleString());

// Start the sync
vtigerStorage.syncWithVtiger()
  .then(result => {
    console.log('✅ Sync completed successfully!');
    console.log('Result:', result);
  })
  .catch(error => {
    console.error('❌ Sync failed:', error);
    console.error('Stack trace:', error.stack);
  });
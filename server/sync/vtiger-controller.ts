/**
 * Vtiger Sync Controller
 * 
 * This controller provides API endpoints for synchronizing data between
 * the recruitment platform and Vtiger CRM
 */

import { Router, Request, Response } from 'express';
import { VtigerSyncService, SyncDirection } from './vtiger-sync-service';

// Initialize the Vtiger sync service
const syncService = new VtigerSyncService();

// Initialize the service when the server starts
syncService.initialize().catch(error => {
  console.error('Failed to initialize Vtiger sync service:', error);
});

export const vtigerSyncRouter = Router();

/**
 * Get sync status
 */
vtigerSyncRouter.get('/status', (req: Request, res: Response) => {
  const status = syncService.getSyncStatus();
  res.json({
    success: true,
    ...status
  });
});

/**
 * Get sync history
 */
vtigerSyncRouter.get('/history', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
  const history = syncService.getSyncHistory(limit);
  
  res.json({
    success: true,
    history
  });
});

/**
 * Start a manual sync
 */
vtigerSyncRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const { direction = SyncDirection.BIDIRECTIONAL } = req.body;
    
    // Get user ID from authenticated session (default to 2 if not available for backwards compatibility)
    const userId = req.user?.id || 2;
    console.log(`🔵 Manual sync requested by user ID: ${userId}`);
    
    // Start the sync in the background with user ID
    syncService.syncAll(direction, userId).catch(error => {
      console.error('Sync error:', error);
    });
    
    res.json({
      success: true,
      message: 'Synchronization started'
    });
  } catch (error) {
    console.error('Error starting sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start synchronization'
    });
  }
});

/**
 * Update sync configuration
 */
vtigerSyncRouter.post('/config', (req: Request, res: Response) => {
  try {
    const { syncInterval, enableAutoSync } = req.body;
    
    syncService.updateConfig({
      syncInterval: syncInterval,
      enableAutoSync
    });
    
    res.json({
      success: true,
      message: 'Configuration updated'
    });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update configuration'
    });
  }
});

/**
 * Start auto-sync
 */
vtigerSyncRouter.post('/auto-sync/start', (req: Request, res: Response) => {
  try {
    syncService.startAutoSync();
    
    res.json({
      success: true,
      message: 'Auto-sync started'
    });
  } catch (error) {
    console.error('Error starting auto-sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start auto-sync'
    });
  }
});

/**
 * Stop auto-sync
 */
vtigerSyncRouter.post('/auto-sync/stop', (req: Request, res: Response) => {
  try {
    syncService.stopAutoSync();
    
    res.json({
      success: true,
      message: 'Auto-sync stopped'
    });
  } catch (error) {
    console.error('Error stopping auto-sync:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop auto-sync'
    });
  }
});

/**
 * Vtiger webhook endpoint
 * This endpoint receives webhooks from Vtiger CRM
 */
vtigerSyncRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    
    // In a real implementation, you would validate the webhook data
    // and trigger a sync for the affected entities
    
    console.log('Received webhook from Vtiger:', data);
    
    // Acknowledge the webhook
    res.json({
      success: true,
      message: 'Webhook received'
    });
    
    // Sync the affected entity
    // This would be implemented based on the webhook data
    // syncService.syncEntityFromVtiger(data.module, data.id);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook'
    });
  }
});

// Export the sync service instance for use by other modules
export { syncService };
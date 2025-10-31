import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';

const router = Router();

/**
 * Endpoint to trigger direct Vtiger data correction
 * This bypasses the API inconsistency issues by querying individual records
 */
router.post('/api/vtiger/fix-data', async (req, res) => {
  try {
    console.log('🔧 Starting direct Vtiger data correction process...');
    
    // Run the data correction script
    const scriptPath = path.resolve(__dirname, 'fix-vtiger-data.js');
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      const message = data.toString();
      console.log(message);
      output += message;
    });
    
    child.stderr.on('data', (data) => {
      const message = data.toString();
      console.error(message);
      errorOutput += message;
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Data correction completed successfully');
        res.json({
          success: true,
          message: 'Data correction completed successfully',
          output: output
        });
      } else {
        console.error(`❌ Data correction failed with code ${code}`);
        res.status(500).json({
          success: false,
          message: 'Data correction failed',
          error: errorOutput,
          output: output
        });
      }
    });
    
    child.on('error', (error) => {
      console.error('❌ Failed to start data correction script:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start data correction',
        error: error.message
      });
    });
    
  } catch (error) {
    console.error('❌ Data correction endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * Get data correction status and statistics
 */
router.get('/api/vtiger/data-status', async (req, res) => {
  try {
    const { db } = await import('./db.js');
    
    // Get statistics about data completeness
    const stats = await db.execute(`
      SELECT 
        COUNT(*) as total_candidates,
        COUNT(CASE WHEN profile_summary IS NOT NULL AND profile_summary != first_name || ' ' || last_name THEN 1 END) as has_profile_summary,
        COUNT(CASE WHEN title_description IS NOT NULL AND title_description != '' THEN 1 END) as has_title_description,
        COUNT(CASE WHEN linkedin_url IS NOT NULL AND linkedin_url != '' THEN 1 END) as has_linkedin_url
      FROM candidates
    `);
    
    res.json({
      success: true,
      statistics: stats.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Data status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get data status',
      error: error.message
    });
  }
});

export default router;
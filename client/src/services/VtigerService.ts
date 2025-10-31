import { useContext } from 'react';
import { useVtiger } from '@/context/VtigerContext';

/**
 * Service for interacting with Vtiger CRM API
 */
export function useVtigerCRM() {
  const vtigerContext = useVtiger();
  
  return {
    ...vtigerContext,
    
    // Additional helper methods can be added here
    isSyncing: false,
    
    // Two-way sync between local database and Vtiger CRM
    async syncAll() {
      if (!vtigerContext.isConnected) {
        throw new Error('Not connected to Vtiger CRM');
      }
      
      await vtigerContext.syncCandidates();
      await vtigerContext.syncClients();
    },
    
    // Import all data from Vtiger CRM
    async importAll() {
      if (!vtigerContext.isConnected) {
        throw new Error('Not connected to Vtiger CRM');
      }
      
      await vtigerContext.importContacts();
      await vtigerContext.importAccounts();
    }
  };
}
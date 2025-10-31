/**
 * VtigerAutoConnectService - Automatically connects to Vtiger CRM using environment variables
 * 
 * This service checks for Vtiger CRM environment variables and automatically
 * establishes a connection if they are present, without requiring manual setup.
 */

import { useEffect } from 'react';
import { useVtigerCRM } from './VtigerService';
import { useToast } from '@/hooks/use-toast';

/**
 * Get Vtiger credentials from environment variables
 */
const getVtigerCredentialsFromEnv = () => {
  // In a real application, these would be accessed server-side
  // For demo purposes, we're checking if they exist
  const serverUrl = import.meta.env.VITE_VTIGER_SERVER_URL || '';
  const username = import.meta.env.VITE_VTIGER_USERNAME || '';
  const accessKey = import.meta.env.VITE_VTIGER_ACCESS_KEY || '';
  
  // Check if all credentials are available
  const hasCredentials = serverUrl && username && accessKey;
  
  return {
    serverUrl,
    username,
    accessKey,
    hasCredentials
  };
};

/**
 * Hook to automatically connect to Vtiger CRM if environment variables are present
 */
export function useAutoConnectVtiger() {
  const { config, updateConfig, isConnected } = useVtigerCRM();
  const { toast } = useToast();
  const { serverUrl, username, accessKey, hasCredentials } = getVtigerCredentialsFromEnv();
  
  // Attempt auto-connection if credentials exist and we're not already connected
  useEffect(() => {
    // Skip if already connected or no credentials available
    if (isConnected || !hasCredentials) {
      return;
    }
    
    // Only auto-connect if no config exists or if the config is enabled but
    // using different credentials (e.g., environment variables changed)
    if (!config.enabled || 
        (config.enabled && 
         (config.serverUrl !== serverUrl || 
          config.username !== username || 
          config.accessKey !== accessKey))) {
      // Auto-connect with environment credentials
      const newConfig = {
        serverUrl,
        username,
        accessKey,
        enabled: true
      };
      
      updateConfig(newConfig);
      
      // Notify user (only if this is initial auto-connect)
      if (!config.enabled) {
        toast({
          title: 'Vtiger CRM Auto-Connected',
          description: 'Automatically connected to Vtiger CRM using environment credentials.',
          duration: 5000,
        });
      }
    }
  }, [isConnected, hasCredentials, config, updateConfig, toast, serverUrl, username, accessKey]);
  
  return {
    isAutoConnected: isConnected && hasCredentials,
    hasEnvCredentials: hasCredentials
  };
}
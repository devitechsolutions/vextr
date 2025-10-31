import { useEffect, useState } from 'react';
import { useToast } from './use-toast';
import { useVtigerCRM } from '@/services/VtigerService';

/**
 * Hook to automatically connect to Vtiger CRM using environment credentials
 */
export function useVtigerAutoConnect() {
  const { toast } = useToast();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isEnvConfigured, setIsEnvConfigured] = useState(false);
  const { updateConfig, isConnected } = useVtigerCRM();
  
  // Check for environment configuration
  useEffect(() => {
    async function checkVtigerConfig() {
      try {
        // Fetch environment configuration from server
        const response = await fetch('/api/vtiger/env-config');
        
        if (!response.ok) {
          throw new Error('Failed to fetch Vtiger environment configuration');
        }
        
        const data = await response.json();
        
        if (data.hasCredentials) {
          setIsEnvConfigured(true);
          
          // Auto-configure with environment variables if not already connected
          if (!isConnected) {
            updateConfig({
              serverUrl: data.serverUrl,
              username: data.username,
              accessKey: '', // For security, we don't expose the access key to the client
              enabled: true
            });
            
            // Silent auto-connection - no notification needed
          }
        }
        
        // Mark as initialized even if no credentials found
        setIsInitialized(true);
      } catch (error) {
        console.error('Error checking Vtiger environment config:', error);
        // Mark as initialized even on error
        setIsInitialized(true);
      }
    }
    
    if (!isInitialized) {
      checkVtigerConfig();
    }
  }, [isInitialized, isConnected, updateConfig, toast]);
  
  return {
    isInitialized,
    isEnvConfigured
  };
}
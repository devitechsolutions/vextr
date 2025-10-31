import React, { createContext, useContext, useState, useEffect } from 'react';

interface VtigerConfig {
  serverUrl: string;
  username: string;
  accessKey: string;
  enabled: boolean;
}

interface VtigerContextType {
  config: VtigerConfig;
  isConnected: boolean;
  updateConfig: (newConfig: Partial<VtigerConfig>) => void;
  syncCandidates: () => Promise<void>;
  syncClients: () => Promise<void>;
  importContacts: () => Promise<void>;
  importAccounts: () => Promise<void>;
}

const defaultConfig: VtigerConfig = {
  serverUrl: '',
  username: '',
  accessKey: '',
  enabled: false
};

const VtigerContext = createContext<VtigerContextType>({
  config: defaultConfig,
  isConnected: false,
  updateConfig: () => {},
  syncCandidates: async () => {},
  syncClients: async () => {},
  importContacts: async () => {},
  importAccounts: async () => {}
});

export const useVtiger = () => useContext(VtigerContext);

export const VtigerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<VtigerConfig>(defaultConfig);
  const [isConnected, setIsConnected] = useState(false);
  
  // Verify connection when config changes
  useEffect(() => {
    async function verifyConnection() {
      if (!config.enabled || !config.serverUrl) {
        setIsConnected(false);
        return;
      }
      
      try {
        const response = await fetch('/api/vtiger/verify-connection');
        const data = await response.json();
        setIsConnected(data.success);
      } catch (error) {
        console.error('Error verifying Vtiger connection:', error);
        setIsConnected(false);
      }
    }
    
    verifyConnection();
  }, [config]);
  
  const updateConfig = (newConfig: Partial<VtigerConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };
  
  // Sync candidates to Vtiger CRM
  const syncCandidates = async () => {
    if (!isConnected) return;
    
    try {
      const response = await fetch('/api/sync/vtiger/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          direction: 'FROM_VTIGER'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to sync candidates');
      }
    } catch (error) {
      console.error('Error syncing candidates:', error);
      throw error;
    }
  };
  
  // Sync clients to Vtiger CRM
  const syncClients = async () => {
    if (!isConnected) return;
    
    try {
      const response = await fetch('/api/vtiger/sync/clients', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to sync clients');
      }
    } catch (error) {
      console.error('Error syncing clients:', error);
      throw error;
    }
  };
  
  // Import contacts from Vtiger CRM
  const importContacts = async () => {
    if (!isConnected) return;
    
    try {
      const response = await fetch('/api/vtiger/import/contacts');
      
      if (!response.ok) {
        throw new Error('Failed to import contacts');
      }
    } catch (error) {
      console.error('Error importing contacts:', error);
      throw error;
    }
  };
  
  // Import accounts from Vtiger CRM
  const importAccounts = async () => {
    if (!isConnected) return;
    
    try {
      const response = await fetch('/api/vtiger/import/accounts');
      
      if (!response.ok) {
        throw new Error('Failed to import accounts');
      }
    } catch (error) {
      console.error('Error importing accounts:', error);
      throw error;
    }
  };
  
  return (
    <VtigerContext.Provider 
      value={{ 
        config, 
        isConnected, 
        updateConfig,
        syncCandidates,
        syncClients,
        importContacts,
        importAccounts
      }}
    >
      {children}
    </VtigerContext.Provider>
  );
};
import { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  ArrowDownUp, 
  ArrowUp, 
  ArrowDown,
  Play,
  Pause,
  Settings,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from 'date-fns';

enum SyncDirection {
  TO_VTIGER = 'to_vtiger',
  FROM_VTIGER = 'from_vtiger',
  BIDIRECTIONAL = 'bidirectional'
}

enum SyncStatus {
  IDLE = 'idle',
  SYNCING = 'syncing',
  SUCCESS = 'success',
  ERROR = 'error'
}

enum SyncEntityType {
  CANDIDATE = 'candidate',
  CLIENT = 'client',
  VACANCY = 'vacancy',
  TODO = 'todo',
  ACTIVITY = 'activity',
  INTERVIEW = 'interview'
}

interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  entityType: SyncEntityType;
  entityId?: number;
  direction: SyncDirection;
  status: SyncStatus;
  message?: string;
  details?: any;
}

export default function VtigerSyncPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<{
    status: SyncStatus;
    lastSyncTime: string | null;
    isInitialized: boolean;
    enableAutoSync: boolean;
    processedCandidates?: number;
    totalCandidates?: number;
    progressPercentage?: number;
    rate?: number;
    isRunning?: boolean;
    message?: string;
  }>({
    status: SyncStatus.IDLE,
    lastSyncTime: null,
    isInitialized: false,
    enableAutoSync: true,
    processedCandidates: 0,
    totalCandidates: 0,
    progressPercentage: 0,
    rate: 0,
    isRunning: false,
    message: 'Ready'
  });
  const [history, setHistory] = useState<SyncHistoryEntry[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [syncInterval, setSyncInterval] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch sync status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/sync/vtiger/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus({
          status: data.status,
          lastSyncTime: data.lastSyncTime,
          isInitialized: data.isInitialized,
          enableAutoSync: data.enableAutoSync,
          processedCandidates: data.processedCandidates || 0,
          totalCandidates: data.totalCandidates || 0,
          progressPercentage: data.progressPercentage || 0,
          rate: data.rate || 0,
          isRunning: data.isRunning || false,
          message: data.message || 'Ready'
        });
      }
    } catch (error) {
      console.error('Error fetching sync status:', error);
    }
  };
  
  // Fetch sync history
  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/sync/vtiger/history');
      const data = await response.json();
      
      if (data.success) {
        setHistory(data.history);
      }
    } catch (error) {
      console.error('Error fetching sync history:', error);
    }
  };
  
  // Start manual sync
  const startSync = async (direction: SyncDirection) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync/vtiger/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ direction })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Sync Started',
          description: `Synchronization with Vtiger CRM has been started.`,
        });
        
        // Update status immediately
        setStatus(prev => ({
          ...prev,
          status: SyncStatus.SYNCING
        }));
        
        // Poll status for updates
        pollStatus();
      } else {
        toast({
          title: 'Sync Failed',
          description: data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Sync Error',
        description: 'Failed to start synchronization',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Toggle auto-sync
  const toggleAutoSync = async (enabled: boolean) => {
    try {
      const endpoint = enabled ? '/api/sync/vtiger/auto-sync/start' : '/api/sync/vtiger/auto-sync/stop';
      
      const response = await fetch(endpoint, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus(prev => ({
          ...prev,
          enableAutoSync: enabled
        }));
        
        toast({
          title: enabled ? 'Auto-Sync Enabled' : 'Auto-Sync Disabled',
          description: enabled 
            ? `Data will be automatically synchronized every ${syncInterval} minutes`
            : 'Automatic synchronization has been disabled'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update auto-sync settings',
        variant: 'destructive'
      });
    }
  };
  
  // Update sync settings
  const updateSyncSettings = async () => {
    try {
      const response = await fetch('/api/sync/vtiger/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          syncInterval: syncInterval * 60 * 1000, // Convert minutes to milliseconds
          enableAutoSync: status.enableAutoSync
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Settings Updated',
          description: 'Sync configuration has been updated successfully'
        });
        setIsSettingsOpen(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update sync settings',
        variant: 'destructive'
      });
    }
  };
  
  // Poll status when sync is in progress
  const pollStatus = () => {
    const interval = setInterval(async () => {
      const response = await fetch('/api/sync/vtiger/status');
      const data = await response.json();
      
      if (data.success) {
        setStatus({
          status: data.status,
          lastSyncTime: data.lastSyncTime,
          isInitialized: data.isInitialized,
          enableAutoSync: data.enableAutoSync,
          processedCandidates: data.processedCandidates || 0,
          totalCandidates: data.totalCandidates || 0,
          progressPercentage: data.progressPercentage || 0,
          rate: data.rate || 0,
          isRunning: data.isRunning || false,
          message: data.message || 'Ready'
        });
        
        // If sync is complete, fetch new history and stop polling
        if (data.status === SyncStatus.SUCCESS || data.status === SyncStatus.ERROR) {
          fetchHistory();
          clearInterval(interval);
          
          toast({
            title: data.status === SyncStatus.SUCCESS ? 'Sync Completed' : 'Sync Failed',
            description: data.status === SyncStatus.SUCCESS 
              ? 'Data has been synchronized successfully'
              : 'There was an error during synchronization',
            variant: data.status === SyncStatus.SUCCESS ? 'default' : 'destructive'
          });
        }
      }
    }, 2000);
    
    // Clear interval after 5 minutes (just in case)
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
    
    return interval;
  };
  
  // Format direction
  const formatDirection = (direction: SyncDirection) => {
    switch (direction) {
      case SyncDirection.TO_VTIGER:
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <ArrowUp className="h-3 w-3 mr-1" />
            To Vtiger
          </Badge>
        );
      case SyncDirection.FROM_VTIGER:
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
            <ArrowDown className="h-3 w-3 mr-1" />
            From Vtiger
          </Badge>
        );
      case SyncDirection.BIDIRECTIONAL:
        return (
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
            <ArrowDownUp className="h-3 w-3 mr-1" />
            Bidirectional
          </Badge>
        );
      default:
        return direction;
    }
  };
  
  // Format status
  const formatStatus = (status: SyncStatus) => {
    switch (status) {
      case SyncStatus.IDLE:
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
            <Clock className="h-3 w-3 mr-1" />
            Idle
          </Badge>
        );
      case SyncStatus.SYNCING:
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-500 border-blue-200">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Syncing
          </Badge>
        );
      case SyncStatus.SUCCESS:
        return (
          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Success
          </Badge>
        );
      case SyncStatus.ERROR:
        return (
          <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return status;
    }
  };
  
  // Format entity type
  const formatEntityType = (type: SyncEntityType) => {
    return (
      <Badge className="capitalize">
        {type}
      </Badge>
    );
  };
  
  // Format time
  const formatTime = (timestamp: string) => {
    if (!timestamp) return 'Never';
    
    try {
      const date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return timestamp;
    }
  };
  
  // Load data on mount
  useEffect(() => {
    fetchStatus();
    fetchHistory();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM Synchronization</h1>
          <p className="text-muted-foreground">
            Manage and monitor bidirectional data synchronization with Vtiger CRM
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setIsSettingsOpen(true)}
            className="gap-1.5"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Button>
          
          <Button
            variant="outline"
            onClick={() => {
              fetchStatus();
              fetchHistory();
            }}
            className="gap-1.5"
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
      
      {/* Progress Card - Shows when sync is running */}
      {status.isRunning && status.status === SyncStatus.SYNCING && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
              Sync Progress
            </CardTitle>
            <CardDescription>Real-time synchronization progress</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{status.message}</span>
                <span className="text-muted-foreground">
                  {status.processedCandidates} of {status.totalCandidates} candidates
                </span>
              </div>
              <Progress value={status.progressPercentage || 0} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{status.progressPercentage}% complete</span>
                <span>{status.rate} candidates/sec</span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Processed</p>
                <p className="text-lg font-semibold text-blue-600">{status.processedCandidates}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Total</p>
                <p className="text-lg font-semibold">{status.totalCandidates}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Rate</p>
                <p className="text-lg font-semibold text-green-600">{status.rate}/s</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="grid gap-6 md:grid-cols-3">
        {/* Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Sync Status</CardTitle>
            <CardDescription>Current synchronization status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <div>{formatStatus(status.status)}</div>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Last Sync</p>
                <p>{status.lastSyncTime ? formatTime(status.lastSyncTime) : 'Never'}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Auto Sync</p>
                <p>{status.enableAutoSync ? 
                  <Badge variant="outline" className="bg-green-50 text-green-600">Enabled</Badge> : 
                  <Badge variant="outline" className="bg-amber-50 text-amber-600">Disabled</Badge>
                }</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Initialized</p>
                <p>{status.isInitialized ? 
                  <Badge variant="outline" className="bg-green-50 text-green-600">Yes</Badge> : 
                  <Badge variant="outline" className="bg-red-50 text-red-600">No</Badge>
                }</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="auto-sync"
                checked={status.enableAutoSync}
                onCheckedChange={toggleAutoSync}
              />
              <Label htmlFor="auto-sync">Auto-sync every {syncInterval} minutes</Label>
            </div>
          </CardContent>
        </Card>
        
        {/* Actions Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Sync Actions</CardTitle>
            <CardDescription>Manually trigger data synchronization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <Button 
                onClick={() => startSync(SyncDirection.BIDIRECTIONAL)}
                disabled={status.status === SyncStatus.SYNCING || isLoading}
                className="w-full"
              >
                {status.status === SyncStatus.SYNCING || isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <ArrowDownUp className="mr-2 h-4 w-4" />
                    Sync Bidirectional
                  </>
                )}
              </Button>
              
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline"
                  onClick={() => startSync(SyncDirection.TO_VTIGER)}
                  disabled={status.status === SyncStatus.SYNCING || isLoading}
                >
                  <ArrowUp className="mr-2 h-4 w-4" />
                  To Vtiger
                </Button>
                
                <Button 
                  variant="outline"
                  onClick={() => startSync(SyncDirection.FROM_VTIGER)}
                  disabled={status.status === SyncStatus.SYNCING || isLoading}
                >
                  <ArrowDown className="mr-2 h-4 w-4" />
                  From Vtiger
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Statistics Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Sync Statistics</CardTitle>
            <CardDescription>Synchronization metrics and data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Total Syncs</p>
                <p className="text-2xl font-semibold">{history.length}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Successful</p>
                <p className="text-2xl font-semibold text-green-600">
                  {history.filter(entry => entry.status === SyncStatus.SUCCESS).length}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Failed</p>
                <p className="text-2xl font-semibold text-red-600">
                  {history.filter(entry => entry.status === SyncStatus.ERROR).length}
                </p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Last Error</p>
                <p>
                  {history.find(entry => entry.status === SyncStatus.ERROR)?.timestamp
                    ? formatTime(history.find(entry => entry.status === SyncStatus.ERROR)?.timestamp || '')
                    : 'None'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>Recent synchronization events and operations</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                    No synchronization history available
                  </TableCell>
                </TableRow>
              ) : (
                history.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatTime(entry.timestamp)}</TableCell>
                    <TableCell>{formatDirection(entry.direction)}</TableCell>
                    <TableCell>{formatEntityType(entry.entityType)}</TableCell>
                    <TableCell>{formatStatus(entry.status)}</TableCell>
                    <TableCell className="max-w-xs truncate">{entry.message || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Settings</DialogTitle>
            <DialogDescription>
              Configure synchronization parameters and behavior
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sync-interval">Sync Interval (minutes)</Label>
              <Input 
                id="sync-interval" 
                type="number"
                min={1}
                max={60}
                value={syncInterval}
                onChange={e => setSyncInterval(parseInt(e.target.value) || 5)}
              />
              <p className="text-xs text-muted-foreground">
                How frequently data should be automatically synchronized between systems
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="settings-auto-sync"
                checked={status.enableAutoSync}
                onCheckedChange={(checked) => setStatus(prev => ({ ...prev, enableAutoSync: checked }))}
              />
              <Label htmlFor="settings-auto-sync">Enable automatic synchronization</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateSyncSettings}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
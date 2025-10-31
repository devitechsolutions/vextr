import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Link2, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Download, 
  Upload, 
  Users,
  Building,
  Key,
  Search,
  Settings,
  Loader2,
  ArrowRight,
  ExternalLink,
  Database
} from "lucide-react";
import { createVtigerAPI } from "@/lib/vtiger-api";
import { queryClient } from "@/lib/queryClient";

export default function VtigerIntegrationPage() {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnectionPending, setIsConnectionPending] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Connection settings
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [accessKey, setAccessKey] = useState("");
  
  // Sync options
  const [syncOptions, setSyncOptions] = useState({
    candidates: true,
    clients: true,
    bidirectional: false,
    autoSync: false,
    syncFrequency: "daily"
  });
  
  // For mocking the Vtiger modules
  const [availableModules, setAvailableModules] = useState<any[]>([]);
  const [mappingFields, setMappingFields] = useState({
    candidates: {
      firstName: "firstname",
      lastName: "lastname",
      email: "email",
      phone: "phone",
      title: "title",
      skills: "skills"
    },
    clients: {
      name: "accountname",
      industry: "industry",
      website: "website",
      phone: "phone",
      location: "location"
    }
  });
  
  const handleConnect = async () => {
    if (!serverUrl || !username || !accessKey) {
      toast({
        title: "Missing credentials",
        description: "Please provide all connection details.",
        variant: "destructive"
      });
      return;
    }
    
    setIsConnectionPending(true);
    try {
      const vtigerAPI = createVtigerAPI(serverUrl, username, accessKey);
      const success = await vtigerAPI.verifyConnection();
      
      if (success) {
        setIsConnected(true);
        await vtigerAPI.login();
        
        // Get available modules (in real app, this would fetch from Vtiger)
        const modules = await vtigerAPI.getModules();
        setAvailableModules(modules);
        
        toast({
          title: "Connection successful",
          description: "Successfully connected to Vtiger CRM.",
        });
      } else {
        toast({
          title: "Connection failed",
          description: "Could not connect to Vtiger CRM. Please check your credentials.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Connection error",
        description: "An error occurred while connecting to Vtiger CRM.",
        variant: "destructive"
      });
    } finally {
      setIsConnectionPending(false);
    }
  };
  
  const handleImport = async (type: "contacts" | "accounts") => {
    setIsImporting(true);
    try {
      const vtigerAPI = createVtigerAPI(serverUrl, username, accessKey);
      
      let data: any[] = [];
      
      if (type === "contacts") {
        data = await vtigerAPI.importContacts();
        
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.length} contacts from Vtiger CRM.`,
        });
        
        // In a real app, this would update the local database
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
        }, 1000);
        
      } else if (type === "accounts") {
        data = await vtigerAPI.importAccounts();
        
        toast({
          title: "Import successful",
          description: `Successfully imported ${data.length} organizations from Vtiger CRM.`,
        });
        
        // In a real app, this would update the local database
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
        }, 1000);
      }
    } catch (error) {
      toast({
        title: "Import error",
        description: `An error occurred while importing ${type} from Vtiger CRM.`,
        variant: "destructive"
      });
    } finally {
      setIsImporting(false);
    }
  };
  
  const handleSync = async (type: "candidates" | "clients") => {
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/vtiger/sync/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',  // Include cookies for authentication
        body: JSON.stringify({
          [type]: []
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to sync ${type}`);
      }
      
      const result = await response.json();
      
      toast({
        title: "Sync successful",
        description: `Successfully synced ${type} with Vtiger CRM.`,
      });
      
      // Refresh the data
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: [`/api/${type === "candidates" ? "candidates" : "clients"}`] });
      }, 1000);
      
    } catch (error) {
      toast({
        title: "Sync error",
        description: `An error occurred while syncing ${type} to Vtiger CRM.`,
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleSyncOptionChange = (option: string, value: boolean | string) => {
    setSyncOptions(prev => ({
      ...prev,
      [option]: value
    }));
  };
  
  // No simulated data is permitted - this system only works with authentic Vtiger CRM data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vtiger CRM Integration</h1>
        <p className="text-muted-foreground">
          Integrate RecruiterHub with your Vtiger CRM instance
        </p>
      </div>
      
      {!isConnected ? (
        <Card>
          <CardHeader>
            <CardTitle>Connect to Vtiger CRM</CardTitle>
            <CardDescription>
              Configure the connection to your Vtiger CRM instance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="serverUrl">Vtiger Server URL</Label>
              <Input
                id="serverUrl"
                placeholder="https://yourdomain.com/vtigercrm"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                Enter the full URL to your Vtiger CRM installation
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="accessKey">Access Key</Label>
                <Input
                  id="accessKey"
                  type="password"
                  placeholder="••••••••"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  You can find your access key in Vtiger CRM under My Preferences → Access Key
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 mt-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Need help? <a href="#" className="text-primary hover:underline">View Vtiger CRM integration guide</a>
              </span>
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleConnect}
              disabled={isConnectionPending}
            >
              {isConnectionPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Link2 className="mr-2 h-4 w-4" />
                  Connect to Vtiger
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-green-100 text-green-800 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  <div className="ml-4">
                    <h3 className="font-medium">Connected to Vtiger CRM</h3>
                    <p className="text-sm text-muted-foreground">{serverUrl}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Key className="h-4 w-4 mr-2" /> Update Credentials
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <Tabs defaultValue="data-sync" className="w-full">
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="data-sync">
                <RefreshCw className="h-4 w-4 mr-2" /> Data Sync
              </TabsTrigger>
              <TabsTrigger value="field-mapping">
                <Settings className="h-4 w-4 mr-2" /> Field Mapping
              </TabsTrigger>
              <TabsTrigger value="settings">
                <Database className="h-4 w-4 mr-2" /> Sync Settings
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="data-sync" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Candidates / Contacts</CardTitle>
                    <CardDescription>
                      Sync candidate data with Vtiger Contacts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Candidate Synchronization</h4>
                          <p className="text-sm text-muted-foreground">
                            Last sync: Never
                          </p>
                        </div>
                        <Badge variant="outline">
                          {syncOptions.candidates ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="syncCandidates">Enable sync</Label>
                          <Switch 
                            id="syncCandidates" 
                            checked={syncOptions.candidates}
                            onCheckedChange={(checked) => handleSyncOptionChange("candidates", checked)}
                          />
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          When enabled, candidate data will be synchronized with Vtiger Contacts
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t pt-4">
                    <Button 
                      variant="outline"
                      onClick={() => handleImport("contacts")}
                      disabled={isImporting}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Import Contacts
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={() => handleSync("candidates")}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Sync to Vtiger
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle>Clients / Organizations</CardTitle>
                    <CardDescription>
                      Sync client data with Vtiger Accounts
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Client Synchronization</h4>
                          <p className="text-sm text-muted-foreground">
                            Last sync: Never
                          </p>
                        </div>
                        <Badge variant="outline">
                          {syncOptions.clients ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="syncClients">Enable sync</Label>
                          <Switch 
                            id="syncClients" 
                            checked={syncOptions.clients}
                            onCheckedChange={(checked) => handleSyncOptionChange("clients", checked)}
                          />
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          When enabled, client data will be synchronized with Vtiger Accounts
                        </p>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t pt-4">
                    <Button 
                      variant="outline"
                      onClick={() => handleImport("accounts")}
                      disabled={isImporting}
                    >
                      {isImporting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Import Accounts
                        </>
                      )}
                    </Button>
                    <Button 
                      onClick={() => handleSync("clients")}
                      disabled={isSyncing}
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Sync to Vtiger
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
              
              <Card>
                <CardHeader>
                  <CardTitle>Recent Sync Activity</CardTitle>
                  <CardDescription>
                    View recent synchronization activities with Vtiger CRM
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity Type</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Records</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                          No sync activity available. Mock data is not permitted.
                          <br />
                          Only authentic Vtiger CRM synchronization data will be displayed.
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="field-mapping" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Field Mapping Configuration</CardTitle>
                  <CardDescription>
                    Configure how fields are mapped between RecruiterHub and Vtiger CRM
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Tabs defaultValue="candidates" className="w-full">
                    <TabsList className="grid grid-cols-2">
                      <TabsTrigger value="candidates">
                        <Users className="h-4 w-4 mr-2" /> Candidates to Contacts
                      </TabsTrigger>
                      <TabsTrigger value="clients">
                        <Building className="h-4 w-4 mr-2" /> Clients to Accounts
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="candidates" className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium">Candidate to Contact Mapping</h3>
                          <Button variant="outline" size="sm">
                            <Settings className="h-4 w-4 mr-2" /> Reset to Default
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Define how candidate fields map to Vtiger Contact fields
                        </p>
                      </div>
                      
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-1/3">RecruiterHub Field</TableHead>
                              <TableHead className="w-1/3">Vtiger CRM Field</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium">First Name</TableCell>
                              <TableCell>firstname</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Contact's first name
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Last Name</TableCell>
                              <TableCell>lastname</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Contact's last name
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Email</TableCell>
                              <TableCell>email</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Primary email address
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Phone</TableCell>
                              <TableCell>phone</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Primary phone number
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Current Title</TableCell>
                              <TableCell>title</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Job title or position
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Skills</TableCell>
                              <TableCell>skills</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Candidate skills (custom field in Vtiger)
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                      
                      <div className="flex justify-end">
                        <Button>
                          Save Mapping
                        </Button>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="clients" className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-medium">Client to Account Mapping</h3>
                          <Button variant="outline" size="sm">
                            <Settings className="h-4 w-4 mr-2" /> Reset to Default
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Define how client fields map to Vtiger Account fields
                        </p>
                      </div>
                      
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-1/3">RecruiterHub Field</TableHead>
                              <TableHead className="w-1/3">Vtiger CRM Field</TableHead>
                              <TableHead>Description</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium">Name</TableCell>
                              <TableCell>accountname</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Organization name
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Industry</TableCell>
                              <TableCell>industry</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Industry category
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Website</TableCell>
                              <TableCell>website</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Company website URL
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Phone</TableCell>
                              <TableCell>phone</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Primary phone number
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Location</TableCell>
                              <TableCell>location</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                Physical location or address
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                      
                      <div className="flex justify-end">
                        <Button>
                          Save Mapping
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Synchronization Settings</CardTitle>
                  <CardDescription>
                    Configure synchronization behavior and schedule
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="bidirectional" 
                        checked={syncOptions.bidirectional}
                        onCheckedChange={(checked) => 
                          handleSyncOptionChange("bidirectional", checked === true)
                        }
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="bidirectional" className="text-base">Bidirectional Sync</Label>
                        <p className="text-sm text-muted-foreground">
                          Changes made in either system will be synchronized to the other
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="autoSync" 
                        checked={syncOptions.autoSync}
                        onCheckedChange={(checked) => 
                          handleSyncOptionChange("autoSync", checked === true)
                        }
                      />
                      <div className="grid gap-1.5 leading-none">
                        <Label htmlFor="autoSync" className="text-base">Automatic Synchronization</Label>
                        <p className="text-sm text-muted-foreground">
                          Schedule regular synchronization based on the frequency below
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Sync Frequency</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {["hourly", "daily", "weekly", "manual"].map((frequency) => (
                        <Button
                          key={frequency}
                          type="button"
                          variant={syncOptions.syncFrequency === frequency ? "default" : "outline"}
                          className="capitalize"
                          onClick={() => handleSyncOptionChange("syncFrequency", frequency)}
                          disabled={!syncOptions.autoSync && frequency !== "manual"}
                        >
                          {frequency}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label>Data Conflict Resolution</Label>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="vtigerPriority" name="conflictResolution" checked />
                        <Label htmlFor="vtigerPriority">Vtiger CRM has priority</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="recruiterHubPriority" name="conflictResolution" />
                        <Label htmlFor="recruiterHubPriority">RecruiterHub has priority</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input type="radio" id="mostRecent" name="conflictResolution" />
                        <Label htmlFor="mostRecent">Most recent change wins</Label>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between pt-5 border-t">
                  <Button variant="ghost">Reset to Default</Button>
                  <Button>Save Settings</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Options</CardTitle>
                  <CardDescription>
                    Additional configuration options for Vtiger CRM integration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="grid gap-1">
                      <Label>API Rate Limiting</Label>
                      <p className="text-sm text-muted-foreground">
                        Maximum API calls per minute
                      </p>
                    </div>
                    <Input 
                      type="number" 
                      className="w-20" 
                      defaultValue="60" 
                      min="1" 
                      max="100"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="grid gap-1">
                      <Label>Sync Timeouts</Label>
                      <p className="text-sm text-muted-foreground">
                        API timeout in seconds
                      </p>
                    </div>
                    <Input 
                      type="number" 
                      className="w-20" 
                      defaultValue="30" 
                      min="5" 
                      max="120"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="grid gap-1">
                      <Label>Debug Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable detailed logging for troubleshooting
                      </p>
                    </div>
                    <Switch id="debugMode" />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button variant="destructive" className="ml-auto">
                    Reset API Connection
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
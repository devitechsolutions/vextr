import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Phone, 
  Calendar, 
  AlertTriangle, 
  Clock,
  CheckCircle,
  Briefcase,
  PhoneCall,
  MessageSquare,
  UserCheck,
  PlayCircle,
  PauseCircle,
  BarChart3,
  Eye
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import TeamOverview from "./components/TeamOverview";
import CallRoundManager from "./components/CallRoundManager";
import PipelinePhases from "./components/PipelinePhases";
import KPITracker from "./components/KPITracker";
import ClientNotifications from "./components/ClientNotifications";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface RecruiterStatus {
  id: number;
  name: string;
  avatar?: string;
  currentActivity: string;
  currentPhase: string;
  dailyProgress: {
    calls: number;
    targetCalls: number;
    candidatesContacted: number;
    interviewsScheduled: number;
    cvsSubmitted: number;
  };
  isActive: boolean;
  lastActivity: string;
  assignedVacancies: { id: number; title: string; clientName: string; }[];
  candidatesToContact: any[];
}

interface CallQueueResponse {
  success: boolean;
  dailyTarget: number;
  currentProgress: number;
  queue: PriorityAction[];
}

interface PriorityAction {
  id: number;
  candidate: {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string;
    linkedinUrl?: string;
    jobTitle?: string;
    company?: string;
    location?: string;
  };
  vacancy: {
    id: number;
    title: string;
    clientName: string;
  };
  actionType: string;
  priorityScore: number;
  reason: string;
  canCall: boolean;
  canLinkedIn: boolean;
  dueAt: string;
  lastAttempt?: {
    method: string;
    outcome: string;
    createdAt: string;
    notes?: string;
  };
}

interface TodayMetrics {
  callsMade: number;
  candidatesContacted: number;
  interviewsScheduled: number;
}

interface DashboardData {
  todayMetrics: TodayMetrics;
  totalActive: number;
  callList: any[];
}

interface TaskData {
  timeframe: string;
  startDate: string;
  endDate: string;
  tasks: any[];
  totalCount: number;
}

interface KPIData {
  daily: any;
  weekly: any;
  monthly: any;
  targets: any;
  trends: any;
  [key: string]: any;
}

export default function EnhancedDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedRecruiterId, setSelectedRecruiterId] = useState<number | null>(null);
  const [workflowPhase, setWorkflowPhase] = useState<string>('morning_calls');
  const [, setLocation] = useLocation();
  
  // Auto-select current user's ID for non-admin users
  useEffect(() => {
    if (!isAdmin && user?.id && selectedRecruiterId === null) {
      setSelectedRecruiterId(user.id);
    }
  }, [isAdmin, user?.id, selectedRecruiterId]);
  
  // Handle clicking on client-related tasks
  const handleTaskClick = (task: any) => {
    if (task.relatedType === 'client' && task.relatedId) {
      setLocation(`/clients?edit=${task.relatedId}`);
    }
  };

  // Fetch dashboard data
  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard/enhanced", selectedRecruiterId],
    queryFn: async () => {
      const url = selectedRecruiterId 
        ? `/api/dashboard/enhanced?recruiterId=${selectedRecruiterId}`
        : '/api/dashboard/enhanced';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 10000, // Refresh every 10 seconds for real-time updates
  });

  const { data: teamStatus } = useQuery<RecruiterStatus[]>({
    queryKey: ["/api/dashboard/team-status"],
    enabled: isAdmin,
    refetchInterval: 5000, // More frequent updates for team status
  });


  const { data: pipelineData } = useQuery<{ totalActive: number; [key: string]: any }>({
    queryKey: ["/api/dashboard/pipeline", selectedRecruiterId],
    queryFn: async () => {
      const url = selectedRecruiterId 
        ? `/api/dashboard/pipeline?recruiterId=${selectedRecruiterId}`
        : '/api/dashboard/pipeline';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const { data: kpiData } = useQuery<KPIData>({
    queryKey: ["/api/dashboard/kpis", selectedRecruiterId],
    queryFn: async () => {
      const url = selectedRecruiterId 
        ? `/api/dashboard/kpis?recruiterId=${selectedRecruiterId}`
        : '/api/dashboard/kpis';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  // Fetch task data for dashboard blocks
  const { data: thisWeekTasks } = useQuery<TaskData>({
    queryKey: ["/api/dashboard/tasks/thisweek"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: nextWeekTasks } = useQuery<TaskData>({
    queryKey: ["/api/dashboard/tasks/nextweek"],
    refetchInterval: 30000,
  });

  // Calculate daily target progress using dashboard data
  const calculateProgress = () => {
    if (!dashboardData) return 0;
    const metrics = dashboardData.todayMetrics || { callsMade: 0 };
    const { callsMade = 0 } = metrics;
    return Math.min((callsMade / 30) * 100, 100);
  };

  // Get daily target (default 30)
  const getDailyTarget = () => {
    return 30;
  };

  // Get current progress count
  const getCurrentProgress = () => {
    return dashboardData?.todayMetrics?.callsMade || 0;
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 60) return "bg-blue-500";
    if (percentage >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header with Role-based View Selector */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Recruitment Dashboard</h1>
          <p className="text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Admin View Selector */}
          {isAdmin && teamStatus && (
            <Select
              value={selectedRecruiterId?.toString() || "all"}
              onValueChange={(value) => 
                setSelectedRecruiterId(value === "all" ? null : parseInt(value))
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Admin view
                  </div>
                </SelectItem>
                {teamStatus.map(recruiter => (
                  <SelectItem key={recruiter.id} value={recruiter.id.toString()}>
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4" />
                      {recruiter.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Real-time Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Clock className="h-4 w-4" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {thisWeekTasks?.totalCount || 0}
            </div>
            <div className="space-y-1 mt-2">
              {thisWeekTasks?.tasks?.slice(0, 2).map((task: any, index: number) => (
                <div 
                  key={index} 
                  className={`text-xs text-muted-foreground truncate ${
                    task.relatedType === 'client' ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5' : ''
                  }`}
                  onClick={() => handleTaskClick(task)}
                  title={task.relatedType === 'client' ? 'Click to edit client contact details' : task.title}
                >
                  <Badge className={`mr-1 text-xs ${
                    task.priority === 'high' ? 'bg-red-100 text-red-800' :
                    task.priority === 'urgent' ? 'bg-red-500 text-white' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {task.priority}
                  </Badge>
                  {task.title.replace(/💰|🎯|📋|⚡/, '').slice(0, 25)}...
                </div>
              ))}
              {(thisWeekTasks?.totalCount || 0) === 0 && (
                <p className="text-xs text-muted-foreground">No pending tasks</p>
              )}
            </div>
          </CardContent>
        </Card>


        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Coming Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {nextWeekTasks?.totalCount || 0}
            </div>
            <div className="space-y-1 mt-2">
              {nextWeekTasks?.tasks?.slice(0, 2).map((task: any, index: number) => (
                <div 
                  key={index} 
                  className={`text-xs text-muted-foreground truncate ${
                    task.relatedType === 'client' ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-50 rounded px-1 py-0.5' : ''
                  }`}
                  onClick={() => handleTaskClick(task)}
                  title={task.relatedType === 'client' ? 'Click to edit client contact details' : task.title}
                >
                  <Badge className={`mr-1 text-xs ${
                    task.priority === 'high' ? 'bg-red-100 text-red-800' :
                    task.priority === 'urgent' ? 'bg-red-500 text-white' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {task.priority}
                  </Badge>
                  {task.title.replace(/💰|🎯|📋|⚡/, '').slice(0, 25)}...
                </div>
              ))}
              {(nextWeekTasks?.totalCount || 0) === 0 && (
                <p className="text-xs text-muted-foreground">No upcoming tasks</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Interviews This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardData?.todayMetrics?.interviewsScheduled || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Scheduled this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pipelineData?.totalCandidates || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active candidates
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Team Overview for Admins */}
      {isAdmin && !selectedRecruiterId && teamStatus && (
        <TeamOverview recruiters={teamStatus} />
      )}

      {/* Main Dashboard Content */}
      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList className={`grid w-full ${selectedRecruiterId ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {selectedRecruiterId && <TabsTrigger value="workflow">Workflow</TabsTrigger>}
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
        </TabsList>

        {selectedRecruiterId && (
          <TabsContent value="workflow" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <CallRoundManager 
                  key={selectedRecruiterId}
                  phase={workflowPhase}
                  candidates={dashboardData?.callList || []}
                />
              </div>
              <div className="space-y-4">
                <ClientNotifications />
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="pipeline" className="space-y-4">
          <PipelinePhases 
            pipelineData={pipelineData}
            selectedRecruiterId={selectedRecruiterId}
          />
        </TabsContent>

        <TabsContent value="kpis" className="space-y-4">
          <KPITracker 
            kpiData={kpiData}
            isAdmin={isAdmin}
            selectedRecruiterId={selectedRecruiterId}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Target, 
  Phone, 
  Calendar, 
  AlertTriangle, 
  Clock,
  CheckCircle,
  DollarSign,
  Briefcase,
  Mail,
  PhoneCall
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardSummary {
  pipelineSummary: {
    today: PipelineMetrics;
    week: PipelineMetrics;
    month: PipelineMetrics;
  };
  workBlocks: WorkBlock[];
  tasks: DashboardTask[];
  revenueRadar: {
    currentMonth: RevenueData;
    currentQuarter: RevenueData;
    forecastByVacancy: any[];
  };
  slaMetrics: {
    timeToFirstContact: SLAMetric;
    timeToShortlist: SLAMetric;
    timeToClientSubmission: SLAMetric;
    timeToInterview: SLAMetric;
  };
  alerts: Alert[];
  kpis: {
    recruiter: RecruiterKPIs;
    fieldManager: FieldManagerKPIs;
  };
}

interface PipelineMetrics {
  totalCandidates: number;
  totalVacancies: number;
  newCandidates: number;
  callsMade: number;
  interviewsScheduled: number;
  offersSent: number;
  placements: number;
  changeVsPrevious: {
    totalCandidates: number;
    newCandidates: number;
    callsMade: number;
    interviewsScheduled: number;
    offersSent: number;
    placements: number;
  };
}

interface WorkBlock {
  name: string;
  timeSlot: string;
  plannedCalls: number;
  completedCalls: number;
  isOverdue: boolean;
  tasks: DashboardTask[];
}

interface DashboardTask {
  id: number;
  title: string;
  type: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueAt: string;
  isOverdue: boolean;
  estimatedDuration?: number;
}

interface SLAMetric {
  average: number;
  breaches: number;
  target: number;
}

interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
}

interface RecruiterKPIs {
  today: {
    callsMade: number;
    candidatesSpoken: number;
    newCandidatesAdded: number;
    introsSent: number;
    cvsFormatted: number;
    interviewsScheduled: number;
    offersSent: number;
    placements: number;
  };
  week: {
    callsMade: number;
    candidatesSpoken: number;
    newCandidatesAdded: number;
    introsSent: number;
    cvsFormatted: number;
    interviewsScheduled: number;
    offersSent: number;
    placements: number;
  };
}

interface FieldManagerKPIs {
  contactsDue: {
    activeHiringManagers: number;
    inactiveClients: number;
    currentStaff: number;
    formerStaff: number;
    highPotentials: number;
  };
  pipeline: {
    liveVacancies: number;
    totalCandidatesMatched: number;
    interviewsPipeline: number;
    offersAndStartDates: number;
  };
}

interface RevenueData {
  totalExpected: number;
  totalRealized: number;
  currency: string;
  probabilityWeighted: number;
}

export default function DashboardPage() {
  const [scope, setScope] = useState<"recruiter" | "field_manager">("recruiter");
  const [timeRange, setTimeRange] = useState("today");
  const queryClient = useQueryClient();

  const { data: dashboardData, isLoading, error } = useQuery<DashboardSummary>({
    queryKey: ["/api/dashboard/summary", scope],
    refetchInterval: 30000, // Refresh every 30 seconds for real-time updates
  });

  const { data: pipelineData } = useQuery({
    queryKey: ["/api/dashboard/pipeline"],
  });

  const { data: cadenceData } = useQuery({
    queryKey: ["/api/dashboard/cadence", scope],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Dashboard Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to load dashboard data. Please try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat().format(num);
  };

  const formatCurrency = (amount: number, currency: string = "EUR"): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const getMetricByTimeRange = () => {
    if (!dashboardData) return null;
    
    switch (timeRange) {
      case "today":
        return dashboardData.pipelineSummary.today;
      case "week":
        return dashboardData.pipelineSummary.week;
      case "month":
        return dashboardData.pipelineSummary.month;
      default:
        return dashboardData.pipelineSummary.today;
    }
  };

  const currentMetrics = getMetricByTimeRange();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case "error":
        return "border-red-500 bg-red-50";
      case "warning":
        return "border-yellow-500 bg-yellow-50";
      case "info":
        return "border-blue-500 bg-blue-50";
      default:
        return "border-gray-500 bg-gray-50";
    }
  };

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Activity className="h-4 w-4 text-gray-600" />;
  };

  const getTrendValue = (value: number) => {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value}`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-600">Live pipeline view and execution tracking</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={scope} onValueChange={(value: "recruiter" | "field_manager") => setScope(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recruiter">Recruiter</SelectItem>
              <SelectItem value="field_manager">Field Manager</SelectItem>
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alerts */}
      {dashboardData?.alerts && dashboardData.alerts.length > 0 && (
        <div className="space-y-2">
          {dashboardData.alerts.slice(0, 3).map((alert) => (
            <Card key={alert.id} className={cn("border-l-4", getAlertColor(alert.type))}>
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">{alert.title}</span>
                  <Badge variant="outline" className="ml-auto">
                    {alert.priority}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pipeline Summary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">New Candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(currentMetrics?.newCandidates || 0)}</div>
            <div className="flex items-center text-sm text-gray-600">
              {getTrendIcon(currentMetrics?.changeVsPrevious.newCandidates || 0)}
              <span className="ml-1">{getTrendValue(currentMetrics?.changeVsPrevious.newCandidates || 0)} vs previous</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Calls Made</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(currentMetrics?.callsMade || 0)}</div>
            <div className="flex items-center text-sm text-gray-600">
              {getTrendIcon(currentMetrics?.changeVsPrevious.callsMade || 0)}
              <span className="ml-1">{getTrendValue(currentMetrics?.changeVsPrevious.callsMade || 0)} vs previous</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(currentMetrics?.interviewsScheduled || 0)}</div>
            <div className="flex items-center text-sm text-gray-600">
              {getTrendIcon(currentMetrics?.changeVsPrevious.interviewsScheduled || 0)}
              <span className="ml-1">{getTrendValue(currentMetrics?.changeVsPrevious.interviewsScheduled || 0)} vs previous</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Placements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(currentMetrics?.placements || 0)}</div>
            <div className="flex items-center text-sm text-gray-600">
              {getTrendIcon(currentMetrics?.changeVsPrevious.placements || 0)}
              <span className="ml-1">{getTrendValue(currentMetrics?.changeVsPrevious.placements || 0)} vs previous</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={scope === "recruiter" ? "recruiter" : "field-manager"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="recruiter">Recruiter View</TabsTrigger>
          <TabsTrigger value="field-manager">Field Manager View</TabsTrigger>
        </TabsList>

        <TabsContent value="recruiter" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Work Blocks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Today's Work Blocks
                </CardTitle>
                <CardDescription>Track your daily call blocks and completion</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {dashboardData?.workBlocks.map((block, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-medium">{block.name}</span>
                        <span className="text-sm text-gray-600 ml-2">{block.timeSlot}</span>
                        {block.isOverdue && <Badge variant="destructive" className="ml-2">Overdue</Badge>}
                      </div>
                      <span className="text-sm">
                        {block.completedCalls}/{block.plannedCalls} calls
                      </span>
                    </div>
                    <Progress 
                      value={block.plannedCalls > 0 ? (block.completedCalls / block.plannedCalls) * 100 : 0} 
                      className="h-2"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Today's KPIs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Productivity KPIs
                </CardTitle>
                <CardDescription>Today vs This Week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="font-medium">Today</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Calls Made</span>
                        <span>{dashboardData?.kpis.recruiter.today.callsMade || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Candidates Spoken</span>
                        <span>{dashboardData?.kpis.recruiter.today.candidatesSpoken || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Intros Sent</span>
                        <span>{dashboardData?.kpis.recruiter.today.introsSent || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CVs Formatted</span>
                        <span>{dashboardData?.kpis.recruiter.today.cvsFormatted || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">This Week</div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>Calls Made</span>
                        <span>{dashboardData?.kpis.recruiter.week.callsMade || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Candidates Spoken</span>
                        <span>{dashboardData?.kpis.recruiter.week.candidatesSpoken || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Intros Sent</span>
                        <span>{dashboardData?.kpis.recruiter.week.introsSent || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>CVs Formatted</span>
                        <span>{dashboardData?.kpis.recruiter.week.cvsFormatted || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Next Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Next Actions
                </CardTitle>
                <CardDescription>Upcoming tasks and priorities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {dashboardData?.tasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg border">
                      <div className={cn("w-2 h-2 rounded-full", getPriorityColor(task.priority))} />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{task.title}</div>
                        <div className="text-xs text-gray-600">
                          {task.type} • Due {new Date(task.dueAt).toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                          {task.isOverdue && <span className="text-red-600 ml-1">• OVERDUE</span>}
                        </div>
                      </div>
                      {task.estimatedDuration && (
                        <Badge variant="outline" className="text-xs">
                          {task.estimatedDuration}m
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Revenue Radar */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Revenue Radar
                </CardTitle>
                <CardDescription>Expected revenue this month/quarter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">This Month</span>
                      <span className="text-sm text-gray-600">
                        {formatCurrency(dashboardData?.revenueRadar.currentMonth.totalRealized || 0)} / 
                        {formatCurrency(dashboardData?.revenueRadar.currentMonth.totalExpected || 0)}
                      </span>
                    </div>
                    <Progress 
                      value={dashboardData?.revenueRadar.currentMonth.totalExpected ? 
                        (dashboardData.revenueRadar.currentMonth.totalRealized / dashboardData.revenueRadar.currentMonth.totalExpected) * 100 : 0
                      } 
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">This Quarter</span>
                      <span className="text-sm text-gray-600">
                        {formatCurrency(dashboardData?.revenueRadar.currentQuarter.totalRealized || 0)} / 
                        {formatCurrency(dashboardData?.revenueRadar.currentQuarter.totalExpected || 0)}
                      </span>
                    </div>
                    <Progress 
                      value={dashboardData?.revenueRadar.currentQuarter.totalExpected ? 
                        (dashboardData.revenueRadar.currentQuarter.totalRealized / dashboardData.revenueRadar.currentQuarter.totalExpected) * 100 : 0
                      } 
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    Probability weighted: {formatCurrency(dashboardData?.revenueRadar.currentMonth.probabilityWeighted || 0)}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="field-manager" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Contacts Due */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Contacts Due Today
                </CardTitle>
                <CardDescription>Cadence-based contact requirements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 rounded bg-blue-50">
                    <span className="text-sm font-medium">Active Hiring Managers</span>
                    <Badge>{dashboardData?.kpis.fieldManager.contactsDue.activeHiringManagers || 0}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-yellow-50">
                    <span className="text-sm font-medium">Inactive Clients</span>
                    <Badge>{dashboardData?.kpis.fieldManager.contactsDue.inactiveClients || 0}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-green-50">
                    <span className="text-sm font-medium">Current Staff</span>
                    <Badge>{dashboardData?.kpis.fieldManager.contactsDue.currentStaff || 0}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-purple-50">
                    <span className="text-sm font-medium">Former Staff</span>
                    <Badge>{dashboardData?.kpis.fieldManager.contactsDue.formerStaff || 0}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 rounded bg-orange-50">
                    <span className="text-sm font-medium">High Potentials</span>
                    <Badge>{dashboardData?.kpis.fieldManager.contactsDue.highPotentials || 0}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Client Pipeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Client Pipeline
                </CardTitle>
                <CardDescription>Live vacancies and candidate pipeline</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded bg-blue-50">
                    <div className="text-2xl font-bold text-blue-600">
                      {dashboardData?.kpis.fieldManager.pipeline.liveVacancies || 0}
                    </div>
                    <div className="text-sm text-gray-600">Live Vacancies</div>
                  </div>
                  <div className="text-center p-3 rounded bg-green-50">
                    <div className="text-2xl font-bold text-green-600">
                      {dashboardData?.kpis.fieldManager.pipeline.totalCandidatesMatched || 0}
                    </div>
                    <div className="text-sm text-gray-600">Candidates Matched</div>
                  </div>
                  <div className="text-center p-3 rounded bg-yellow-50">
                    <div className="text-2xl font-bold text-yellow-600">
                      {dashboardData?.kpis.fieldManager.pipeline.interviewsPipeline || 0}
                    </div>
                    <div className="text-sm text-gray-600">Interviews Pipeline</div>
                  </div>
                  <div className="text-center p-3 rounded bg-purple-50">
                    <div className="text-2xl font-bold text-purple-600">
                      {dashboardData?.kpis.fieldManager.pipeline.offersAndStartDates || 0}
                    </div>
                    <div className="text-sm text-gray-600">Offers & Start Dates</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* SLA Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            SLA Performance
          </CardTitle>
          <CardDescription>Service level agreement metrics and breaches</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-sm font-medium mb-2">Time to First Contact</div>
              <div className="text-2xl font-bold mb-1">
                {dashboardData?.slaMetrics.timeToFirstContact.average || 0}h
              </div>
              <div className="text-xs text-gray-600">
                Target: {dashboardData?.slaMetrics.timeToFirstContact.target || 0}h
              </div>
              {(dashboardData?.slaMetrics.timeToFirstContact.breaches || 0) > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {dashboardData?.slaMetrics.timeToFirstContact.breaches} breaches
                </Badge>
              )}
            </div>
            <div className="text-center">
              <div className="text-sm font-medium mb-2">Time to Shortlist</div>
              <div className="text-2xl font-bold mb-1">
                {dashboardData?.slaMetrics.timeToShortlist.average || 0}h
              </div>
              <div className="text-xs text-gray-600">
                Target: {dashboardData?.slaMetrics.timeToShortlist.target || 0}h
              </div>
              {(dashboardData?.slaMetrics.timeToShortlist.breaches || 0) > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {dashboardData?.slaMetrics.timeToShortlist.breaches} breaches
                </Badge>
              )}
            </div>
            <div className="text-center">
              <div className="text-sm font-medium mb-2">Time to Client Submission</div>
              <div className="text-2xl font-bold mb-1">
                {dashboardData?.slaMetrics.timeToClientSubmission.average || 0}h
              </div>
              <div className="text-xs text-gray-600">
                Target: {dashboardData?.slaMetrics.timeToClientSubmission.target || 0}h
              </div>
              {(dashboardData?.slaMetrics.timeToClientSubmission.breaches || 0) > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {dashboardData?.slaMetrics.timeToClientSubmission.breaches} breaches
                </Badge>
              )}
            </div>
            <div className="text-center">
              <div className="text-sm font-medium mb-2">Time to Interview</div>
              <div className="text-2xl font-bold mb-1">
                {dashboardData?.slaMetrics.timeToInterview.average || 0}h
              </div>
              <div className="text-xs text-gray-600">
                Target: {dashboardData?.slaMetrics.timeToInterview.target || 0}h
              </div>
              {(dashboardData?.slaMetrics.timeToInterview.breaches || 0) > 0 && (
                <Badge variant="destructive" className="mt-1">
                  {dashboardData?.slaMetrics.timeToInterview.breaches} breaches
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
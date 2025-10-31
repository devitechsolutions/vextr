import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts";
import { 
  TrendingUp, 
  TrendingDown,
  Clock,
  DollarSign,
  Users,
  Target,
  Activity,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Phone,
  UserCheck,
  Briefcase,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Download,
  RefreshCw,
  Info
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface AdvancedAnalyticsProps {
  dashboardData: any;
  pipelineData: any;
  kpiData: any;
  isAdmin: boolean;
  selectedRecruiterId: number | null;
}

export default function AdvancedAnalytics({ 
  dashboardData, 
  pipelineData, 
  kpiData, 
  isAdmin, 
  selectedRecruiterId 
}: AdvancedAnalyticsProps) {
  const [timeRange, setTimeRange] = useState("30d");

  // Fetch actual candidate and vacancy data
  const { data: candidates } = useQuery({
    queryKey: ["/api/candidates"],
  });

  const { data: vacancies } = useQuery({
    queryKey: ["/api/vacancies"],
  });

  const { data: interviews } = useQuery({
    queryKey: ["/api/interviews"],
  });

  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    enabled: isAdmin,
  });

  // Create pipeline funnel from real candidate status data
  const createPipelineFunnel = () => {
    if (!candidates || candidates.length === 0) {
      return [];
    }

    const statusCounts: { [key: string]: number } = {};
    candidates.forEach((candidate: any) => {
      const status = candidate.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#a4de6c', '#ffc0cb'];
    
    return Object.entries(statusCounts)
      .map(([status, count], index) => ({
        name: status,
        value: count,
        fill: COLORS[index % COLORS.length]
      }))
      .sort((a, b) => b.value - a.value);
  };

  // Create current metrics from actual data
  const getCurrentMetrics = () => {
    const today = dashboardData?.todayMetrics || {};
    
    return [
      {
        title: "Calls Made Today",
        value: today.callsMade || 0,
        icon: <Phone className="h-4 w-4" />,
        change: 0, // No historical data available yet
        period: "today"
      },
      {
        title: "Candidates Contacted",
        value: today.candidatesContacted || 0,
        icon: <UserCheck className="h-4 w-4" />,
        change: 0,
        period: "today"
      },
      {
        title: "Interviews Scheduled",
        value: today.interviewsScheduled || 0,
        icon: <Calendar className="h-4 w-4" />,
        change: 0,
        period: "today"
      },
      {
        title: "Total Candidates",
        value: candidates?.length || 0,
        icon: <Users className="h-4 w-4" />,
        change: 0,
        period: "total"
      }
    ];
  };

  // Create team performance from actual user data
  const getTeamPerformance = () => {
    if (!users || !isAdmin) {
      return [];
    }

    return users
      .filter((user: any) => user.role === 'recruiter')
      .map((user: any) => ({
        name: user.name,
        // These would need to be calculated from actual interaction/activity data
        // For now showing 0 since we don't have this data available
        calls: 0,
        interviews: 0,
        placements: 0,
        revenue: 0
      }));
  };

  const pipelineFunnelData = createPipelineFunnel();
  const currentMetrics = getCurrentMetrics();
  const teamData = getTeamPerformance();

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Advanced Analytics</h2>
          <p className="text-muted-foreground">Deep insights into recruitment performance and trends</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline Analysis</TabsTrigger>
          <TabsTrigger value="team">Team Performance</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Current Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {currentMetrics.map((metric, index) => (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {metric.icon}
                    {metric.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metric.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metric.period === 'total' ? 'Total in database' : `From ${metric.period}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Key Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Database Summary
                </CardTitle>
                <CardDescription>Current data in your recruitment system</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Candidates</span>
                    <span className="font-bold">{candidates?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Vacancies</span>
                    <span className="font-bold">{vacancies?.length || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Interviews</span>
                    <span className="font-bold">{interviews?.length || 0}</span>
                  </div>
                  {isAdmin && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Team Members</span>
                      <span className="font-bold">{users?.length || 0}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Today's Activity
                </CardTitle>
                <CardDescription>Real-time activity from your dashboard</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Calls Made</span>
                    <span className="font-bold">{dashboardData?.todayMetrics?.callsMade || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Candidates Contacted</span>
                    <span className="font-bold">{dashboardData?.todayMetrics?.candidatesContacted || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Interviews Scheduled</span>
                    <span className="font-bold">{dashboardData?.todayMetrics?.interviewsScheduled || 0}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Pipeline Active</span>
                    <span className="font-bold">{pipelineData?.totalActive || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Pipeline Analysis Tab */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Candidate Status Distribution
                </CardTitle>
                <CardDescription>Current candidates by status in your database</CardDescription>
              </CardHeader>
              <CardContent>
                {pipelineFunnelData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={pipelineFunnelData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {pipelineFunnelData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <PieChartIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No candidate data available</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Status Breakdown
                </CardTitle>
                <CardDescription>Detailed view of candidate status counts</CardDescription>
              </CardHeader>
              <CardContent>
                {pipelineFunnelData.length > 0 ? (
                  <div className="space-y-3">
                    {pipelineFunnelData.slice(0, 8).map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: item.fill }}
                          ></div>
                          <span className="text-sm">{item.name}</span>
                        </div>
                        <span className="font-bold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    <div className="text-center">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No status data available</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Team Performance Tab */}
        <TabsContent value="team" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Overview
              </CardTitle>
              <CardDescription>Performance metrics for team members</CardDescription>
            </CardHeader>
            <CardContent>
              {isAdmin ? (
                teamData.length > 0 ? (
                  <div className="space-y-4">
                    {teamData.map((member, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{member.name}</span>
                          <Badge variant="outline">Recruiter</Badge>
                        </div>
                        <div className="grid grid-cols-4 gap-4 mt-2 text-sm text-muted-foreground">
                          <div>Calls: {member.calls}</div>
                          <div>Interviews: {member.interviews}</div>
                          <div>Placements: {member.placements}</div>
                          <div>Revenue: €{member.revenue}</div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Performance metrics will be calculated from activity data
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                    <div className="text-center">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No team members found</p>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground">
                  <div className="text-center">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Admin access required to view team performance</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5" />
                Historical Trends
              </CardTitle>
              <CardDescription>Performance trends over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <LineChartIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Historical trend data not yet available</p>
                  <p className="text-xs mt-2">
                    Trends will be generated as your recruitment data accumulates over time
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
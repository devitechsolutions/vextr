import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Target, 
  TrendingUp, 
  TrendingDown,
  Phone,
  UserCheck,
  Calendar,
  FileText,
  Award,
  Banknote,
  Clock,
  Activity,
  Settings,
  Edit3
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";

interface KPIData {
  daily: DailyKPIs;
  weekly: WeeklyKPIs;
  monthly: MonthlyKPIs;
  targets: KPITargets;
  trends: TrendData[];
}

interface KPITrackerProps {
  kpiData: KPIData | undefined;
  isAdmin: boolean;
  selectedRecruiterId: number | null;
}

interface DailyKPIs {
  callsMade: number;
  candidatesContacted: number;
  newCandidatesAdded: number;
  interviewsScheduled: number;
  cvsSubmitted: number;
  introsSent: number;
  placementsMade: number;
}

interface WeeklyKPIs extends DailyKPIs {
  conversionRate: number;
  avgTimeToFill: number;
  clientSatisfaction: number;
}

interface MonthlyKPIs extends WeeklyKPIs {
  revenue: number;
  costPerHire: number;
  qualityOfHire: number;
}

interface KPITargets {
  dailyCalls: number;
  weeklyPlacements: number;
  monthlyRevenue: number;
  conversionRate: number;
}

interface TrendData {
  date: string;
  calls: number;
  contacts: number;
  interviews: number;
  placements: number;
}

interface KPITrackerProps {
  kpiData: KPIData | undefined;
  isAdmin: boolean;
  selectedRecruiterId: number | null;
}

export default function KPITracker({ kpiData, isAdmin, selectedRecruiterId }: KPITrackerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper function to get currency symbol
  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      EUR: '€',
      USD: '$',
      GBP: '£',
      CHF: 'CHF',
      CAD: 'C$',
      AUD: 'A$'
    };
    return symbols[currency] || currency;
  };
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedTargets, setEditedTargets] = useState<KPITargets | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState('month');
  const [selectedRecruiter, setSelectedRecruiter] = useState('all');
  // Mock data if no real data available
  const defaultKPIData: KPIData = {
    daily: {
      callsMade: 18,
      candidatesContacted: 12,
      newCandidatesAdded: 3,
      interviewsScheduled: 2,
      cvsSubmitted: 4,
      introsSent: 6,
      placementsMade: 0,
    },
    weekly: {
      callsMade: 112,
      candidatesContacted: 68,
      newCandidatesAdded: 15,
      interviewsScheduled: 8,
      cvsSubmitted: 22,
      introsSent: 28,
      placementsMade: 2,
      conversionRate: 65,
      avgTimeToFill: 18,
      clientSatisfaction: 4.2,
    },
    monthly: {
      callsMade: 486,
      candidatesContacted: 312,
      newCandidatesAdded: 68,
      interviewsScheduled: 42,
      cvsSubmitted: 98,
      introsSent: 124,
      placementsMade: 8,
      conversionRate: 68,
      avgTimeToFill: 16,
      clientSatisfaction: 4.3,
      revenue: 125000,
      costPerHire: 2800,
      qualityOfHire: 85,
    },
    targets: {
      dailyCalls: 30,
      weeklyPlacements: 3,
      monthlyRevenue: 20000,
      currency: 'EUR',
      conversionRate: 3,
    },
    trends: [
      { date: "Mon", calls: 28, contacts: 18, interviews: 3, placements: 0 },
      { date: "Tue", calls: 32, contacts: 22, interviews: 4, placements: 1 },
      { date: "Wed", calls: 25, contacts: 15, interviews: 2, placements: 0 },
      { date: "Thu", calls: 30, contacts: 20, interviews: 3, placements: 0 },
      { date: "Fri", calls: 18, contacts: 12, interviews: 2, placements: 0 },
    ],
  };

  // Fetch recruiters for the selector
  const { data: recruiters } = useQuery({
    queryKey: ['/api/users'],
    enabled: true,
  });

  const data = kpiData || defaultKPIData;

  // Initialize edited targets when dialog opens
  const handleEditClick = () => {
    setEditedTargets({ ...data.targets });
    setIsEditDialogOpen(true);
  };

  // Update KPI targets mutation
  const updateTargetsMutation = useMutation({
    mutationFn: async (newTargets: KPITargets) => {
      const response = await apiRequest(`/api/dashboard/kpi-targets${selectedRecruiterId ? `?recruiterId=${selectedRecruiterId}` : ''}`, {
        method: 'PUT',
        body: JSON.stringify(newTargets),
        headers: { 'Content-Type': 'application/json' },
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "KPI Targets Updated",
        description: "Your KPI targets have been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/kpis"] });
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update KPI targets",
        variant: "destructive",
      });
    },
  });

  const handleSaveTargets = () => {
    if (editedTargets) {
      // Only send the fields that should be updated, exclude system fields
      const targetsToSave = {
        dailyCalls: editedTargets.dailyCalls,
        weeklyPlacements: editedTargets.weeklyPlacements,
        monthlyRevenue: editedTargets.monthlyRevenue,
        currency: editedTargets.currency,
        conversionRate: editedTargets.conversionRate,
      };
      updateTargetsMutation.mutate(targetsToSave);
    }
  };

  const handleTargetChange = (field: keyof KPITargets, value: string) => {
    if (editedTargets) {
      setEditedTargets({
        ...editedTargets,
        [field]: field === 'currency' ? value : (parseFloat(value) || 0),
      });
    }
  };

  const calculateProgress = (current: number, target: number) => {
    return Math.min((current / target) * 100, 100);
  };

  const getPerformanceIndicator = (current: number, target: number) => {
    const percentage = (current / target) * 100;
    if (percentage >= 100) return { icon: TrendingUp, color: "text-green-500", label: "On Track" };
    if (percentage >= 70) return { icon: Activity, color: "text-yellow-500", label: "Near Target" };
    return { icon: TrendingDown, color: "text-red-500", label: "Below Target" };
  };

  const getTimeframeData = (timeframe: string) => {
    switch (timeframe) {
      case 'day':
        return data.daily;
      case 'week':
        return data.weekly;
      case 'month':
        return data.monthly;
      case 'quarter':
        // Mock quarterly data - would come from backend in real implementation
        return {
          callsMade: data.monthly.callsMade * 3,
          candidatesContacted: data.monthly.candidatesContacted * 3,
          interviewsScheduled: data.monthly.interviewsScheduled * 3,
          cvsSubmitted: data.monthly.cvsSubmitted * 3,
          placementsMade: data.monthly.placementsMade * 3,
        };
      case 'year':
        // Mock yearly data - would come from backend in real implementation
        return {
          callsMade: data.monthly.callsMade * 12,
          candidatesContacted: data.monthly.candidatesContacted * 12,
          interviewsScheduled: data.monthly.interviewsScheduled * 12,
          cvsSubmitted: data.monthly.cvsSubmitted * 12,
          placementsMade: data.monthly.placementsMade * 12,
        };
      case 'all':
        // Mock all-time data - would come from backend in real implementation
        return {
          callsMade: data.monthly.callsMade * 24,
          candidatesContacted: data.monthly.candidatesContacted * 24,
          interviewsScheduled: data.monthly.interviewsScheduled * 24,
          cvsSubmitted: data.monthly.cvsSubmitted * 24,
          placementsMade: data.monthly.placementsMade * 24,
        };
      default:
        return data.monthly;
    }
  };

  const getTimeframeLabel = (timeframe: string) => {
    const labels = {
      day: 'Today',
      week: 'This Week',
      month: 'This Month',
      quarter: 'This Quarter',
      year: 'This Year',
      all: 'All Time'
    };
    return labels[timeframe] || labels.month;
  };

  const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

  const pieData = [
    { name: "Calls", value: data.daily.callsMade },
    { name: "Contacts", value: data.daily.candidatesContacted },
    { name: "Interviews", value: data.daily.interviewsScheduled },
    { name: "CVs Sent", value: data.daily.cvsSubmitted },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Header with Edit Button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Key Performance Indicators</h2>
          <p className="text-sm text-muted-foreground">Track and manage your performance targets</p>
        </div>
        {isAdmin && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={handleEditClick}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit Targets
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit KPI Targets</DialogTitle>
                <DialogDescription>
                  Adjust the performance targets for {selectedRecruiterId ? 'this recruiter' : 'your team'}.
                </DialogDescription>
              </DialogHeader>
              {editedTargets && (
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="dailyCalls" className="text-right">
                      Daily Calls
                    </Label>
                    <Input
                      id="dailyCalls"
                      type="number"
                      value={editedTargets.dailyCalls}
                      onChange={(e) => handleTargetChange('dailyCalls', e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="weeklyPlacements" className="text-right">
                      Weekly Placements
                    </Label>
                    <Input
                      id="weeklyPlacements"
                      type="number"
                      value={editedTargets.weeklyPlacements}
                      onChange={(e) => handleTargetChange('weeklyPlacements', e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="monthlyRevenue" className="text-right">
                      Monthly Revenue
                    </Label>
                    <div className="col-span-3 flex gap-2">
                      <Input
                        id="monthlyRevenue"
                        type="number"
                        value={editedTargets.monthlyRevenue}
                        onChange={(e) => handleTargetChange('monthlyRevenue', e.target.value)}
                        className="flex-1"
                      />
                      <select
                        value={editedTargets.currency || 'EUR'}
                        onChange={(e) => handleTargetChange('currency', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="GBP">GBP</option>
                        <option value="CHF">CHF</option>
                        <option value="CAD">CAD</option>
                        <option value="AUD">AUD</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="conversionRate" className="text-right">
                      Conversion Rate (%)
                    </Label>
                    <Input
                      id="conversionRate"
                      type="number"
                      value={editedTargets.conversionRate}
                      onChange={(e) => handleTargetChange('conversionRate', e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveTargets} disabled={updateTargetsMutation.isPending}>
                  {updateTargetsMutation.isPending ? "Saving..." : "Save Targets"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Daily Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.daily.callsMade}/{data.targets.dailyCalls}
            </div>
            <Progress 
              value={calculateProgress(data.daily.callsMade, data.targets.dailyCalls)} 
              className="mt-2" 
            />
            {(() => {
              const indicator = getPerformanceIndicator(data.daily.callsMade, data.targets.dailyCalls);
              const Icon = indicator.icon;
              return (
                <div className="flex items-center gap-1 mt-1">
                  <Icon className={cn("h-4 w-4", indicator.color)} />
                  <span className={cn("text-xs", indicator.color)}>{indicator.label}</span>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Conversion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.weekly.conversionRate}%
            </div>
            <Progress 
              value={calculateProgress(data.weekly.conversionRate, data.targets.conversionRate)} 
              className="mt-2" 
            />
            <p className="text-xs text-muted-foreground mt-1">
              Target: {data.targets.conversionRate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Award className="h-4 w-4" />
              Weekly Placements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.weekly.placementsMade}/{data.targets.weeklyPlacements}
            </div>
            <Progress 
              value={calculateProgress(data.weekly.placementsMade, data.targets.weeklyPlacements)} 
              className="mt-2" 
            />
            {data.weekly.placementsMade >= data.targets.weeklyPlacements && (
              <Badge className="mt-1 bg-green-100 text-green-800">Target Met!</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Banknote className="h-4 w-4" />
              Monthly Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {getCurrencySymbol(data.targets.currency || 'EUR')}{(data.monthly.revenue / 1000).toFixed(0)}k
            </div>
            <Progress 
              value={calculateProgress(data.monthly.revenue, data.targets.monthlyRevenue)} 
              className="mt-2" 
            />
            <p className="text-xs text-muted-foreground mt-1">
              Target: {getCurrencySymbol(data.targets.currency || 'EUR')}{(data.targets.monthlyRevenue / 1000).toFixed(0)}k
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics Section */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
            {/* Performance Metrics with Timeframe Selector */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Performance Metrics</CardTitle>
                    <CardDescription>{getTimeframeLabel(selectedTimeframe)} performance overview</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={selectedRecruiter} onValueChange={setSelectedRecruiter}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Recruiter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Admin view</SelectItem>
                        {recruiters?.map((recruiter: any) => (
                          <SelectItem key={recruiter.id} value={recruiter.id.toString()}>
                            {recruiter.fullName || recruiter.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Timeframe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="day">Day</SelectItem>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="quarter">Quarter</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(() => {
                    const timeframeData = getTimeframeData(selectedTimeframe);
                    const metrics = [
                      { label: "Calls Made", value: timeframeData.callsMade, target: selectedTimeframe === 'day' ? 30 : selectedTimeframe === 'week' ? 150 : selectedTimeframe === 'month' ? 600 : selectedTimeframe === 'quarter' ? 1800 : selectedTimeframe === 'year' ? 7200 : 14400, icon: Phone },
                      { label: "Candidates Contacted", value: timeframeData.candidatesContacted, target: selectedTimeframe === 'day' ? 20 : selectedTimeframe === 'week' ? 100 : selectedTimeframe === 'month' ? 400 : selectedTimeframe === 'quarter' ? 1200 : selectedTimeframe === 'year' ? 4800 : 9600, icon: UserCheck },
                      { label: "Interviews Scheduled", value: timeframeData.interviewsScheduled, target: selectedTimeframe === 'day' ? 3 : selectedTimeframe === 'week' ? 15 : selectedTimeframe === 'month' ? 60 : selectedTimeframe === 'quarter' ? 180 : selectedTimeframe === 'year' ? 720 : 1440, icon: Calendar },
                      { label: "CVs Submitted", value: timeframeData.cvsSubmitted, target: selectedTimeframe === 'day' ? 5 : selectedTimeframe === 'week' ? 25 : selectedTimeframe === 'month' ? 100 : selectedTimeframe === 'quarter' ? 300 : selectedTimeframe === 'year' ? 1200 : 2400, icon: FileText },
                    ];

                    return metrics.map((metric) => {
                      const Icon = metric.icon;
                      return (
                        <div key={metric.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{metric.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{metric.value}</span>
                            <span className="text-sm text-muted-foreground">/ {metric.target}</span>
                            <Progress 
                              value={calculateProgress(metric.value, metric.target)} 
                              className="w-20" 
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
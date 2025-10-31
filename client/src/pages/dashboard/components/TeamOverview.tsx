import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Phone, 
  Clock, 
  UserCheck, 
  TrendingUp,
  Activity,
  PauseCircle,
  PlayCircle,
  Briefcase,
  Users,
  Target,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface RecruiterStatus {
  id: number;
  name: string;
  avatar?: string;
  currentActivity: string;
  currentPhase: string;
  assignedVacancies: Array<{
    id: number;
    title: string;
    clientName: string;
  }>;
  candidatesToContact: Array<{
    candidateId: number;
    candidateName: string;
    vacancyId: number;
    vacancyTitle: string;
    matchScore: number;
    status: string;
  }>;
  dailyProgress: {
    calls: number;
    targetCalls: number;
    candidatesContacted: number;
    interviewsScheduled: number;
    cvsSubmitted: number;
  };
  isActive: boolean;
  lastActivity: string;
}

interface TeamOverviewProps {
  recruiters: RecruiterStatus[];
}

export default function TeamOverview({ recruiters }: TeamOverviewProps) {
  const [expandedRecruiters, setExpandedRecruiters] = useState<Set<number>>(new Set());
  const [showVacancyDetails, setShowVacancyDetails] = useState<Set<number>>(new Set());

  const toggleExpanded = (recruiterId: number) => {
    setExpandedRecruiters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recruiterId)) {
        newSet.delete(recruiterId);
      } else {
        newSet.add(recruiterId);
      }
      return newSet;
    });
  };
  
  const toggleVacancyDetails = (recruiterId: number) => {
    setShowVacancyDetails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recruiterId)) {
        newSet.delete(recruiterId);
      } else {
        newSet.add(recruiterId);
      }
      return newSet;
    });
  };

  const getActivityColor = (activity: string) => {
    const activityColors: Record<string, string> = {
      "On Call": "bg-green-500",
      "In Meeting": "bg-blue-500",
      "Administrative": "bg-yellow-500",
      "Break": "bg-gray-400",
      "Available": "bg-purple-500",
      "Offline": "bg-gray-600"
    };
    return activityColors[activity] || "bg-gray-500";
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600 bg-green-50";
    if (score >= 40) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const calculateTeamProgress = () => {
    if (recruiters.length === 0) return 0;
    const totalCalls = recruiters.reduce((sum, r) => sum + r.dailyProgress.calls, 0);
    const totalTarget = recruiters.reduce((sum, r) => sum + r.dailyProgress.targetCalls, 0);
    return totalTarget > 0 ? Math.round((totalCalls / totalTarget) * 100) : 0;
  };

  const activeRecruiters = recruiters.filter(r => r.isActive).length;
  const teamProgress = calculateTeamProgress();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Team Overview</CardTitle>
            <CardDescription>
              Real-time status of all recruiters
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{teamProgress}%</div>
              <div className="text-xs text-muted-foreground">Team Target</div>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recruiters.map((recruiter) => {
            const progress = recruiter.dailyProgress.targetCalls > 0 
              ? Math.round((recruiter.dailyProgress.calls / recruiter.dailyProgress.targetCalls) * 100)
              : 0;
            const isExpanded = expandedRecruiters.has(recruiter.id);
            const showingVacancies = showVacancyDetails.has(recruiter.id);
            
            return (
              <Collapsible key={recruiter.id}>
                <div
                  className={cn(
                    "p-4 rounded-lg border",
                    recruiter.isActive ? "bg-background" : "bg-muted/30"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={recruiter.avatar} />
                        <AvatarFallback>{getInitials(recruiter.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{recruiter.name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {/* Activity status removed - showing only essential info */}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <button
                            onClick={() => toggleVacancyDetails(recruiter.id)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Briefcase className="h-3 w-3" />
                            {recruiter.assignedVacancies.length} vacancies
                          </button>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {recruiter.candidatesToContact.length} candidates
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      <div>
                        <div className="text-sm font-medium">
                          {recruiter.dailyProgress.calls}/{recruiter.dailyProgress.targetCalls} calls
                        </div>
                        <Progress value={progress} className="w-24 mt-1" />
                      </div>
                      <CollapsibleTrigger
                        onClick={() => toggleExpanded(recruiter.id)}
                        className="p-1 rounded hover:bg-muted"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </CollapsibleTrigger>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mt-3 pt-3 border-t">
                    <div className="text-center">
                      <Phone className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-semibold">{recruiter.dailyProgress.calls}</div>
                      <div className="text-xs text-muted-foreground">Calls</div>
                    </div>
                    <div className="text-center">
                      <UserCheck className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-semibold">{recruiter.dailyProgress.candidatesContacted}</div>
                      <div className="text-xs text-muted-foreground">Reached</div>
                    </div>
                    <div className="text-center">
                      <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-semibold">{recruiter.dailyProgress.interviewsScheduled}</div>
                      <div className="text-xs text-muted-foreground">Interviews</div>
                    </div>
                    <div className="text-center">
                      <Activity className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-lg font-semibold">{recruiter.dailyProgress.cvsSubmitted}</div>
                      <div className="text-xs text-muted-foreground">CVs Sent</div>
                    </div>
                  </div>

                  {/* Vacancy Details - Shows when vacancy count is clicked */}
                  {showingVacancies && recruiter.assignedVacancies.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="space-y-2">
                        {recruiter.assignedVacancies.map((vacancy) => (
                          <div key={vacancy.id} className="p-3 rounded-md bg-muted/50">
                            <div className="font-medium text-sm">{vacancy.title}</div>
                            <div className="text-xs text-muted-foreground">{vacancy.clientName}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <CollapsibleContent>
                    <div className="mt-4 pt-4 border-t space-y-4">
                      {/* Only show candidate details in expanded view */}
                      {recruiter.candidatesToContact.length > 0 && (
                        <div>
                          <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Priority Candidates ({recruiter.candidatesToContact.length})
                          </h4>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {recruiter.candidatesToContact.map((candidate) => (
                              <div key={`${candidate.candidateId}-${candidate.vacancyId}`} 
                                   className="p-3 rounded-md bg-muted/50">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <div className="font-medium text-sm">{candidate.candidateName}</div>
                                    <div className="text-xs text-muted-foreground">{candidate.vacancyTitle}</div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {candidate.matchScore && (
                                      <Badge 
                                        variant="outline" 
                                        className={cn("text-xs", getMatchScoreColor(candidate.matchScore))}
                                      >
                                        {candidate.matchScore}% match
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="text-xs">
                                      {candidate.status.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {recruiter.assignedVacancies.length === 0 && recruiter.candidatesToContact.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No vacancies or candidates assigned</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, 
  Filter, 
  UserCheck, 
  Briefcase, 
  MapPin, 
  Star, 
  Zap,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  X,
  Building,
  Clock,
  DollarSign,
  Briefcase as BriefcaseIcon,
  Pencil
} from "lucide-react";
import { Vacancy, Candidate } from "@shared/schema";
import { AddVacancyModal } from "@/components/AddVacancyModal";

export default function MatcherPage() {
  const [selectedVacancy, setSelectedVacancy] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"todo" | "rejected">("todo");
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [candidateSearchTerm, setCandidateSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("not-contacted"); // Default to show only not contacted
  const [editVacancy, setEditVacancy] = useState<Vacancy | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const candidatesPerPage = 10;
  const queryClient = useQueryClient();
  const search = useSearch();
  const [, setLocation] = useLocation();

  // Auto-select vacancy, page, and status filter from URL parameters on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(search);
    const vacancyParam = urlParams.get('vacancy');
    const pageParam = urlParams.get('page');
    const statusParam = urlParams.get('status');
    
    if (vacancyParam && !selectedVacancy) {
      const vacancyId = parseInt(vacancyParam);
      if (!isNaN(vacancyId)) {
        setSelectedVacancy(vacancyId);
      }
    }
    
    if (pageParam) {
      const pageNum = parseInt(pageParam);
      if (!isNaN(pageNum) && pageNum > 0) {
        setCurrentPage(pageNum);
      }
    }
    
    if (statusParam) {
      setStatusFilter(statusParam);
    }
  }, [search, selectedVacancy]);

  // Reset page when candidate search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [candidateSearchTerm]);
  
  // Navigate to candidate details
  const handleCandidateClick = (candidate: Candidate) => {
    const fullName = `${candidate.firstName} ${candidate.lastName}`;
    const params = new URLSearchParams({
      search: fullName,
      edit: candidate.id.toString()
    });
    
    // Include vacancy, page, and status filter context for proper back navigation
    if (selectedVacancy) {
      params.append('fromVacancy', selectedVacancy.toString());
      params.append('fromPage', currentPage.toString());
      params.append('fromStatus', statusFilter);
    }
    
    setLocation(`/candidates?${params.toString()}`);
  };
  
  const { data: vacancies, isLoading: vacanciesLoading } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
  });
  
  const { data: matchedData, isLoading: matchLoading } = useQuery({
    queryKey: [`/api/match/${selectedVacancy}`, currentPage, candidateSearchTerm],
    queryFn: selectedVacancy ? () => {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: candidatesPerPage.toString()
      });
      
      if (candidateSearchTerm.trim()) {
        params.append('search', candidateSearchTerm.trim());
      }
      
      return apiRequest(`/api/match/${selectedVacancy}?${params}`);
    } : undefined,
    enabled: !!selectedVacancy,
  });

  // Load candidate statuses for the selected vacancy
  const { data: candidateStatuses } = useQuery<Array<{
    id: number;
    candidateId: number;
    vacancyId: number;
    status: string;
    userId: number;
    notes?: string;
    createdAt: string;
    updatedAt: string;
  }>>({
    queryKey: [`/api/candidate-statuses/${selectedVacancy}`],
    enabled: !!selectedVacancy,
  });
  
  const filteredVacancies = vacancies?.filter(v => {
    const isOpen = v.status === "open";
    const matchesSearch = searchTerm === "" || 
      v.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.skills?.some((skill: string) => skill.toLowerCase().includes(searchTerm.toLowerCase()));
    return isOpen && matchesSearch;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) || [];

  // Mutation for updating candidate status with optimistic updates
  const updateCandidateStatusMutation = useMutation({
    mutationFn: async ({ candidateId, status }: { candidateId: number; status: string }) => {
      if (!selectedVacancy) throw new Error("No vacancy selected");
      
      const response = await fetch("/api/candidate-statuses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidateId,
          vacancyId: selectedVacancy,
          status,
        }),
      });

      if (!response.ok) {
        const responseData = await response.json();
        throw new Error(`API request failed: ${response.status} - ${JSON.stringify(responseData)}`);
      }

      return response.json();
    },
    // Optimistic updates for instant UI feedback
    onMutate: async ({ candidateId, status }) => {
      if (!selectedVacancy) return;

      const queryKey = [`/api/candidate-statuses/${selectedVacancy}`];
      
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey });

      // Snapshot the previous value
      const previousStatuses = queryClient.getQueryData(queryKey);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKey, (old: any[]) => {
        if (!old) return [{ candidateId, vacancyId: selectedVacancy, status, userId: 2, id: Date.now() }];
        
        // Remove any existing status for this candidate and add the new one
        const filteredStatuses = old.filter(s => s.candidateId !== candidateId);
        return [...filteredStatuses, { candidateId, vacancyId: selectedVacancy, status, userId: 2, id: Date.now() }];
      });

      // Return a context object with the snapshotted value
      return { previousStatuses };
    },
    // If the mutation fails, use the context returned from onMutate to roll back
    onError: (err, variables, context) => {
      if (context?.previousStatuses && selectedVacancy) {
        queryClient.setQueryData([`/api/candidate-statuses/${selectedVacancy}`], context.previousStatuses);
      }
    },
    // Always refetch after error or success to ensure we have the latest data
    onSettled: () => {
      if (selectedVacancy) {
        // Invalidate both candidate statuses and vacancy assignments for bidirectional sync
        queryClient.invalidateQueries({ queryKey: [`/api/candidate-statuses/${selectedVacancy}`] });
        queryClient.invalidateQueries({ queryKey: ['/api/candidates/vacancy-assignments'] });
      }
    },
  });

  // Helper functions to get candidate status sets
  const getRejectedCandidateIds = (): Set<number> => {
    if (!candidateStatuses) return new Set();
    return new Set(
      candidateStatuses
        .filter((status: any) => status.status === "not-a-match")
        .map((status: any) => status.candidateId)
    );
  };

  const rejectedCandidateIds = getRejectedCandidateIds();

  // Functions to handle candidate actions
  const handleRejectCandidate = (candidateId: number) => {
    updateCandidateStatusMutation.mutate({ candidateId, status: "not-a-match" });
  };

  const handleResetCandidate = (candidateId: number) => {
    updateCandidateStatusMutation.mutate({ candidateId, status: "todo" });
  };

  // Get candidates from paginated response
  const allMatchedCandidates = matchedData?.candidates || [];
  const totalCandidates = matchedData?.total || 0;
  const totalPages = matchedData?.totalPages || 0;
  
  // Filter candidates based on active tab and status filter
  const getFilteredCandidates = () => {
    if (!allMatchedCandidates.length) return [];
    
    // First filter by tab (Not a Match vs To Do)
    let tabFiltered = allMatchedCandidates;
    switch (activeTab) {
      case "rejected":
        tabFiltered = allMatchedCandidates.filter((candidate: Candidate) => rejectedCandidateIds.has(candidate.id));
        break;
      case "todo":
        tabFiltered = allMatchedCandidates.filter((candidate: Candidate) => 
          !rejectedCandidateIds.has(candidate.id)
        );
        break;
    }
    
    // Then apply pipeline status filter (simplified to just two options)
    if (statusFilter === "all") {
      return tabFiltered;
    } else if (statusFilter === "not-contacted") {
      return tabFiltered.filter((candidate: Candidate) => 
        candidate.status === "Uncontacted" || 
        candidate.status === "Not Contacted" ||
        !candidate.status
      );
    }
    
    return tabFiltered;
  };

  // Filter candidates for current tab and display them
  const filteredCandidates = getFilteredCandidates();
  const paginatedCandidates = filteredCandidates;

  // Reset to page 1 when changing tabs or vacancy
  const handleTabChange = (newTab: "todo" | "rejected") => {
    setActiveTab(newTab);
    setCurrentPage(1);
  };

  const handleVacancyChange = (vacancyId: string) => {
    setSelectedVacancy(parseInt(vacancyId));
    setCurrentPage(1);
    setActiveTab("todo");
    setCandidateSearchTerm(""); // Reset candidate search when switching vacancies
    
    // Update URL to include vacancy parameter for proper browser navigation
    setLocation(`/matcher?vacancy=${vacancyId}&page=1&status=${statusFilter}`);
  };

  // Helper function to update page and URL together
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    if (selectedVacancy) {
      setLocation(`/matcher?vacancy=${selectedVacancy}&page=${newPage}&status=${statusFilter}`);
    }
  };
  
  // Helper function to update status filter and URL together
  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setCurrentPage(1); // Reset to page 1 when filter changes
    if (selectedVacancy) {
      setLocation(`/matcher?vacancy=${selectedVacancy}&page=1&status=${newStatus}`);
    }
  };

  
  const getMatchScore = (candidate: Candidate & { matchScore?: number }) => {
    return candidate.matchScore || 0;
  };
  
  const getMatchBadge = (score: number, matchLabel?: string, matchIcon?: string) => {
    if (score >= 70) {
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">{matchIcon} Strong Match ({score}%)</Badge>;
    } else if (score >= 40) {
      return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">{matchIcon} Moderate Match ({score}%)</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">{matchIcon} Weak Match ({score}%)</Badge>;
    }
  };
  
  // Helper function to get status badge styling
  const getStatusBadge = (status: string | null | undefined) => {
    if (!status || status === "Uncontacted" || status === "Not Contacted") {
      return <Badge variant="outline" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">Not Contacted</Badge>;
    } else if (status === "Contacted") {
      return <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Contacted</Badge>;
    } else if (status === "First Screening") {
      return <Badge variant="outline" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">First Screening</Badge>;
    } else if (status === "Had 1st Interview") {
      return <Badge variant="outline" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Interviews</Badge>;
    } else if (status === "Introduced") {
      return <Badge variant="outline" className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300">Introduced</Badge>;
    } else if (status === "Placed") {
      return <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Placed</Badge>;
    } else if (status === "Rejected (Client)") {
      return <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">Rejected</Badge>;
    } else {
      return <Badge variant="outline" className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{status}</Badge>;
    }
  };

  // Component to display candidate professional details
  const CandidateDetails = ({ candidate }: { candidate: Candidate }) => {
    return (
      <div className="mt-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <BriefcaseIcon className="h-4 w-4 text-muted-foreground" />
          <h5 className="font-medium text-sm">Professional Details</h5>
        </div>
        
        {/* Key Info Grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <Building className="h-3 w-3" />
              Current Company
            </div>
            <div className="text-sm font-medium">
              {candidate.company || "Not provided"}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <MapPin className="h-3 w-3" />
              Location
            </div>
            <div className="text-sm font-medium">
              {candidate.location || "Not provided"}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <Clock className="h-3 w-3" />
              Time at Company
            </div>
            <div className="text-sm">
              {candidate.durationAtCompany || "Not provided"}
            </div>
          </div>
          
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              Salary Range
            </div>
            <div className="text-sm">
              {candidate.salaryRangeMin && candidate.salaryRangeMax 
                ? `${candidate.salaryRangeMin} - ${candidate.salaryRangeMax} ${candidate.salaryCurrency || 'EUR'}`
                : "Not provided"}
            </div>
          </div>
        </div>

        {/* Industry & Company Location */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Industry:</span>
            <span className="text-sm ml-2">{candidate.branche || "Not provided"}</span>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Company Location:</span>
            <span className="text-sm ml-2">{candidate.companyLocation || "Not provided"}</span>
          </div>
        </div>

        {/* Experience Section */}
        {(candidate.pastRoleTitle || candidate.pastExperienceDuration) && (
          <div className="mb-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Previous Experience</div>
            <div className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
              {candidate.pastRoleTitle && (
                <div className="text-sm font-medium mb-1">
                  {candidate.pastRoleTitle}
                  {candidate.pastEmployer && <span className="text-muted-foreground"> at {candidate.pastEmployer}</span>}
                </div>
              )}
              {candidate.pastExperienceDuration && (
                <div className="text-xs text-muted-foreground">
                  Duration: {candidate.pastExperienceDuration}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Title Description */}
        {candidate.titleDescription && candidate.titleDescription !== "Not provided" && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Role Description</div>
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {candidate.titleDescription}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Helper function to get skill relevance color and styling
  const getSkillBadgeProps = (relevance: 'strong' | 'partial' | 'weak', similarity: number) => {
    switch (relevance) {
      case 'strong':
        return {
          className: "text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 border border-green-200 dark:border-green-800",
          icon: "🟢"
        };
      case 'partial':
        return {
          className: "text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100 border border-orange-200 dark:border-orange-800",
          icon: "🟠"
        };
      case 'weak':
      default:
        return {
          className: "text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100 border border-red-200 dark:border-red-800",
          icon: "🔴"
        };
    }
  };

  const MatchBreakdown = ({ candidate }: { candidate: Candidate & { matchDetails?: any } }) => {
    const isExpanded = expandedBreakdowns.has(candidate.id);
    
    const handleExpandChange = (expanded: boolean) => {
      setExpandedBreakdowns(prev => {
        const newSet = new Set(prev);
        if (expanded) {
          newSet.add(candidate.id);
        } else {
          newSet.delete(candidate.id);
        }
        return newSet;
      });
    };
    
    if (!candidate.matchDetails) return null;
    
    const { criteria, matchedSkills, skillMatches, candidateSkills, explanation } = candidate.matchDetails;
    
    return (
      <Collapsible open={isExpanded} onOpenChange={handleExpandChange}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          <span>Matching Logic & Skills Analysis</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-4 text-sm">
          {/* Match Explanation */}
          {explanation && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">Match Summary</div>
              <div className="text-xs text-blue-700 dark:text-blue-300">{explanation}</div>
            </div>
          )}
          
          {/* Scoring Breakdown */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Skills:</span>
              <span className="font-medium">{criteria.skillsScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Location:</span>
              <span className="font-medium">{criteria.locationScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Experience:</span>
              <span className="font-medium">{criteria.experienceScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Title Match:</span>
              <span className="font-medium">{criteria.titleScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Education:</span>
              <span className="font-medium">{criteria.educationScore}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Industry:</span>
              <span className="font-medium">{criteria.industryScore}%</span>
            </div>
          </div>
          
          {/* Enhanced Skills Analysis */}
          {skillMatches && skillMatches.length > 0 && (
            <div className="space-y-3">
              <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Required Skills vs Candidate Match:</p>
                <div className="space-y-2">
                  {skillMatches
                    .sort((a: any, b: any) => b.similarity - a.similarity) // Sort by score high to low
                    .map((skillMatch: any, index: number) => {
                    const badgeProps = getSkillBadgeProps(skillMatch.relevance, skillMatch.similarity);
                    return (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-900 rounded border">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={badgeProps.className + " px-2 py-1 rounded-full font-medium"}>
                              {skillMatch.skill}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(skillMatch.similarity)}% match)
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground capitalize">
                            {skillMatch.source === 'direct' ? 'Direct Match' : 
                             skillMatch.source === 'synonym' ? 'Synonym Match' :
                             skillMatch.source === 'fuzzy' ? 'Fuzzy Match' : 
                             skillMatch.source || 'Unknown'}
                          </div>
                        </div>
                        
                        {/* Enhanced source information */}
                        {(skillMatch.sourceLocation || skillMatch.sourceContext) && (
                          <div className="mt-2 p-2 bg-white dark:bg-gray-800 rounded text-xs border-l-2 border-blue-200 dark:border-blue-700">
                            {skillMatch.sourceLocation && (
                              <div className="flex items-center gap-1 mb-1">
                                <span className="font-medium text-blue-600 dark:text-blue-400">Found in:</span>
                                <span className="text-muted-foreground">{skillMatch.sourceLocation}</span>
                              </div>
                            )}
                            {skillMatch.sourceContext && (
                              <div className="text-gray-600 dark:text-gray-400 italic break-words">
                                "{skillMatch.sourceContext.length > 120 ? skillMatch.sourceContext.substring(0, 120) + '...' : skillMatch.sourceContext}"
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          {/* Candidate Skills Analysis */}
          {candidateSkills && candidateSkills.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">All Candidate Skills (Relevance to Role):</p>
              <div className="flex flex-wrap gap-1">
                {candidateSkills
                  .sort((a: any, b: any) => {
                    // Sort by percentage (high to low), then alphabetically
                    const percentageA = Math.round(a.similarity);
                    const percentageB = Math.round(b.similarity);
                    
                    if (percentageA !== percentageB) {
                      return percentageB - percentageA; // High to low
                    }
                    
                    // If percentages are equal, sort alphabetically
                    return a.skill.localeCompare(b.skill);
                  })
                  .map((skillMatch: any, index: number) => {
                  const badgeProps = getSkillBadgeProps(skillMatch.relevance, skillMatch.similarity);
                  return (
                    <Badge 
                      key={index} 
                      className={badgeProps.className}
                      title={`${Math.round(skillMatch.similarity)}% relevance to this role`}
                    >
                      {skillMatch.skill} ({Math.round(skillMatch.similarity)}%)
                    </Badge>
                  );
                })}
              </div>
              
              {/* Legend */}
              <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-900 rounded">
                <div className="text-xs font-medium text-muted-foreground mb-1">Color Legend:</div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span>Strong Match (70-100%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span>Partial Match (40-69%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span>Weak/No Match (0-39%)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Legacy matched skills fallback */}
          {(!skillMatches || skillMatches.length === 0) && matchedSkills && matchedSkills.length > 0 && (
            <div className="mt-2">
              <p className="text-muted-foreground text-xs mb-1">Matched Skills:</p>
              <div className="flex flex-wrap gap-1">
                {matchedSkills.map((skill: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="p-6 pb-0">
        <h1 className="text-2xl font-bold tracking-tight">Vacancy Matcher</h1>
        <p className="text-muted-foreground">
          Match open vacancies with suitable candidates in your database
        </p>
      </div>
      
      <div className="flex-1 flex flex-col md:flex-row gap-6 p-6 min-h-0 overflow-hidden">
        {/* Left column - Vacancy selection */}
        <Card className="w-full md:w-1/3 flex flex-col h-full min-h-0 overflow-hidden">
          <CardHeader>
            <CardTitle>Select a Vacancy</CardTitle>
            <CardDescription>
              Choose an open vacancy to find matching candidates
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-6 pb-0">
            {!vacanciesLoading && filteredVacancies.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search vacancies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8"
                />
              </div>
            )}
            
            {/* Scrollable vacancy list */}
            <div className="flex-1 overflow-y-auto pr-1 min-h-0">
              {vacanciesLoading ? (
                <div className="space-y-3">
                  {Array(5).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 pb-6">
                  {filteredVacancies.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No open vacancies found</p>
                      <Button variant="outline" className="mt-2">
                        Create a Vacancy
                      </Button>
                    </div>
                  ) : (
                    filteredVacancies.map((vacancy) => (
                      <div 
                        key={vacancy.id}
                        className={`group relative p-3 border rounded-md cursor-pointer transition-colors ${
                          selectedVacancy === vacancy.id 
                            ? "border-primary bg-primary/5" 
                            : "hover:border-primary/50"
                        }`}
                        onClick={() => handleVacancyChange(vacancy.id.toString())}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditVacancy(vacancy);
                            setShowEditModal(true);
                          }}
                          title="Edit vacancy"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <div className="font-medium pr-8">{vacancy.title}</div>
                        <div className="text-sm text-muted-foreground flex items-center mt-1">
                          <Briefcase className="h-3 w-3 mr-1" />
                          {vacancy.employmentType || "Full-time"}
                          {vacancy.location && (
                            <>
                              <span className="mx-1">•</span>
                              <MapPin className="h-3 w-3 mr-1" />
                              {vacancy.location}
                            </>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {vacancy.skills?.slice(0, 3).map((skill: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{skill}</Badge>
                          ))}
                          {vacancy.skills && vacancy.skills.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{vacancy.skills.length - 3}</Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* Right column - Matching filters and results */}
        <Card className="w-full md:w-2/3 flex flex-col h-full min-h-0 overflow-hidden">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle>Matching Candidates</CardTitle>
                <CardDescription>
                  Candidates that match the selected vacancy requirements
                </CardDescription>
              </div>
              {selectedVacancy && (
                <div className="ml-4 flex items-center gap-3">
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search candidate names..."
                      value={candidateSearchTerm}
                      onChange={(e) => setCandidateSearchTerm(e.target.value)}
                      className="w-full pl-8"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not-contacted">Not Contacted</SelectItem>
                      <SelectItem value="all">All Statuses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {selectedVacancy && (
              <Tabs value={activeTab} onValueChange={(value) => handleTabChange(value as "todo" | "rejected")} className="mt-4">
                <TabsList>
                  <TabsTrigger value="todo">
                    Matches
                  </TabsTrigger>
                  <TabsTrigger value="rejected">
                    Not a match
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </CardHeader>
          
          {!selectedVacancy ? (
            <CardContent className="flex items-center justify-center py-10">
              <div className="text-center space-y-3">
                <UserCheck className="h-12 w-12 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-medium">Select a vacancy to start matching</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a vacancy from the left panel to find matching candidates
                </p>
              </div>
            </CardContent>
          ) : (
            <>
              <CardContent className="flex flex-1 min-h-0 flex-col overflow-hidden p-6 pb-0">
                {/* Scrollable candidate list */}
                <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                  {matchLoading ? (
                    <div className="space-y-4 pb-6">
                      {Array(3).fill(0).map((_, i) => (
                        <div key={i} className="flex items-start space-x-4">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-4 w-full" />
                            <div className="flex space-x-2">
                              <Skeleton className="h-5 w-16" />
                              <Skeleton className="h-5 w-16" />
                              <Skeleton className="h-5 w-16" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="pb-6">
                      {paginatedCandidates && paginatedCandidates.length > 0 ? (
                        <div className="space-y-4">
                          {paginatedCandidates.map((candidate: Candidate & { matchScore?: number; matchDetails?: any }) => {
                          const score = getMatchScore(candidate);
                          return (
                            <div key={candidate.id} className="border rounded-lg p-4">
                              <div className="flex items-start">
                                <div className="flex-1">
                                  <div className="flex justify-between">
                                    <div className="flex items-center gap-2">
                                      <h4 
                                        className="font-medium cursor-pointer hover:text-blue-600 hover:underline transition-colors" 
                                        onClick={() => handleCandidateClick(candidate)}
                                        title="Click to view candidate details"
                                      >
                                        {candidate.firstName} {candidate.lastName}
                                      </h4>
                                      {getStatusBadge(candidate.status)}
                                    </div>
                                    <div className="flex items-center">
                                      <div className="relative w-12 h-12">
                                        <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                                          {/* Background circle */}
                                          <path
                                            className="text-gray-200"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            fill="transparent"
                                            d="M18 2.0845
                                              a 15.9155 15.9155 0 0 1 0 31.831
                                              a 15.9155 15.9155 0 0 1 0 -31.831"
                                          />
                                          {/* Progress circle */}
                                          <circle
                                            className={`${score >= 70 ? 'text-green-500' : score >= 40 ? 'text-yellow-500' : 'text-red-500'}`}
                                            cx="18"
                                            cy="18"
                                            r="15.9155"
                                            stroke="currentColor"
                                            strokeWidth="3"
                                            fill="transparent"
                                            strokeDasharray={`${score} 100`}
                                          />
                                        </svg>
                                        {/* Percentage text */}
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <span className="text-xs font-bold">{score}%</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {candidate.currentTitle || "No current title"}
                                    {candidate.location && ` • ${candidate.location}`}
                                  </p>
                                  <div className="mt-2 flex items-center">
                                    <div className="mr-2">
                                      {getMatchBadge(score, candidate.matchDetails?.matchLabel, candidate.matchDetails?.matchIcon)}
                                    </div>
                                    {candidate.experience && (
                                      <Badge variant="outline" className="mr-2">
                                        {candidate.experience} years exp.
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  {/* Candidate Professional Details */}
                                  <CandidateDetails candidate={candidate} />
                                  
                                  {/* Collapsible match breakdown */}
                                  <div className="mt-3">
                                    <MatchBreakdown candidate={candidate} />
                                  </div>
                                  
                                  {/* Show badges only when breakdown is collapsed */}
                                  {!expandedBreakdowns.has(candidate.id) && (
                                  <div className="mt-3 flex flex-wrap gap-1">
                                    {/* Show strong and partial matches with consistent colors */}
                                    {candidate.matchDetails?.skillMatches?.filter((match: any) => 
                                      match.relevance === 'strong'
                                    ).slice(0, 3).map((match: any, i: number) => (
                                      <Badge 
                                        key={`strong-${i}`} 
                                        variant="default"
                                        className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 border border-green-200 dark:border-green-800"
                                      >
                                        ✓ {match.skill}
                                      </Badge>
                                    ))}
                                    {/* Add partial matches */}
                                    {candidate.matchDetails?.skillMatches?.filter((match: any) => 
                                      match.relevance === 'partial'
                                    ).slice(0, 2).map((match: any, i: number) => (
                                      <Badge 
                                        key={`partial-${i}`} 
                                        variant="default"
                                        className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100 border border-orange-200 dark:border-orange-800"
                                      >
                                        ~ {match.skill}
                                      </Badge>
                                    ))}
                                    {candidate.skills?.slice(0, 2).map((skill: string, i: number) => (
                                      <Badge 
                                        key={`other-${i}`} 
                                        variant="secondary"
                                      >
                                        {skill}
                                      </Badge>
                                    ))}
                                    {candidate.skills && candidate.skills.length > 2 && (
                                      <Badge variant="outline">+{candidate.skills.length - 2} more</Badge>
                                    )}
                                  </div>
                                  )}
                                </div>
                              </div>
                              <div className="mt-4 flex justify-end space-x-2">
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    if (candidate.linkedinUrl) {
                                      window.open(candidate.linkedinUrl, '_blank');
                                    }
                                  }}
                                  disabled={!candidate.linkedinUrl}
                                >
                                  View Profile
                                </Button>
                                {!rejectedCandidateIds.has(candidate.id) && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleRejectCandidate(candidate.id)}
                                    className="border-red-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600"
                                  >
                                    <ThumbsDown className="h-4 w-4 mr-1" />
                                    Not a match
                                  </Button>
                                )}
                                {rejectedCandidateIds.has(candidate.id) && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="border-red-300 text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600"
                                      >
                                        <ThumbsDown className="h-4 w-4 mr-1" />
                                        Not a match
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent side="top">
                                      <DropdownMenuItem onClick={() => handleResetCandidate(candidate.id)}>
                                        To Do
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Zap className="h-10 w-10 mx-auto mb-2" />
                        <p>
                          {activeTab === "rejected" 
                            ? "No candidates marked as 'not a match' yet"
                            : activeTab === "todo"
                            ? "All candidates have been reviewed"
                            : "No matching candidates found"
                          }
                        </p>
                        <p className="text-sm mt-1">
                          {activeTab === "todo" 
                            ? "Great job! You've reviewed all candidates. Check the 'Not a match' tab to see your decisions."
                            : "Switch to 'To Do' tab to review more candidates"
                          }
                        </p>
                      </div>
                    )}
                    
                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between mt-6 pt-4 border-t">
                        <div className="text-sm text-muted-foreground">
                          Showing {((currentPage - 1) * candidatesPerPage) + 1} to {Math.min(currentPage * candidatesPerPage, totalCandidates)} of {totalCandidates} candidates • Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <div className="flex items-center space-x-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              const page = i + 1;
                              if (totalPages <= 5) {
                                return (
                                  <Button
                                    key={page}
                                    variant={currentPage === page ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handlePageChange(page)}
                                    className="w-8 h-8 p-0"
                                  >
                                    {page}
                                  </Button>
                                );
                              }
                              // Show pagination with ellipsis for larger datasets
                              return null;
                            })}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
      
      <AddVacancyModal
        open={showEditModal}
        onOpenChange={(open) => {
          setShowEditModal(open);
          if (!open) {
            setEditVacancy(null);
          }
        }}
        editVacancy={editVacancy}
      />
    </div>
  );
}

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Users, 
  UserX, 
  UserCheck,
  Phone,
  MessageSquare,
  FileText,
  Calendar,
  Briefcase,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Search,
  ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PipelinePhase {
  id: string;
  name: string;
  icon: any;
  color: string;
  count: number;
  candidates: PipelineCandidate[];
  conversionRate?: number;
  avgTimeInPhase?: number;
}

interface PipelineCandidate {
  id: number;
  name: string;
  title: string;
  company: string;
  vacancyTitle: string;
  daysInPhase: number;
  priority: "urgent" | "high" | "medium" | "low";
  lastActivity?: string;
}

interface PipelinePhasesProps {
  pipelineData: any;
  selectedRecruiterId: number | null;
}

export default function PipelinePhases({ pipelineData, selectedRecruiterId }: PipelinePhasesProps) {
  const [selectedPhase, setSelectedPhase] = useState<string>("all");
  const [draggedCandidate, setDraggedCandidate] = useState<PipelineCandidate | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const phases: PipelinePhase[] = [
    {
      id: "all",
      name: "All Candidates",
      icon: Users,
      color: "bg-gray-500",
      count: pipelineData?.totalCandidates || 0,
      candidates: pipelineData?.allCandidates || [],
    },
    {
      id: "not_contacted",
      name: "Not Contacted",
      icon: UserX,
      color: "bg-gray-400",
      count: pipelineData?.notContacted?.length || 0,
      candidates: pipelineData?.notContacted || [],
      conversionRate: 0,
      avgTimeInPhase: 2,
    },
    {
      id: "contacted",
      name: "Contacted",
      icon: Phone,
      color: "bg-blue-500",
      count: pipelineData?.contacted?.length || 0,
      candidates: pipelineData?.contacted || [],
      conversionRate: 65,
      avgTimeInPhase: 3,
    },
    {
      id: "first_screening",
      name: "First Screening",
      icon: MessageSquare,
      color: "bg-purple-500",
      count: pipelineData?.first_screening?.length || 0,
      candidates: pipelineData?.first_screening || [],
      conversionRate: 45,
      avgTimeInPhase: 4,
    },
    {
      id: "introduced",
      name: "Introduced",
      icon: FileText,
      color: "bg-indigo-500",
      count: pipelineData?.introduced?.length || 0,
      candidates: pipelineData?.introduced || [],
      conversionRate: 70,
      avgTimeInPhase: 5,
    },
    {
      id: "interviews",
      name: "Interviews",
      icon: Calendar,
      color: "bg-yellow-500",
      count: pipelineData?.interviews?.length || 0,
      candidates: pipelineData?.interviews || [],
      conversionRate: 60,
      avgTimeInPhase: 7,
    },
    {
      id: "contracting",
      name: "Contracting",
      icon: Briefcase,
      color: "bg-orange-500",
      count: pipelineData?.contracting?.length || 0,
      candidates: pipelineData?.contracting || [],
      conversionRate: 85,
      avgTimeInPhase: 3,
    },
    {
      id: "placed",
      name: "Placed",
      icon: CheckCircle,
      color: "bg-green-500",
      count: pipelineData?.placed?.length || 0,
      candidates: pipelineData?.placed || [],
      conversionRate: 100,
      avgTimeInPhase: 0,
    },
    {
      id: "rejected",
      name: "Rejected",
      icon: XCircle,
      color: "bg-red-500",
      count: pipelineData?.rejected?.length || 0,
      candidates: pipelineData?.rejected || [],
    },
  ];

  const moveCandidate = useMutation({
    mutationFn: async ({ candidateId, fromPhase, toPhase }: any) => {
      return apiRequest("/api/dashboard/move-candidate", {
        method: "POST",
        body: JSON.stringify({ candidateId, fromPhase, toPhase }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/pipeline"] });
      toast({
        title: "Candidate moved",
        description: "Pipeline updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to move candidate",
        variant: "destructive",
      });
    },
  });

  const handleDragStart = (e: React.DragEvent, candidate: PipelineCandidate) => {
    setDraggedCandidate(candidate);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, toPhase: string) => {
    e.preventDefault();
    if (draggedCandidate && toPhase !== "all") {
      moveCandidate.mutate({
        candidateId: draggedCandidate.id,
        fromPhase: selectedPhase,
        toPhase,
      });
    }
    setDraggedCandidate(null);
  };

  const currentPhase = phases.find(p => p.id === selectedPhase) || phases[0];

  // Filter candidates based on search term
  const filteredCandidates = useMemo(() => {
    if (!searchTerm.trim()) {
      return currentPhase.candidates;
    }
    
    const term = searchTerm.toLowerCase();
    return currentPhase.candidates.filter(candidate => 
      candidate.name.toLowerCase().includes(term) ||
      candidate.company.toLowerCase().includes(term) ||
      (candidate.title && candidate.title.toLowerCase().includes(term))
    );
  }, [currentPhase.candidates, searchTerm]);

  // Paginate filtered candidates
  const paginatedCandidates = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCandidates.slice(startIndex, endIndex);
  }, [filteredCandidates, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);

  // Reset to first page when search changes or phase changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedPhase]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStagnationAlert = (days: number) => {
    if (days > 14) return { icon: AlertCircle, color: "text-red-500", message: "Stagnant" };
    if (days > 7) return { icon: AlertCircle, color: "text-yellow-500", message: "Needs attention" };
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Pipeline Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {phases.slice(1).map((phase) => {
          const Icon = phase.icon;
          return (
            <Card
              key={phase.id}
              className={cn(
                "cursor-pointer transition-all",
                selectedPhase === phase.id && "ring-2 ring-primary"
              )}
              onClick={() => setSelectedPhase(phase.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, phase.id)}
            >
              <CardContent className="p-3">
                <div className="flex flex-col items-center text-center">
                  <div className={cn("p-2 rounded-full mb-2", phase.color, "bg-opacity-20")}>
                    <Icon className={cn("h-5 w-5", phase.color.replace("bg-", "text-"))} />
                  </div>
                  <p className="text-xs font-medium mb-1">{phase.name}</p>
                  <p className="text-2xl font-bold">{phase.count}</p>
                  {phase.conversionRate !== undefined && (
                    <div className="flex items-center gap-1 mt-1">
                      {phase.conversionRate > 50 ? (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {phase.conversionRate}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detailed Phase View */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{currentPhase.name}</CardTitle>
              <CardDescription>
                {filteredCandidates.length} of {currentPhase.count} candidates in this phase
                {currentPhase.avgTimeInPhase && (
                  <span> • Average time: {currentPhase.avgTimeInPhase} days</span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search candidates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              {filteredCandidates.length > itemsPerPage && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Page {currentPage} of {totalPages}</span>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {paginatedCandidates.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchTerm ? "No candidates match your search" : "No candidates in this phase"}
                  </p>
                </div>
              ) : (
                paginatedCandidates.map((candidate) => {
                  const stagnation = getStagnationAlert(candidate.daysInPhase);
                  return (
                    <div
                      key={candidate.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, candidate)}
                      className="p-3 rounded-lg border hover:shadow-md transition-all cursor-move"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-grow">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{candidate.name}</span>
                            <Badge className={cn("text-xs", getPriorityColor(candidate.priority))}>
                              {candidate.priority}
                            </Badge>
                            {stagnation && (
                              <div className="flex items-center gap-1">
                                <stagnation.icon className={cn("h-4 w-4", stagnation.color)} />
                                <span className={cn("text-xs", stagnation.color)}>
                                  {stagnation.message}
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {candidate.title} at {candidate.company}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            For: {candidate.vacancyTitle}
                          </p>
                          {candidate.lastActivity && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Last activity: {candidate.lastActivity}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">{candidate.daysInPhase} days</p>
                          <Button size="sm" variant="ghost" className="mt-1">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Pagination Controls */}
            {filteredCandidates.length > itemsPerPage && (
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredCandidates.length)} of {filteredCandidates.length} candidates
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNumber;
                      if (totalPages <= 5) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 3) {
                        pageNumber = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNumber = totalPages - 4 + i;
                      } else {
                        pageNumber = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNumber}
                          variant={currentPage === pageNumber ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNumber)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNumber}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Phone, 
  PhoneOff, 
  PhoneMissed,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  UserCheck,
  Calendar,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Candidate {
  id: number;
  name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  lastContact?: string;
  priority: "urgent" | "high" | "medium" | "low";
  vacancyTitle?: string;
  status: string;
  matchScore?: number;
  linkedinUrl?: string;
}

interface CallRoundManagerProps {
  phase: string;
  candidates: Candidate[];
}

interface CallOutcome {
  candidateId: number;
  outcome: "answered" | "voicemail" | "no_answer" | "callback" | "not_interested" | "requested_number";
  notes: string;
  followUpDate?: string;
}

export default function CallRoundManager({ phase, candidates = [] }: CallRoundManagerProps) {
  const [expandedCandidateId, setExpandedCandidateId] = useState<number | null>(
    candidates.length > 0 ? candidates[0].id : null
  );
  const [completedCandidateIds, setCompletedCandidateIds] = useState<Set<number>>(new Set());
  const [callOutcomes, setCallOutcomes] = useState<Record<number, Partial<CallOutcome>>>({});
  const [showNotes, setShowNotes] = useState<Record<number, boolean>>({});
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const progress = candidates.length > 0 ? (completedCandidateIds.size / candidates.length) * 100 : 0;
  const completedCount = completedCandidateIds.size;

  const logCallMutation = useMutation({
    mutationFn: async (outcome: CallOutcome) => {
      return apiRequest("/api/dashboard/log-call", {
        method: "POST",
        body: JSON.stringify(outcome),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/enhanced"] });
      
      // Mark this candidate as completed
      setCompletedCandidateIds(prev => new Set(Array.from(prev).concat(variables.candidateId)));
      
      // Clear the outcome and notes for this candidate
      setCallOutcomes(prev => {
        const updated = { ...prev };
        delete updated[variables.candidateId];
        return updated;
      });
      setShowNotes(prev => {
        const updated = { ...prev };
        delete updated[variables.candidateId];
        return updated;
      });
      
      toast({
        title: "Call logged",
        description: "Call outcome recorded successfully",
      });
      
      // Auto-expand next uncompleted candidate
      const currentIndex = candidates.findIndex(c => c.id === variables.candidateId);
      const nextCandidate = candidates.slice(currentIndex + 1).find(c => !completedCandidateIds.has(c.id));
      if (nextCandidate) {
        setExpandedCandidateId(nextCandidate.id);
      } else if (completedCandidateIds.size + 1 === candidates.length) {
        toast({
          title: "Call round complete!",
          description: `You've contacted all ${candidates.length} candidates in this round`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log call",
        variant: "destructive",
      });
    },
  });

  const handleOutcome = (candidateId: number, outcome: CallOutcome["outcome"]) => {
    setCallOutcomes(prev => ({ 
      ...prev, 
      [candidateId]: { ...prev[candidateId], outcome, candidateId } 
    }));
    
    if (outcome === "answered" || outcome === "callback") {
      setShowNotes(prev => ({ ...prev, [candidateId]: true }));
    } else {
      // For quick outcomes, log immediately
      logCallMutation.mutate({
        candidateId,
        outcome,
        notes: "",
      });
    }
  };

  const handleSaveNotes = (candidateId: number) => {
    const outcome = callOutcomes[candidateId];
    if (outcome?.outcome) {
      logCallMutation.mutate({
        candidateId,
        outcome: outcome.outcome,
        notes: outcome.notes || "",
        followUpDate: outcome.followUpDate,
      });
    }
  };

  const getMatchScoreColor = (score?: number) => {
    if (!score) return "bg-gray-100 text-gray-800 border-gray-200";
    
    if (score >= 70) {
      return "bg-green-100 text-green-800 border-green-200";
    } else if (score >= 40) {
      return "bg-orange-100 text-orange-800 border-orange-200";
    } else {
      return "bg-red-100 text-red-800 border-red-200";
    }
  };

  const toggleCandidate = (candidateId: number) => {
    if (expandedCandidateId === candidateId) {
      setExpandedCandidateId(null);
    } else {
      setExpandedCandidateId(candidateId);
    }
  };

  const renderCandidateCard = (candidate: Candidate, isExpanded: boolean) => {
    const isCompleted = completedCandidateIds.has(candidate.id);
    const outcome = callOutcomes[candidate.id];
    const showNotesForCandidate = showNotes[candidate.id];

    return (
      <div key={candidate.id} className="border rounded-lg bg-card">
        {/* Candidate Header - Always Visible */}
        <div
          onClick={() => toggleCandidate(candidate.id)}
          className={cn(
            "flex items-center justify-between p-3 cursor-pointer transition-colors",
            isExpanded ? "bg-muted/30" : "hover:bg-muted/20",
            isCompleted && "opacity-60"
          )}
        >
          <div className="flex items-center gap-3 flex-1">
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
              isCompleted ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
            )}>
              {isCompleted ? <CheckCircle className="h-4 w-4" /> : candidates.indexOf(candidate) + 1}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{candidate.name}</span>
                {candidate.matchScore && (
                  <Badge className={cn("text-xs", getMatchScoreColor(candidate.matchScore))}>
                    {candidate.matchScore}%
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {candidate.title} at {candidate.company}
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Expanded Card Content */}
        {isExpanded && !isCompleted && (
          <div className="p-4 border-t space-y-4">
            {/* Candidate Details */}
            <div className="flex justify-between items-start">
              <div>
                {candidate.vacancyTitle && (
                  <p className="text-sm text-muted-foreground">
                    For: {candidate.vacancyTitle}
                  </p>
                )}
              </div>
              <div className="text-right space-y-2">
                {candidate.phone && candidate.phone !== 'No phone' ? (
                  <a
                    href={`tel:${candidate.phone}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    <Phone className="h-4 w-4" />
                    {candidate.phone}
                  </a>
                ) : (
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground mb-1">No phone number available</div>
                    {candidate.linkedinUrl && (
                      <a
                        href={candidate.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Contact on LinkedIn
                      </a>
                    )}
                  </div>
                )}
                {candidate.matchScore && (
                  <div className="text-xs text-muted-foreground">
                    Match: {candidate.matchScore}%
                  </div>
                )}
                {candidate.lastContact && (
                  <p className="text-xs text-muted-foreground">
                    Last contact: {candidate.lastContact}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Outcome Buttons */}
            {!showNotesForCandidate && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Log call outcome:</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOutcome(candidate.id, "answered")}
                    className="flex items-center gap-1"
                  >
                    <CheckCircle className="h-4 w-4" />
                    Answered
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOutcome(candidate.id, "voicemail")}
                    className="flex items-center gap-1"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Voicemail
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOutcome(candidate.id, "no_answer")}
                    className="flex items-center gap-1"
                  >
                    <PhoneMissed className="h-4 w-4" />
                    No Answer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOutcome(candidate.id, "callback")}
                    className="flex items-center gap-1"
                  >
                    <Clock className="h-4 w-4" />
                    Callback
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOutcome(candidate.id, "not_interested")}
                    className="flex items-center gap-1"
                  >
                    <XCircle className="h-4 w-4" />
                    Not Interested
                  </Button>
                  {(!candidate.phone || candidate.phone === 'No phone') && candidate.linkedinUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOutcome(candidate.id, "requested_number")}
                      className="flex items-center gap-1 bg-blue-50 hover:bg-blue-100"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Requested Number
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Notes Section */}
            {showNotesForCandidate && (
              <div className="border-t pt-3 space-y-3">
                <div>
                  <label className="text-sm font-medium">Call Notes</label>
                  <Textarea
                    placeholder="Enter call notes..."
                    value={outcome?.notes || ""}
                    onChange={(e) => setCallOutcomes(prev => ({
                      ...prev,
                      [candidate.id]: { ...prev[candidate.id], notes: e.target.value }
                    }))}
                    className="mt-1"
                    rows={3}
                  />
                </div>
                {outcome?.outcome === "callback" && (
                  <div>
                    <label className="text-sm font-medium">Follow-up Date</label>
                    <Input
                      type="datetime-local"
                      value={outcome?.followUpDate || ""}
                      onChange={(e) => setCallOutcomes(prev => ({
                        ...prev,
                        [candidate.id]: { ...prev[candidate.id], followUpDate: e.target.value }
                      }))}
                      className="mt-1"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={() => handleSaveNotes(candidate.id)} disabled={logCallMutation.isPending}>
                    Save & Continue
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowNotes(prev => ({ ...prev, [candidate.id]: false }));
                      setCallOutcomes(prev => {
                        const updated = { ...prev };
                        delete updated[candidate.id];
                        return updated;
                      });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed State */}
        {isExpanded && isCompleted && (
          <div className="p-4 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>Call logged for this candidate</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (candidates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Call Round Manager</CardTitle>
          <CardDescription>No candidates in your call list</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No candidates to call at this time. Check back later or refresh your list.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Call Round Manager</CardTitle>
            <CardDescription>
              Contact candidates efficiently with quick logging
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {completedCount}/{candidates.length}
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(progress)}% complete
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {candidates.map((candidate) => 
            renderCandidateCard(candidate, expandedCandidateId === candidate.id)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

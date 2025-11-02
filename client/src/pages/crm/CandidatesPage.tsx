import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import {
  Card, CardContent, CardHeader
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, MoreHorizontal, Filter, Users, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, RefreshCw, Briefcase, Edit2, Check, X, FileText, Phone, Video, Mail, MessageSquare, Trash2, Calendar, User, Building2, Eye, FileUp, Loader2, History, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Candidate, InsertCandidate, Vacancy, CandidateNote } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { UploadResult } from "@uppy/core";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/api-config";

// Define form input type for easier form handling
type CandidateInput = Omit<InsertCandidate, "skills"> & { 
  skills: string;
};

// Define sync metadata type
interface SyncMetadata {
  id: number;
  syncType: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  vtigerTotal?: number;
  fetchedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  errorCount?: number;
  errorMessage?: string;
  lastProcessedContactId?: string;
}

// Helper function to get contact method icon
const getContactMethodIcon = (method: string) => {
  switch (method) {
    case 'Phone': return <Phone className="h-4 w-4" />;
    case 'Videocall': return <Video className="h-4 w-4" />;
    case 'Email': return <Mail className="h-4 w-4" />;
    case 'Text': return <MessageSquare className="h-4 w-4" />;
    default: return <Phone className="h-4 w-4" />;
  }
};

// Helper function to format date
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Helper function to format last sync time
const formatLastSyncTime = (lastSyncTime: string | null) => {
  if (!lastSyncTime) return "No sync performed yet";
  
  const syncDate = new Date(lastSyncTime);
  const now = new Date();
  const diffMs = now.getTime() - syncDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return "Last sync: just now";
  if (diffMinutes < 60) return `Last sync: ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `Last sync: ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return "Last sync: yesterday";
  if (diffDays < 7) return `Last sync: ${diffDays} days ago`;
  
  return `Last sync: ${syncDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
};

// DIRECT SIMPLE NOTES COMPONENT - USING AUTH-SAFE API WRAPPER
const DirectNotesDisplay = ({ candidateId }: { candidateId: number }) => {
  const { data: notes, isLoading: loading, error } = useQuery<CandidateNote[]>({
    queryKey: ['candidate-notes', candidateId],
    queryFn: () => apiGet(`/api/candidates/${candidateId}/notes`),
    enabled: true,
    staleTime: 5000,
  });

  console.log(`💥 DirectNotesDisplay: Query result for candidate ${candidateId}:`, { 
    loading, 
    error: error?.message, 
    notesCount: notes?.length,
    notes
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="text-sm text-gray-500">Loading notes...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-red-500">
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <div className="text-gray-400 mb-2">📄</div>
        <div className="text-sm">No notes yet</div>
        <div className="text-xs">Add a note to track your communication with this candidate</div>
      </div>
    );
  }

  // Sort notes chronologically using contact date for contact notes and created date for internal notes
  const sortedNotes = [...notes].sort((a, b) => {
    const getDateForSorting = (note: any) => {
      if (note.contactMethod === "Internal") {
        return new Date(note.createdAt);
      } else {
        return new Date(note.contactDate);
      }
    };
    
    return getDateForSorting(b).getTime() - getDateForSorting(a).getTime(); // Most recent first
  });

  return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-green-600">
        Found {notes.length} notes for candidate {candidateId}
      </div>
      {sortedNotes.map((note: any) => (
        <div key={note.id} className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {note.contactMethod === "Internal" ? (
                <span>Internal</span>
              ) : (
                <>
                  <span>
                    {note.contactMethod === "Phone" && "📞"}
                    {note.contactMethod === "Videocall" && "📹"}
                    {note.contactMethod === "Email" && "📧"}
                    {note.contactMethod === "Text" && "💬"}
                    {note.contactMethod}
                  </span>
                  <span>•</span>
                  <span>{formatDate(note.contactDate)}</span>
                </>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{note.content}</p>
          <div className="text-xs text-gray-400 mt-2">
            Added {formatDate(note.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
};

// Component for displaying candidate notes list
interface CandidateNotesListProps {
  candidateId: number;
  deleteNoteMutation: any; // Simplified type to avoid TypeScript conflicts
}

const CandidateNotesList: React.FC<CandidateNotesListProps> = ({ 
  candidateId, 
  deleteNoteMutation
}) => {
  console.log(`🟢 CandidateNotesList rendering for candidate ${candidateId}`);
  
  const { data: notes, isLoading, error, refetch } = useQuery<CandidateNote[]>({
    queryKey: ['candidate-notes', candidateId],
    queryFn: () => apiGet(`/api/candidates/${candidateId}/notes`),
    enabled: true,
    retry: 1,
    staleTime: 0
  });

  console.log(`🔍 Query result for ${candidateId}:`, { 
    isLoading, 
    error: error?.message, 
    notesCount: notes?.length,
    notes
  });

  // Force manual fetch to test
  React.useEffect(() => {
    console.log(`🚀 Manual fetch attempt for candidate ${candidateId}`);
    fetch(`/api/candidates/${candidateId}/notes`, {
      credentials: 'include'
    })
    .then(res => res.json())
    .then(data => console.log(`✅ Manual fetch result for ${candidateId}:`, data))
    .catch(err => console.log(`❌ Manual fetch error for ${candidateId}:`, err));
  }, [candidateId]);

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading notes...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-500">Error loading notes</div>;
  }

  // Filter out empty notes - only show notes with actual content
  const validNotes = notes?.filter(note => 
    note?.content && 
    note.content.trim().length > 0 &&
    note.content !== 'No content'
  ) || [];

  if (validNotes.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p>No notes yet</p>
        <p className="text-xs">Add a note to track your communication with this candidate</p>
      </div>
    );
  }

  // Sort notes chronologically using contact date for contact notes and created date for internal notes
  const sortedValidNotes = [...validNotes].sort((a, b) => {
    const getDateForSorting = (note: any) => {
      if (note.contactMethod === "Internal") {
        return new Date(note.createdAt);
      } else {
        return new Date(note.contactDate);
      }
    };
    
    return getDateForSorting(b).getTime() - getDateForSorting(a).getTime(); // Most recent first
  });

  return (
    <div className="space-y-3">
      {sortedValidNotes.map((note) => (
        <div 
          key={note.id} 
          className="p-3 bg-gray-50 rounded-lg border-l-4 border-l-blue-400"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {note.contactMethod === "Internal" ? (
                <span className="font-medium">Internal</span>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    {getContactMethodIcon(note.contactMethod)}
                    <span className="font-medium">{note.contactMethod}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>{note.contactDate ? formatDate(note.contactDate.toString()) : 'No date'}</span>
                  </div>
                </>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm('Are you sure you want to delete this note?')) {
                  deleteNoteMutation.mutate({ id: note.id, candidateId });
                }
              }}
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
            {note.content || 'No content'}
          </p>
          <div className="mt-2 text-xs text-gray-400">
            Added {note.createdAt ? formatDate(note.createdAt.toString()) : 'Unknown date'}
          </div>
        </div>
      ))}
    </div>
  );
};

// Sync History Viewer Component
const SyncHistoryViewer = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { data: syncHistory, isLoading } = useQuery({
    queryKey: ["/api/sync-metadata"],
    queryFn: async () => {
      const response = await fetch(getApiUrl("/api/sync-metadata?limit=20"));
      if (!response.ok) throw new Error("Failed to fetch sync history");
      return response.json();
    },
    enabled: isOpen,
    staleTime: 30000, // Cache for 30 seconds
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "running":
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-5 w-5 p-0 ml-1 hover:bg-transparent"
          title="View sync history"
        >
          <History className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Sync History
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : syncHistory && syncHistory.length > 0 ? (
            <div className="space-y-3">
              {syncHistory.map((sync: any) => (
                <div 
                  key={sync.id} 
                  className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(sync.status)}
                      <span className="font-medium text-sm">
                        {sync.status === "completed" ? "Completed" : 
                         sync.status === "running" ? "Running" : 
                         sync.status === "failed" ? "Failed" : sync.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatLastSyncTime(sync.startedAt)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Duration: {formatDuration(sync.startedAt, sync.completedAt)}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    {sync.vtigerTotal > 0 && (
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-medium">{sync.vtigerTotal.toLocaleString()}</span>
                      </div>
                    )}
                    {sync.createdCount > 0 && (
                      <div>
                        <span className="text-muted-foreground">Created: </span>
                        <span className="font-medium text-green-600">{sync.createdCount.toLocaleString()}</span>
                      </div>
                    )}
                    {sync.updatedCount > 0 && (
                      <div>
                        <span className="text-muted-foreground">Updated: </span>
                        <span className="font-medium text-blue-600">{sync.updatedCount.toLocaleString()}</span>
                      </div>
                    )}
                    {sync.errorCount > 0 && (
                      <div>
                        <span className="text-muted-foreground">Errors: </span>
                        <span className="font-medium text-red-600">{sync.errorCount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  
                  {sync.errorMessage && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/30 rounded text-xs text-red-600 dark:text-red-400">
                      {sync.errorMessage}
                    </div>
                  )}
                  
                  {sync.lastProcessedContactId && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last processed: {sync.lastProcessedContactId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No sync history available
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function CandidatesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [searchTerm, setSearchTerm] = useState("");
  // REMOVED: showAddForm - candidate creation disabled (VTiger-only platform)
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [currentTab, setCurrentTab] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [editingExpanded, setEditingExpanded] = useState<Set<number>>(new Set());
  const [viewingCV, setViewingCV] = useState<{ url: string; candidateName: string } | null>(null);
  const [uploadingCV, setUploadingCV] = useState<{[candidateId: number]: boolean}>({});
  const [expandedFormData, setExpandedFormData] = useState<{[key: number]: any}>({});
  const [inlineEditing, setInlineEditing] = useState<{[candidateId: number]: {[field: string]: boolean}}>({});
  const [inlineValues, setInlineValues] = useState<{[candidateId: number]: {[field: string]: any}}>({});
  const [showAddNoteForm, setShowAddNoteForm] = useState<{[candidateId: number]: boolean}>({});
  const [newNoteForm, setNewNoteForm] = useState<{[candidateId: number]: { content: string; contactDate: string; contactMethod: string; hasBeenContacted: boolean }}>({});
  
  // Sorting state
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  // Clear notes cache on component mount to prevent stale data
  React.useEffect(() => {
    // Clear any cached notes data that might be stale
    queryClient.removeQueries({ queryKey: ["/api/candidates"], predicate: (query) => 
      query.queryKey.length === 3 && query.queryKey[2] === "notes"
    });
  }, [queryClient]);

  const { data: candidates, isLoading, error } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
    staleTime: 0, // Force fresh data
    refetchOnMount: true, // Always refetch when component mounts
  });

  // Auto-search and expand candidate when URL parameters are present
  React.useEffect(() => {
    const urlParams = new URLSearchParams(search);
    const searchParam = urlParams.get('search');
    const editParam = urlParams.get('edit');
    
    // Set search term from URL parameter
    if (searchParam && searchParam !== searchTerm) {
      console.log('🔍 Setting search term from URL:', searchParam);
      setSearchTerm(searchParam);
      setCurrentPage(1); // Reset to first page when searching
      setCurrentTab("all"); // Show all candidates
    }
    
    // Auto-expand candidate row when edit parameter is present
    if (editParam && candidates) {
      const candidateId = parseInt(editParam);
      console.log('🔍 Auto-expand effect running:', { candidateId, candidatesCount: candidates?.length });
      
      if (!isNaN(candidateId)) {
        // Small delay to ensure search has filtered the results
        setTimeout(() => {
          const candidateExists = candidates.some(c => c.id === candidateId);
          console.log('🔍 Candidate exists:', candidateExists);
          
          if (candidateExists) {
            console.log('🔍 Expanding candidate row:', candidateId);
            setExpandedRows(prev => {
              const newSet = new Set(prev);
              newSet.add(candidateId);
              console.log('🔍 New expanded rows:', Array.from(newSet));
              return newSet;
            });

            // Scroll to the candidate after a brief delay
            setTimeout(() => {
              const candidateElement = document.querySelector(`[data-candidate-id="${candidateId}"]`);
              if (candidateElement) {
                candidateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                console.log('🔍 Scrolled to candidate:', candidateId);
              }
            }, 200);
          }
        }, 100);
      }
    }
  }, [search, candidates, searchTerm]);

  // Hook to fetch all available vacancies for assignment
  const { data: vacancies } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
    staleTime: 30000, // Cache for 30 seconds
  });

  // No longer using a function - we'll create the query directly in the component

  // Mutations for candidate notes
  const createNoteMutation = useMutation({
    mutationFn: async (data: { candidateId: number; content: string; contactDate: string; contactMethod: string }) => {
      const payload = {
        content: data.content,
        contactDate: data.contactDate,
        contactMethod: data.contactMethod,
      };
      
      console.log("🔍 [FRONTEND DEBUG] Sending note data:", {
        candidateId: data.candidateId,
        payload: payload
      });
      
      const result = await apiPost(`/api/candidates/${data.candidateId}/notes`, payload);
      console.log("✅ [FRONTEND DEBUG] Note created successfully:", result);
      return result;
    },
    onSuccess: async (_, variables) => {
      // Force immediate refetch instead of just invalidating
      await queryClient.invalidateQueries({ queryKey: ['candidate-notes', variables.candidateId] });
      // Reset form
      setNewNoteForm(prev => ({ ...prev, [variables.candidateId]: { content: "", contactDate: "", contactMethod: "Phone", hasBeenContacted: false } }));
      setShowAddNoteForm(prev => ({ ...prev, [variables.candidateId]: false }));
      toast({ title: "Note added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    }
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (data: { id: number; candidateId: number; content?: string; contactDate?: string; contactMethod?: string }) => {
      return await apiPut(`/api/candidate-notes/${data.id}`, {
        content: data.content,
        contactDate: data.contactDate,
        contactMethod: data.contactMethod,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-notes', variables.candidateId] });
      toast({ title: "Note updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update note", variant: "destructive" });
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (data: { id: number; candidateId: number }) => {
      await apiDelete(`/api/candidate-notes/${data.id}`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-notes', data.candidateId] });
      toast({ title: "Note deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete note", variant: "destructive" });
    }
  });

  // Hook to fetch sync status for last sync timestamp
  const { data: syncStatus } = useQuery({
    queryKey: ["/api/sync/vtiger/status"],
    queryFn: () => apiGet("/api/sync/vtiger/status"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Hook to fetch latest sync metadata with detailed tracking
  // Refresh more frequently when sync is running
  const { data: syncMetadata } = useQuery<SyncMetadata>({
    queryKey: ["/api/sync-metadata/latest"],
    queryFn: () => apiGet("/api/sync-metadata/latest"),
    refetchInterval: (query) => {
      // Poll every 1 second when sync is running, otherwise every 30 seconds
      return query.state.data?.status === "running" ? 1000 : 30000;
    },
  });

  // Hook to fetch all candidate vacancy assignments - always fetch for visible candidates
  const { data: candidateVacancies } = useQuery<Record<number, Array<{vacancy: Vacancy; status: string; assignedAt: string}>>>({
    queryKey: ["/api/candidates/vacancy-assignments", searchTerm, currentTab, currentPage],
    queryFn: async () => {
      if (!candidates?.length) return {};
      
      const assignments: Record<number, Array<{vacancy: Vacancy; status: string; assignedAt: string}>> = {};
      
      // Always fetch for currently visible candidates (regardless of search)
      const currentData = getCandidatesForTab(currentTab);
      const startIdx = (currentPage - 1) * itemsPerPage;
      const visibleCandidates = currentData.slice(startIdx, startIdx + itemsPerPage);
      
      // Fetch assignments for all visible candidates
      const promises = visibleCandidates.map(async (candidate) => {
        try {
          const response = await fetch(`/api/candidates/${candidate.id}/vacancy-assignments`);
          if (response.ok) {
            const data = await response.json();
            assignments[candidate.id] = data;
          }
        } catch (error) {
          console.error(`Failed to fetch assignments for candidate ${candidate.id}:`, error);
        }
      });
      
      await Promise.all(promises);
      return assignments;
    },
    enabled: !!candidates?.length, // Only run when candidates are loaded
    staleTime: 5000, // Shorter cache for more real-time updates
  });

  

  // Query REAL-TIME extraction status (much faster updates)
  const { data: extractionStatusResponse, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/vtiger/extraction-status"],
    refetchInterval: 2000, // Poll every 2 seconds for real-time updates
    staleTime: 0, // Always fresh data - no caching
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });

  // Transform API response to expected format with LIVE status tracking
  const extractionProgress = extractionStatusResponse?.success ? {
    isRunning: extractionStatusResponse.status?.isRunning,
    percentComplete: extractionStatusResponse.status?.progressPercentage,
    processedCandidates: extractionStatusResponse.status?.processedCandidates,
    totalCandidates: extractionStatusResponse.status?.totalCandidates,
    currentBatch: extractionStatusResponse.status?.currentBatch,
    totalBatches: extractionStatusResponse.status?.totalBatches,
    rate: extractionStatusResponse.status?.rate,
    estimatedCompletion: extractionStatusResponse.status?.estimatedCompletion,
    fieldCoverage: {
      profileSummary: extractionStatusResponse.status?.fieldCoverage?.profileSummaries,
      titleDescription: extractionStatusResponse.status?.fieldCoverage?.titleDescriptions,
      linkedinUrl: extractionStatusResponse.status?.fieldCoverage?.linkedinUrls,
      profilePercentage: extractionStatusResponse.status?.fieldCoverage?.profilePercentage,
      titlePercentage: extractionStatusResponse.status?.fieldCoverage?.titlePercentage,
      linkedinPercentage: extractionStatusResponse.status?.fieldCoverage?.linkedinPercentage
    }
  } : null;

  // Debug: Log status to console when sync button is clicked
  React.useEffect(() => {
    if (extractionStatusResponse) {
      console.log('🔍 Extraction Status Response:', extractionStatusResponse);
      console.log('🔍 Is Running?', extractionStatusResponse.status?.isRunning);
    }
  }, [extractionStatusResponse]);





  // REMOVED: newCandidate state - candidate creation disabled (VTiger-only platform)

  // REMOVED: createCandidate mutation - candidate creation disabled (VTiger-only platform)

    // UPDATE mutation
    const updateCandidate = useMutation({
      mutationFn: async ({ id, formData }: { id: string, formData: CandidateInput }) => {
        const skillsArray = formData.skills.split(",").map(s => s.trim()).filter(Boolean);
        const res = await fetch(`/api/candidates/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...formData, skills: skillsArray }),
        });
        if (!res.ok) throw new Error("Failed to update candidate");
        return res.json() as Promise<Candidate>;
      },
      onSuccess: async (updated) => {
        // Sync to Vtiger
        await fetch(getApiUrl("/api/sync/vtiger/update-candidate"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: updated.id }),
        });

        queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
        setEditingCandidate(null);
      }
    });

    const handleEditClick = (candidate: Candidate) => {
      setEditingCandidate(candidate);
      // REMOVED: setShowAddForm - candidate creation disabled
    };

    // Handler to save edits
    const handleEditSave = () => {
      if (editingCandidate) {
        updateCandidate.mutate({
          id: editingCandidate.id.toString(),
          formData: {
            ...editingCandidate,
            skills: editingCandidate.skills?.join(", ") || ""
          }
        });
      }
    };

    // Handler to update edit form fields
  const handleEditFieldChange = (field: keyof Candidate, value: any) => {
    if (editingCandidate) {
      setEditingCandidate({
        ...editingCandidate,
        [field]: value
      });
    }
  };



  const filteredCandidates = candidates?.filter(candidate => {
    if (!searchTerm) return true; // Show all if no search term
    
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Split search term into individual words for better matching
    const searchWords = searchLower.split(/\s+/).filter(word => word.length > 0);
    
    // Create full name for name-based searching - ONLY search in names
    const fullName = `${candidate.firstName || ""} ${candidate.lastName || ""}`.toLowerCase().trim();
    
    // For multi-word searches, check if all words appear in the full name
    if (searchWords.length >= 2) {
      // Check if all search words are found in the full name
      return searchWords.every(word => fullName.includes(word));
    }
    
    // For single word searches, check if it appears in first name or last name
    const word = searchWords[0];
    return fullName.includes(word);
  }) || [];

  // Sorting helper functions
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortCandidates = (candidates: Candidate[]) => {
    if (!sortField) return candidates;

    return [...candidates].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "name":
          aValue = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase().trim();
          bValue = `${b.firstName || ""} ${b.lastName || ""}`.toLowerCase().trim();
          break;
        case "title":
          aValue = (a.currentTitle || a.jobTitle || "").toLowerCase();
          bValue = (b.currentTitle || b.jobTitle || "").toLowerCase();
          break;
        case "location":
          aValue = (a.location || "").toLowerCase();
          bValue = (b.location || "").toLowerCase();
          break;
        case "experience":
          aValue = a.experience || 0;
          bValue = b.experience || 0;
          break;
        case "status":
          aValue = (a.status || "").toLowerCase();
          bValue = (b.status || "").toLowerCase();
          break;
        default:
          return 0;
      }

      // Handle numeric sorting
      if (sortField === "experience") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      // Handle string sorting (case-insensitive)
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  // Helper function to get candidates for a specific tab with consistent sorting
  const getCandidatesForTab = (tab: string) => {
    let tabCandidates;
    
    if (tab === "all") {
      tabCandidates = filteredCandidates;
    } else if (tab === "interviews") {
      tabCandidates = filteredCandidates.filter(c => c.status?.includes("Interview"));
    } else if (tab === "rejected") {
      tabCandidates = filteredCandidates.filter(c => c.status?.includes("Rejected"));
    } else if (tab === "blacklist") {
      tabCandidates = filteredCandidates.filter(c => c.status === "Blacklist");
    } else if (tab === "Not Contacted") {
      // Handle both "Not Contacted" and "Uncontacted" status variations
      tabCandidates = filteredCandidates.filter(c => c.status === "Not Contacted" || c.status === "Uncontacted");
    } else {
      tabCandidates = filteredCandidates.filter(c => c.status === tab);
    }
    
    // Apply sorting if a sort field is selected, otherwise maintain stable positioning by ID
    if (sortField) {
      return sortCandidates(tabCandidates);
    } else {
      // Sort candidates consistently by ID to maintain stable positioning
      // This ensures candidates don't move around in the list after updates
      return tabCandidates.sort((a, b) => a.id - b.id);
    }
  };

  // Reset to first page when search changes or items per page changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  // Candidate status options for the recruitment pipeline
  const candidateStatuses = [
    "Not Contacted",
    "Contacted",
    "First Screening",
    "Introduced",
    "Had 1st Interview",
    "Had 2nd Interview",
    "Had 3rd Interview",
    "Had 4th Interview",
    "Contracting",
    "Placed",
    "Rejected (Client)",
    "Rejected (JO)",
    "Blacklist"
  ];

  // Handle status updates
  const handleStatusUpdate = async (candidateId: number, newStatus: string, onSuccess?: () => void) => {
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (!response.ok) throw new Error("Failed to update status");
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Status update error:', error);
      throw error;
    }
  };

  // Helper functions for expandable rows - only one row can be expanded at a time
  const toggleRowExpansion = (candidateId: number) => {
    setExpandedRows(prev => {
      const newSet = new Set<number>();
      if (prev.has(candidateId)) {
        // Close this row - clear all
        setEditingExpanded(new Set());
      } else {
        // Open only this row - close all others
        newSet.add(candidateId);
        setEditingExpanded(new Set()); // Close any editing mode
      }
      return newSet;
    });
  };

  // Inline editing helper functions
  const startInlineEdit = (candidateId: number, field: string, currentValue: any) => {
    setInlineEditing(prev => ({
      ...prev,
      [candidateId]: { ...prev[candidateId], [field]: true }
    }));
    setInlineValues(prev => ({
      ...prev,
      [candidateId]: { ...prev[candidateId], [field]: currentValue }
    }));
  };

  const cancelInlineEdit = (candidateId: number, field: string) => {
    setInlineEditing(prev => ({
      ...prev,
      [candidateId]: { ...prev[candidateId], [field]: false }
    }));
    setInlineValues(prev => {
      const newValues = { ...prev };
      if (newValues[candidateId]) {
        delete newValues[candidateId][field];
      }
      return newValues;
    });
  };

  const saveInlineEdit = async (candidateId: number, field: string, candidate: Candidate) => {
    let formData: any = {
      ...candidate,
      skills: candidate.skills?.join(", ") || "",
    };

    if (field === 'salaryRange') {
      // Handle salary range as a special case with multiple fields
      const values = inlineValues[candidateId];
      formData.salaryCurrency = values?.salaryCurrency || candidate.salaryCurrency;
      formData.salaryRangeMin = values?.salaryRangeMin;
      formData.salaryRangeMax = values?.salaryRangeMax;
    } else {
      // Handle single field updates
      const newValue = inlineValues[candidateId]?.[field];
      formData[field] = newValue;
    }
    
    try {
      await updateCandidate.mutateAsync({
        id: candidateId.toString(),
        formData
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
      toast({
        title: "Success",
        description: field === 'salaryRange' ? 'Updated salary range successfully' : `Updated ${field} successfully`
      });
      
      // Exit inline edit mode
      setInlineEditing(prev => ({
        ...prev,
        [candidateId]: { ...prev[candidateId], [field]: false }
      }));
      setInlineValues(prev => {
        const newValues = { ...prev };
        if (newValues[candidateId]) {
          if (field === 'salaryRange') {
            delete newValues[candidateId].salaryCurrency;
            delete newValues[candidateId].salaryRangeMin;
            delete newValues[candidateId].salaryRangeMax;
          } else {
            delete newValues[candidateId][field];
          }
        }
        return newValues;
      });
    } catch (error) {
      console.error('Error updating field:', error);
      toast({
        title: "Error",
        description: field === 'salaryRange' ? 'Failed to update salary range' : `Failed to update ${field}`,
        variant: "destructive"
      });
    }
  };

  const toggleEditExpanded = (candidateId: number, candidate: any) => {
    setEditingExpanded(prev => {
      const newSet = new Set(prev);
      if (newSet.has(candidateId)) {
        newSet.delete(candidateId);
      } else {
        newSet.add(candidateId);
        setExpandedFormData(prevData => ({
          ...prevData,
          [candidateId]: {
            email: candidate.email || '',
            phone: (candidate as any).phone || '',
            salaryRangeMin: (candidate as any).salaryRangeMin?.toString() || '',
            salaryRangeMax: (candidate as any).salaryRangeMax?.toString() || '',
            salaryCurrency: (candidate as any).salaryCurrency || 'EUR',
            notes: candidate.notes && candidate.notes !== 'Imported from Vtiger CRM' ? candidate.notes : ''
          }
        }));
      }
      return newSet;
    });
  };

  const handleExpandedFieldChange = (candidateId: number, field: string, value: any) => {
    setExpandedFormData(prev => ({
      ...prev,
      [candidateId]: {
        ...prev[candidateId],
        [field]: value
      }
    }));
  };

  const saveExpandedChanges = async (candidateId: number, candidate: any) => {
    const formData = expandedFormData[candidateId];
    if (!formData) return;

    try {
      await updateCandidate.mutateAsync({
        id: candidateId.toString(),
        formData: {
          ...formData,
          salaryRangeMin: formData.salaryRangeMin ? parseInt(formData.salaryRangeMin) : null,
          salaryRangeMax: formData.salaryRangeMax ? parseInt(formData.salaryRangeMax) : null,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          skills: candidate.skills?.join(", ") || "",
          status: candidate.status
        }
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
      toast({
        title: "Success",
        description: "Candidate information updated successfully"
      });
      
      setEditingExpanded(prev => {
        const newSet = new Set(prev);
        newSet.delete(candidateId);
        return newSet;
      });
    } catch (error) {
      console.error('Error updating candidate:', error);
      toast({
        title: "Error",
        description: "Failed to update candidate information",
        variant: "destructive"
      });
    }
  };

  const renderCustomTableRows = (data: Candidate[] | undefined) => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center py-8">
          <div className="flex flex-col items-center space-y-3">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div className="text-muted-foreground">
              {searchTerm ? (
                <p>No candidates match your search criteria.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium">No candidates found in your CRM</p>
                  <p className="text-sm">Add candidates to Vtiger to see them here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return data.map((candidate: any, index) => (
      <div 
        key={candidate.id} 
        data-candidate-id={candidate.id}
        className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/50 transition-all duration-200 ${expandedRows.has(candidate.id) ? 'shadow-inner bg-blue-50/30' : ''}`}
      >
        <div 
          className="grid grid-cols-8 gap-6 px-6 py-5 cursor-pointer border-b border-gray-100 items-center"
          onClick={() => toggleRowExpansion(candidate.id)}
        >
          <div className="flex flex-col self-start">
            <div className="font-semibold text-gray-900 text-sm">
              {candidate.firstName} {candidate.lastName}
            </div>
            {candidate.email && (
              <div className="text-xs text-gray-500 break-words">
                {candidate.email}
              </div>
            )}
          </div>
          <div className="flex flex-col self-start">
            <div className="text-sm font-medium text-gray-900 break-words">
              {candidate.jobTitle || candidate.currentTitle || '—'}
            </div>
            {candidate.titleDescription && (
              <div className="text-xs text-gray-500 break-words">
                {candidate.titleDescription}
              </div>
            )}
          </div>
          <div className="flex flex-col self-start">
            <div className="text-sm font-medium text-gray-900 break-words">
              {candidate.company || '—'}
            </div>
            {candidate.companyLocation && (
              <div className="text-xs text-gray-500 break-words">
                {candidate.companyLocation}
              </div>
            )}
          </div>
          <div className="flex items-start self-start text-sm text-gray-600 break-words">
            {candidate.location || '—'}
          </div>
          <div 
            className="flex flex-col gap-1 self-start"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className={`text-left text-xs px-2 py-1 rounded border cursor-pointer hover:shadow-sm transition-all min-w-[120px] ${
                    candidateVacancies?.[candidate.id]?.length > 0 
                      ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {candidateVacancies?.[candidate.id]?.length > 0 ? (
                    <div>
                      <div className="font-medium truncate" title={candidateVacancies[candidate.id][0].vacancy.title}>
                        {candidateVacancies[candidate.id][0].vacancy.title}
                      </div>
                      {candidateVacancies[candidate.id].length > 1 && (
                        <div className="text-[10px] opacity-75">
                          +{candidateVacancies[candidate.id].length - 1} more
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="font-medium">None selected</div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                {candidateVacancies?.[candidate.id]?.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-medium text-gray-500 border-b">Current Assignments</div>
                    {candidateVacancies[candidate.id].map((assignment, idx) => (
                      <DropdownMenuItem
                        key={`current-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          // Do nothing - just prevent event bubbling
                        }}
                        className="flex items-center justify-between"
                      >
                        <div className="flex-1">
                          <div className="font-medium truncate">{assignment.vacancy.title}</div>
                          <div className="text-xs text-muted-foreground">{assignment.status}</div>
                        </div>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              // Use batch endpoint for instant removal
                              const response = await fetch(getApiUrl('/api/batch/vacancy-assignments'), {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ 
                                  candidateIds: [candidate.id],
                                  vacancyId: assignment.vacancy.id
                                })
                              });
                              
                              if (!response.ok) throw new Error('Failed to remove assignment');
                              
                              // Refresh both vacancy assignments and candidate statuses for bidirectional sync
                              queryClient.invalidateQueries({ queryKey: ['/api/candidates/vacancy-assignments'] });
                              queryClient.invalidateQueries({ queryKey: [`/api/candidate-statuses/${assignment.vacancy.id}`] });
                              toast({
                                title: "Success",
                                description: `Removed ${candidate.firstName} ${candidate.lastName} from ${assignment.vacancy.title}`,
                              });
                            } catch (error) {
                              console.error('Failed to remove assignment:', error);
                              toast({
                                title: "Error",
                                description: "Failed to remove assignment. Please try again.",
                                variant: "destructive",
                              });
                            }
                          }}
                          className="text-red-500 hover:text-red-700 text-xs ml-2"
                        >
                          ×
                        </button>
                      </DropdownMenuItem>
                    ))}
                    <div className="px-2 py-1 text-xs font-medium text-gray-500 border-b border-t">Available Vacancies</div>
                  </>
                )}
                {vacancies?.filter(vacancy => 
                  !candidateVacancies?.[candidate.id]?.some(assignment => assignment.vacancy.id === vacancy.id)
                ).map(vacancy => (
                  <DropdownMenuItem
                    key={vacancy.id}
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        // Use batch endpoint for instant assignment
                        const response = await fetch(getApiUrl('/api/batch/vacancy-assignments'), {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            candidateIds: [candidate.id],
                            vacancyId: vacancy.id,
                            status: 'assigned'
                          })
                        });
                        
                        if (!response.ok) throw new Error('Failed to assign vacancy');
                        
                        // Refresh both vacancy assignments and candidate statuses for bidirectional sync
                        queryClient.invalidateQueries({ queryKey: ['/api/candidates/vacancy-assignments'] });
                        queryClient.invalidateQueries({ queryKey: [`/api/candidate-statuses/${vacancy.id}`] });
                        toast({
                          title: "Success",
                          description: `Assigned ${candidate.firstName} ${candidate.lastName} to ${vacancy.title}`,
                        });
                      } catch (error) {
                        console.error('Failed to assign vacancy:', error);
                        toast({
                          title: "Error",
                          description: "Failed to assign vacancy. Please try again.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    <div>
                      <div className="font-medium">{vacancy.title}</div>
                      <div className="text-xs text-muted-foreground">{vacancy.company}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
                {(!vacancies || vacancies.length === 0) && (
                  <DropdownMenuItem disabled>
                    No vacancies available
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-start self-start text-sm text-gray-600 break-words">
            {candidate.durationCurrentRole || '—'}
          </div>
          <div className="flex flex-col self-start">
            <div className="text-sm text-gray-900 break-words">
              {candidate.pastEmployer || '—'}
            </div>
            {candidate.pastRoleTitle && (
              <div className="text-xs text-gray-500 break-words">
                {candidate.pastRoleTitle}
              </div>
            )}
          </div>
          <div className="flex justify-center items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className={`
                    inline-flex items-center justify-center min-w-[80px] h-6 px-2 rounded text-xs font-medium cursor-pointer transition-all duration-200 hover:shadow-sm border
                    ${candidate.status === 'Placed' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : ''}
                    ${candidate.status === 'Contracting' ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : ''}
                    ${candidate.status?.includes('Rejected') ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' : ''}
                    ${candidate.status === 'Blacklist' ? 'bg-black text-white border-gray-800 hover:bg-gray-800' : ''}
                    ${candidate.status?.includes('Interview') ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' : ''}
                    ${candidate.status === 'First Screening' || candidate.status === 'Introduced' ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : ''}
                    ${!['Placed', 'Contracting', 'First Screening', 'Introduced', 'Blacklist'].includes(candidate.status) && !candidate.status?.includes('Rejected') && !candidate.status?.includes('Interview') ? 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100' : ''}
                  `}
                >
                  {candidate.status}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {candidateStatuses.map(status => {
                  const hasVacancyAssignments = candidateVacancies?.[candidate.id]?.length > 0;
                  const isNotContactedStatus = status === "Not Contacted";
                  const canSelectStatus = isNotContactedStatus || hasVacancyAssignments;
                  
                  return (
                    <DropdownMenuItem
                      key={status}
                      onClick={async (e) => {
                        e.stopPropagation();
                        
                        if (!canSelectStatus) {
                          toast({
                            title: "Cannot change status", 
                            description: "Candidates must be assigned to a vacancy before they can have a status other than 'Not Contacted'.",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        try {
                          await handleStatusUpdate(candidate.id, status);
                          queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
                          toast({
                            title: "Success",
                            description: `Status updated to "${status}"`,
                          });
                        } catch (error) {
                          console.error('Failed to update candidate status:', error);
                          toast({
                            title: "Error", 
                            description: "Failed to update status. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                      className={`${candidate.status === status ? "bg-primary/10 font-medium" : ""} ${!canSelectStatus ? "opacity-50 cursor-not-allowed" : ""}`}
                      disabled={!canSelectStatus}
                    >
                      {status}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Beautiful Expanded Content */}
        {expandedRows.has(candidate.id) && (
          <div className="bg-gradient-to-r from-blue-50/50 to-purple-50/50 border-t border-blue-100">
            <div className="px-6 py-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-lg text-gray-900">
                            {candidate.firstName} {candidate.lastName}
                          </h3>
                          <p className="text-sm text-gray-600">{candidate.jobTitle || candidate.currentTitle || 'No title specified'}</p>
                        </div>
                        <div className="flex gap-2">
                          {candidate.cvUrl ? (
                            <>
                              {/* Preview CV Button */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setViewingCV({
                                    url: `/api/candidates/${candidate.id}/cv`,
                                    candidateName: `${candidate.firstName} ${candidate.lastName}`
                                  });
                                }}
                                className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Original CV
                              </Button>
                              
                              {/* Format CV or Formatted CV Button */}
                              {candidate.formattedCvUrl ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setViewingCV({
                                      url: `/api/candidates/${candidate.id}/formatted-cv`,
                                      candidateName: `${candidate.firstName} ${candidate.lastName} (Formatted CV)`
                                    });
                                  }}
                                  className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Formatted CV
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setLocation(`/cv-formatter?candidateId=${candidate.id}&cvUrl=${encodeURIComponent(candidate.cvUrl)}`);
                                  }}
                                  className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  <FileUp className="h-4 w-4 mr-1" />
                                  Format CV
                                </Button>
                              )}
                            </>
                          ) : (
                            /* Upload CV Button */
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={uploadingCV[candidate.id]}
                              onClick={() => {
                                // Create a simple file input
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.pdf,.doc,.docx';
                                input.style.display = 'none';
                                input.onchange = async (e) => {
                                  const file = (e.target as HTMLInputElement).files?.[0];
                                  if (file) {
                                    if (file.size > 10485760) { // 10MB limit
                                      toast({
                                        title: "Error",
                                        description: "File size must be less than 10MB",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    
                                    try {
                                      // Set loading state
                                      setUploadingCV(prev => ({ ...prev, [candidate.id]: true }));
                                      
                                      // Get upload URL
                                      const response = await apiRequest('/api/objects/upload', {
                                        method: 'POST'
                                      });
                                      
                                      // Upload file directly
                                      const uploadResponse = await fetch(response.uploadURL, {
                                        method: 'PUT',
                                        body: file,
                                        headers: {
                                          'Content-Type': file.type,
                                        },
                                      });
                                      
                                      if (uploadResponse.ok) {
                                        // Update candidate with CV URL
                                        const updateResponse = await apiRequest(`/api/candidates/${candidate.id}`, {
                                          method: 'PUT',
                                          body: JSON.stringify({
                                            cvUrl: response.uploadURL
                                          }),
                                          headers: {
                                            'Content-Type': 'application/json'
                                          }
                                        });
                                        
                                        // Refresh the candidates list
                                        await queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
                                        
                                        toast({
                                          title: "Success",
                                          description: "CV uploaded successfully!",
                                        });
                                      } else {
                                        throw new Error('Upload failed');
                                      }
                                    } catch (error) {
                                      console.error('Failed to upload CV:', error);
                                      toast({
                                        title: "Error",
                                        description: "Failed to upload CV. Please try again.",
                                        variant: "destructive",
                                      });
                                    } finally {
                                      // Clear loading state
                                      setUploadingCV(prev => ({ ...prev, [candidate.id]: false }));
                                    }
                                  }
                                  document.body.removeChild(input);
                                };
                                document.body.appendChild(input);
                                input.click();
                              }}
                              className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                              {uploadingCV[candidate.id] ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <FileText className="h-4 w-4 mr-1" />
                              )}
                              {uploadingCV[candidate.id] ? 'Uploading...' : 'Upload CV'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {candidateVacancies?.[candidate.id]?.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-4 w-4 text-blue-600" />
                          <span className="text-sm text-blue-600 font-medium">
                            {candidateVacancies[candidate.id].length} vacancy{candidateVacancies[candidate.id].length > 1 ? 'ies' : ''} assigned
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {candidateVacancies[candidate.id].slice(0, 3).map((assignment, idx) => (
                            <Badge 
                              key={idx}
                              variant="secondary" 
                              className={`text-xs px-2 py-1 ${
                                assignment.status === 'matched' ? 'bg-green-100 text-green-800 border-green-200' :
                                assignment.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                                'bg-blue-100 text-blue-800 border-blue-200'
                              }`}
                            >
                              {assignment.vacancy.title}
                            </Badge>
                          ))}
                          {candidateVacancies[candidate.id].length > 3 && (
                            <Badge variant="outline" className="text-xs px-2 py-1 text-gray-600">
                              +{candidateVacancies[candidate.id].length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Professional Details Card - LEFT */}
                <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                    <Briefcase className="w-4 h-4 text-green-600 mr-2" />
                    Professional Details
                  </h4>
                  <div className="space-y-4 text-sm">
                    <div>
                      <span className="font-semibold text-gray-900 block mb-1">Title Description</span>
                      <span className="text-gray-700">{candidate.titleDescription || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 block mb-1">Industry</span>
                      <span className="text-gray-700">{candidate.branche || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 block mb-1">Company Location</span>
                      <span className="text-gray-700">{candidate.companyLocation || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 block mb-1">Time at Company</span>
                      <span className="text-gray-700">{candidate.durationAtCompany || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 block mb-1">Past Role</span>
                      <span className="text-gray-700">{candidate.pastRoleTitle || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-gray-900 block mb-1">Past Experience</span>
                      <span className="text-gray-700">{candidate.pastExperienceDuration || 'Not provided'}</span>
                    </div>
                    <div className="group">
                      <span className="font-semibold text-gray-900 block mb-1">Salary Range</span>
                      {inlineEditing[candidate.id]?.salaryRange ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Select 
                              value={inlineValues[candidate.id]?.salaryCurrency || candidate.salaryCurrency || 'EUR'}
                              onValueChange={(value) => setInlineValues(prev => ({
                                ...prev,
                                [candidate.id]: { ...prev[candidate.id], salaryCurrency: value }
                              }))}
                            >
                              <SelectTrigger className="w-20 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              value={inlineValues[candidate.id]?.salaryRangeMin || ''}
                              onChange={(e) => setInlineValues(prev => ({
                                ...prev,
                                [candidate.id]: { ...prev[candidate.id], salaryRangeMin: e.target.value ? Number(e.target.value) : undefined }
                              }))}
                              className="flex-1 h-8 text-sm"
                              placeholder="Min"
                            />
                            <span className="text-gray-500">-</span>
                            <Input
                              type="number"
                              value={inlineValues[candidate.id]?.salaryRangeMax || ''}
                              onChange={(e) => setInlineValues(prev => ({
                                ...prev,
                                [candidate.id]: { ...prev[candidate.id], salaryRangeMax: e.target.value ? Number(e.target.value) : undefined }
                              }))}
                              className="flex-1 h-8 text-sm"
                              placeholder="Max"
                            />
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => saveInlineEdit(candidate.id, 'salaryRange', candidate)}
                              className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelInlineEdit(candidate.id, 'salaryRange')}
                              className="h-8 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group-hover:bg-gray-50 p-2 -m-2 rounded">
                          <span className="text-gray-700">
                            {candidate.salaryRangeMin || candidate.salaryRangeMax ? (
                              `${candidate.salaryCurrency || 'EUR'} ${candidate.salaryRangeMin ? candidate.salaryRangeMin.toLocaleString() : '0'} - ${candidate.salaryRangeMax ? candidate.salaryRangeMax.toLocaleString() : '∞'}`
                            ) : 'Not provided'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              startInlineEdit(candidate.id, 'salaryRange', true);
                              setInlineValues(prev => ({
                                ...prev,
                                [candidate.id]: {
                                  ...prev[candidate.id],
                                  salaryCurrency: candidate.salaryCurrency || 'EUR',
                                  salaryRangeMin: candidate.salaryRangeMin || '',
                                  salaryRangeMax: candidate.salaryRangeMax || ''
                                }
                              }));
                            }}
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-gray-500 hover:text-blue-600"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Section: Profile Summary, Contact Information, and Notes */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  {/* Top Row: Profile Summary and Contact Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Profile Summary Card - MIDDLE */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                        <User className="w-4 h-4 text-purple-600 mr-2" />
                        Profile Summary
                      </h4>
                      <div className="text-sm text-gray-900 flex-1">
                        {candidate.profileSummary && candidate.profileSummary !== `${candidate.firstName} ${candidate.lastName}` ? (
                          <p className="leading-relaxed">{candidate.profileSummary}</p>
                        ) : (
                          <p className="text-gray-500 italic">No profile summary available</p>
                        )}
                      </div>
                    </div>

                    {/* Contact Information Card - RIGHT */}
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col">
                      <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                        <Phone className="w-4 h-4 text-blue-600 mr-2" />
                        Contact Information
                      </h4>
                      <div className="space-y-4 text-sm flex-1">
                        <div className="group">
                          <span className="font-semibold text-gray-900 block mb-1">Email</span>
                          {inlineEditing[candidate.id]?.email ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="email"
                                value={inlineValues[candidate.id]?.email || ''}
                                onChange={(e) => setInlineValues(prev => ({
                                  ...prev,
                                  [candidate.id]: { ...prev[candidate.id], email: e.target.value }
                                }))}
                                className="flex-1 h-8 text-sm"
                                placeholder="candidate@email.com"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => saveInlineEdit(candidate.id, 'email', candidate)}
                                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelInlineEdit(candidate.id, 'email')}
                                className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group-hover:bg-gray-50 p-2 -m-2 rounded">
                              <span className="text-gray-700">{candidate.email || 'Not provided'}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startInlineEdit(candidate.id, 'email', candidate.email || '')}
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-gray-500 hover:text-blue-600"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="group">
                          <span className="font-semibold text-gray-900 block mb-1">Phone</span>
                          {inlineEditing[candidate.id]?.phone ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="tel"
                                value={inlineValues[candidate.id]?.phone || ''}
                                onChange={(e) => setInlineValues(prev => ({
                                  ...prev,
                                  [candidate.id]: { ...prev[candidate.id], phone: e.target.value }
                                }))}
                                className="flex-1 h-8 text-sm"
                                placeholder="+31 6 12345678"
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => saveInlineEdit(candidate.id, 'phone', candidate)}
                                className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => cancelInlineEdit(candidate.id, 'phone')}
                                className="h-8 w-8 p-0 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group-hover:bg-gray-50 p-2 -m-2 rounded">
                              <span className="text-gray-700">{candidate.phone || 'Not provided'}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startInlineEdit(candidate.id, 'phone', candidate.phone || '')}
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-gray-500 hover:text-blue-600"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-gray-900 block mb-1">LinkedIn</span>
                          <span className="text-gray-700">
                            {candidate.linkedinUrl ? (
                              <a 
                                href={(() => {
                                  let url = candidate.linkedinUrl.trim();
                                  // Extract the username part after /in/
                                  const match = url.match(/linkedin\.com\/in\/(.+?)(?:\/.*)?$/);
                                  if (match) {
                                    const username = match[1]
                                      .replace(/\s+/g, '-') // Replace spaces with hyphens
                                      .replace(/[®©™]/g, '') // Remove trademark symbols
                                      .replace(/[^a-zA-Z0-9-_.]/g, '') // Remove invalid chars except hyphens, dots, underscores
                                      .toLowerCase();
                                    return `https://linkedin.com/in/${username}`;
                                  }
                                  return url; // Return original if pattern doesn't match
                                })()} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-600 hover:underline"
                              >
                                View Profile
                              </a>
                            ) : 'Not provided'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Notes Section - Below Profile Summary and Contact Information */}
                  <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900 flex items-center">
                        <MessageSquare className="w-4 h-4 text-orange-600 mr-2" />
                        Notes
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowAddNoteForm(prev => ({ ...prev, [candidate.id]: true }));
                          setNewNoteForm(prev => ({
                            ...prev,
                            [candidate.id]: {
                              content: "",
                              contactDate: new Date().toISOString().split('T')[0],
                              contactMethod: "Phone"
                            }
                          }));
                        }}
                        className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Note
                      </Button>
                    </div>

                    {/* Add Note Form */}
                    {showAddNoteForm[candidate.id] && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
                        <div className="space-y-3">
                          {/* Contact Toggle */}
                          <div className="flex items-center space-x-2">
                            <Switch
                              id={`contact-toggle-${candidate.id}`}
                              checked={newNoteForm[candidate.id]?.hasBeenContacted || false}
                              onCheckedChange={(checked) => setNewNoteForm(prev => ({
                                ...prev,
                                [candidate.id]: { 
                                  ...prev[candidate.id], 
                                  hasBeenContacted: checked,
                                  contactDate: checked ? (prev[candidate.id]?.contactDate || new Date().toISOString().split('T')[0]) : '',
                                  contactMethod: checked ? (prev[candidate.id]?.contactMethod || 'Phone') : ''
                                }
                              }))}
                            />
                            <label htmlFor={`contact-toggle-${candidate.id}`} className="text-sm font-medium text-gray-700">
                              Has candidate been contacted?
                            </label>
                          </div>

                          {/* Contact Details - Only show if contacted */}
                          {newNoteForm[candidate.id]?.hasBeenContacted && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Date</label>
                                <Input
                                  type="date"
                                  value={newNoteForm[candidate.id]?.contactDate || ''}
                                  onChange={(e) => setNewNoteForm(prev => ({
                                    ...prev,
                                    [candidate.id]: { ...prev[candidate.id], contactDate: e.target.value }
                                  }))}
                                  className="h-8 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Method</label>
                                <Select
                                  value={newNoteForm[candidate.id]?.contactMethod || 'Phone'}
                                  onValueChange={(value) => setNewNoteForm(prev => ({
                                    ...prev,
                                    [candidate.id]: { ...prev[candidate.id], contactMethod: value }
                                  }))}
                                >
                                  <SelectTrigger className="h-8 text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Phone">Phone</SelectItem>
                                    <SelectItem value="Videocall">Videocall</SelectItem>
                                    <SelectItem value="Email">Email</SelectItem>
                                    <SelectItem value="Text">Text</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {newNoteForm[candidate.id]?.hasBeenContacted ? "Note about conversation" : "Internal note"}
                            </label>
                            <textarea
                              className="w-full p-3 border border-gray-300 rounded-lg resize-none text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none overflow-hidden"
                              rows={3}
                              value={newNoteForm[candidate.id]?.content || ''}
                              onChange={(e) => {
                                setNewNoteForm(prev => ({
                                  ...prev,
                                  [candidate.id]: { ...prev[candidate.id], content: e.target.value }
                                }));
                                // Auto-resize textarea
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.max(e.target.scrollHeight, 76) + 'px';
                              }}
                              onInput={(e) => {
                                // Also handle onInput for better responsiveness
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = Math.max(target.scrollHeight, 76) + 'px';
                              }}
                              placeholder={newNoteForm[candidate.id]?.hasBeenContacted 
                                ? "Add your note about the conversation..." 
                                : "Add an internal note..."
                              }
                            />
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShowAddNoteForm(prev => ({ ...prev, [candidate.id]: false }))}
                              className="h-8 text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                const form = newNoteForm[candidate.id];
                                if (form?.content && (!form?.hasBeenContacted || form?.contactDate)) {
                                  createNoteMutation.mutate({
                                    candidateId: candidate.id,
                                    content: form.content,
                                    contactDate: form.hasBeenContacted ? form.contactDate : '',
                                    contactMethod: form.hasBeenContacted ? (form.contactMethod || 'Phone') : 'Internal'
                                  });
                                }
                              }}
                              disabled={!newNoteForm[candidate.id]?.content || 
                                       (newNoteForm[candidate.id]?.hasBeenContacted && !newNoteForm[candidate.id]?.contactDate) ||
                                       createNoteMutation.isPending}
                              className="h-8 text-white bg-blue-600 hover:bg-blue-700"
                            >
                              {createNoteMutation.isPending ? "Adding..." : "Add Note"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Existing Notes */}
                    <CandidateNotesList 
                      candidateId={candidate.id} 
                      deleteNoteMutation={deleteNoteMutation}
                    />
                  </div>
                </div>
              </div>



            </div>
          </div>
        )}
      </div>
    ));
  };

  const renderTableRows = (data: Candidate[] | undefined) => {
    if (!data || data.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={8} className="text-center py-8">
            <div className="flex flex-col items-center space-y-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div className="text-muted-foreground">
                {searchTerm ? (
                  <p>No candidates match your search criteria.</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium">No candidates found in your CRM</p>
                    <p className="text-sm">Add candidates to Vtiger to see them here</p>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      );
    }

    const toggleRowExpansion = (candidateId: number) => {
      console.log(`🚨🚨🚨 TOGGLE ROW EXPANSION CALLED FOR CANDIDATE ${candidateId} 🚨🚨🚨`);
      setExpandedRows(prev => {
        console.log(`🚨 BEFORE: expandedRows had ${prev.size} items:`, Array.from(prev));
        const newSet = new Set(prev);
        if (newSet.has(candidateId)) {
          console.log(`🚨 COLLAPSING candidate ${candidateId}`);
          newSet.delete(candidateId);
          // Also close editing mode when collapsing
          setEditingExpanded(prevEdit => {
            const newEditSet = new Set(prevEdit);
            newEditSet.delete(candidateId);
            return newEditSet;
          });
        } else {
          console.log(`🚨 EXPANDING candidate ${candidateId}`);
          newSet.add(candidateId);
        }
        console.log(`🚨 AFTER: expandedRows will have ${newSet.size} items:`, Array.from(newSet));
        return newSet;
      });
    };

    const toggleEditExpanded = (candidateId: number, candidate: any) => {
      setEditingExpanded(prev => {
        const newSet = new Set(prev);
        if (newSet.has(candidateId)) {
          newSet.delete(candidateId);
        } else {
          newSet.add(candidateId);
          // Initialize form data with current candidate data
          setExpandedFormData(prevData => ({
            ...prevData,
            [candidateId]: {
              email: candidate.email || '',
              phone: (candidate as any).phone || '',
              salaryRangeMin: (candidate as any).salaryRangeMin || '',
              salaryRangeMax: (candidate as any).salaryRangeMax || '',
              salaryCurrency: (candidate as any).salaryCurrency || 'EUR',
              notes: candidate.notes && candidate.notes !== 'Imported from Vtiger CRM' ? candidate.notes : ''
            }
          }));
        }
        return newSet;
      });
    };

    const handleExpandedFieldChange = (candidateId: number, field: string, value: any) => {
      setExpandedFormData(prev => ({
        ...prev,
        [candidateId]: {
          ...prev[candidateId],
          [field]: value
        }
      }));
    };

    const saveExpandedChanges = async (candidateId: number, candidate: any) => {
      const formData = expandedFormData[candidateId];
      if (!formData) return;

      try {
        await updateCandidate.mutateAsync({
          id: candidateId.toString(),
          formData: {
            ...formData,
            firstName: candidate.firstName,
            lastName: candidate.lastName,
            skills: candidate.skills?.join(", ") || "",
            status: candidate.status
          }
        });
        
        queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
        toast({
          title: "Success",
          description: `Updated ${candidate.firstName} ${candidate.lastName}'s information`,
        });
        
        // Exit edit mode
        setEditingExpanded(prev => {
          const newSet = new Set(prev);
          newSet.delete(candidateId);
          return newSet;
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to update candidate information",
          variant: "destructive",
        });
      }
    };

    const rows: React.ReactNode[] = [];
    
    data.forEach(candidate => {
      // Main row
      rows.push(
        <TableRow 
          key={candidate.id} 
          data-candidate-id={candidate.id}
          className="cursor-pointer hover:bg-muted/50"
          onClick={() => toggleRowExpansion(candidate.id)}
        >
          <TableCell className="font-medium">
            <div className="flex items-center gap-2">
              {expandedRows.has(candidate.id) ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {candidate.firstName} {candidate.lastName}
            </div>
          </TableCell>
          <TableCell>{(candidate as any).jobTitle || candidate.currentTitle || "—"}</TableCell>
          <TableCell>{(candidate as any).company || "—"}</TableCell>
          <TableCell>{candidate.location || "—"}</TableCell>
          <TableCell>{(candidate as any).branche || "—"}</TableCell>
          <TableCell>{(candidate as any).durationCurrentRole || "—"}</TableCell>
          <TableCell>{(candidate as any).pastEmployer || "—"}</TableCell>
        <TableCell>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="p-0">
                <Badge
                  className={
                    (candidate.status === "Not Contacted" || candidate.status === "Uncontacted")
                      ? "bg-gray-100 text-gray-800 hover:bg-gray-200 cursor-pointer"
                      : candidate.status === "Contacted"
                        ? "bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                        : candidate.status === "First Screening"
                          ? "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 cursor-pointer"
                          : candidate.status === "Introduced"
                            ? "bg-cyan-100 text-cyan-800 hover:bg-cyan-200 cursor-pointer"
                            : candidate.status?.includes("Interview")
                              ? "bg-orange-100 text-orange-800 hover:bg-orange-200 cursor-pointer"
                              : candidate.status === "Contracting"
                                ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-200 cursor-pointer"
                                : candidate.status === "Placed"
                                  ? "bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer"
                                  : candidate.status?.includes("Rejected")
                                    ? "bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer"
                                    : candidate.status === "Blacklist"
                                      ? "bg-black text-white hover:bg-gray-800 cursor-pointer"
                                      : "bg-gray-100 text-gray-800 hover:bg-gray-200 cursor-pointer"
                  }
                >
                  {candidate.status}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {[
                "Not Contacted",
                "Contacted", 
                "First Screening",
                "Introduced",
                "Had 1st Interview",
                "Had 2nd Interview", 
                "Had 3rd Interview",
                "Had 4th Interview",
                "Contracting",
                "Placed",
                "Rejected (Client)",
                "Rejected (JO)",
                "Blacklist"
              ].map(status => {
                const hasVacancyAssignments = candidateVacancies?.[candidate.id]?.length > 0;
                const isNotContactedStatus = status === "Not Contacted";
                const canSelectStatus = isNotContactedStatus || hasVacancyAssignments;
                
                return (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => {
                      if (!canSelectStatus) {
                        toast({
                          title: "Cannot change status", 
                          description: "Candidates must be assigned to a vacancy before they can have a status other than 'Not Contacted'.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      updateCandidate.mutate({
                        id: candidate.id.toString(),
                        formData: {
                          status,
                          firstName: candidate.firstName,
                          lastName: candidate.lastName,
                          email: candidate.email,
                          skills: candidate.skills?.join(", ") || "",
                        }
                      }, {
                        onSuccess: () => {
                          // Invalidate and refetch candidates data
                          queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
                          toast({
                            title: "Success",
                            description: `Moved ${candidate.firstName} ${candidate.lastName} to ${status}`,
                          });
                        },
                        onError: (error) => {
                          console.error('Failed to update candidate status:', error);
                          toast({
                            title: "Error",
                            description: "Failed to update candidate status. Please try again.",
                            variant: "destructive",
                          });
                        }
                      });
                    }}
                    className={`${candidate.status === status ? "bg-primary/10" : ""} ${!canSelectStatus ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={!canSelectStatus}
                  >
                    {status}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
        </TableRow>
      );
      
      // Expanded row
      if (expandedRows.has(candidate.id)) {
        rows.push(
          <TableRow key={`${candidate.id}-expanded`}>
            <TableCell colSpan={8} className="bg-muted/30 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">Candidate Details</h3>
                <div className="flex gap-2">
                  {!editingExpanded.has(candidate.id) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleEditExpanded(candidate.id, candidate)}
                    >
                      Edit Details
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleEditExpanded(candidate.id, candidate)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveExpandedChanges(candidate.id, candidate)}
                        disabled={updateCandidate.isPending}
                      >
                        {updateCandidate.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Contact Information</h4>
                  <div className="space-y-2 text-sm">
                    {editingExpanded.has(candidate.id) ? (
                      <>
                        <div>
                          <label className="font-medium text-xs">Email:</label>
                          <Input
                            size="sm"
                            value={expandedFormData[candidate.id]?.email || ''}
                            onChange={(e) => handleExpandedFieldChange(candidate.id, 'email', e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="font-medium text-xs">Phone:</label>
                          <Input
                            size="sm"
                            value={expandedFormData[candidate.id]?.phone || ''}
                            onChange={(e) => handleExpandedFieldChange(candidate.id, 'phone', e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div><span className="font-medium">Email:</span> {candidate.email || "—"}</div>
                        <div><span className="font-medium">Phone:</span> {(candidate as any).phone || "—"}</div>
                      </>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Salary Expectations</h4>
                  <div className="space-y-2 text-sm">
                    {editingExpanded.has(candidate.id) ? (
                      <>
                        <div>
                          <label className="font-medium text-xs">Currency:</label>
                          <Select
                            value={expandedFormData[candidate.id]?.salaryCurrency || 'EUR'}
                            onValueChange={(value) => handleExpandedFieldChange(candidate.id, 'salaryCurrency', value)}
                          >
                            <SelectTrigger className="mt-1 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="font-medium text-xs">Min Salary:</label>
                            <Input
                              size="sm"
                              type="number"
                              value={expandedFormData[candidate.id]?.salaryRangeMin?.toString() || ''}
                              onChange={(e) => handleExpandedFieldChange(candidate.id, 'salaryRangeMin', e.target.value ? parseInt(e.target.value) : undefined)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="font-medium text-xs">Max Salary:</label>
                            <Input
                              size="sm"
                              type="number"
                              value={expandedFormData[candidate.id]?.salaryRangeMax?.toString() || ''}
                              onChange={(e) => handleExpandedFieldChange(candidate.id, 'salaryRangeMax', e.target.value ? parseInt(e.target.value) : undefined)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="font-medium">Range:</span> {
                            (candidate as any).salaryRangeMin && (candidate as any).salaryRangeMax 
                              ? `${((candidate as any).salaryCurrency || 'EUR')} ${((candidate as any).salaryRangeMin / 1000).toFixed(0)}k - ${((candidate as any).salaryRangeMax / 1000).toFixed(0)}k`
                              : (candidate as any).salaryRangeMin 
                                ? `${((candidate as any).salaryCurrency || 'EUR')} ${((candidate as any).salaryRangeMin / 1000).toFixed(0)}k+`
                                : "Not specified"
                          }
                        </div>
                        <div><span className="font-medium">Currency:</span> {(candidate as any).salaryCurrency || "EUR"}</div>
                      </>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Experience Details</h4>
                  <div className="space-y-1 text-sm">
                    <div><span className="font-medium">Past Role:</span> {(candidate as any).pastRoleTitle || "—"}</div>
                    <div><span className="font-medium">Duration:</span> {(candidate as any).pastExperienceDuration || "—"}</div>
                    <div><span className="font-medium">Company Location:</span> {(candidate as any).companyLocation || "—"}</div>
                  </div>
                </div>
                
                {((candidate as any).profileSummary || (candidate.notes && candidate.notes !== 'Imported from Vtiger CRM') || editingExpanded.has(candidate.id)) && (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3">
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">Summary & Notes</h4>
                    <div className="text-sm space-y-2">
                      {(candidate as any).profileSummary && (
                        <div><span className="font-medium">Profile:</span> {(candidate as any).profileSummary}</div>
                      )}
                      {editingExpanded.has(candidate.id) ? (
                        <div>
                          <label className="font-medium text-xs">Notes:</label>
                          <textarea
                            className="w-full mt-1 p-2 border rounded text-sm resize-none overflow-hidden"
                            rows={3}
                            value={expandedFormData[candidate.id]?.notes || ''}
                            onChange={(e) => {
                              handleExpandedFieldChange(candidate.id, 'notes', e.target.value);
                              // Auto-resize textarea
                              e.target.style.height = 'auto';
                              e.target.style.height = Math.max(e.target.scrollHeight, 76) + 'px';
                            }}
                            onInput={(e) => {
                              // Also handle onInput for better responsiveness
                              const target = e.target as HTMLTextAreaElement;
                              target.style.height = 'auto';
                              target.style.height = Math.max(target.scrollHeight, 76) + 'px';
                            }}
                            placeholder="Add your notes here..."
                          />
                        </div>
                      ) : (
                        candidate.notes && candidate.notes !== 'Imported from Vtiger CRM' && (
                          <div><span className="font-medium">Notes:</span> {candidate.notes}</div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* NOTES SECTION - MISSING FROM TABLE VIEW! */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">📝 Notes</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddNoteForm(prev => ({ ...prev, [candidate.id]: !prev[candidate.id] }))}
                    className="h-8 text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Note
                  </Button>
                </div>

                {/* Add Note Form */}
                {showAddNoteForm[candidate.id] && (
                  <div className="mb-4 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                    <div className="grid grid-cols-1 gap-3">
                      {/* Contact Toggle */}
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`table-contact-toggle-${candidate.id}`}
                          checked={newNoteForm[candidate.id]?.hasBeenContacted || false}
                          onCheckedChange={(checked) => setNewNoteForm(prev => ({
                            ...prev,
                            [candidate.id]: { 
                              ...prev[candidate.id], 
                              hasBeenContacted: checked,
                              contactDate: checked ? (prev[candidate.id]?.contactDate || new Date().toISOString().split('T')[0]) : '',
                              contactMethod: checked ? (prev[candidate.id]?.contactMethod || 'Phone') : ''
                            }
                          }))}
                        />
                        <label htmlFor={`table-contact-toggle-${candidate.id}`} className="text-sm font-medium text-gray-700">
                          Has candidate been contacted?
                        </label>
                      </div>

                      {/* Contact Details - Only show if contacted */}
                      {newNoteForm[candidate.id]?.hasBeenContacted && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Date</label>
                            <Input
                              type="date"
                              value={newNoteForm[candidate.id]?.contactDate || ""}
                              onChange={(e) => setNewNoteForm(prev => ({
                                ...prev,
                                [candidate.id]: { ...prev[candidate.id], contactDate: e.target.value }
                              }))}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Method</label>
                            <select
                              value={newNoteForm[candidate.id]?.contactMethod || "Phone"}
                              onChange={(e) => setNewNoteForm(prev => ({
                                ...prev,
                                [candidate.id]: { ...prev[candidate.id], contactMethod: e.target.value }
                              }))}
                              className="h-8 w-full rounded-md border border-gray-300 bg-white px-3 py-1 text-sm"
                            >
                              <option value="Phone">📞 Phone</option>
                              <option value="Videocall">📹 Videocall</option>
                              <option value="Email">📧 Email</option>
                              <option value="Text">💬 Text</option>
                            </select>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {newNoteForm[candidate.id]?.hasBeenContacted ? "Note about conversation" : "Internal note"}
                        </label>
                        <textarea
                          value={newNoteForm[candidate.id]?.content || ""}
                          onChange={(e) => setNewNoteForm(prev => ({
                            ...prev,
                            [candidate.id]: { ...prev[candidate.id], content: e.target.value }
                          }))}
                          placeholder={newNoteForm[candidate.id]?.hasBeenContacted 
                            ? "Add your note about the conversation..." 
                            : "Add an internal note..."
                          }
                          className="w-full h-20 p-2 border border-gray-300 rounded-md text-sm resize-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAddNoteForm(prev => ({ ...prev, [candidate.id]: false }))}
                          className="h-8"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            const noteData = newNoteForm[candidate.id];
                            if (!noteData?.content || (noteData?.hasBeenContacted && !noteData?.contactDate)) return;
                            
                            createNoteMutation.mutate({
                              candidateId: candidate.id,
                              content: noteData.content,
                              contactDate: noteData.hasBeenContacted ? noteData.contactDate : '',
                              contactMethod: noteData.hasBeenContacted ? (noteData.contactMethod || "Phone") : 'Internal'
                            });
                          }}
                          disabled={!newNoteForm[candidate.id]?.content || 
                                   (newNoteForm[candidate.id]?.hasBeenContacted && !newNoteForm[candidate.id]?.contactDate) ||
                                   createNoteMutation.isPending}
                          className="h-8 text-white bg-blue-600 hover:bg-blue-700"
                        >
                          {createNoteMutation.isPending ? "Adding..." : "Add Note"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* NOTES DISPLAY - DIRECT SIMPLE APPROACH */}
                <DirectNotesDisplay candidateId={candidate.id} />
              </div>
            </TableCell>
          </TableRow>
        );
      }
    });
    
    return rows;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Candidates</h1>
          <p className="text-muted-foreground">Manage your candidate database and track applications</p>
        </div>
        <div className="flex flex-col items-end space-y-1">
          <Button 
            onClick={async () => {
              // If sync is running, this cancels it. Otherwise, starts a new sync
              if (syncMetadata?.status === "running") {
                try {
                  const response = await fetch(getApiUrl("/api/candidates/cancel-sync"), { 
                    method: "POST"
                  });
                  const result = await response.json();
                  if (result.success) {
                    queryClient.invalidateQueries({ queryKey: ["/api/sync-metadata/latest"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
                    toast({ title: "Sync cancelled", description: "VTiger synchronization has been stopped" });
                  } else {
                    toast({ title: "Info", description: result.message, variant: "default" });
                  }
                } catch (error) {
                  console.error('Cancel sync error:', error);
                  toast({ title: "Error", description: "Failed to cancel sync", variant: "destructive" });
                }
              } else {
                try {
                  console.log('🔄 Sync button clicked - starting VTiger sync...');
                  const response = await fetch(getApiUrl("/api/candidates/force-sync"), { method: "POST" });
                  const result = await response.json();
                  console.log('🔄 Sync response:', result);
                  if (result.success) {
                    // Force immediate refresh of sync metadata and candidates
                    queryClient.invalidateQueries({ queryKey: ["/api/sync-metadata/latest"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
                    toast({ title: "Sync started", description: "VTiger synchronization is running..." });
                  } else {
                    toast({ title: "Error", description: result.error || "Failed to start sync", variant: "destructive" });
                  }
                } catch (error) {
                  console.log('🔄 Sync error:', error);
                  toast({ title: "Error", description: "Network error", variant: "destructive" });
                }
              }
            }}
            variant="outline"
            className="relative"
            title={syncMetadata?.status === "running" ? "Click to cancel sync" : "Start VTiger sync"}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncMetadata?.status === "running" ? "animate-spin" : ""}`} /> 
            Sync candidates
            {syncMetadata?.status === "running" && (
              <X className="ml-2 h-3 w-3 opacity-60 hover:opacity-100 transition-opacity" />
            )}
          </Button>
          {syncMetadata && (
            <div className="flex flex-col items-end space-y-0.5">
              {/* Last sync time - always show */}
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">
                  {formatLastSyncTime(syncMetadata.completedAt || syncMetadata.startedAt)}
                </p>
                <SyncHistoryViewer />
              </div>
              
              {/* Completed sync stats */}
              {syncMetadata.status === "completed" && (
                <p className="text-xs text-muted-foreground">
                  {syncMetadata.createdCount > 0 && `${syncMetadata.createdCount.toLocaleString()} new`}
                  {syncMetadata.createdCount > 0 && syncMetadata.updatedCount > 0 && ', '}
                  {syncMetadata.updatedCount > 0 && `${syncMetadata.updatedCount.toLocaleString()} updated`}
                  {syncMetadata.vtigerTotal && ` of ${syncMetadata.vtigerTotal.toLocaleString()} total`}
                </p>
              )}
              
              {/* Failed sync */}
              {syncMetadata.status === "failed" && (
                <p className="text-xs text-red-500">
                  Sync failed: {syncMetadata.errorMessage || "Unknown error"}
                </p>
              )}
              
              {/* Running sync with real-time batch progress */}
              {(syncMetadata.status === "running" || (extractionProgress && extractionProgress.isRunning)) && (
                <div className="flex flex-col items-end space-y-0.5">
                  {(() => {
                    // Use extractionProgress if it has valid data (isRunning && totalCandidates > 0)
                    const useExtractionProgress = extractionProgress?.isRunning && extractionProgress.totalCandidates > 0;
                    const processed = useExtractionProgress ? extractionProgress.processedCandidates : (syncMetadata.fetchedCount || 0);
                    const total = useExtractionProgress ? extractionProgress.totalCandidates : (syncMetadata.vtigerTotal || 0);
                    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;
                    const rate = useExtractionProgress ? extractionProgress.rate : 0;
                    
                    return (
                      <>
                        <p className="text-xs text-blue-600 font-medium">
                          Syncing: {processed.toLocaleString()} / {total.toLocaleString()} candidates
                          {percentage > 0 && ` (${percentage}%)`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rate > 0 && `${rate}/sec`}
                          {rate > 0 && (syncMetadata.createdCount > 0 || syncMetadata.updatedCount > 0) && ' • '}
                          {syncMetadata.createdCount > 0 && `${syncMetadata.createdCount.toLocaleString()} new`}
                          {syncMetadata.createdCount > 0 && syncMetadata.updatedCount > 0 && ', '}
                          {syncMetadata.updatedCount > 0 && `${syncMetadata.updatedCount.toLocaleString()} updated`}
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* REMOVED: Candidate creation form - platform is VTiger-only */}

  {/* Edit Form */}
  {editingCandidate && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Edit Candidate</h2>
              <Button variant="outline" onClick={() => setEditingCandidate(null)}>
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ["First Name", "firstName"],
                ["Last Name", "lastName"],
                ["Email", "email"],
                ["Phone", "phone"],
                ["Location", "location"],
                ["Current Title", "currentTitle"],
                ["Target Role", "targetRole"],
                ["Company", "company"],
                ["Experience (yrs)", "experience"],
                ["Education", "education"],
                ["Availability", "availability"],
                ["Resume URL", "resume"],
                ["LinkedIn URL", "linkedinUrl"],
                ["External ID", "externalId"],
              ].map(([label, key]) => (
                <Input
                  key={key}
                  type={key === "experience" ? "number" : "text"}
                  placeholder={label}
                  value={(editingCandidate as any)[key] || ""}
                  onChange={(e) => 
                    handleEditFieldChange(
                      key as keyof Candidate, 
                      key === "experience" ? Number(e.target.value) : e.target.value
                    )
                  }
                />
              ))}
              <Input
                placeholder="Skills (comma separated)"
                value={editingCandidate.skills?.join(", ") || ""}
                onChange={e => 
                  handleEditFieldChange("skills", e.target.value)
                }
              />
              
              {/* Salary Range Fields for Edit */}
              <div className="col-span-2">
                <label className="text-sm font-medium text-gray-700 mb-2 block">Salary Range</label>
                <div className="grid grid-cols-3 gap-2">
                  <Select 
                    value={(editingCandidate as any).salaryCurrency || "EUR"} 
                    onValueChange={(value) => handleEditFieldChange("salaryCurrency", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Min Salary"
                    value={(editingCandidate as any).salaryRangeMin || ""}
                    onChange={(e) => handleEditFieldChange("salaryRangeMin", e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                  <Input
                    type="number"
                    placeholder="Max Salary"
                    value={(editingCandidate as any).salaryRangeMax || ""}
                    onChange={(e) => handleEditFieldChange("salaryRangeMax", e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </div>
              </div>
              
              <Input
                placeholder="Notes"
                value={editingCandidate.notes || ""}
                onChange={e => 
                  handleEditFieldChange("notes", e.target.value)
                }
              />
              <select
                className="border rounded px-2 py-1"
                value={editingCandidate.status || "Uncontacted"}
                onChange={e => 
                  handleEditFieldChange("status", e.target.value)
                }
              >
                {[
                  "Uncontacted",
                  "Contacted", 
                  "First Screening",
                  "Introduced",
                  "Had 1st Interview",
                  "Had 2nd Interview", 
                  "Had 3rd Interview",
                  "Had 4th Interview",
                  "Contracting",
                  "Placed",
                  "Rejected (Client)",
                  "Rejected (JO)",
                  "Blacklist"
                ].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Input
                placeholder="Source"
                value={editingCandidate.source || ""}
                onChange={e => 
                  handleEditFieldChange("source", e.target.value)
                }
              />
            </div>
            <Button
              onClick={handleEditSave}
              disabled={updateCandidate.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {updateCandidate.isPending ? "Updating..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <div className="mb-4">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search candidates..."
              className="w-full pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Tabs defaultValue="all" onValueChange={(value) => { setCurrentTab(value); setCurrentPage(1); }}>
            <div className="overflow-x-auto mb-6">
              <TabsList className="h-10 w-auto inline-flex">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="Not Contacted">Not Contacted</TabsTrigger>
                <TabsTrigger value="Contacted">Contacted</TabsTrigger>
                <TabsTrigger value="First Screening">First Screening</TabsTrigger>
                <TabsTrigger value="Introduced">Introduced</TabsTrigger>
                <TabsTrigger value="interviews">Interviews</TabsTrigger>
                <TabsTrigger value="Contracting">Contracting</TabsTrigger>
                <TabsTrigger value="Placed">Placed</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
                <TabsTrigger value="blacklist">Blacklist</TabsTrigger>
              </TabsList>
            </div>
            {["all", "Not Contacted", "Contacted", "First Screening", "Introduced", "interviews", "Contracting", "Placed", "rejected"].map(tab => {
              const tabCandidates = getCandidatesForTab(tab);
              const totalItems = tabCandidates.length;
              const totalPages = Math.ceil(totalItems / itemsPerPage);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedCandidates = tabCandidates.slice(startIndex, endIndex);
              
              return (
              <TabsContent key={tab} value={tab} className="p-0">
                {isLoading ? (
                  <div className="p-4">
                    {Array(5).fill(0).map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 py-3">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
                    <div className="sticky top-0 z-10 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <div className="grid grid-cols-8 gap-6 px-6 py-4">
                        <div 
                          className="font-semibold text-sm text-gray-700 cursor-pointer hover:text-blue-600 flex items-center gap-1"
                          onClick={() => handleSort("name")}
                          data-testid="header-name"
                        >
                          Name
                          {sortField === "name" && (
                            sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                        <div 
                          className="font-semibold text-sm text-gray-700 cursor-pointer hover:text-blue-600 flex items-center gap-1"
                          onClick={() => handleSort("title")}
                          data-testid="header-title"
                        >
                          Title
                          {sortField === "title" && (
                            sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                        <div className="font-semibold text-sm text-gray-700">Company</div>
                        <div 
                          className="font-semibold text-sm text-gray-700 cursor-pointer hover:text-blue-600 flex items-center gap-1"
                          onClick={() => handleSort("location")}
                          data-testid="header-location"
                        >
                          Location
                          {sortField === "location" && (
                            sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                        <div className="font-semibold text-sm text-gray-700">Vacancy</div>
                        <div 
                          className="font-semibold text-sm text-gray-700 cursor-pointer hover:text-blue-600 flex items-center gap-1"
                          onClick={() => handleSort("experience")}
                          data-testid="header-experience"
                        >
                          Experience
                          {sortField === "experience" && (
                            sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                        <div className="font-semibold text-sm text-gray-700">Previous Role</div>
                        <div 
                          className="font-semibold text-sm text-gray-700 text-center cursor-pointer hover:text-blue-600 flex items-center justify-center gap-1"
                          onClick={() => handleSort("status")}
                          data-testid="header-status"
                        >
                          Status
                          {sortField === "status" && (
                            sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="overflow-auto bg-white" style={{ height: "65vh" }}>
                      <div>
                        {renderCustomTableRows(paginatedCandidates)}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
              );
            })}
          </Tabs>
        </div>
        
        {/* Pagination Controls */}
        {(() => {
          const currentTabCandidates = getCandidatesForTab(currentTab);
          const totalItems = currentTabCandidates.length;
          const totalPages = Math.ceil(totalItems / itemsPerPage);
          const startIndex = (currentPage - 1) * itemsPerPage;
          const endIndex = startIndex + itemsPerPage;
          
          return (
            <div className="flex items-center justify-between p-4 mt-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Show</span>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">
                  candidates per page
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">
                  Showing {Math.min(startIndex + 1, totalItems)} to {Math.min(endIndex, totalItems)} of {totalItems} results
                </span>
                <div className="flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  {/* Page numbers */}
                  {totalPages > 1 && (
                    <div className="flex space-x-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(pageNum)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages <= 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* CV Viewer Modal */}
      {viewingCV && (
        <Dialog open={true} onOpenChange={() => setViewingCV(null)}>
          <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
            <DialogHeader className="flex flex-row items-center justify-between">
              <DialogTitle>CV - {viewingCV.candidateName}</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    // Extract candidate ID from the URL
                    const candidateId = viewingCV.url.split('/')[3];
                    const response = await fetch(`/api/candidates/${candidateId}/cv`, {
                      method: 'DELETE'
                    });
                    
                    if (response.ok) {
                      toast({
                        title: "Success",
                        description: "CV deleted successfully"
                      });
                      queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
                      setViewingCV(null);
                    } else {
                      throw new Error('Failed to delete CV');
                    }
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to delete CV",
                      variant: "destructive"
                    });
                  }
                }}
                className="h-8 text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete CV
              </Button>
            </DialogHeader>
            <div className="flex-1 bg-gray-100 rounded-lg overflow-hidden">
              <iframe
                src={viewingCV.url}
                className="w-full h-full border-0"
                title={`CV for ${viewingCV.candidateName}`}
              />
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => setViewingCV(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
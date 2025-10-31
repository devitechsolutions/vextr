import {
  users, User, InsertUser,
  candidates, Candidate, InsertCandidate,
  clients, Client, InsertClient,
  vacancies, Vacancy, InsertVacancy,
  todos, Todo, InsertTodo,
  kpiTargets, KpiTargets, InsertKpiTargets,
  activities, Activity, InsertActivity,
  interviews, Interview, InsertInterview,
  pipelineStages, PipelineStage, InsertPipelineStage,
  jobTitles, JobTitle, InsertJobTitle,
  sourcedProfiles, SourcedProfile, InsertSourcedProfile,
  candidateStatuses, CandidateStatus, InsertCandidateStatus,
  candidateNotes, CandidateNote, InsertCandidateNote,
  placements, Placement, InsertPlacement,
  contactAttempts, ContactAttempt, InsertContactAttempt,
  nextActions, NextAction, InsertNextAction,
  candidateVacancyMatches,
  syncMetadata, SyncMetadata, InsertSyncMetadata
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, getTableColumns, or, isNull, inArray, lt } from "drizzle-orm";
import { VacancyMatcher, MatchResult } from "./services/matcher-service";

// LinkedIn URL normalization utility
function normalizeLinkedInUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  const trimmed = url.trim();
  if (trimmed === '' || trimmed.length === 0) {
    return null;
  }
  
  // Normalize LinkedIn URL format
  let normalized = trimmed.toLowerCase();
  
  // Remove common LinkedIn URL variations and parameters
  normalized = normalized.replace(/\?.*$/, ''); // Remove query parameters
  normalized = normalized.replace(/\/$/, ''); // Remove trailing slash
  
  // Ensure it starts with https://
  if (normalized.startsWith('linkedin.com/') || normalized.startsWith('www.linkedin.com/')) {
    normalized = 'https://' + normalized;
  } else if (normalized.startsWith('http://')) {
    normalized = normalized.replace('http://', 'https://');
  }
  
  return normalized;
}

export interface IStorage {
  // User methods
  getUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Candidate methods
  getCandidates(): Promise<Candidate[]>;
  getCandidate(id: number): Promise<Candidate | undefined>;
  getCandidateByEmail(email: string): Promise<Candidate | undefined>;
  getCandidateByVtigerId(vtigerId: string): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  updateCandidate(id: number, candidate: Partial<InsertCandidate>): Promise<Candidate | undefined>;
  deleteCandidate(id: number): Promise<boolean>;
  searchCandidates(searchTerm: string): Promise<Candidate[]>;
  
  // Bulk operations for performance
  bulkUpsertCandidates(candidates: InsertCandidate[]): Promise<Candidate[]>;
  
  // Client methods
  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  getClientByEmail(email: string): Promise<Client | undefined>;
  getClientByName(companyName: string): Promise<Client | undefined>;
  getClientByVtigerId(vtigerId: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<boolean>;
  
  // Vacancy methods
  getVacancies(): Promise<Vacancy[]>;
  getVacancy(id: number): Promise<Vacancy | undefined>;
  getVacancyByTitle(title: string): Promise<Vacancy | undefined>;
  getVacancyByVtigerId(vtigerId: string): Promise<Vacancy | undefined>;
  createVacancy(vacancy: InsertVacancy): Promise<Vacancy>;
  updateVacancy(id: number, vacancy: Partial<InsertVacancy>): Promise<Vacancy | undefined>;
  deleteVacancy(id: number): Promise<boolean>;
  
  // Todo methods
  getTodos(userId: number): Promise<Todo[]>;
  getTodo(id: number): Promise<Todo | undefined>;
  getTodoByExternalId(externalId: string): Promise<Todo | undefined>;
  createTodo(todo: InsertTodo): Promise<Todo>;
  updateTodo(id: number, todo: Partial<InsertTodo>): Promise<Todo | undefined>;
  deleteTodo(id: number): Promise<boolean>;
  
  // KPI Targets methods
  getKpiTargets(userId: number): Promise<KpiTargets>;
  updateKpiTargets(userId: number, targets: Partial<InsertKpiTargets>): Promise<KpiTargets>;
  
  // Activity methods
  getActivities(): Promise<Activity[]>;
  createActivity(activity: InsertActivity): Promise<Activity>;
  
  // Interview methods
  getInterviews(): Promise<Interview[]>;
  getInterview(id: number): Promise<Interview | undefined>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: number, interview: Partial<InsertInterview>): Promise<Interview | undefined>;
  deleteInterview(id: number): Promise<boolean>;
  
  // Pipeline methods
  getPipelineStages(vacancyId: number): Promise<PipelineStage[]>;
  updatePipelineStage(id: number, stage: Partial<InsertPipelineStage>): Promise<PipelineStage | undefined>;
  
  // Job matching
  matchCandidatesToVacancy(vacancyId: number, limit?: number, offset?: number): Promise<{
    candidates: Array<Candidate & { 
      matchScore?: number;
      matchCriteria?: string[];
      matchDetails?: MatchResult;
    }>;
    total: number;
  }>;
  
  // Job Title methods for automated sourcing
  getJobTitles(): Promise<JobTitle[]>;
  getActiveJobTitles(): Promise<JobTitle[]>;
  getJobTitle(id: number): Promise<JobTitle | undefined>;
  createJobTitle(jobTitle: InsertJobTitle): Promise<JobTitle>;
  updateJobTitle(id: number, jobTitle: Partial<InsertJobTitle>): Promise<JobTitle | undefined>;
  deleteJobTitle(id: number): Promise<boolean>;
  
  // Sourced Profile methods
  getSourcedProfiles(): Promise<SourcedProfile[]>;
  getSourcedProfile(id: number): Promise<SourcedProfile | undefined>;
  getSourcedProfileByUrl(profileUrl: string): Promise<SourcedProfile | undefined>;
  createSourcedProfile(profile: InsertSourcedProfile): Promise<SourcedProfile>;
  updateSourcedProfile(id: number, profile: Partial<InsertSourcedProfile>): Promise<SourcedProfile | undefined>;
  deleteSourcedProfile(id: number): Promise<boolean>;

  // Candidate Status methods
  getCandidateStatuses(vacancyId: number): Promise<CandidateStatus[]>;
  getAllCandidateStatuses(): Promise<CandidateStatus[]>;
  getCandidateStatus(candidateId: number, vacancyId: number): Promise<CandidateStatus | undefined>;
  createCandidateStatus(status: InsertCandidateStatus): Promise<CandidateStatus>;
  updateCandidateStatus(candidateId: number, vacancyId: number, update: Partial<InsertCandidateStatus>): Promise<CandidateStatus | undefined>;
  deleteCandidateStatus(candidateId: number, vacancyId: number): Promise<boolean>;
  
  // Candidate Vacancy Assignments methods
  getCandidateVacancyAssignments(candidateId: number): Promise<Array<{vacancy: Vacancy; status: string; assignedAt: Date}>>;
  
  // Candidate Notes methods
  getCandidateNotes(candidateId: number): Promise<CandidateNote[]>;
  getCandidateNote(id: number): Promise<CandidateNote | undefined>;
  createCandidateNote(note: InsertCandidateNote): Promise<CandidateNote>;
  updateCandidateNote(id: number, note: Partial<InsertCandidateNote>): Promise<CandidateNote | undefined>;
  deleteCandidateNote(id: number): Promise<boolean>;

  // Placement methods
  getPlacements(): Promise<Placement[]>;
  getPlacement(id: number): Promise<Placement | undefined>;
  createPlacement(placement: InsertPlacement): Promise<Placement>;
  updatePlacement(id: number, placement: Partial<InsertPlacement>): Promise<Placement | undefined>;
  deletePlacement(id: number): Promise<boolean>;

  // Priority Engine methods
  createContactAttempt(attempt: InsertContactAttempt): Promise<ContactAttempt>;
  getContactAttempts(candidateId?: number, vacancyId?: number, recruiterId?: number): Promise<ContactAttempt[]>;
  createNextAction(action: InsertNextAction): Promise<NextAction>;
  getNextActions(recruiterId: number, status?: string): Promise<NextAction[]>;
  updateNextAction(id: number, updates: Partial<NextAction>): Promise<NextAction | undefined>;
  deleteNextAction(id: number): Promise<boolean>;
  getPriorityCallQueue(recruiterId: number, limit?: number): Promise<NextAction[]>;
  expireOldActions(beforeDate: Date): Promise<void>;
  refreshRecruiterQueue(recruiterId: number): Promise<NextAction[]>;

  // Match Score Caching methods
  saveMatchScores(vacancyId: number, matches: Array<{candidateId: number, matchScore: number, breakdown: any}>): Promise<void>;
  getMatchScoresForVacancy(vacancyId: number, minScore?: number): Promise<Array<{candidateId: number, matchScore: number, breakdown: any, calculatedAt: Date}>>;
  getTopMatchesForRecruiter(recruiterId: number, limit: number): Promise<Array<{candidate: Candidate, vacancy: Vacancy, matchScore: number, breakdown: any}>>;
  clearMatchScoresForVacancy(vacancyId: number): Promise<void>;

  // Sync Metadata methods
  createSyncMetadata(metadata: InsertSyncMetadata): Promise<SyncMetadata>;
  updateSyncMetadata(id: number, metadata: Partial<InsertSyncMetadata>): Promise<SyncMetadata | undefined>;
  getLatestSyncMetadata(syncType?: string): Promise<SyncMetadata | undefined>;
  getAllSyncMetadata(limit?: number): Promise<SyncMetadata[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private candidates: Map<number, Candidate>;
  private clients: Map<number, Client>;
  private vacancies: Map<number, Vacancy>;
  private todos: Map<number, Todo>;
  private activities: Map<number, Activity>;
  private interviews: Map<number, Interview>;
  private pipelineStages: Map<number, PipelineStage>;
  private jobTitles: Map<number, JobTitle>;
  private sourcedProfiles: Map<number, SourcedProfile>;
  
  // Fast O(1) lookup indexes for candidates
  private candidatesByVtigerId: Map<string, Candidate>;
  private candidatesByEmail: Map<string, Candidate>;
  
  private currentIds: {
    users: number;
    candidates: number;
    clients: number;
    vacancies: number;
    todos: number;
    activities: number;
    interviews: number;
    pipelineStages: number;
    jobTitles: number;
    sourcedProfiles: number;
  };

  constructor() {
    this.users = new Map();
    this.candidates = new Map();
    this.clients = new Map();
    this.vacancies = new Map();
    this.todos = new Map();
    this.activities = new Map();
    this.interviews = new Map();
    this.pipelineStages = new Map();
    this.jobTitles = new Map();
    this.sourcedProfiles = new Map();
    
    // Initialize fast lookup indexes
    this.candidatesByVtigerId = new Map();
    this.candidatesByEmail = new Map();
    
    this.currentIds = {
      users: 1,
      candidates: 1,
      clients: 1,
      vacancies: 1,
      todos: 1,
      activities: 1,
      interviews: 1,
      pipelineStages: 1,
      jobTitles: 1,
      sourcedProfiles: 1
    };
    
    // No mock data initialization - system starts empty
    // All data comes from Vtiger CRM or user input
  }



  // User methods
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentIds.users++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      createdAt: now,
      updatedAt: now,
      fullName: insertUser.fullName ?? null,
      phone: insertUser.phone ?? null,
      passwordHash: insertUser.passwordHash ?? null,
      isActive: insertUser.isActive ?? false,
      mustChangePassword: insertUser.mustChangePassword ?? false,
      inviteToken: insertUser.inviteToken ?? null,
      inviteTokenExpiry: insertUser.inviteTokenExpiry ?? null,
      resetToken: insertUser.resetToken ?? null,
      resetTokenExpiry: insertUser.resetTokenExpiry ?? null,
      lastLoginAt: insertUser.lastLoginAt ?? null
    };
    this.users.set(id, user);
    return user;
  }
  
  // Candidate methods
  async getCandidates(): Promise<Candidate[]> {
    return Array.from(this.candidates.values());
  }
  
  async getCandidate(id: number): Promise<Candidate | undefined> {
    return this.candidates.get(id);
  }
  
  async getCandidateByEmail(email: string): Promise<Candidate | undefined> {
    // Fast O(1) lookup using index instead of O(n) array search
    return this.candidatesByEmail.get(email);
  }
  
  async getCandidateByVtigerId(vtigerId: string): Promise<Candidate | undefined> {
    // Fast O(1) lookup using index instead of O(n) array search
    return this.candidatesByVtigerId.get(vtigerId);
  }
  
  /**
   * Get candidates missing key Vtiger data (used for enrichment)
   * This method is implemented in MemStorage for VtigerStorage inheritance
   */
  async getCandidatesMissingVtigerData(): Promise<Candidate[]> {
    const allCandidates = Array.from(this.candidates.values());
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago (reduced from 2)
    
    const candidatesMissingData = allCandidates.filter(candidate => {
      // Check for missing core data
      const hasMissingData = !candidate.profileSummary || 
        candidate.profileSummary.trim() === "" || 
        !candidate.vtigerId ||
        !candidate.jobTitle ||
        candidate.jobTitle.trim() === "" ||
        !candidate.company ||
        candidate.company.trim() === "";
      
      // Check for stale sync data (with proper TypeScript null handling)
      const hasStaleData = !candidate.lastSyncedAt || 
        new Date(candidate.lastSyncedAt).getTime() < oneDayAgo.getTime();
      
      return hasMissingData || hasStaleData;
    });
    console.log(`🔍 Found ${candidatesMissingData.length} candidates missing or with stale Vtiger data (missing fields or sync > 1 day old)`);
    return candidatesMissingData;
  }
  
  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const id = this.currentIds.candidates++;
    const now = new Date();
    const newCandidate: Candidate = { 
      ...candidate, 
      id, 
      createdAt: now, 
      updatedAt: now,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
      status: candidate.status ?? "Uncontacted"
    };
    this.candidates.set(id, newCandidate);
    
    // Maintain fast lookup indexes
    if (newCandidate.email) {
      this.candidatesByEmail.set(newCandidate.email, newCandidate);
    }
    if (newCandidate.vtigerId) {
      this.candidatesByVtigerId.set(newCandidate.vtigerId, newCandidate);
    }
    
    // Create activity for new candidate
    this.createActivity({
      userId: 1,
      type: "new_candidate",
      description: `New candidate ${candidate.firstName} ${candidate.lastName} added`,
      relatedType: "candidate",
      relatedId: id
    });
    
    return newCandidate;
  }
  
  async updateCandidate(id: number, candidateUpdate: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    const candidate = this.candidates.get(id);
    if (!candidate) return undefined;
    
    // Remove old index entries if email or vtigerId is changing
    if (candidateUpdate.email !== undefined && candidate.email) {
      this.candidatesByEmail.delete(candidate.email);
    }
    if (candidateUpdate.vtigerId !== undefined && candidate.vtigerId) {
      this.candidatesByVtigerId.delete(candidate.vtigerId);
    }
    
    const updatedCandidate: Candidate = {
      ...candidate,
      ...candidateUpdate,
      updatedAt: new Date()
    };
    
    this.candidates.set(id, updatedCandidate);
    
    // Add new index entries
    if (updatedCandidate.email) {
      this.candidatesByEmail.set(updatedCandidate.email, updatedCandidate);
    }
    if (updatedCandidate.vtigerId) {
      this.candidatesByVtigerId.set(updatedCandidate.vtigerId, updatedCandidate);
    }
    
    return updatedCandidate;
  }
  
  async deleteCandidate(id: number): Promise<boolean> {
    const candidate = this.candidates.get(id);
    if (!candidate) return false;
    
    // Remove from indexes
    if (candidate.email) {
      this.candidatesByEmail.delete(candidate.email);
    }
    if (candidate.vtigerId) {
      this.candidatesByVtigerId.delete(candidate.vtigerId);
    }
    
    return this.candidates.delete(id);
  }
  
  async searchCandidates(searchTerm: string): Promise<Candidate[]> {
    const lowerSearch = searchTerm.toLowerCase();
    return Array.from(this.candidates.values()).filter(candidate => {
      return (
        candidate.firstName.toLowerCase().includes(lowerSearch) ||
        candidate.lastName.toLowerCase().includes(lowerSearch) ||
        candidate.email.toLowerCase().includes(lowerSearch) ||
        candidate.currentTitle?.toLowerCase().includes(lowerSearch) ||
        candidate.skills?.some(skill => skill.toLowerCase().includes(lowerSearch))
      );
    });
  }
  
  // Bulk operations for high-performance sync
  async bulkUpsertCandidates(candidateData: InsertCandidate[]): Promise<Candidate[]> {
    const results: Candidate[] = [];
    const now = new Date();
    
    for (const data of candidateData) {
      let candidate: Candidate | undefined = undefined;
      
      // Fast O(1) lookup by vtigerId or email
      if (data.vtigerId) {
        candidate = this.candidatesByVtigerId.get(data.vtigerId);
      }
      if (!candidate && data.email) {
        candidate = this.candidatesByEmail.get(data.email);
      }
      
      if (candidate) {
        // UPDATE existing candidate - use the optimized updateCandidate method
        const updated = await this.updateCandidate(candidate.id, data);
        if (updated) results.push(updated);
      } else {
        // CREATE new candidate - use the optimized createCandidate method
        const created = await this.createCandidate(data);
        results.push(created);
      }
    }
    
    return results;
  }
  
  // Client methods
  async getClients(): Promise<Client[]> {
    return Array.from(this.clients.values());
  }
  
  async getClient(id: number): Promise<Client | undefined> {
    return this.clients.get(id);
  }
  
  async getClientByEmail(email: string): Promise<Client | undefined> {
    return Array.from(this.clients.values()).find(
      client => client.email === email
    );
  }
  
  async getClientByName(name: string): Promise<Client | undefined> {
    return Array.from(this.clients.values()).find(
      client => client.name.toLowerCase() === name.toLowerCase()
    );
  }
  
  async getClientByVtigerId(vtigerId: string): Promise<Client | undefined> {
    return Array.from(this.clients.values()).find(
      client => client.vtigerId === vtigerId
    );
  }
  
  async createClient(client: InsertClient): Promise<Client> {
    const id = this.currentIds.clients++;
    const now = new Date();
    const newClient: Client = { 
      ...client, 
      id, 
      createdAt: now, 
      updatedAt: now,
      email: client.email ?? null,
      phone: client.phone ?? null,
      status: client.status ?? "Active"
    };
    this.clients.set(id, newClient);
    
    // Create activity for new client
    this.createActivity({
      userId: 1,
      type: "new_client",
      description: `New client ${client.name} added`,
      relatedType: "client",
      relatedId: id
    });
    
    return newClient;
  }
  
  async updateClient(id: number, clientUpdate: Partial<InsertClient>): Promise<Client | undefined> {
    const client = this.clients.get(id);
    if (!client) return undefined;
    
    const updatedClient: Client = {
      ...client,
      ...clientUpdate,
      updatedAt: new Date()
    };
    
    this.clients.set(id, updatedClient);
    return updatedClient;
  }
  
  async deleteClient(id: number): Promise<boolean> {
    return this.clients.delete(id);
  }
  
  // Vacancy methods
  async getVacancies(): Promise<Vacancy[]> {
    return Array.from(this.vacancies.values());
  }
  
  async getVacancy(id: number): Promise<Vacancy | undefined> {
    return this.vacancies.get(id);
  }
  
  async getVacancyByTitle(title: string): Promise<Vacancy | undefined> {
    return Array.from(this.vacancies.values()).find(
      vacancy => vacancy.title.toLowerCase() === title.toLowerCase()
    );
  }
  
  async getVacancyByVtigerId(vtigerId: string): Promise<Vacancy | undefined> {
    return Array.from(this.vacancies.values()).find(
      vacancy => vacancy.vtigerId === vtigerId
    );
  }
  
  async createVacancy(vacancy: InsertVacancy): Promise<Vacancy> {
    const id = this.currentIds.vacancies++;
    const now = new Date();
    const newVacancy: Vacancy = { 
      ...vacancy, 
      id, 
      createdAt: now, 
      updatedAt: now,
      function: vacancy.function ?? null,
      status: vacancy.status ?? "open"
    };
    this.vacancies.set(id, newVacancy);
    
    // Create activity for new vacancy
    this.createActivity({
      userId: 1,
      type: "new_vacancy",
      description: `New vacancy ${vacancy.title} created`,
      relatedType: "vacancy",
      relatedId: id
    });
    
    // Create default pipeline stages for this vacancy
    const stageNames = ["Applications", "Screening", "Interview", "Offer", "Hired"];
    stageNames.forEach((name, index) => {
      const stageId = this.currentIds.pipelineStages++;
      const stage: PipelineStage = {
        id: stageId,
        name,
        vacancyId: id,
        count: 0,
        order: index + 1
      };
      this.pipelineStages.set(stageId, stage);
    });
    
    return newVacancy;
  }
  
  async updateVacancy(id: number, vacancyUpdate: Partial<InsertVacancy>): Promise<Vacancy | undefined> {
    const vacancy = this.vacancies.get(id);
    if (!vacancy) return undefined;
    
    const updatedVacancy: Vacancy = {
      ...vacancy,
      ...vacancyUpdate,
      updatedAt: new Date()
    };
    
    this.vacancies.set(id, updatedVacancy);
    return updatedVacancy;
  }
  
  async deleteVacancy(id: number): Promise<boolean> {
    return this.vacancies.delete(id);
  }
  
  // Todo methods
  async getTodos(userId: number): Promise<Todo[]> {
    return Array.from(this.todos.values()).filter(todo => todo.userId === userId);
  }
  
  async getTodo(id: number): Promise<Todo | undefined> {
    return this.todos.get(id);
  }
  
  async getTodoByExternalId(externalId: string): Promise<Todo | undefined> {
    return Array.from(this.todos.values()).find(
      todo => todo.externalId === externalId
    );
  }
  
  async createTodo(todo: InsertTodo): Promise<Todo> {
    const id = this.currentIds.todos++;
    const now = new Date();
    const newTodo: Todo = { 
      ...todo, 
      id, 
      createdAt: now,
      vtigerId: null,
      externalId: null,
      lastSyncedAt: null,
      completed: false
    };
    this.todos.set(id, newTodo);
    return newTodo;
  }
  
  async updateTodo(id: number, todoUpdate: Partial<InsertTodo>): Promise<Todo | undefined> {
    const todo = this.todos.get(id);
    if (!todo) return undefined;
    
    const updatedTodo: Todo = {
      ...todo,
      ...todoUpdate
    };
    
    this.todos.set(id, updatedTodo);
    return updatedTodo;
  }
  
  async deleteTodo(id: number): Promise<boolean> {
    return this.todos.delete(id);
  }

  // KPI Targets methods
  async getKpiTargets(userId: number): Promise<KpiTargets> {
    // Return default targets if no user-specific targets exist
    const defaultTargets: KpiTargets = {
      id: 0,
      userId: userId,
      dailyCalls: 30,
      weeklyPlacements: 3,
      monthlyRevenue: 20000,
      currency: 'EUR',
      conversionRate: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return defaultTargets;
  }

  async updateKpiTargets(userId: number, targets: Partial<InsertKpiTargets>): Promise<KpiTargets> {
    // For in-memory storage, just return the updated targets
    const updatedTargets: KpiTargets = {
      id: 0,
      userId: userId,
      dailyCalls: targets.dailyCalls ?? 30,
      weeklyPlacements: targets.weeklyPlacements ?? 3,
      monthlyRevenue: targets.monthlyRevenue ?? 20000,
      currency: targets.currency ?? 'EUR',
      conversionRate: targets.conversionRate ?? 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return updatedTargets;
  }
  
  // Activity methods
  async getActivities(): Promise<Activity[]> {
    return Array.from(this.activities.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  
  async createActivity(activity: InsertActivity): Promise<Activity> {
    const id = this.currentIds.activities++;
    const now = new Date();
    const newActivity: Activity = { 
      ...activity, 
      id, 
      createdAt: now,
      relatedType: activity.relatedType ?? null,
      relatedId: activity.relatedId ?? null
    };
    this.activities.set(id, newActivity);
    return newActivity;
  }
  
  // Interview methods
  async getInterviews(): Promise<Interview[]> {
    return Array.from(this.interviews.values())
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }
  
  async getInterview(id: number): Promise<Interview | undefined> {
    return this.interviews.get(id);
  }
  
  async createInterview(interview: InsertInterview): Promise<Interview> {
    const id = this.currentIds.interviews++;
    const now = new Date();
    const newInterview: Interview = { 
      ...interview, 
      id, 
      createdAt: now,
      updatedAt: now,
      type: interview.type ?? "video",
      status: interview.status ?? "scheduled",
      notes: interview.notes ?? null,
      feedback: interview.feedback ?? null
    };
    this.interviews.set(id, newInterview);
    
    // Create activity for new interview
    const candidate = this.candidates.get(interview.candidateId);
    const vacancy = this.vacancies.get(interview.vacancyId);
    
    if (candidate && vacancy) {
      this.createActivity({
        userId: 1,
        type: "interview_scheduled",
        description: `Interview scheduled for ${candidate.firstName} ${candidate.lastName} for ${vacancy.title}`,
        relatedType: "interview",
        relatedId: id
      });
    }
    
    return newInterview;
  }
  
  async updateInterview(id: number, interviewUpdate: Partial<InsertInterview>): Promise<Interview | undefined> {
    const interview = this.interviews.get(id);
    if (!interview) return undefined;
    
    const updatedInterview: Interview = {
      ...interview,
      ...interviewUpdate,
      updatedAt: new Date()
    };
    
    this.interviews.set(id, updatedInterview);
    return updatedInterview;
  }
  
  async deleteInterview(id: number): Promise<boolean> {
    return this.interviews.delete(id);
  }
  
  // Pipeline methods
  async getPipelineStages(vacancyId: number): Promise<PipelineStage[]> {
    return Array.from(this.pipelineStages.values())
      .filter(stage => stage.vacancyId === vacancyId)
      .sort((a, b) => a.order - b.order);
  }
  
  async updatePipelineStage(id: number, stageUpdate: Partial<InsertPipelineStage>): Promise<PipelineStage | undefined> {
    const stage = this.pipelineStages.get(id);
    if (!stage) return undefined;
    
    const updatedStage: PipelineStage = {
      ...stage,
      ...stageUpdate
    };
    
    this.pipelineStages.set(id, updatedStage);
    return updatedStage;
  }
  
  // Job matching
  async matchCandidatesToVacancy(vacancyId: number, limit?: number, offset?: number): Promise<{
    candidates: Array<Candidate & { matchScore?: number, matchCriteria?: string[] }>;
    total: number;
  }> {
    const vacancy = this.vacancies.get(vacancyId);
    if (!vacancy) return { candidates: [], total: 0 };
    
    const candidatesList = Array.from(this.candidates.values());
    
    const matchedCandidates = candidatesList
      .map(candidate => {
        const matchCriteria: string[] = [];
        let matchScore = 0;

        // Skills match (40% of total score)
        if (vacancy.skills && candidate.skills && vacancy.skills.length > 0 && candidate.skills.length > 0) {
          const matchedSkills = vacancy.skills.filter(skill => 
            candidate.skills!.some(candidateSkill => 
              candidateSkill.toLowerCase().includes(skill.toLowerCase()) ||
              skill.toLowerCase().includes(candidateSkill.toLowerCase())
            )
          );
          if (matchedSkills.length > 0) {
            const skillsScore = (matchedSkills.length / vacancy.skills.length) * 40;
            matchScore += skillsScore;
            matchCriteria.push(`Skills (${matchedSkills.length}/${vacancy.skills.length})`);
          }
        }

        // Location match (20% of total score)
        if (vacancy.location && candidate.location) {
          const locationMatches = candidate.location.toLowerCase().includes(vacancy.location.toLowerCase()) || 
                                 vacancy.location.toLowerCase().includes(candidate.location.toLowerCase());
          if (locationMatches) {
            matchScore += 20;
            matchCriteria.push('Location');
          }
        }

        // Experience match (20% of total score)
        if (vacancy.experienceLevel && candidate.experience !== null && candidate.experience !== undefined) {
          const experienceMatches = (vacancy.experienceLevel === "Senior" && candidate.experience >= 5) ||
                                   (vacancy.experienceLevel === "Mid-level" && candidate.experience >= 3 && candidate.experience < 5) ||
                                   (vacancy.experienceLevel === "Junior" && candidate.experience < 3);
          if (experienceMatches) {
            matchScore += 20;
            matchCriteria.push('Experience Level');
          }
        }

        // Title/Role match (20% of total score)
        if (vacancy.title && (candidate.jobTitle || candidate.currentTitle || candidate.profileSummary)) {
          const titleMatches = [candidate.jobTitle, candidate.currentTitle, candidate.profileSummary]
            .filter(Boolean)
            .some(field => 
              field!.toLowerCase().includes(vacancy.title.toLowerCase()) ||
              vacancy.title.toLowerCase().includes(field!.toLowerCase())
            );
          if (titleMatches) {
            matchScore += 20;
            matchCriteria.push('Job Title/Role');
          }
        }

        return {
          ...candidate,
          matchScore: Math.round(matchScore),
          matchCriteria
        };
      })
      .filter(candidate => candidate.matchScore && candidate.matchScore > 0)
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const total = matchedCandidates.length;
    
    // Apply pagination if specified
    const paginatedCandidates = (limit !== undefined && offset !== undefined) 
      ? matchedCandidates.slice(offset, offset + limit)
      : matchedCandidates;
    
    return {
      candidates: paginatedCandidates,
      total
    };
  }
  
  // Job Title methods for automated sourcing
  async getJobTitles(): Promise<JobTitle[]> {
    return Array.from(this.jobTitles.values());
  }

  async getActiveJobTitles(): Promise<JobTitle[]> {
    return Array.from(this.jobTitles.values()).filter(jobTitle => jobTitle.isActive);
  }

  async getJobTitle(id: number): Promise<JobTitle | undefined> {
    return this.jobTitles.get(id);
  }

  async createJobTitle(jobTitle: InsertJobTitle): Promise<JobTitle> {
    const id = this.currentIds.jobTitles++;
    const now = new Date();
    
    const newJobTitle: JobTitle = {
      id,
      title: jobTitle.title,
      isActive: jobTitle.isActive ?? true,
      sources: jobTitle.sources ?? ['linkedin', 'github'],
      lastRunAt: jobTitle.lastRunAt ?? null,
      createdAt: now,
      updatedAt: now
    };
    
    this.jobTitles.set(id, newJobTitle);
    return newJobTitle;
  }

  async updateJobTitle(id: number, jobTitleUpdate: Partial<InsertJobTitle>): Promise<JobTitle | undefined> {
    const jobTitle = await this.getJobTitle(id);
    if (!jobTitle) return undefined;
    
    const updatedJobTitle: JobTitle = {
      ...jobTitle,
      ...jobTitleUpdate,
      updatedAt: new Date()
    };
    
    this.jobTitles.set(id, updatedJobTitle);
    return updatedJobTitle;
  }

  async deleteJobTitle(id: number): Promise<boolean> {
    return this.jobTitles.delete(id);
  }

  // Sourced Profile methods
  async getSourcedProfiles(): Promise<SourcedProfile[]> {
    return Array.from(this.sourcedProfiles.values());
  }

  async getSourcedProfile(id: number): Promise<SourcedProfile | undefined> {
    return this.sourcedProfiles.get(id);
  }

  async getSourcedProfileByUrl(profileUrl: string): Promise<SourcedProfile | undefined> {
    return Array.from(this.sourcedProfiles.values()).find(
      profile => profile.profileUrl === profileUrl
    );
  }

  async createSourcedProfile(profile: InsertSourcedProfile): Promise<SourcedProfile> {
    const id = this.currentIds.sourcedProfiles++;
    const now = new Date();
    
    const newProfile: SourcedProfile = {
      id,
      name: profile.name || null,
      profileUrl: profile.profileUrl,
      source: profile.source,
      jobTitleId: profile.jobTitleId,
      
      // Enhanced data fields
      profileTitle: profile.profileTitle || null,
      description: profile.description || null,
      rawData: profile.rawData || {},
      extractedSkills: profile.extractedSkills || null,
      location: profile.location || null,
      email: profile.email || null,
      contactInfo: profile.contactInfo || null,
      
      // Processing status fields
      candidateId: profile.candidateId || null,
      vtigerId: profile.vtigerId || null,
      processed: profile.processed || false,
      syncStatus: profile.syncStatus || 'pending',
      lastProcessedAt: profile.lastProcessedAt || null,
      createdAt: now
    };
    
    this.sourcedProfiles.set(id, newProfile);
    return newProfile;
  }

  async updateSourcedProfile(id: number, profileUpdate: Partial<InsertSourcedProfile>): Promise<SourcedProfile | undefined> {
    const profile = await this.getSourcedProfile(id);
    if (!profile) return undefined;
    
    const updatedProfile: SourcedProfile = {
      ...profile,
      ...profileUpdate
    };
    
    this.sourcedProfiles.set(id, updatedProfile);
    return updatedProfile;
  }

  async deleteSourcedProfile(id: number): Promise<boolean> {
    return this.sourcedProfiles.delete(id);
  }

  // Candidate Status methods - stub implementations
  async getCandidateStatuses(vacancyId: number): Promise<CandidateStatus[]> { return []; }
  async getAllCandidateStatuses(): Promise<CandidateStatus[]> { return []; }
  async getCandidateStatus(candidateId: number, vacancyId: number): Promise<CandidateStatus | undefined> { return undefined; }
  async createCandidateStatus(status: InsertCandidateStatus): Promise<CandidateStatus> { throw new Error("Not implemented"); }
  async updateCandidateStatus(candidateId: number, vacancyId: number, update: Partial<InsertCandidateStatus>): Promise<CandidateStatus | undefined> { return undefined; }
  async deleteCandidateStatus(candidateId: number, vacancyId: number): Promise<boolean> { return false; }

  // Candidate Vacancy Assignments methods - stub implementation
  async getCandidateVacancyAssignments(candidateId: number): Promise<Array<{vacancy: Vacancy; status: string; assignedAt: Date}>> {
    return [];
  }

  // Candidate Notes methods - stub implementations
  async getCandidateNotes(candidateId: number): Promise<CandidateNote[]> { return []; }
  async getCandidateNote(id: number): Promise<CandidateNote | undefined> { return undefined; }
  async createCandidateNote(note: InsertCandidateNote): Promise<CandidateNote> { throw new Error("Not implemented"); }
  async updateCandidateNote(id: number, note: Partial<InsertCandidateNote>): Promise<CandidateNote | undefined> { return undefined; }
  async deleteCandidateNote(id: number): Promise<boolean> { return false; }
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUsers(): Promise<User[]> {
    try {
      console.log("Fetching users from database...");
      const result = await db.select().from(users);
      console.log("Users fetched successfully:", result.length);
      return result;
    } catch (error) {
      console.error("Error fetching users:", error);
      throw error;
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        createdAt: new Date(),
        updatedAt: new Date(),
        passwordHash: insertUser.passwordHash || null,
        isActive: insertUser.isActive ?? true,
        inviteToken: insertUser.inviteToken || null,
        inviteTokenExpiry: insertUser.inviteTokenExpiry || null,
        resetToken: insertUser.resetToken || null,
        resetTokenExpiry: insertUser.resetTokenExpiry || null,
        lastLoginAt: insertUser.lastLoginAt || null,
      })
      .returning();
    return user;
  }

  // Candidate methods
  async getCandidates(): Promise<Candidate[]> {
    const result = await db.select().from(candidates);
    console.log(`[CRITICAL DEBUG] DatabaseStorage: Fetched ${result.length} candidates from database`);
    
    if (result.length > 0) {
      console.log("[CRITICAL DEBUG] Sample candidate fields:", Object.keys(result[0]));
      const sample = result[0];
      console.log("[CRITICAL DEBUG] Sample titleDescription:", sample.titleDescription);
      console.log("[CRITICAL DEBUG] Sample profileSummary:", sample.profileSummary);
      console.log("[CRITICAL DEBUG] Sample linkedinUrl:", sample.linkedinUrl);
      
      // Test specific candidates we know have data (IDs: 52, 94, 110, 120, 128)
      const knownCandidatesWithData = result.filter(c => 
        [52, 94, 110, 120, 128].includes(c.id)
      );
      console.log(`[CRITICAL DEBUG] Found ${knownCandidatesWithData.length} candidates with known database IDs`);
      
      if (knownCandidatesWithData.length > 0) {
        for (const candidate of knownCandidatesWithData) {
          console.log(`[CRITICAL DEBUG] ID ${candidate.id} - ${candidate.firstName} ${candidate.lastName}:`);
          console.log(`[CRITICAL DEBUG]   titleDescription: "${candidate.titleDescription}"`);
          console.log(`[CRITICAL DEBUG]   profileSummary: "${candidate.profileSummary}"`);  
          console.log(`[CRITICAL DEBUG]   linkedinUrl: "${candidate.linkedinUrl}"`);
        }
      }
      
      // Test all candidates with data
      const candidatesWithData = result.filter(c => 
        c.titleDescription || c.profileSummary || c.linkedinUrl
      );
      console.log(`[CRITICAL DEBUG] Total candidates with field data: ${candidatesWithData.length}`);
    }
    return result;
  }

  /**
   * Get candidates missing key Vtiger data (used for enrichment)
   */
  async getCandidatesMissingVtigerData(): Promise<Candidate[]> {
    const result = await db.select().from(candidates).where(
      or(
        isNull(candidates.profileSummary),
        eq(candidates.profileSummary, ""),
        isNull(candidates.vtigerId)
      )
    );
    console.log(`🔍 Found ${result.length} candidates missing Vtiger profile data`);
    return result;
  }

  async getCandidate(id: number): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate || undefined;
  }

  async getCandidateByEmail(email: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.email, email));
    return candidate || undefined;
  }

  async getCandidateByVtigerId(vtigerId: string): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.vtigerId, vtigerId));
    return candidate || undefined;
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const [newCandidate] = await db
      .insert(candidates)
      .values({
        ...candidate,
        phone: candidate.phone ?? null,
        jobTitle: candidate.jobTitle ?? null,
        titleDescription: candidate.titleDescription ?? null,
        profileSummary: candidate.profileSummary ?? null,
        company: candidate.company ?? null,
        companyLocation: candidate.companyLocation ?? null,
        branche: candidate.branche ?? null,
        location: candidate.location ?? null,
        durationCurrentRole: candidate.durationCurrentRole ?? null,
        durationAtCompany: candidate.durationAtCompany ?? null,
        pastEmployer: candidate.pastEmployer ?? null,
        pastRoleTitle: candidate.pastRoleTitle ?? null,
        pastExperienceDuration: candidate.pastExperienceDuration ?? null,
        currentTitle: candidate.currentTitle ?? null,
        targetRole: candidate.targetRole ?? null,
        accountName: candidate.accountName ?? null,
        skills: candidate.skills ?? [],
        department: candidate.department ?? null,
        education: candidate.education ?? null,
        availability: candidate.availability ?? null,
        resume: candidate.resume ?? null,
        linkedinUrl: normalizeLinkedInUrl(candidate.linkedinUrl),
        notes: candidate.notes ?? null,
        status: candidate.status ?? "Uncontacted",
        source: candidate.source ?? null,
        vtigerId: candidate.vtigerId ?? null,
        externalId: candidate.externalId ?? null,
        lastSyncedAt: candidate.lastSyncedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newCandidate;
  }

  async updateCandidate(id: number, candidateUpdate: Partial<InsertCandidate>): Promise<Candidate | undefined> {
    // Normalize LinkedIn URL if provided
    const normalizedUpdate = {
      ...candidateUpdate,
      updatedAt: new Date(),
    };
    
    if (candidateUpdate.linkedinUrl !== undefined) {
      normalizedUpdate.linkedinUrl = normalizeLinkedInUrl(candidateUpdate.linkedinUrl);
    }
    
    const [updatedCandidate] = await db
      .update(candidates)
      .set(normalizedUpdate)
      .where(eq(candidates.id, id))
      .returning();
    return updatedCandidate || undefined;
  }

  async deleteCandidate(id: number): Promise<boolean> {
    const result = await db.delete(candidates).where(eq(candidates.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async searchCandidates(searchTerm: string): Promise<Candidate[]> {
    const allCandidates = await this.getCandidates();
    const lowerSearchTerm = searchTerm.toLowerCase();
    
    return allCandidates.filter(candidate => 
      candidate.firstName.toLowerCase().includes(lowerSearchTerm) ||
      candidate.lastName.toLowerCase().includes(lowerSearchTerm) ||
      candidate.email.toLowerCase().includes(lowerSearchTerm) ||
      candidate.jobTitle?.toLowerCase().includes(lowerSearchTerm) ||
      candidate.company?.toLowerCase().includes(lowerSearchTerm) ||
      (candidate.skills && candidate.skills.some(skill => skill.toLowerCase().includes(lowerSearchTerm)))
    );
  }

  // Client methods
  async getClients(): Promise<Client[]> {
    const result = await db.select().from(clients);
    return result;
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async getClientByEmail(email: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.email, email));
    return client || undefined;
  }

  async getClientByName(companyName: string): Promise<Client | undefined> {
    const allClients = await db.select().from(clients);
    return allClients.find(client => client.name.toLowerCase() === companyName.toLowerCase());
  }

  async getClientByVtigerId(vtigerId: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.vtigerId, vtigerId));
    return client || undefined;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [newClient] = await db
      .insert(clients)
      .values({
        ...client,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newClient;
  }

  async updateClient(id: number, clientUpdate: Partial<InsertClient>): Promise<Client | undefined> {
    const [updatedClient] = await db
      .update(clients)
      .set({
        ...clientUpdate,
        updatedAt: new Date(),
      })
      .where(eq(clients.id, id))
      .returning();
    return updatedClient || undefined;
  }

  async deleteClient(id: number): Promise<boolean> {
    const result = await db.delete(clients).where(eq(clients.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Vacancy methods
  async getVacancies(): Promise<(Vacancy & { ownerName?: string })[]> {
    const result = await db
      .select({
        ...getTableColumns(vacancies),
        ownerName: users.fullName,
      })
      .from(vacancies)
      .leftJoin(users, eq(vacancies.ownerId, users.id));
    return result;
  }

  async getVacancy(id: number): Promise<Vacancy | undefined> {
    const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.id, id));
    return vacancy || undefined;
  }

  async getVacancyByTitle(title: string): Promise<Vacancy | undefined> {
    const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.title, title));
    return vacancy || undefined;
  }

  async getVacancyByVtigerId(vtigerId: string): Promise<Vacancy | undefined> {
    const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.vtigerId, vtigerId));
    return vacancy || undefined;
  }

  async createVacancy(vacancy: InsertVacancy): Promise<Vacancy> {
    const [newVacancy] = await db
      .insert(vacancies)
      .values({
        ...vacancy,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newVacancy;
  }

  async updateVacancy(id: number, vacancyUpdate: Partial<InsertVacancy>): Promise<Vacancy | undefined> {
    const [updatedVacancy] = await db
      .update(vacancies)
      .set({
        ...vacancyUpdate,
        updatedAt: new Date(),
      })
      .where(eq(vacancies.id, id))
      .returning();
    return updatedVacancy || undefined;
  }

  async deleteVacancy(id: number): Promise<boolean> {
    const result = await db.delete(vacancies).where(eq(vacancies.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getTodos(userId: number): Promise<Todo[]> { 
    const result = await db.select().from(todos).where(eq(todos.userId, userId));
    return result;
  }
  
  async getTodo(id: number): Promise<Todo | undefined> { 
    const [todo] = await db.select().from(todos).where(eq(todos.id, id));
    return todo || undefined;
  }
  
  async getTodoByExternalId(externalId: string): Promise<Todo | undefined> { 
    const [todo] = await db.select().from(todos).where(eq(todos.externalId, externalId));
    return todo || undefined;
  }
  
  async createTodo(todo: InsertTodo): Promise<Todo> { 
    const [newTodo] = await db
      .insert(todos)
      .values({
        ...todo,
        description: todo.description ?? null,
        dueDate: todo.dueDate ?? null,
        priority: todo.priority ?? "medium",
        status: todo.status ?? "pending",
        completed: false,
        relatedType: todo.relatedType ?? null,
        relatedId: todo.relatedId ?? null,
        vtigerId: null,
        externalId: null,
        lastSyncedAt: null,
        createdAt: new Date(),
      })
      .returning();
    return newTodo;
  }
  
  async updateTodo(id: number, todo: Partial<InsertTodo>): Promise<Todo | undefined> { 
    const [updatedTodo] = await db
      .update(todos)
      .set(todo)
      .where(eq(todos.id, id))
      .returning();
    return updatedTodo || undefined;
  }
  
  async deleteTodo(id: number): Promise<boolean> { 
    const result = await db.delete(todos).where(eq(todos.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // KPI Targets methods
  async getKpiTargets(userId: number): Promise<KpiTargets> {
    // Try to get user-specific targets first
    const [userTargets] = await db
      .select()
      .from(kpiTargets)
      .where(eq(kpiTargets.userId, userId));
    
    if (userTargets) {
      return userTargets;
    }
    
    // Return default targets if no user-specific targets exist
    const defaultTargets: KpiTargets = {
      id: 0,
      userId: userId,
      dailyCalls: 30,
      weeklyPlacements: 3,
      monthlyRevenue: 20000,
      currency: 'EUR',
      conversionRate: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return defaultTargets;
  }

  async updateKpiTargets(userId: number, targets: Partial<InsertKpiTargets>): Promise<KpiTargets> {
    // Check if user-specific targets already exist
    const [existingTargets] = await db
      .select()
      .from(kpiTargets)
      .where(eq(kpiTargets.userId, userId));
    
    if (existingTargets) {
      // Update existing targets
      const [updatedTargets] = await db
        .update(kpiTargets)
        .set({
          ...targets,
          updatedAt: new Date(),
        })
        .where(eq(kpiTargets.userId, userId))
        .returning();
      return updatedTargets;
    } else {
      // Create new targets for this user
      const [newTargets] = await db
        .insert(kpiTargets)
        .values({
          userId,
          dailyCalls: targets.dailyCalls ?? 30,
          weeklyPlacements: targets.weeklyPlacements ?? 3,
          monthlyRevenue: targets.monthlyRevenue ?? 20000,
          conversionRate: targets.conversionRate ?? 3,
        })
        .returning();
      return newTargets;
    }
  }

  // Other placeholder methods for interface compliance
  async getActivities(userId: number): Promise<Activity[]> { return []; }
  async getActivity(id: number): Promise<Activity | undefined> { return undefined; }
  async createActivity(activity: InsertActivity): Promise<Activity> { throw new Error("Not implemented"); }
  async updateActivity(id: number, activity: Partial<InsertActivity>): Promise<Activity | undefined> { return undefined; }
  async deleteActivity(id: number): Promise<boolean> { return false; }

  async getInterviews(): Promise<Interview[]> { return []; }
  async getInterview(id: number): Promise<Interview | undefined> { return undefined; }
  async createInterview(interview: InsertInterview): Promise<Interview> { throw new Error("Not implemented"); }
  async updateInterview(id: number, interview: Partial<InsertInterview>): Promise<Interview | undefined> { return undefined; }
  async deleteInterview(id: number): Promise<boolean> { return false; }

  async getPipelineStages(): Promise<PipelineStage[]> { return []; }
  async getPipelineStage(id: number): Promise<PipelineStage | undefined> { return undefined; }
  async createPipelineStage(stage: InsertPipelineStage): Promise<PipelineStage> { throw new Error("Not implemented"); }
  async updatePipelineStage(id: number, stage: Partial<InsertPipelineStage>): Promise<PipelineStage | undefined> { return undefined; }
  async deletePipelineStage(id: number): Promise<boolean> { return false; }

  async matchCandidatesToVacancy(vacancyId: number, limit?: number, offset?: number, search?: string): Promise<{
    candidates: Array<Candidate & { 
      matchScore?: number;
      matchCriteria?: string[];
      matchDetails?: MatchResult;
    }>;
    total: number;
  }> {
    try {
      console.log(`🎯 Advanced Vacancy Matcher: Processing vacancy ${vacancyId}`);
      
      // Get the vacancy from database
      const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.id, vacancyId));
      if (!vacancy) {
        console.log(`❌ No vacancy found with ID ${vacancyId}`);
        return [];
      }

      console.log(`📋 Found vacancy "${vacancy.title}" with ${vacancy.skills?.length || 0} required skills`);
      
      // Get all candidates from database
      const allCandidates = await db.select().from(candidates);
      console.log(`👥 Analyzing ${allCandidates.length} candidates for matches`);
      
      let matchedCandidates = allCandidates
        .map(candidate => {
          // Use the sophisticated matching algorithm
          const matchResult = VacancyMatcher.calculateMatchScore(candidate, vacancy);
          
          // Convert the detailed match into legacy format for backward compatibility
          const matchCriteria: string[] = [];
          
          if (matchResult.criteria.skillsScore > 0) {
            matchCriteria.push(`${matchResult.matchIcon} Skills (${matchResult.criteria.skillsScore}%)`);
          }
          if (matchResult.criteria.locationScore > 0) {
            matchCriteria.push(`🌍 Location (${matchResult.criteria.locationScore}%)`);
          }
          if (matchResult.criteria.experienceScore > 0) {
            matchCriteria.push(`⭐ Experience (${matchResult.criteria.experienceScore}%)`);
          }
          if (matchResult.criteria.titleScore > 0) {
            matchCriteria.push(`💼 Title Match (${matchResult.criteria.titleScore}%)`);
          }
          if (matchResult.criteria.educationScore > 0) {
            matchCriteria.push(`🎓 Education (${matchResult.criteria.educationScore}%)`);
          }
          if (matchResult.criteria.industryScore > 0) {
            matchCriteria.push(`🏢 Industry (${matchResult.criteria.industryScore}%)`);
          }

          return {
            ...candidate,
            matchScore: matchResult.totalScore,
            matchCriteria,
            matchDetails: matchResult
          };
        })
        .filter(candidate => candidate.matchScore && candidate.matchScore >= 15) // Lower threshold for more inclusive results
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

      // Apply name search filter if provided
      if (search && search.trim()) {
        const searchLower = search.toLowerCase().trim();
        console.log(`🔍 Applying name search filter: "${search}"`);
        matchedCandidates = matchedCandidates.filter(candidate => {
          const fullName = `${candidate.firstName} ${candidate.lastName}`.toLowerCase();
          const matches = fullName.includes(searchLower);
          if (matches) {
            console.log(`✅ Found matching candidate: ${candidate.firstName} ${candidate.lastName}`);
          }
          return matches;
        });
        console.log(`🔍 Search filtered to ${matchedCandidates.length} candidates`);
      }

      const total = matchedCandidates.length;
      console.log(`✅ Found ${total} candidates with sophisticated match scores`);
      console.log(`📊 Match distribution: Strong (≥70%): ${matchedCandidates.filter(c => c.matchScore! >= 70).length}, Moderate (40-69%): ${matchedCandidates.filter(c => c.matchScore! >= 40 && c.matchScore! < 70).length}, Weak (<40%): ${matchedCandidates.filter(c => c.matchScore! < 40).length}`);
      
      // Auto-assign strong matches (70%+) to the vacancy
      const strongMatches = matchedCandidates.filter(c => c.matchScore! >= 70);
      if (strongMatches.length > 0) {
        console.log(`🎯 Auto-assigning ${strongMatches.length} strong matches to vacancy ${vacancyId}`);
        
        for (const candidate of strongMatches) {
          try {
            // Check if candidate is already assigned to this vacancy
            const existingStatus = await this.getCandidateStatus(candidate.id, vacancyId);
            
            if (!existingStatus) {
              // Auto-assign with 'todo' status
              await this.createCandidateStatus({
                candidateId: candidate.id,
                vacancyId: vacancyId,
                status: 'todo',
                userId: 1, // System user for auto-assignments
                notes: `Auto-assigned due to strong match (${candidate.matchScore}%)`
              });
              
              console.log(`✅ Auto-assigned ${candidate.firstName} ${candidate.lastName} (${candidate.matchScore}%) to vacancy ${vacancyId}`);
            } else {
              console.log(`ℹ️ ${candidate.firstName} ${candidate.lastName} already assigned to vacancy ${vacancyId} with status: ${existingStatus.status}`);
            }
          } catch (error) {
            console.error(`❌ Failed to auto-assign candidate ${candidate.id} to vacancy ${vacancyId}:`, error);
          }
        }
      }
      
      // Save match scores to database (only moderate+ matches, 50% threshold)
      const matchesToCache = matchedCandidates
        .filter(c => c.matchScore && c.matchScore >= 50)
        .map(c => ({
          candidateId: c.id,
          matchScore: c.matchScore!,
          breakdown: c.matchDetails
        }));
      
      if (matchesToCache.length > 0) {
        try {
          await this.saveMatchScores(vacancyId, matchesToCache);
          console.log(`💾 Cached ${matchesToCache.length} match scores for vacancy ${vacancyId}`);
        } catch (error) {
          console.error(`❌ Failed to cache match scores:`, error);
        }
      }
      
      // Apply pagination if specified
      const paginatedCandidates = (limit !== undefined && offset !== undefined) 
        ? matchedCandidates.slice(offset, offset + limit)
        : matchedCandidates;
      
      return {
        candidates: paginatedCandidates,
        total
      };
    } catch (error) {
      console.error("❌ Error in advanced vacancy matching:", error);
      return { candidates: [], total: 0 };
    }
  }

  async getJobTitles(): Promise<JobTitle[]> { return []; }
  async getActiveJobTitles(): Promise<JobTitle[]> { return []; }
  async getJobTitle(id: number): Promise<JobTitle | undefined> { return undefined; }
  async createJobTitle(jobTitle: InsertJobTitle): Promise<JobTitle> { throw new Error("Not implemented"); }
  async updateJobTitle(id: number, jobTitle: Partial<InsertJobTitle>): Promise<JobTitle | undefined> { return undefined; }
  async deleteJobTitle(id: number): Promise<boolean> { return false; }

  async getSourcedProfiles(): Promise<SourcedProfile[]> { return []; }
  async getSourcedProfile(id: number): Promise<SourcedProfile | undefined> { return undefined; }
  async getSourcedProfileByUrl(profileUrl: string): Promise<SourcedProfile | undefined> { return undefined; }
  async createSourcedProfile(profile: InsertSourcedProfile): Promise<SourcedProfile> { throw new Error("Not implemented"); }
  async updateSourcedProfile(id: number, profile: Partial<InsertSourcedProfile>): Promise<SourcedProfile | undefined> { return undefined; }
  async deleteSourcedProfile(id: number): Promise<boolean> { return false; }

  // Candidate Status methods
  async getCandidateStatuses(vacancyId: number): Promise<CandidateStatus[]> {
    const statuses = await db
      .select()
      .from(candidateStatuses)
      .where(eq(candidateStatuses.vacancyId, vacancyId));
    return statuses;
  }

  async getAllCandidateStatuses(): Promise<CandidateStatus[]> {
    const statuses = await db
      .select()
      .from(candidateStatuses);
    return statuses;
  }

  async getCandidateStatus(candidateId: number, vacancyId: number): Promise<CandidateStatus | undefined> {
    const [status] = await db
      .select()
      .from(candidateStatuses)
      .where(
        and(
          eq(candidateStatuses.candidateId, candidateId),
          eq(candidateStatuses.vacancyId, vacancyId)
        )
      );
    return status || undefined;
  }

  async createCandidateStatus(status: InsertCandidateStatus): Promise<CandidateStatus> {
    // Check if status already exists and update instead
    const [existingStatus] = await db
      .select()
      .from(candidateStatuses)
      .where(
        and(
          eq(candidateStatuses.candidateId, status.candidateId),
          eq(candidateStatuses.vacancyId, status.vacancyId)
        )
      );

    if (existingStatus) {
      // Update existing status
      const [updatedStatus] = await db
        .update(candidateStatuses)
        .set({
          status: status.status,
          userId: status.userId,
          notes: status.notes,
          updatedAt: new Date(),
        })
        .where(eq(candidateStatuses.id, existingStatus.id))
        .returning();
      return updatedStatus;
    }

    // Create new status
    const [newStatus] = await db
      .insert(candidateStatuses)
      .values({
        ...status,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newStatus;
  }

  async updateCandidateStatus(candidateId: number, vacancyId: number, update: Partial<InsertCandidateStatus>): Promise<CandidateStatus | undefined> {
    const [updatedStatus] = await db
      .update(candidateStatuses)
      .set({
        ...update,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(candidateStatuses.candidateId, candidateId),
          eq(candidateStatuses.vacancyId, vacancyId)
        )
      )
      .returning();
    return updatedStatus || undefined;
  }

  async deleteCandidateStatus(candidateId: number, vacancyId: number): Promise<boolean> {
    const result = await db
      .delete(candidateStatuses)
      .where(
        and(
          eq(candidateStatuses.candidateId, candidateId),
          eq(candidateStatuses.vacancyId, vacancyId)
        )
      );
    return result.rowCount > 0;
  }
  
  // Candidate Vacancy Assignments methods
  async getCandidateVacancyAssignments(candidateId: number): Promise<Array<{vacancy: Vacancy; status: string; assignedAt: Date}>> {
    const assignments = await db
      .select({
        vacancy: vacancies,
        status: candidateStatuses.status,
        assignedAt: candidateStatuses.createdAt
      })
      .from(candidateStatuses)
      .innerJoin(vacancies, eq(vacancies.id, candidateStatuses.vacancyId))
      .where(eq(candidateStatuses.candidateId, candidateId));
    
    console.log(`[VACANCY-ASSIGNMENT-DEBUG] Found ${assignments.length} assignments for candidate ${candidateId}:`, assignments.map(a => ({ vacancyTitle: a.vacancy.title, status: a.status })));
    
    return assignments.map(assignment => ({
      vacancy: assignment.vacancy,
      status: assignment.status,
      assignedAt: assignment.assignedAt
    }));
  }

  // Candidate Notes methods
  async getCandidateNotes(candidateId: number): Promise<CandidateNote[]> {
    const notes = await db
      .select()
      .from(candidateNotes)
      .where(eq(candidateNotes.candidateId, candidateId))
      .orderBy(desc(candidateNotes.contactDate));
    return notes;
  }

  async getCandidateNote(id: number): Promise<CandidateNote | undefined> {
    const [note] = await db
      .select()
      .from(candidateNotes)
      .where(eq(candidateNotes.id, id));
    return note || undefined;
  }

  async createCandidateNote(note: InsertCandidateNote): Promise<CandidateNote> {
    const [newNote] = await db
      .insert(candidateNotes)
      .values({
        ...note,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newNote;
  }

  async updateCandidateNote(id: number, note: Partial<InsertCandidateNote>): Promise<CandidateNote | undefined> {
    const [updatedNote] = await db
      .update(candidateNotes)
      .set({
        ...note,
        updatedAt: new Date(),
      })
      .where(eq(candidateNotes.id, id))
      .returning();
    return updatedNote || undefined;
  }

  async deleteCandidateNote(id: number): Promise<boolean> {
    const result = await db
      .delete(candidateNotes)
      .where(eq(candidateNotes.id, id));
    return result.rowCount > 0;
  }

  // Placement methods
  async getPlacements(): Promise<Placement[]> {
    const results = await db.select().from(placements);
    return results;
  }

  async getPlacement(id: number): Promise<Placement | undefined> {
    const [placement] = await db
      .select()
      .from(placements)
      .where(eq(placements.id, id));
    return placement || undefined;
  }

  async createPlacement(placement: InsertPlacement): Promise<Placement> {
    const [newPlacement] = await db
      .insert(placements)
      .values({
        ...placement,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newPlacement;
  }

  async updatePlacement(id: number, placement: Partial<InsertPlacement>): Promise<Placement | undefined> {
    const [updatedPlacement] = await db
      .update(placements)
      .set({
        ...placement,
        updatedAt: new Date(),
      })
      .where(eq(placements.id, id))
      .returning();
    return updatedPlacement || undefined;
  }

  async deletePlacement(id: number): Promise<boolean> {
    const result = await db
      .delete(placements)
      .where(eq(placements.id, id));
    return result.rowCount > 0;
  }

  // Priority Engine methods
  async createContactAttempt(attempt: InsertContactAttempt): Promise<ContactAttempt> {
    const [newAttempt] = await db
      .insert(contactAttempts)
      .values({
        ...attempt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newAttempt;
  }

  async getContactAttempts(candidateId?: number, vacancyId?: number, recruiterId?: number): Promise<ContactAttempt[]> {
    let query = db.select().from(contactAttempts);

    if (candidateId !== undefined || vacancyId !== undefined || recruiterId !== undefined) {
      const conditions = [];
      if (candidateId !== undefined) conditions.push(eq(contactAttempts.candidateId, candidateId));
      if (vacancyId !== undefined) conditions.push(eq(contactAttempts.vacancyId, vacancyId));
      if (recruiterId !== undefined) conditions.push(eq(contactAttempts.recruiterId, recruiterId));
      
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(contactAttempts.createdAt));
  }

  async createNextAction(action: InsertNextAction): Promise<NextAction> {
    const [newAction] = await db
      .insert(nextActions)
      .values({
        ...action,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newAction;
  }

  async getNextActions(recruiterId: number, status?: string): Promise<NextAction[]> {
    let query = db.select().from(nextActions).where(eq(nextActions.recruiterId, recruiterId));
    
    if (status) {
      query = query.where(and(eq(nextActions.recruiterId, recruiterId), eq(nextActions.status, status)));
    }

    return await query.orderBy(desc(nextActions.priorityScore));
  }

  async updateNextAction(id: number, updates: Partial<NextAction>): Promise<NextAction | undefined> {
    const [updatedAction] = await db
      .update(nextActions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(nextActions.id, id))
      .returning();
    return updatedAction || undefined;
  }

  async deleteNextAction(id: number): Promise<boolean> {
    const result = await db
      .delete(nextActions)
      .where(eq(nextActions.id, id));
    return result.rowCount > 0;
  }

  async getPriorityCallQueue(recruiterId: number, limit?: number): Promise<NextAction[]> {
    let query = db
      .select()
      .from(nextActions)
      .where(and(
        eq(nextActions.recruiterId, recruiterId),
        eq(nextActions.status, 'pending')
      ))
      .orderBy(desc(nextActions.priorityScore));

    if (limit) {
      query = query.limit(limit);
    }

    return await query;
  }

  async expireOldActions(beforeDate: Date): Promise<void> {
    await db
      .update(nextActions)
      .set({ 
        status: 'expired',
        updatedAt: new Date()
      })
      .where(and(
        eq(nextActions.status, 'pending'),
        lt(nextActions.createdAt, beforeDate)
      ));
  }

  async refreshRecruiterQueue(recruiterId: number): Promise<NextAction[]> {
    // Mark overdue actions as expired (older than 24 hours)
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.expireOldActions(cutoffDate);

    // Clean up very old expired actions (older than 7 days)
    const cleanupDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await db
      .delete(nextActions)
      .where(and(
        eq(nextActions.recruiterId, recruiterId),
        eq(nextActions.status, 'expired'),
        lt(nextActions.createdAt, cleanupDate)
      ));

    // Return current pending actions for this recruiter
    return await this.getPriorityCallQueue(recruiterId);
  }

  // Match Score Caching methods
  async saveMatchScores(vacancyId: number, matches: Array<{candidateId: number, matchScore: number, breakdown: any}>): Promise<void> {
    // Clear existing scores for this vacancy
    await db.delete(candidateVacancyMatches).where(eq(candidateVacancyMatches.vacancyId, vacancyId));

    // Bulk insert new match scores
    if (matches.length > 0) {
      await db.insert(candidateVacancyMatches).values(
        matches.map(match => ({
          candidateId: match.candidateId,
          vacancyId: vacancyId,
          matchScore: match.matchScore,
          breakdown: JSON.stringify(match.breakdown)
        }))
      );
    }
  }

  async getMatchScoresForVacancy(vacancyId: number, minScore?: number): Promise<Array<{candidateId: number, matchScore: number, breakdown: any, calculatedAt: Date}>> {
    let query = db
      .select()
      .from(candidateVacancyMatches)
      .where(eq(candidateVacancyMatches.vacancyId, vacancyId));

    const results = await query.orderBy(desc(candidateVacancyMatches.matchScore));

    return results
      .filter(result => minScore === undefined || result.matchScore >= minScore)
      .map(result => ({
        candidateId: result.candidateId,
        matchScore: result.matchScore,
        breakdown: result.breakdown ? JSON.parse(result.breakdown) : null,
        calculatedAt: result.calculatedAt
      }));
  }

  async getTopMatchesForRecruiter(recruiterId: number, limit: number): Promise<Array<{candidate: Candidate, vacancy: Vacancy, matchScore: number, breakdown: any}>> {
    // Get all OPEN vacancies for this recruiter
    const recruiterVacancies = await db
      .select()
      .from(vacancies)
      .where(and(
        eq(vacancies.ownerId, recruiterId),
        eq(vacancies.status, 'open')
      ));

    if (recruiterVacancies.length === 0) {
      return [];
    }

    const vacancyIds = recruiterVacancies.map(v => v.id);

    // Get top matches across all recruiter's open vacancies
    const matches = await db
      .select({
        match: candidateVacancyMatches,
        candidate: candidates,
        vacancy: vacancies
      })
      .from(candidateVacancyMatches)
      .innerJoin(candidates, eq(candidateVacancyMatches.candidateId, candidates.id))
      .innerJoin(vacancies, eq(candidateVacancyMatches.vacancyId, vacancies.id))
      .where(inArray(candidateVacancyMatches.vacancyId, vacancyIds))
      .orderBy(desc(candidateVacancyMatches.matchScore))
      .limit(limit);

    return matches.map(result => ({
      candidate: result.candidate,
      vacancy: result.vacancy,
      matchScore: result.match.matchScore,
      breakdown: result.match.breakdown ? JSON.parse(result.match.breakdown) : null
    }));
  }

  async clearMatchScoresForVacancy(vacancyId: number): Promise<void> {
    await db.delete(candidateVacancyMatches).where(eq(candidateVacancyMatches.vacancyId, vacancyId));
  }

  // Sync Metadata methods
  async createSyncMetadata(metadata: InsertSyncMetadata): Promise<SyncMetadata> {
    const [result] = await db.insert(syncMetadata).values(metadata).returning();
    return result;
  }

  async updateSyncMetadata(id: number, metadata: Partial<InsertSyncMetadata>): Promise<SyncMetadata | undefined> {
    const [result] = await db
      .update(syncMetadata)
      .set(metadata)
      .where(eq(syncMetadata.id, id))
      .returning();
    return result;
  }

  async getLatestSyncMetadata(syncType?: string): Promise<SyncMetadata | undefined> {
    const query = db
      .select()
      .from(syncMetadata)
      .orderBy(desc(syncMetadata.startedAt))
      .limit(1);

    if (syncType) {
      const [result] = await query.where(eq(syncMetadata.syncType, syncType));
      return result;
    }

    const [result] = await query;
    return result;
  }

  async getAllSyncMetadata(limit: number = 10): Promise<SyncMetadata[]> {
    return await db
      .select()
      .from(syncMetadata)
      .orderBy(desc(syncMetadata.startedAt))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();

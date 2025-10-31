import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User schema - Invite-based authentication system
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  role: text("role").notNull().default("recruiter"),
  avatar: text("avatar"),
  isActive: boolean("is_active").notNull().default(false),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  inviteToken: text("invite_token"),
  inviteTokenExpiry: timestamp("invite_token_expiry"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Schema for creating a new user invite (admin only)
export const createUserInviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(1, "Full name is required"),
  role: z.enum(["admin", "recruiter"]).default("recruiter"),
});

// Schema for setting password from invite
export const setPasswordFromInviteSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
  fullName: z.string().min(2, "Full name is required"),
  phone: z.string().optional(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  email: z.string().email("Invalid email address"),
});

// Login schema - simplified for invite-based system
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

// Password reset schema
export const passwordResetSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8, "Password must be at least 8 characters long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
});

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters long")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain at least one uppercase letter, one lowercase letter, and one number"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Edit user schema
export const editUserSchema = z.object({
  fullName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(["admin", "recruiter"]).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().optional(),
});

// Type definitions for invite-based system
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CreateUserInvite = z.infer<typeof createUserInviteSchema>;
export type SetPasswordFromInvite = z.infer<typeof setPasswordFromInviteSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordReset = z.infer<typeof passwordResetSchema>;
export type EditUser = z.infer<typeof editUserSchema>;

// Candidate schema - updated to match exact Vtiger column structure
export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(), // Vtiger: firstname
  lastName: text("last_name").notNull(), // Vtiger: lastname
  email: text("email"), // Vtiger: email
  phone: text("phone"), // Vtiger: phone
  jobTitle: text("job_title"), // Vtiger: title
  titleDescription: text("title_description"), // Vtiger: cf_title_description
  profileSummary: text("profile_summary"), // Vtiger: cf_profile_summary
  company: text("company"), // Vtiger: cf_company
  companyLocation: text("company_location"), // Vtiger: cf_company_location
  branche: text("branche"), // Vtiger: cf_branche (Industry)
  location: text("location"), // Vtiger: cf_location
  durationCurrentRole: text("duration_current_role"), // Vtiger: cf_duration_current_role
  durationAtCompany: text("duration_at_company"), // Vtiger: cf_duration_at_company
  pastEmployer: text("past_employer"), // Vtiger: cf_past_employer
  pastRoleTitle: text("past_role_title"), // Vtiger: cf_past_role_title
  pastExperienceDuration: text("past_experience_duration"), // Vtiger: cf_past_experience_duration
  scrapedOn: text("scraped_on"), // Vtiger: cf_scraped_on
  
  // Legacy fields for backward compatibility
  currentTitle: text("current_title"), // Legacy field
  targetRole: text("target_role"), // Legacy field
  skills: text("skills").array(), // Derived from profileSummary
  experience: integer("experience"), // Derived from duration fields
  education: text("education"), // Legacy field
  availability: text("availability"), // Legacy field
  resume: text("resume"), // Legacy field
  cvUrl: text("cv_url"), // URL to uploaded CV file
  formattedCvUrl: text("formatted_cv_url"), // URL to formatted CV file
  linkedinUrl: text("linkedin_url"), // Legacy field
  notes: text("notes"), // Legacy field
  
  // Salary and matching fields
  salaryRangeMin: integer("salary_range_min"), // Minimum desired salary
  salaryRangeMax: integer("salary_range_max"), // Maximum desired salary
  salaryCurrency: text("salary_currency").default("EUR"), // Currency preference
  
  status: text("status").notNull().default("Uncontacted"),
  source: text("source"), // Source of the candidate: LinkedIn, Vtiger, Manual, etc.
  vtigerId: text("vtiger_id"), // ID in Vtiger CRM
  externalId: text("external_id"), // For general external ID references
  lastSyncedAt: timestamp("last_synced_at"), // Timestamp of last sync
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCandidateSchema = createInsertSchema(candidates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client/Company schema
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  companyName: text("company_name"), // Alias for Vtiger compatibility
  industry: text("industry"),
  location: text("location"),
  website: text("website"),
  description: text("description"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  email: text("email"), // Direct company email
  phone: text("phone"), // Direct company phone
  logoUrl: text("logo_url"), // Company logo URL
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  source: text("source"), // Source of the client: Vtiger, Manual, etc.
  vtigerId: text("vtiger_id"), // ID in Vtiger CRM
  externalId: text("external_id"), // For general external ID references
  lastSyncedAt: timestamp("last_synced_at"), // Timestamp of last sync
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Vacancy schema
export const vacancies = pgTable("vacancies", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  clientId: integer("client_id").notNull(),
  ownerId: integer("owner_id").notNull(), // User who owns this vacancy
  
  // Split job description into four parts
  organization: text("organization"), // Organization description
  function: text("function"), // Function/role description
  jobRequirements: text("job_requirements"), // Job requirements
  offer: text("offer"), // What we offer
  
  // Legacy field for backward compatibility
  description: text("description"),
  requirements: text("requirements"),
  
  skills: text("skills").array(),
  experienceLevel: text("experience_level"),
  educationLevel: text("education_level"), // New educational level field
  location: text("location"),
  employmentType: text("employment_type"),
  
  // Salary range fields
  salaryRangeMin: integer("salary_range_min"), // Minimum salary
  salaryRangeMax: integer("salary_range_max"), // Maximum salary
  salaryCurrency: text("salary_currency").default("EUR"), // Currency
  salary: text("salary"), // Legacy field
  
  // Customizable matching weights (percentages, must sum to 100)
  skillsWeight: integer("skills_weight").default(40), // Technical Skills Match weight (0-100)
  locationWeight: integer("location_weight").default(25), // Location Match weight (0-100)
  experienceWeight: integer("experience_weight").default(15), // Experience Level Match weight (0-100)
  titleWeight: integer("title_weight").default(10), // Title/Role Match weight (0-100)
  educationWeight: integer("education_weight").default(5), // Education Level Match weight (0-100)
  industryWeight: integer("industry_weight").default(0), // Language/Industry Match weight (0-100)
  
  status: text("status").notNull().default("open"),
  vtigerId: text("vtiger_id"), // ID in Vtiger CRM
  externalId: text("external_id"), // For general external ID references
  lastSyncedAt: timestamp("last_synced_at"), // Timestamp of last sync
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVacancySchema = createInsertSchema(vacancies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Todo schema
export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  completed: boolean("completed").default(false),
  relatedType: text("related_type"),
  relatedId: integer("related_id"),
  vtigerId: text("vtiger_id"), // ID in Vtiger CRM
  externalId: text("external_id"), // For general external ID references
  lastSyncedAt: timestamp("last_synced_at"), // Timestamp of last sync
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Contact attempts tracking for priority engine
export const contactAttempts = pgTable("contact_attempts", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  vacancyId: integer("vacancy_id").notNull().references(() => vacancies.id),
  recruiterId: integer("recruiter_id").notNull().references(() => users.id),
  method: text("method").notNull(), // 'phone', 'linkedin', 'email'
  outcome: text("outcome").notNull(), // 'answered', 'voicemail', 'no_answer', 'callback', 'not_interested', 'requested_number', 'bad_number', 'interested'
  notes: text("notes"),
  followUpDate: timestamp("follow_up_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Next actions for recruiters (priority queue)
export const nextActions = pgTable("next_actions", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  vacancyId: integer("vacancy_id").notNull().references(() => vacancies.id),
  recruiterId: integer("recruiter_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'call', 'linkedin_request', 'email', 'nurture', 'follow_up'
  dueAt: timestamp("due_at").defaultNow(),
  reason: text("reason"), // 'new_candidate', 'follow_up_voicemail', 'callback_requested', etc.
  priorityScore: real("priority_score").default(0),
  status: text("status").default("pending"), // 'pending', 'done', 'skipped', 'expired'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Candidate-Vacancy match scores cache
export const candidateVacancyMatches = pgTable("candidate_vacancy_matches", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  vacancyId: integer("vacancy_id").notNull().references(() => vacancies.id),
  matchScore: real("match_score").notNull(), // 0-100 score
  breakdown: text("breakdown"), // JSON string with detailed breakdown
  calculatedAt: timestamp("calculated_at").notNull().defaultNow(),
});

export const insertTodoSchema = createInsertSchema(todos).omit({
  id: true,
  createdAt: true,
  completed: true,
  vtigerId: true,
  externalId: true,
  lastSyncedAt: true,
});

// KPI Targets schema
export const kpiTargets = pgTable("kpi_targets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // 0 for global/default targets
  dailyCalls: integer("daily_calls").notNull().default(30),
  weeklyPlacements: integer("weekly_placements").notNull().default(3),
  monthlyRevenue: integer("monthly_revenue").notNull().default(20000),
  currency: text("currency").notNull().default("EUR"), // EUR, USD, GBP, etc.
  conversionRate: integer("conversion_rate").notNull().default(3), // percentage
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKpiTargetsSchema = createInsertSchema(kpiTargets).omit({
  id: true,
  userId: true, // Determined server-side from authenticated user
  createdAt: true,
  updatedAt: true,
});

// Activity schema
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  relatedType: text("related_type"),
  relatedId: integer("related_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
});

// Interview schema
export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  vacancyId: integer("vacancy_id").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  endTime: timestamp("end_time").notNull(),
  type: text("type").notNull().default("video"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  feedback: text("feedback"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// For storing pipeline stages and metrics
export const pipelineStages = pgTable("pipeline_stages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  vacancyId: integer("vacancy_id").notNull(),
  count: integer("count").notNull().default(0),
  order: integer("order").notNull(),
});

export const insertPipelineStageSchema = createInsertSchema(pipelineStages).omit({
  id: true,
});

// LinkedIn tokens schema
export const linkedInTokens = pgTable("linkedin_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLinkedInTokenSchema = createInsertSchema(linkedInTokens).omit({
  id: true,
  createdAt: true,
});

export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type Vacancy = typeof vacancies.$inferSelect;
export type InsertVacancy = z.infer<typeof insertVacancySchema>;

export type Todo = typeof todos.$inferSelect;
export type InsertTodo = z.infer<typeof insertTodoSchema>;

// Contact attempts schemas
export const insertContactAttemptSchema = createInsertSchema(contactAttempts).omit({
  id: true,
  createdAt: true,
});

export type ContactAttempt = typeof contactAttempts.$inferSelect;
export type InsertContactAttempt = z.infer<typeof insertContactAttemptSchema>;

// Next actions schemas  
export const insertNextActionSchema = createInsertSchema(nextActions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NextAction = typeof nextActions.$inferSelect;
export type InsertNextAction = z.infer<typeof insertNextActionSchema>;

export type KpiTargets = typeof kpiTargets.$inferSelect;
export type InsertKpiTargets = z.infer<typeof insertKpiTargetsSchema>;

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type InsertPipelineStage = z.infer<typeof insertPipelineStageSchema>;

export type LinkedInToken = typeof linkedInTokens.$inferSelect;
export type InsertLinkedInToken = z.infer<typeof insertLinkedInTokenSchema>;

// Candidate Status Tracking for Matcher
export const candidateStatuses = pgTable("candidate_statuses", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  vacancyId: integer("vacancy_id").notNull(),
  status: text("status").notNull(), // "matched", "rejected", "todo"
  userId: integer("user_id").notNull(), // Who made the decision
  notes: text("notes"), // Optional notes about the decision
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCandidateStatusSchema = createInsertSchema(candidateStatuses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CandidateStatus = typeof candidateStatuses.$inferSelect;
export type InsertCandidateStatus = z.infer<typeof insertCandidateStatusSchema>;

// Job Titles for Automated Sourcing
export const jobTitles = pgTable("job_titles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sources: jsonb("sources").notNull().default(['linkedin', 'github']),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertJobTitleSchema = createInsertSchema(jobTitles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Sourced Profiles schema for tracking sourced candidates
export const sourcedProfiles = pgTable("sourced_profiles", {
  id: serial("id").primaryKey(),
  name: text("name"),
  profileUrl: text("profile_url").notNull().unique(),
  source: text("source").notNull(), // "linkedin", "github", etc.
  jobTitleId: integer("job_title_id").notNull(),
  
  // Enhanced candidate data fields
  profileTitle: text("profile_title"), // e.g. "Senior Frontend Engineer at X"
  description: text("description"), // Bio, snippet or extracted profile description
  rawData: jsonb("raw_data"), // Store all raw data for later processing
  extractedSkills: text("extracted_skills").array(), // Skills extracted from profile
  location: text("location"), // Location info if available
  email: text("email"), // Email if legally accessible
  contactInfo: text("contact_info"), // Other contact info
  
  // Processing status fields
  candidateId: integer("candidate_id"), // If converted to candidate
  vtigerId: text("vtiger_id"), // ID in Vtiger CRM if synced
  processed: boolean("processed").notNull().default(false),
  syncStatus: text("sync_status"), // Additional sync status info
  lastProcessedAt: timestamp("last_processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSourcedProfileSchema = createInsertSchema(sourcedProfiles).omit({
  id: true,
  createdAt: true,
});

export type JobTitle = typeof jobTitles.$inferSelect;
export type InsertJobTitle = z.infer<typeof insertJobTitleSchema>;

export type SourcedProfile = typeof sourcedProfiles.$inferSelect;
export type InsertSourcedProfile = z.infer<typeof insertSourcedProfileSchema>;

// Candidate Notes schema - for multiple notes per candidate
export const candidateNotes = pgTable("candidate_notes", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  content: text("content").notNull(),
  contactDate: timestamp("contact_date"),
  contactMethod: text("contact_method").notNull(), // "Phone", "Videocall", "Email", "Text"
  userId: integer("user_id").notNull(), // Who created the note
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCandidateNoteSchema = createInsertSchema(candidateNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  contactDate: z.string().transform((val) => {
    // Handle empty string for internal notes
    if (!val || val.trim() === '') {
      return null;
    }
    return new Date(val);
  }),
});

export type CandidateNote = typeof candidateNotes.$inferSelect;
export type InsertCandidateNote = z.infer<typeof insertCandidateNoteSchema>;

// Candidate Vacancy Links - Pipeline tracking
export const candidateVacancyLinks = pgTable("candidate_vacancy_links", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  vacancyId: integer("vacancy_id").notNull(),
  stage: text("stage").notNull().default("Uncontacted"), // Uncontacted → Contacted → First Screening → Introduced → Interviews → Contracting → Placed → Rejected (Client) → Rejected (Job)
  assignedBy: integer("assigned_by").notNull(), // User who assigned candidate to vacancy
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCandidateVacancyLinkSchema = createInsertSchema(candidateVacancyLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Interactions - Communication tracking
export const interactions = pgTable("interactions", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  vacancyId: integer("vacancy_id"), // Optional - can be general candidate interaction
  userId: integer("user_id").notNull(), // Who made the interaction
  type: text("type").notNull(), // "phone", "videocall", "email", "text", "linkedin"
  direction: text("direction").notNull(), // "inbound", "outbound"
  outcome: text("outcome"), // "connected", "voicemail", "no_answer", "bounce", "replied", etc.
  subject: text("subject"), // Email subject or call topic
  content: text("content"), // Full content/notes
  duration: integer("duration"), // Duration in minutes for calls
  scheduledAt: timestamp("scheduled_at"), // For scheduled calls/meetings
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInteractionSchema = createInsertSchema(interactions).omit({
  id: true,
  createdAt: true,
});

// Placements - Revenue tracking
export const placements = pgTable("placements", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id").notNull(),
  vacancyId: integer("vacancy_id").notNull(),
  clientId: integer("client_id").notNull(),
  placedBy: integer("placed_by").notNull(), // User who made the placement
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // For contract roles
  employmentType: text("employment_type").notNull(), // "permanent", "contract", "temp"
  buyRate: integer("buy_rate"), // What we pay the candidate (per hour/month)
  sellRate: integer("sell_rate").notNull(), // What client pays us (per hour/month)
  currency: text("currency").notNull().default("EUR"),
  margin: integer("margin"), // Calculated margin
  marginPercentage: integer("margin_percentage"), // Margin as percentage
  commissionPaid: boolean("commission_paid").default(false),
  status: text("status").notNull().default("active"), // "active", "ended", "cancelled"
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPlacementSchema = createInsertSchema(placements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Enhanced Tasks table for daily cadences and actions
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(), // User responsible
  type: text("type").notNull(), // "call", "email", "follow_up", "cv_format", "intro_send", etc.
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("medium"), // "low", "medium", "high", "urgent"
  status: text("status").notNull().default("pending"), // "pending", "in_progress", "completed", "cancelled"
  dueAt: timestamp("due_at").notNull(),
  completedAt: timestamp("completed_at"),
  relatedType: text("related_type"), // "candidate", "vacancy", "client", "placement"
  relatedId: integer("related_id"),
  candidateId: integer("candidate_id"), // Direct link for candidate tasks
  vacancyId: integer("vacancy_id"), // Direct link for vacancy tasks
  clientId: integer("client_id"), // Direct link for client tasks
  automatedTask: boolean("automated_task").default(false), // Auto-generated from cadence rules
  blockTime: text("block_time"), // "morning", "afternoon", "evening" for call blocks
  estimatedDuration: integer("estimated_duration"), // Minutes
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Revenue Forecasts - For pipeline probability calculations
export const revenueForecast = pgTable("revenue_forecast", {
  id: serial("id").primaryKey(),
  vacancyId: integer("vacancy_id").notNull(),
  stage: text("stage").notNull(),
  probabilityWeight: integer("probability_weight").notNull(), // 0-100
  forecastAmount: integer("forecast_amount").notNull(),
  currency: text("currency").notNull().default("EUR"),
  month: text("month").notNull(), // YYYY-MM format
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRevenueForecastSchema = createInsertSchema(revenueForecast).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for new tables
export type CandidateVacancyLink = typeof candidateVacancyLinks.$inferSelect;
export type InsertCandidateVacancyLink = z.infer<typeof insertCandidateVacancyLinkSchema>;

export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;

export type Placement = typeof placements.$inferSelect;
export type InsertPlacement = z.infer<typeof insertPlacementSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type RevenueForecast = typeof revenueForecast.$inferSelect;
export type InsertRevenueForecast = z.infer<typeof insertRevenueForecastSchema>;

// VTiger Sync Metadata - Track all sync operations for reliability
export const syncMetadata = pgTable("sync_metadata", {
  id: serial("id").primaryKey(),
  syncType: text("sync_type").notNull(), // "vtiger_contacts", "vtiger_accounts", etc.
  status: text("status").notNull(), // "running", "completed", "failed"
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  vtigerTotal: integer("vtiger_total"), // Total records in VTiger
  fetchedCount: integer("fetched_count"), // How many fetched from VTiger
  createdCount: integer("created_count"), // How many created in platform
  updatedCount: integer("updated_count"), // How many updated in platform
  errorCount: integer("error_count"), // How many failed
  errorMessage: text("error_message"), // Error details if failed
  lastProcessedContactId: text("last_processed_contact_id"), // Checkpoint: last VTiger contact ID successfully processed (for resumable syncs)
  metadata: jsonb("metadata"), // Additional sync details
  startedByUserId: integer("started_by_user_id").references(() => users.id), // User who started the sync
  cancelledByUserId: integer("cancelled_by_user_id").references(() => users.id), // User who cancelled the sync
  cancelReason: text("cancel_reason"), // Reason for cancellation
});

export const insertSyncMetadataSchema = createInsertSchema(syncMetadata).omit({
  id: true,
});

export type SyncMetadata = typeof syncMetadata.$inferSelect;
export type InsertSyncMetadata = z.infer<typeof insertSyncMetadataSchema>;

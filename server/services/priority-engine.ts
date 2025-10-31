import { db } from "../db";
import { eq, and, desc, asc, lt, gte, sql } from "drizzle-orm";
import { 
  candidates, 
  vacancies, 
  contactAttempts, 
  nextActions, 
  candidateStatuses,
  NextAction, 
  InsertNextAction,
  ContactAttempt,
  InsertContactAttempt,
  Candidate, 
  Vacancy 
} from "@shared/schema";
import { VacancyMatcher } from "./matcher-service";
import { DatabaseStorage } from "../storage";

interface PriorityScore {
  candidateId: number;
  vacancyId: number;
  matchScore: number;
  contactabilityScore: number;
  freshnessScore: number;
  vacancyWeight: number;
  finalScore: number;
  reason: string;
}

interface CandidateAction extends NextAction {
  candidate: Candidate;
  vacancy: Vacancy;
  canCall: boolean;
  canLinkedIn: boolean;
  lastAttempt?: ContactAttempt;
}

export class PriorityEngine {
  private matcher: VacancyMatcher;
  private storage: DatabaseStorage;

  constructor() {
    this.matcher = new VacancyMatcher();
    this.storage = new DatabaseStorage();
  }

  /**
   * Generate priority call queue for a recruiter
   * Returns the top candidates they should contact, ranked by relevance
   */
  async generateCallQueue(recruiterId: number, targetSize: number = 30): Promise<CandidateAction[]> {
    console.log(`🎯 Generating call queue for recruiter ${recruiterId}, target size: ${targetSize}`);

    // Get recruiter's assigned vacancies
    const recruiterVacancies = await db
      .select()
      .from(vacancies)
      .where(and(eq(vacancies.status, "open"), eq(vacancies.ownerId, recruiterId)));

    if (!recruiterVacancies.length) {
      console.log(`❌ No active vacancies found for recruiter ${recruiterId}`);
      return [];
    }

    console.log(`📋 Found ${recruiterVacancies.length} active vacancies`);

    // Get all candidates  
    const allCandidates = await db.select().from(candidates);
    console.log(`👥 Found ${allCandidates.length} total candidates`);

    // Calculate priority scores for each candidate-vacancy combination
    const scores: PriorityScore[] = [];
    
    for (const vacancy of recruiterVacancies) {
      // Convert database vacancy to matcher vacancy type (null -> empty array/default/undefined)
      const matcherVacancy = {
        ...vacancy,
        skills: vacancy.skills || [],
        location: vacancy.location || "",
        experienceLevel: vacancy.experienceLevel || "",
        educationLevel: vacancy.educationLevel || "",
        organization: vacancy.organization || "",
        function: vacancy.function || "",
        jobRequirements: vacancy.jobRequirements || "",
        offer: vacancy.offer || "",
        description: vacancy.description || "",
        requirements: vacancy.requirements || "",
        skillsWeight: vacancy.skillsWeight ?? undefined,
        locationWeight: vacancy.locationWeight ?? undefined,
        experienceWeight: vacancy.experienceWeight ?? undefined,
        titleWeight: vacancy.titleWeight ?? undefined,
        educationWeight: vacancy.educationWeight ?? undefined,
        industryWeight: vacancy.industryWeight ?? undefined
      };
      
      // Match all candidates against this vacancy
      for (const candidate of allCandidates) {
        // Convert database candidate to matcher candidate type (null -> undefined)
        const matcherCandidate = {
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          jobTitle: candidate.jobTitle || undefined,
          titleDescription: candidate.titleDescription || undefined,
          profileSummary: candidate.profileSummary || undefined,
          company: candidate.company || undefined,
          companyLocation: candidate.companyLocation || undefined,
          branche: candidate.branche || undefined,
          location: candidate.location || undefined,
          skills: candidate.skills || [],
          experience: candidate.experience || undefined,
          education: candidate.education || undefined,
          durationCurrentRole: candidate.durationCurrentRole || undefined,
          durationAtCompany: candidate.durationAtCompany || undefined,
          pastEmployer: candidate.pastEmployer || undefined,
          pastRoleTitle: candidate.pastRoleTitle || undefined,
          pastExperienceDuration: candidate.pastExperienceDuration || undefined
        };
        
        // Calculate match score using static matcher method
        const matchResult = VacancyMatcher.calculateMatchScore(matcherCandidate, matcherVacancy);
        const matchScore = matchResult.totalScore / 100; // Convert to 0-1 scale
        
        if (matchScore < 0.5) continue; // Skip weak matches (only show moderate 50-69% and strong 70%+)
        
        const score = await this.calculatePriorityScore(
          candidate, 
          vacancy, 
          matchScore,
          recruiterId
        );
        scores.push(score);
      }
    }

    // Sort by final score descending
    scores.sort((a, b) => b.finalScore - a.finalScore);
    
    console.log(`🔢 Generated ${scores.length} candidate-vacancy combinations`);

    // Clear existing pending actions for this recruiter
    await this.storage.refreshRecruiterQueue(recruiterId);
    
    // Convert top scores to actions and save to database
    const actions: CandidateAction[] = [];
    const processedCandidates = new Set<number>();
    
    for (const score of scores.slice(0, targetSize * 2)) { // Get extra in case some are filtered
      // Avoid duplicate candidates (each candidate should appear only once)
      if (processedCandidates.has(score.candidateId)) continue;
      processedCandidates.add(score.candidateId);

      const candidate = allCandidates.find(c => c.id === score.candidateId);
      const vacancy = recruiterVacancies.find(v => v.id === score.vacancyId);
      
      if (!candidate || !vacancy) continue;

      // Check for recent contact attempts using storage
      const recentAttempts = await this.storage.getContactAttempts(
        candidate.id, 
        undefined, 
        recruiterId
      );
      
      // Filter to last 24 hours
      const todayAttempts = recentAttempts.filter(attempt => 
        attempt.createdAt && attempt.createdAt.getTime() > Date.now() - 24 * 60 * 60 * 1000
      );

      // Skip if contacted today and outcome was negative
      if (todayAttempts.length > 0) {
        const lastAttempt = todayAttempts[0];
        if (['not_interested', 'bad_number'].includes(lastAttempt.outcome)) {
          continue;
        }
      }

      const actionType = this.determineActionType(candidate, recentAttempts[0]);
      
      // Create and persist the action to database
      const newAction = await this.storage.createNextAction({
        candidateId: candidate.id,
        vacancyId: vacancy.id,
        recruiterId,
        type: actionType,
        dueAt: new Date(),
        reason: score.reason,
        priorityScore: score.finalScore,
        status: 'pending'
      });

      // Convert to CandidateAction with full candidate/vacancy data
      const candidateAction: CandidateAction = {
        ...newAction,
        candidate,
        vacancy,
        canCall: !!candidate.phone,
        canLinkedIn: !!candidate.linkedinUrl,
        lastAttempt: recentAttempts[0]
      };

      actions.push(candidateAction);
      
      if (actions.length >= targetSize) break;
    }

    console.log(`✅ Generated and persisted ${actions.length} priority actions for recruiter ${recruiterId}`);
    return actions;
  }

  /**
   * Calculate priority score for a candidate-vacancy combination
   * Prioritizes on match score only
   */
  private async calculatePriorityScore(
    candidate: Candidate, 
    vacancy: Vacancy, 
    matchScore: number,
    recruiterId: number
  ): Promise<PriorityScore> {
    
    // Simplified: Use match score only (100% weight)
    const finalScore = matchScore;
    const reason = `Match: ${Math.round(matchScore * 100)}%`;

    return {
      candidateId: candidate.id,
      vacancyId: vacancy.id,
      matchScore,
      contactabilityScore: 0,
      freshnessScore: 0,
      vacancyWeight: 0,
      finalScore: Math.round(finalScore * 1000) / 1000, // Round to 3 decimals
      reason
    };
  }

  /**
   * Determine the appropriate action type based on candidate info and last attempt
   */
  private determineActionType(candidate: Candidate, lastAttempt?: ContactAttempt): string {
    // If we have a follow-up scheduled, use that
    if (lastAttempt?.followUpDate && lastAttempt.followUpDate > new Date()) {
      return 'follow_up';
    }

    // If last attempt outcome suggests specific next action
    if (lastAttempt) {
      switch (lastAttempt.outcome) {
        case 'no_answer':
        case 'voicemail':
          return candidate.phone ? 'call' : 'linkedin_request';
        case 'callback':
          return 'call'; // They requested a callback
        case 'requested_number':
          return 'linkedin_request'; // Continue LinkedIn until we get number
        default:
          break;
      }
    }

    // Default logic: phone if available, otherwise LinkedIn
    if (candidate.phone) {
      return 'call';
    } else if (candidate.linkedinUrl) {
      return 'linkedin_request';
    } else {
      return 'email'; // Last resort
    }
  }

  /**
   * Log a contact attempt and schedule appropriate follow-up
   */
  async logContactAttempt(
    candidateId: number,
    vacancyId: number,
    recruiterId: number,
    method: string,
    outcome: string,
    notes?: string
  ): Promise<ContactAttempt> {
    
    console.log(`📞 Logging contact attempt: Candidate ${candidateId}, Method: ${method}, Outcome: ${outcome}`);

    // Create the contact attempt record
    const attempt: InsertContactAttempt = {
      candidateId,
      vacancyId,
      recruiterId,
      method,
      outcome,
      notes,
      followUpDate: this.calculateFollowUpDate(outcome)
    };

    const [insertedAttempt] = await db.insert(contactAttempts).values(attempt).returning();

    // Schedule next action based on outcome
    await this.scheduleNextAction(candidateId, vacancyId, recruiterId, outcome, method);

    // Mark current action as done
    await db
      .update(nextActions)
      .set({ status: 'done', updatedAt: new Date() })
      .where(and(
        eq(nextActions.candidateId, candidateId),
        eq(nextActions.vacancyId, vacancyId),
        eq(nextActions.recruiterId, recruiterId),
        eq(nextActions.status, 'pending')
      ));

    return insertedAttempt;
  }

  /**
   * Calculate appropriate follow-up date based on outcome
   */
  private calculateFollowUpDate(outcome: string): Date | null {
    const now = new Date();
    
    switch (outcome) {
      case 'no_answer':
        // Call back next business day
        return this.addBusinessDays(now, 1);
      case 'voicemail':
        // Follow up in 2 business days
        return this.addBusinessDays(now, 2);
      case 'callback':
        // They'll call back, but follow up in 3 days if they don't
        return this.addBusinessDays(now, 3);
      case 'requested_number':
        // Follow up LinkedIn request in 2 days
        return this.addBusinessDays(now, 2);
      case 'not_interested':
        // Long cooldown period
        const cooldownDate = new Date(now);
        cooldownDate.setDate(cooldownDate.getDate() + 60);
        return cooldownDate;
      default:
        return null; // No follow-up needed
    }
  }

  /**
   * Schedule next action based on contact outcome
   */
  private async scheduleNextAction(
    candidateId: number,
    vacancyId: number,
    recruiterId: number,
    outcome: string,
    lastMethod: string
  ): Promise<void> {
    
    let nextActionType: string | null = null;
    let dueAt = new Date();

    switch (outcome) {
      case 'no_answer':
        nextActionType = 'call'; // Try calling again
        dueAt = this.addBusinessDays(new Date(), 1);
        break;
      case 'voicemail':
        nextActionType = 'call'; // Follow up call
        dueAt = this.addBusinessDays(new Date(), 2);
        break;
      case 'callback':
        nextActionType = 'call'; // They requested callback
        dueAt = this.addBusinessDays(new Date(), 3); // Safety net if they don't call
        break;
      case 'requested_number':
        nextActionType = 'linkedin_request'; // Continue LinkedIn
        dueAt = this.addBusinessDays(new Date(), 2);
        break;
      case 'bad_number':
        nextActionType = 'linkedin_request'; // Switch to LinkedIn
        dueAt = new Date(); // Immediately
        break;
      // 'answered', 'interested', 'not_interested' don't need automatic follow-up
    }

    if (nextActionType) {
      const nextAction: InsertNextAction = {
        candidateId,
        vacancyId,
        recruiterId,
        type: nextActionType,
        dueAt,
        reason: `Follow-up after ${outcome}`,
        priorityScore: 0.5, // Medium priority for follow-ups
        status: 'pending'
      };

      await db.insert(nextActions).values(nextAction);
      console.log(`📅 Scheduled ${nextActionType} follow-up for ${dueAt.toISOString()}`);
    }
  }

  /**
   * Add business days (skip weekends)
   */
  private addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let addedDays = 0;
    
    while (addedDays < days) {
      result.setDate(result.getDate() + 1);
      // Skip weekends (0 = Sunday, 6 = Saturday)
      if (result.getDay() !== 0 && result.getDay() !== 6) {
        addedDays++;
      }
    }
    
    return result;
  }

  /**
   * Clean up expired actions and refresh recruiter queue
   */
  async refreshRecruiterQueue(recruiterId: number): Promise<void> {
    console.log(`🔄 Refreshing queue for recruiter ${recruiterId}`);
    
    // Mark overdue actions as expired
    await db
      .update(nextActions)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(and(
        eq(nextActions.recruiterId, recruiterId),
        eq(nextActions.status, 'pending'),
        lt(nextActions.dueAt, new Date(Date.now() - 24 * 60 * 60 * 1000)) // 1 day overdue
      ));

    // Clean up very old actions
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days old
    await db
      .delete(nextActions)
      .where(and(
        eq(nextActions.recruiterId, recruiterId),
        lt(nextActions.createdAt, cutoffDate),
        eq(nextActions.status, 'expired')
      ));

    console.log(`✅ Queue refreshed for recruiter ${recruiterId}`);
  }
}

// Export singleton instance
export const priorityEngine = new PriorityEngine();
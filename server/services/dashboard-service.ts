import { DatabaseStorage } from "../storage";
import { db } from "../db";
import { candidateVacancyLinks, interactions, placements, tasks, candidates, vacancies, clients, users } from "@shared/schema";
import { sql, and, eq, gte, lte, desc, count, sum, avg } from "drizzle-orm";

export interface DashboardSummary {
  pipelineSummary: PipelineSummary;
  workBlocks: WorkBlock[];
  tasks: DashboardTask[];
  revenueRadar: RevenueRadar;
  slaMetrics: SLAMetrics;
  alerts: Alert[];
  kpis: KPIMetrics;
}

export interface PipelineSummary {
  today: PipelineMetrics;
  week: PipelineMetrics;
  month: PipelineMetrics;
}

export interface PipelineMetrics {
  totalCandidates: number;
  totalVacancies: number;
  newCandidates: number;
  callsMade: number;
  interviewsScheduled: number;
  offersSent: number;
  placements: number;
  changeVsPrevious: {
    totalCandidates: number;
    newCandidates: number;
    callsMade: number;
    interviewsScheduled: number;
    offersSent: number;
    placements: number;
  };
}

export interface DailyProgress {
  totalPlanned: number;
  completed: number;
  pending: number;
  completionRate: number;
  tasks: DashboardTask[];
}

export interface DashboardTask {
  id: number;
  title: string;
  type: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueAt: Date;
  isOverdue: boolean;
  relatedType?: string;
  relatedId?: number;
  candidateId?: number;
  vacancyId?: number;
  clientId?: number;
  estimatedDuration?: number;
}

export interface RevenueRadar {
  currentMonth: RevenueData;
  currentQuarter: RevenueData;
  forecastByVacancy: VacancyRevenue[];
}

export interface RevenueData {
  totalExpected: number;
  totalRealized: number;
  currency: string;
  probabilityWeighted: number;
}

export interface VacancyRevenue {
  vacancyId: number;
  vacancyTitle: string;
  expectedMargin: number;
  probability: number;
  stage: string;
}

export interface SLAMetrics {
  timeToFirstContact: {
    average: number; // hours
    breaches: number;
    target: number; // hours
  };
  timeToShortlist: {
    average: number; // hours
    breaches: number;
    target: number; // hours
  };
  timeToClientSubmission: {
    average: number; // hours
    breaches: number;
    target: number; // hours
  };
  timeToInterview: {
    average: number; // hours
    breaches: number;
    target: number; // hours
  };
}

export interface Alert {
  id: string;
  type: "warning" | "error" | "info";
  title: string;
  description: string;
  actionUrl?: string;
  priority: "low" | "medium" | "high";
  relatedType?: string;
  relatedId?: number;
}

export interface KPIMetrics {
  recruiter: RecruiterKPIs;
  fieldManager: FieldManagerKPIs;
}

export interface RecruiterKPIs {
  today: {
    callsMade: number;
    candidatesSpoken: number;
    newCandidatesAdded: number;
    introsSent: number;
    cvsFormatted: number;
    interviewsScheduled: number;
    offersSent: number;
    placements: number;
  };
  week: {
    callsMade: number;
    candidatesSpoken: number;
    newCandidatesAdded: number;
    introsSent: number;
    cvsFormatted: number;
    interviewsScheduled: number;
    offersSent: number;
    placements: number;
  };
}

export interface FieldManagerKPIs {
  contactsDue: {
    activeHiringManagers: number; // bi-weekly
    inactiveClients: number; // monthly
    currentStaff: number; // monthly
    formerStaff: number; // 3/6-month cadence
    highPotentials: number; // monthly
  };
  pipeline: {
    liveVacancies: number;
    totalCandidatesMatched: number;
    interviewsPipeline: number;
    offersAndStartDates: number;
  };
}

export interface PipelineData {
  vacancyId: number;
  vacancyTitle: string;
  clientName: string;
  stages: {
    [stage: string]: {
      count: number;
      candidates: {
        id: number;
        name: string;
        lastActivity: Date;
        daysSinceActivity: number;
      }[];
    };
  };
}

export interface CadenceItem {
  type: "client" | "candidate" | "staff";
  id: number;
  name: string;
  lastContact: Date;
  nextDueDate: Date;
  cadenceType: string;
  isOverdue: boolean;
  daysSinceContact: number;
}

export class DashboardService {
  private storage: DatabaseStorage;

  constructor() {
    this.storage = new DatabaseStorage();
  }

  async getDashboardSummary(userId: number, scope: "recruiter" | "field_manager" = "recruiter"): Promise<DashboardSummary> {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getTime() - (today.getDay() * 24 * 60 * 60 * 1000));
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      pipelineSummary,
      workBlocks,
      dashboardTasks,
      revenueRadar,
      slaMetrics,
      alerts,
      kpis
    ] = await Promise.all([
      this.getPipelineSummary(startOfToday, startOfWeek, startOfMonth),
      this.getDailyProgress(userId, today),
      this.getTasks(userId, scope),
      this.getRevenueRadar(),
      this.getSLAMetrics(),
      this.getAlerts(),
      this.getKPIMetrics(userId, scope, startOfToday, startOfWeek)
    ]);

    return {
      pipelineSummary,
      workBlocks,
      tasks: dashboardTasks,
      revenueRadar,
      slaMetrics,
      alerts,
      kpis
    };
  }

  private async getPipelineSummary(startOfToday: Date, startOfWeek: Date, startOfMonth: Date): Promise<PipelineSummary> {
    // Get metrics for today, week, and month
    const [todayMetrics, weekMetrics, monthMetrics] = await Promise.all([
      this.getPipelineMetrics(startOfToday, new Date()),
      this.getPipelineMetrics(startOfWeek, new Date()),
      this.getPipelineMetrics(startOfMonth, new Date())
    ]);

    return {
      today: todayMetrics,
      week: weekMetrics,
      month: monthMetrics
    };
  }

  private async getPipelineMetrics(startDate: Date, endDate: Date): Promise<PipelineMetrics> {
    const [
      candidateCount,
      vacancyCount,
      newCandidates,
      callsMade,
      interviewsScheduled,
      offersSent,
      placementsMade
    ] = await Promise.all([
      db.select({ count: count() }).from(candidates).where(gte(candidates.createdAt, startDate)),
      db.select({ count: count() }).from(vacancies).where(gte(vacancies.createdAt, startDate)),
      db.select({ count: count() }).from(candidates).where(and(gte(candidates.createdAt, startDate), lte(candidates.createdAt, endDate))),
      db.select({ count: count() }).from(interactions).where(and(eq(interactions.type, "phone"), gte(interactions.createdAt, startDate))),
      db.select({ count: count() }).from(candidateVacancyLinks).where(and(eq(candidateVacancyLinks.stage, "Interviews"), gte(candidateVacancyLinks.updatedAt, startDate))),
      db.select({ count: count() }).from(candidateVacancyLinks).where(and(eq(candidateVacancyLinks.stage, "Contracting"), gte(candidateVacancyLinks.updatedAt, startDate))),
      db.select({ count: count() }).from(placements).where(and(gte(placements.createdAt, startDate), lte(placements.createdAt, endDate)))
    ]);

    // Calculate previous period for comparison
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodLength);
    const prevEndDate = startDate;

    const [prevNewCandidates, prevCalls, prevInterviews, prevOffers, prevPlacements] = await Promise.all([
      db.select({ count: count() }).from(candidates).where(and(gte(candidates.createdAt, prevStartDate), lte(candidates.createdAt, prevEndDate))),
      db.select({ count: count() }).from(interactions).where(and(eq(interactions.type, "phone"), gte(interactions.createdAt, prevStartDate), lte(interactions.createdAt, prevEndDate))),
      db.select({ count: count() }).from(candidateVacancyLinks).where(and(eq(candidateVacancyLinks.stage, "Interviews"), gte(candidateVacancyLinks.updatedAt, prevStartDate), lte(candidateVacancyLinks.updatedAt, prevEndDate))),
      db.select({ count: count() }).from(candidateVacancyLinks).where(and(eq(candidateVacancyLinks.stage, "Contracting"), gte(candidateVacancyLinks.updatedAt, prevStartDate), lte(candidateVacancyLinks.updatedAt, prevEndDate))),
      db.select({ count: count() }).from(placements).where(and(gte(placements.createdAt, prevStartDate), lte(placements.createdAt, prevEndDate)))
    ]);

    return {
      totalCandidates: candidateCount[0]?.count || 0,
      totalVacancies: vacancyCount[0]?.count || 0,
      newCandidates: newCandidates[0]?.count || 0,
      callsMade: callsMade[0]?.count || 0,
      interviewsScheduled: interviewsScheduled[0]?.count || 0,
      offersSent: offersSent[0]?.count || 0,
      placements: placementsMade[0]?.count || 0,
      changeVsPrevious: {
        totalCandidates: (candidateCount[0]?.count || 0) - (candidateCount[0]?.count || 0), // Total doesn't have comparison
        newCandidates: (newCandidates[0]?.count || 0) - (prevNewCandidates[0]?.count || 0),
        callsMade: (callsMade[0]?.count || 0) - (prevCalls[0]?.count || 0),
        interviewsScheduled: (interviewsScheduled[0]?.count || 0) - (prevInterviews[0]?.count || 0),
        offersSent: (offersSent[0]?.count || 0) - (prevOffers[0]?.count || 0),
        placements: (placementsMade[0]?.count || 0) - (prevPlacements[0]?.count || 0)
      }
    };
  }

  private async getDailyProgress(userId: number, date: Date): Promise<DailyProgress> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Get all tasks for the day (remove blockTime filter)
    const dailyTasks = await db.select()
      .from(tasks)
      .where(and(
        eq(tasks.ownerId, userId),
        eq(tasks.type, "call"),
        gte(tasks.dueAt, startOfDay),
        lte(tasks.dueAt, endOfDay)
      ));

    const completedTasks = dailyTasks.filter(task => task.status === "completed");
    const pendingTasks = dailyTasks.filter(task => task.status === "pending");

    return {
      totalPlanned: dailyTasks.length,
      completed: completedTasks.length,
      pending: pendingTasks.length,
      completionRate: dailyTasks.length > 0 ? Math.round((completedTasks.length / dailyTasks.length) * 100) : 0,
      tasks: pendingTasks.map(task => this.mapTaskToDashboardTask(task))
    };
  }


  private async getTasks(userId: number, scope: "recruiter" | "field_manager"): Promise<DashboardTask[]> {
    try {
      const today = new Date();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfTomorrow = new Date(startOfToday.getTime() + 48 * 60 * 60 * 1000);

      const userTasks = await db.select()
        .from(tasks)
        .where(and(
          eq(tasks.ownerId, userId),
          gte(tasks.dueAt, startOfToday),
          lte(tasks.dueAt, endOfTomorrow),
          eq(tasks.status, "pending")
        ))
        .orderBy(tasks.dueAt);

      return userTasks.map(task => this.mapTaskToDashboardTask(task));
    } catch (error) {
      console.error("Error fetching tasks:", error);
      return [];
    }
  }

  private mapTaskToDashboardTask(task: any): DashboardTask {
    const now = new Date();
    return {
      id: task.id,
      title: task.title,
      type: task.type,
      priority: task.priority,
      dueAt: task.dueAt, // Keep as Date for now, will be serialized by JSON.stringify
      isOverdue: now > task.dueAt,
      relatedType: task.relatedType,
      relatedId: task.relatedId,
      candidateId: task.candidateId,
      vacancyId: task.vacancyId,
      clientId: task.clientId,
      estimatedDuration: task.estimatedDuration
    };
  }

  private async getRevenueRadar(): Promise<RevenueRadar> {
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const currentQuarter = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);

    // Get current month placements
    const monthPlacements = await db.select()
      .from(placements)
      .where(gte(placements.createdAt, currentMonth));

    // Get current quarter placements
    const quarterPlacements = await db.select()
      .from(placements)
      .where(gte(placements.createdAt, currentQuarter));

    // Calculate revenue
    const monthRevenue = monthPlacements.reduce((sum, p) => sum + (p.margin || 0), 0);
    const quarterRevenue = quarterPlacements.reduce((sum, p) => sum + (p.margin || 0), 0);

    // Get vacancy revenue forecasts (simplified)
    const forecastData = await db.select({
      vacancyId: candidateVacancyLinks.vacancyId,
      stage: candidateVacancyLinks.stage,
      count: count()
    })
      .from(candidateVacancyLinks)
      .groupBy(candidateVacancyLinks.vacancyId, candidateVacancyLinks.stage);

    const forecastByVacancy: VacancyRevenue[] = [];
    // This would need more complex calculation based on vacancy salary ranges and stage probabilities

    return {
      currentMonth: {
        totalExpected: monthRevenue * 1.2, // Simple projection
        totalRealized: monthRevenue,
        currency: "EUR",
        probabilityWeighted: monthRevenue * 0.8
      },
      currentQuarter: {
        totalExpected: quarterRevenue * 1.15,
        totalRealized: quarterRevenue,
        currency: "EUR",
        probabilityWeighted: quarterRevenue * 0.85
      },
      forecastByVacancy
    };
  }

  private async getSLAMetrics(): Promise<SLAMetrics> {
    // This would calculate actual SLA metrics from interaction data
    // For now, returning placeholder structure
    return {
      timeToFirstContact: {
        average: 4.2,
        breaches: 3,
        target: 4
      },
      timeToShortlist: {
        average: 24,
        breaches: 1,
        target: 24
      },
      timeToClientSubmission: {
        average: 48,
        breaches: 2,
        target: 48
      },
      timeToInterview: {
        average: 72,
        breaches: 1,
        target: 72
      }
    };
  }

  private async getAlerts(): Promise<Alert[]> {
    const alerts: Alert[] = [];

    // Check for vacancies with 0 candidates
    const vacanciesWithoutCandidates = await db.select({
      id: vacancies.id,
      title: vacancies.title
    })
      .from(vacancies)
      .leftJoin(candidateVacancyLinks, eq(vacancies.id, candidateVacancyLinks.vacancyId))
      .where(eq(vacancies.status, "open"))
      .groupBy(vacancies.id, vacancies.title)
      .having(sql`count(${candidateVacancyLinks.id}) = 0`);

    vacanciesWithoutCandidates.forEach(vacancy => {
      alerts.push({
        id: `vacancy-no-candidates-${vacancy.id}`,
        type: "warning",
        title: "Vacancy without candidates",
        description: `${vacancy.title} has no linked candidates`,
        actionUrl: `/vacancies/${vacancy.id}`,
        priority: "high",
        relatedType: "vacancy",
        relatedId: vacancy.id
      });
    });

    // Check for stalled stages (>7 days without activity)
    const stalledCandidates = await db.select()
      .from(candidateVacancyLinks)
      .where(sql`${candidateVacancyLinks.lastActivityAt} < NOW() - INTERVAL '7 days'`);

    if (stalledCandidates.length > 0) {
      alerts.push({
        id: "stalled-pipeline",
        type: "warning",
        title: "Stalled pipeline stages",
        description: `${stalledCandidates.length} candidates haven't had activity in 7+ days`,
        priority: "medium"
      });
    }

    return alerts;
  }

  private async getKPIMetrics(userId: number, scope: "recruiter" | "field_manager", startOfToday: Date, startOfWeek: Date): Promise<KPIMetrics> {
    if (scope === "recruiter") {
      const [todayInteractions, weekInteractions] = await Promise.all([
        db.select().from(interactions).where(and(eq(interactions.userId, userId), gte(interactions.createdAt, startOfToday))),
        db.select().from(interactions).where(and(eq(interactions.userId, userId), gte(interactions.createdAt, startOfWeek)))
      ]);

      const todayCalls = todayInteractions.filter(i => i.type === "phone").length;
      const weekCalls = weekInteractions.filter(i => i.type === "phone").length;

      return {
        recruiter: {
          today: {
            callsMade: todayCalls,
            candidatesSpoken: todayInteractions.filter(i => i.outcome === "connected").length,
            newCandidatesAdded: 0, // Would need to calculate from candidate creation
            introsSent: todayInteractions.filter(i => i.type === "email" && i.subject?.includes("intro")).length,
            cvsFormatted: 0, // Would need separate tracking
            interviewsScheduled: 0, // From interviews table
            offersSent: 0, // From stage changes
            placements: 0 // From placements table
          },
          week: {
            callsMade: weekCalls,
            candidatesSpoken: weekInteractions.filter(i => i.outcome === "connected").length,
            newCandidatesAdded: 0,
            introsSent: weekInteractions.filter(i => i.type === "email" && i.subject?.includes("intro")).length,
            cvsFormatted: 0,
            interviewsScheduled: 0,
            offersSent: 0,
            placements: 0
          }
        },
        fieldManager: {
          contactsDue: {
            activeHiringManagers: 0,
            inactiveClients: 0,
            currentStaff: 0,
            formerStaff: 0,
            highPotentials: 0
          },
          pipeline: {
            liveVacancies: 0,
            totalCandidatesMatched: 0,
            interviewsPipeline: 0,
            offersAndStartDates: 0
          }
        }
      };
    }

    // Field manager KPIs would be calculated differently
    return {
      recruiter: {
        today: { callsMade: 0, candidatesSpoken: 0, newCandidatesAdded: 0, introsSent: 0, cvsFormatted: 0, interviewsScheduled: 0, offersSent: 0, placements: 0 },
        week: { callsMade: 0, candidatesSpoken: 0, newCandidatesAdded: 0, introsSent: 0, cvsFormatted: 0, interviewsScheduled: 0, offersSent: 0, placements: 0 }
      },
      fieldManager: {
        contactsDue: {
          activeHiringManagers: 5,
          inactiveClients: 3,
          currentStaff: 12,
          formerStaff: 8,
          highPotentials: 4
        },
        pipeline: {
          liveVacancies: 15,
          totalCandidatesMatched: 45,
          interviewsPipeline: 12,
          offersAndStartDates: 3
        }
      }
    };
  }

  async getPipelineData(filters: any = {}): Promise<PipelineData[]> {
    // Get pipeline data grouped by vacancy and stage
    const pipelineQuery = db.select({
      vacancyId: candidateVacancyLinks.vacancyId,
      vacancyTitle: vacancies.title,
      clientName: clients.name,
      stage: candidateVacancyLinks.stage,
      candidateId: candidateVacancyLinks.candidateId,
      candidateName: sql<string>`${candidates.firstName} || ' ' || ${candidates.lastName}`,
      lastActivity: candidateVacancyLinks.lastActivityAt
    })
      .from(candidateVacancyLinks)
      .innerJoin(vacancies, eq(candidateVacancyLinks.vacancyId, vacancies.id))
      .innerJoin(clients, eq(vacancies.clientId, clients.id))
      .innerJoin(candidates, eq(candidateVacancyLinks.candidateId, candidates.id));

    const pipelineData = await pipelineQuery;

    // Group by vacancy
    const groupedData: { [vacancyId: number]: PipelineData } = {};

    pipelineData.forEach(row => {
      if (!groupedData[row.vacancyId]) {
        groupedData[row.vacancyId] = {
          vacancyId: row.vacancyId,
          vacancyTitle: row.vacancyTitle,
          clientName: row.clientName,
          stages: {}
        };
      }

      if (!groupedData[row.vacancyId].stages[row.stage]) {
        groupedData[row.vacancyId].stages[row.stage] = {
          count: 0,
          candidates: []
        };
      }

      const daysSinceActivity = row.lastActivity 
        ? Math.floor((new Date().getTime() - new Date(row.lastActivity).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      groupedData[row.vacancyId].stages[row.stage].count++;
      groupedData[row.vacancyId].stages[row.stage].candidates.push({
        id: row.candidateId,
        name: row.candidateName,
        lastActivity: row.lastActivity || new Date(),
        daysSinceActivity
      });
    });

    return Object.values(groupedData);
  }

  async getCadenceDueList(role: "recruiter" | "field_manager"): Promise<CadenceItem[]> {
    const cadenceItems: CadenceItem[] = [];
    const today = new Date();

    if (role === "field_manager") {
      // Get clients that need contact based on cadence rules
      const allClients = await db.select().from(clients).where(eq(clients.status, "active"));

      for (const client of allClients) {
        // Get last interaction with this client
        // Note: interactions table doesn't have clientId, so we'll use a different approach
        const lastInteraction = await db.select()
          .from(interactions)
          .where(sql`${interactions.candidateId} IN (SELECT id FROM ${candidates} WHERE ${candidates.id} = ${client.id})`)
          .orderBy(desc(interactions.createdAt))
          .limit(1);

        const lastContact = lastInteraction[0]?.createdAt || client.createdAt;
        const daysSinceContact = Math.floor((today.getTime() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24));
        
        // Determine cadence based on client activity
        let cadenceType = "monthly";
        let cadenceDays = 30;
        
        if (daysSinceContact > 14 && daysSinceContact < 90) {
          cadenceType = "bi-weekly";
          cadenceDays = 14;
        } else if (daysSinceContact > 90) {
          cadenceType = "quarterly";
          cadenceDays = 90;
        }

        const nextDueDate = new Date(new Date(lastContact).getTime() + cadenceDays * 24 * 60 * 60 * 1000);
        const isOverdue = today > nextDueDate;

        if (isOverdue || nextDueDate.getTime() - today.getTime() < 7 * 24 * 60 * 60 * 1000) { // Due within 7 days
          cadenceItems.push({
            type: "client",
            id: client.id,
            name: client.name,
            lastContact: new Date(lastContact),
            nextDueDate,
            cadenceType,
            isOverdue,
            daysSinceContact
          });
        }
      }
    }

    return cadenceItems.sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
  }
}
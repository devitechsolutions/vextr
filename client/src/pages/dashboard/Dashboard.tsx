import MetricsCards from "./components/MetricsCards";
import TasksList from "./components/TasksList";
import ActivityTimeline from "./components/ActivityTimeline";
import UpcomingInterviews from "./components/UpcomingInterviews";
import PipelineSummary from "./components/PipelineSummary";
import QuickActions from "./components/QuickActions";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: todos, isLoading: todosLoading } = useQuery({
    queryKey: ["/api/todos"],
  });
  
  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ["/api/activities"],
  });
  
  const { data: interviews, isLoading: interviewsLoading } = useQuery({
    queryKey: ["/api/interviews"],
  });
  
  const { data: pipelineStages, isLoading: pipelineLoading } = useQuery({
    queryKey: ["/api/pipeline/1"],
  });

  return (
    <div>
      {/* Welcome Section */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-neutral-darkest dark:text-white">
              Welcome back, {user?.fullName || "Sarah"}!
            </h2>
            <p className="text-neutral-dark dark:text-gray-400">
              Here's what's happening with your recruitment activities today.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <div className="inline-flex rounded-md shadow-sm">
              <button className="px-4 py-2 text-sm font-medium rounded-l-md border border-neutral-medium bg-white text-neutral-darkest hover:bg-neutral-light dark:bg-gray-700 dark:text-white dark:border-gray-600">
                Day
              </button>
              <button className="px-4 py-2 text-sm font-medium border-t border-b border-neutral-medium bg-primary text-white dark:border-primary">
                Week
              </button>
              <button className="px-4 py-2 text-sm font-medium rounded-r-md border border-neutral-medium bg-white text-neutral-darkest hover:bg-neutral-light dark:bg-gray-700 dark:text-white dark:border-gray-600">
                Month
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <MetricsCards />

      {/* Main Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* Left Column - Tasks & Activity */}
        <div className="lg:col-span-2 space-y-6">
          {todosLoading ? (
            <div className="bg-white rounded-lg shadow p-6 space-y-4 dark:bg-gray-800">
              <Skeleton className="h-6 w-48" />
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ) : (
            <TasksList tasks={todos || []} />
          )}

          {activitiesLoading ? (
            <div className="bg-white rounded-lg shadow p-6 space-y-4 dark:bg-gray-800">
              <Skeleton className="h-6 w-48" />
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ) : (
            <ActivityTimeline activities={activities || []} />
          )}
        </div>

        {/* Right Column - Upcoming Interviews & Pipeline */}
        <div className="space-y-6">
          {interviewsLoading ? (
            <div className="bg-white rounded-lg shadow p-6 space-y-4 dark:bg-gray-800">
              <Skeleton className="h-6 w-48" />
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
          ) : (
            <UpcomingInterviews interviews={interviews || []} />
          )}

          {pipelineLoading ? (
            <div className="bg-white rounded-lg shadow p-6 space-y-4 dark:bg-gray-800">
              <Skeleton className="h-6 w-48" />
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ) : (
            <PipelineSummary stages={pipelineStages || []} />
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}

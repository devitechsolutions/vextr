import { useQuery } from "@tanstack/react-query";
import { Interview, Candidate, Vacancy } from "@shared/schema";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoIcon, Calendar } from "lucide-react";

interface UpcomingInterviewsProps {
  interviews: Interview[];
}

export default function UpcomingInterviews({ interviews }: UpcomingInterviewsProps) {
  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["/api/candidates"],
  });
  
  const { data: vacancies, isLoading: vacanciesLoading } = useQuery({
    queryKey: ["/api/vacancies"],
  });
  
  const isLoading = candidatesLoading || vacanciesLoading;
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 space-y-4 dark:bg-gray-800">
        <h3 className="text-lg font-semibold text-neutral-darkest dark:text-white">Upcoming Interviews</h3>
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="flex items-start space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-40" />
                <div className="flex space-x-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // Sort interviews by scheduled date (upcoming first)
  const sortedInterviews = [...interviews].sort((a, b) => 
    new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
  );
  
  // Display only the 3 most imminent interviews
  const upcomingInterviews = sortedInterviews.slice(0, 3);
  
  const getCandidateById = (id: number): Candidate | undefined => {
    return candidates?.find((candidate) => candidate.id === id);
  };
  
  const getVacancyById = (id: number): Vacancy | undefined => {
    return vacancies?.find((vacancy) => vacancy.id === id);
  };
  
  const getImageForCandidate = (candidate: Candidate | undefined): string => {
    // In a real app, you'd use the candidate's image if available
    // For now, we'll use placeholder images
    const placeholders = [
      "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=facearea&facepad=2&w=300&h=300",
      "https://images.unsplash.com/photo-1566492031773-4f4e44671857?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=facearea&facepad=2&w=300&h=300"
    ];
    
    return placeholders[Math.floor(Math.random() * placeholders.length)];
  };
  
  const formatInterviewTime = (start: Date, end: Date) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const now = new Date();
    const isToday = startDate.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.setDate(now.getDate() + 1)).toDateString() === startDate.toDateString();
    
    const datePrefix = isToday 
      ? "Today" 
      : isTomorrow 
        ? "Tomorrow" 
        : format(startDate, "MMM d");
        
    return `${datePrefix}, ${format(startDate, "h:mm a")} - ${format(endDate, "h:mm a")}`;
  };

  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="px-6 py-4 border-b border-neutral-medium dark:border-gray-700">
        <h3 className="text-lg font-semibold text-neutral-darkest dark:text-white">Upcoming Interviews</h3>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {upcomingInterviews.map((interview) => {
            const candidate = getCandidateById(interview.candidateId);
            const vacancy = getVacancyById(interview.vacancyId);
            
            return (
              <div key={interview.id} className="flex items-start">
                <div className="flex-shrink-0">
                  <img 
                    className="h-10 w-10 rounded-full" 
                    src={getImageForCandidate(candidate)} 
                    alt={candidate ? `${candidate.firstName} ${candidate.lastName}` : "Candidate"}
                  />
                </div>
                <div className="ml-3">
                  <div className="flex items-center">
                    <p className="text-sm font-medium text-neutral-darkest dark:text-white">
                      {candidate ? `${candidate.firstName} ${candidate.lastName}` : "Unknown Candidate"}
                    </p>
                    <span className="ml-2 bg-primary-light text-primary-dark text-xs px-2 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-200">
                      {vacancy?.title || "Unknown Position"}
                    </span>
                  </div>
                  <div className="flex items-center mt-1">
                    <Calendar className="text-neutral-dark text-xs mr-1.5 h-3 w-3 dark:text-gray-400" />
                    <p className="text-xs text-neutral-dark dark:text-gray-400">
                      {formatInterviewTime(interview.scheduledAt, interview.endTime)}
                    </p>
                  </div>
                  <div className="flex space-x-2 mt-2">
                    <Button 
                      size="sm" 
                      className="bg-primary text-white text-xs rounded hover:bg-primary-dark"
                    >
                      <VideoIcon className="h-3 w-3 mr-1" /> Join
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      className="bg-white text-neutral-darkest border border-neutral-medium text-xs rounded hover:bg-neutral-light dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    >
                      Reschedule
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
          
          {upcomingInterviews.length === 0 && (
            <div className="py-4 text-center text-neutral-dark dark:text-gray-400">
              <p>No upcoming interviews</p>
            </div>
          )}
        </div>
        <div className="mt-4 text-center">
          <Button variant="link" className="text-sm text-primary hover:text-primary-dark dark:text-blue-400 dark:hover:text-blue-300">
            View all interviews
          </Button>
        </div>
      </div>
    </div>
  );
}

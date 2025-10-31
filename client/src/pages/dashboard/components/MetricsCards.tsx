import { useQuery } from "@tanstack/react-query";
import { 
  Briefcase, 
  UserPlus, 
  CalendarCheck, 
  Trophy
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type MetricCardProps = {
  title: string;
  value: number;
  icon: React.ReactNode;
  change: number;
  period: string;
  iconBgColor: string;
  iconColor: string;
};

const MetricCard = ({ title, value, icon, change, period, iconBgColor, iconColor }: MetricCardProps) => {
  const isPositive = change >= 0;
  
  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-neutral-dark dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-neutral-darkest dark:text-white">{value}</p>
        </div>
        <div className={`h-12 w-12 rounded-full ${iconBgColor} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-center">
        <span className={`text-sm font-medium flex items-center ${isPositive ? 'text-success' : 'text-error'}`}>
          {isPositive ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12 7a1 1 0 01-1 1H9v9a1 1 0 01-2 0V8H5a1 1 0 010-2h12a1 1 0 01.707 1.707l-5 5a1 1 0 01-1.414 0l-5-5A1 1 0 015 6h7a1 1 0 011 1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12 13a1 1 0 01-1-1V4a1 1 0 112 0v8a1 1 0 01-1 1zm-5 1a1 1 0 01-1-1V4a1 1 0 012 0v9a1 1 0 01-1 1z" clipRule="evenodd" />
            </svg>
          )}
          {Math.abs(change)}%
        </span>
        <span className="text-neutral-dark text-sm ml-2 dark:text-gray-400">from {period}</span>
      </div>
    </div>
  );
};

export default function MetricsCards() {
  const { data: vacancies, isLoading: vacanciesLoading } = useQuery({
    queryKey: ["/api/vacancies"],
  });
  
  const { data: candidates, isLoading: candidatesLoading } = useQuery({
    queryKey: ["/api/candidates"],
  });
  
  const { data: interviews, isLoading: interviewsLoading } = useQuery({
    queryKey: ["/api/interviews"],
  });
  
  const isLoading = vacanciesLoading || candidatesLoading || interviewsLoading;
  
  const metrics = [
    {
      title: "Active Jobs",
      value: vacancies?.length || 0,
      icon: <Briefcase className="text-primary text-xl" />,
      change: 12,
      period: "last week",
      iconBgColor: "bg-primary-light",
      iconColor: "text-primary",
    },
    {
      title: "New Candidates",
      value: candidates?.length || 0,
      icon: <UserPlus className="text-secondary text-xl" />,
      change: 8,
      period: "last week",
      iconBgColor: "bg-secondary-light",
      iconColor: "text-secondary",
    },
    {
      title: "Interviews",
      value: interviews?.length || 0,
      icon: <CalendarCheck className="text-accent text-xl" />,
      change: -3,
      period: "last week",
      iconBgColor: "bg-accent-light",
      iconColor: "text-accent",
    },
    {
      title: "Placements",
      value: 9,
      icon: <Trophy className="text-primary text-xl" />,
      change: 15,
      period: "last week",
      iconBgColor: "bg-primary-light",
      iconColor: "text-primary",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
              <Skeleton className="h-12 w-12 rounded-full" />
            </div>
            <div className="mt-4">
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {metrics.map((metric, index) => (
        <MetricCard key={index} {...metric} />
      ))}
    </div>
  );
}

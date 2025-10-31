import { Activity } from "@shared/schema";
import { format, isToday, isYesterday } from "date-fns";
import { Button } from "@/components/ui/button";

interface ActivityTimelineProps {
  activities: Activity[];
}

export default function ActivityTimeline({ activities }: ActivityTimelineProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case "application":
      case "new_candidate":
        return "bg-primary";
      case "interview":
      case "interview_scheduled":
        return "bg-success";
      case "feedback":
        return "bg-accent";
      case "job":
      case "new_vacancy":
        return "bg-primary";
      default:
        return "bg-neutral-dark";
    }
  };
  
  const formatDate = (date: Date) => {
    if (isToday(date)) {
      return `Today, ${format(date, "h:mm a")}`;
    } else if (isYesterday(date)) {
      return `Yesterday, ${format(date, "h:mm a")}`;
    } else {
      return format(date, "MMM d, h:mm a");
    }
  };
  
  // Limit to the 5 most recent activities
  const recentActivities = activities.slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="px-6 py-4 border-b border-neutral-medium dark:border-gray-700">
        <h3 className="text-lg font-semibold text-neutral-darkest dark:text-white">Recent Activity</h3>
      </div>
      <div className="p-6">
        <ol className="relative border-l border-neutral-medium dark:border-gray-700">
          {recentActivities.map((activity) => (
            <li key={activity.id} className="mb-6 ml-4">
              <div className={`absolute w-3 h-3 ${getActivityIcon(activity.type)} rounded-full mt-1.5 -left-1.5 border border-white dark:border-gray-900`}></div>
              <time className="mb-1 text-xs font-normal leading-none text-neutral-dark dark:text-gray-500">
                {formatDate(new Date(activity.createdAt))}
              </time>
              <h4 className="text-sm font-semibold text-neutral-darkest dark:text-white">
                {activity.type === "application" && "New candidate applied"}
                {activity.type === "new_candidate" && "New candidate added"}
                {activity.type === "interview" && "Interview scheduled"}
                {activity.type === "interview_scheduled" && "Interview scheduled"}
                {activity.type === "feedback" && "Feedback received"}
                {activity.type === "job" && "New job posted"}
                {activity.type === "new_vacancy" && "New vacancy created"}
              </h4>
              <p className="text-sm text-neutral-dark dark:text-gray-400">{activity.description}</p>
            </li>
          ))}
          {activities.length === 0 && (
            <li className="ml-4 py-4">
              <p className="text-sm text-neutral-dark dark:text-gray-400">No recent activity</p>
            </li>
          )}
        </ol>
        <div className="mt-4 text-center">
          <Button variant="link" className="text-sm text-primary hover:text-primary-dark dark:text-blue-400 dark:hover:text-blue-300">
            View all activity
          </Button>
        </div>
      </div>
    </div>
  );
}

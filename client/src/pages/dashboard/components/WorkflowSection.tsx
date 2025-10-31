import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Phone, 
  MessageSquare, 
  FileText, 
  Users, 
  Briefcase,
  Clock,
  CheckCircle,
  AlertCircle,
  PlayCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowSectionProps {
  currentPhase: string;
  dashboardData: any;
}

interface WorkflowTask {
  id: string;
  title: string;
  description: string;
  icon: any;
  status: "pending" | "in_progress" | "completed" | "skipped";
  priority: "low" | "medium" | "high" | "urgent";
  estimatedTime?: number;
}

export default function WorkflowSection({ currentPhase, dashboardData }: WorkflowSectionProps) {
  const getWorkflowTasks = (): WorkflowTask[] => {
    switch (currentPhase) {
      case "morning_calls":
        return [
          {
            id: "3",
            title: "Start Call Campaign",
            description: "Begin contacting candidates from the priority list",
            icon: Phone,
            status: "in_progress",
            priority: "urgent",
            estimatedTime: 165
          }
        ];
        
      case "afternoon_calls":
        return [
          {
            id: "4",
            title: "Follow-up Calls",
            description: "Contact candidates who requested callbacks",
            icon: Phone,
            status: "pending",
            priority: "high",
            estimatedTime: 90
          },
          {
            id: "5",
            title: "Send Introduction Emails",
            description: "Send candidate introductions to clients",
            icon: MessageSquare,
            status: "pending",
            priority: "medium",
            estimatedTime: 30
          }
        ];
        
      case "administrative":
        return [
          {
            id: "6",
            title: "Format CVs",
            description: "Prepare and format CVs for submission",
            icon: FileText,
            status: "pending",
            priority: "medium",
            estimatedTime: 45
          },
          {
            id: "7",
            title: "Update CRM Records",
            description: "Log all interactions and update candidate statuses",
            icon: Users,
            status: "pending",
            priority: "high",
            estimatedTime: 30
          }
        ];
        
      case "end_of_day":
        return [
          {
            id: "8",
            title: "Complete Daily Report",
            description: "Summarize daily activities and achievements",
            icon: FileText,
            status: "pending",
            priority: "medium",
            estimatedTime: 15
          },
          {
            id: "9",
            title: "Plan Tomorrow",
            description: "Set priorities for the next working day",
            icon: Clock,
            status: "pending",
            priority: "low",
            estimatedTime: 15
          }
        ];
        
      default:
        return [];
    }
  };

  const tasks = getWorkflowTasks();
  const completedTasks = tasks.filter(t => t.status === "completed").length;
  const progress = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "in_progress":
        return <PlayCircle className="h-5 w-5 text-blue-500 animate-pulse" />;
      case "pending":
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
      default:
        return null;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getPhaseName = () => {
    const phaseNames: Record<string, string> = {
      morning_calls: "Morning Call Round",
      afternoon_calls: "Afternoon Call Round",
      final_calls: "Final Call Round",
      administrative: "Administrative Tasks",
      end_of_day: "End of Day Tasks",
      lunch_break: "Lunch Break",
      off_hours: "Off Hours"
    };
    return phaseNames[currentPhase] || "Current Tasks";
  };

  if (currentPhase === "lunch_break" || currentPhase === "off_hours") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{getPhaseName()}</CardTitle>
          <CardDescription>
            {currentPhase === "lunch_break" 
              ? "Take a break and recharge for the afternoon session"
              : "The workday has ended. Review your achievements and prepare for tomorrow."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground" />
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
            <CardTitle>{getPhaseName()}</CardTitle>
            <CardDescription>
              Complete your workflow tasks for this phase
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Progress</div>
            <div className="text-2xl font-bold">{completedTasks}/{tasks.length}</div>
          </div>
        </div>
        <Progress value={progress} className="mt-2" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tasks.map((task) => {
            const Icon = task.icon;
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  task.status === "completed" && "bg-gray-50 dark:bg-gray-900",
                  task.status === "in_progress" && "bg-blue-50 dark:bg-blue-950 border-blue-200"
                )}
              >
                <div className="flex-shrink-0 mt-1">
                  {getStatusIcon(task.status)}
                </div>
                <div className="flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className={cn(
                      "font-medium",
                      task.status === "completed" && "line-through text-muted-foreground"
                    )}>
                      {task.title}
                    </span>
                    <Badge className={cn("text-xs", getPriorityColor(task.priority))}>
                      {task.priority}
                    </Badge>
                    {task.estimatedTime && (
                      <span className="text-xs text-muted-foreground">
                        ~{task.estimatedTime} min
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </div>
                {task.status !== "completed" && (
                  <Button
                    size="sm"
                    variant={task.status === "in_progress" ? "default" : "outline"}
                    className="flex-shrink-0"
                  >
                    {task.status === "in_progress" ? "Continue" : "Start"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
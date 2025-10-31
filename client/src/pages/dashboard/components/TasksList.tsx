import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Todo } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { PlusCircle } from "lucide-react";

interface TasksListProps {
  tasks: Todo[];
}

export default function TasksList({ tasks }: TasksListProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Todo> }) => {
      const res = await apiRequest("PUT", `/api/todos/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/todos"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    }
  });
  
  const handleTaskToggle = (id: number, currentStatus: string) => {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    updateTaskMutation.mutate({ 
      id, 
      data: { status: newStatus } 
    });
  };
  
  // Sort tasks: pending first (sorted by priority), then completed
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    
    if (a.status !== "completed" && b.status !== "completed") {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      // @ts-ignore - We know these values exist
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    
    return 0;
  });

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    return isToday
      ? `Today at ${format(date, "h:mm a")}`
      : format(date, "MMM d, h:mm a");
  };
  
  const getPriorityClasses = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-accent-light text-accent-dark";
      case "medium":
        return "bg-primary-light text-primary-dark";
      default:
        return "bg-neutral-light text-neutral-dark";
    }
  };

  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="px-6 py-4 border-b border-neutral-medium dark:border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-neutral-darkest dark:text-white">Today's Tasks</h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-primary hover:text-primary-dark dark:text-blue-400 dark:hover:text-blue-300"
        >
          <PlusCircle className="h-4 w-4 mr-1" /> Add Task
        </Button>
      </div>
      <div className="p-6">
        <ul className="space-y-4">
          {sortedTasks.map((task) => (
            <li key={task.id} className="flex items-start">
              <Checkbox
                id={`task-${task.id}`}
                checked={task.status === "completed"}
                onCheckedChange={() => handleTaskToggle(task.id, task.status)}
                className="mt-1"
              />
              <div className="ml-3 flex-1">
                <div className="flex justify-between">
                  <p className={`text-sm font-medium ${
                    task.status === "completed" 
                      ? "line-through text-neutral-dark dark:text-gray-500" 
                      : "text-neutral-darkest dark:text-white"
                  }`}>
                    {task.title}
                  </p>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${getPriorityClasses(task.priority)}`}>
                    {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-neutral-dark dark:text-gray-400 mt-1">
                  {task.status === "completed" ? (
                    `Completed at ${format(new Date(task.createdAt), "h:mm a")}`
                  ) : (
                    task.dueDate ? `Due ${formatDate(task.dueDate)}` : "No due date"
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
        {tasks.length === 0 && (
          <div className="py-4 text-center text-neutral-dark dark:text-gray-400">
            <p>No tasks found</p>
          </div>
        )}
        <div className="mt-4 text-center">
          <Button variant="link" className="text-sm text-primary hover:text-primary-dark dark:text-blue-400 dark:hover:text-blue-300">
            View all tasks
          </Button>
        </div>
      </div>
    </div>
  );
}

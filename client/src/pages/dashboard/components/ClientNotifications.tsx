import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AlertTriangle, 
  Building2, 
  CheckCircle, 
  Clock, 
  X 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ClientNotification {
  id: string;
  type: 'missing_info' | 'enhancement_failed' | 'logo_missing';
  clientId: number;
  clientName: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  resolved: boolean;
}

const priorityConfig = {
  low: { color: "bg-blue-500", label: "Low" },
  medium: { color: "bg-yellow-500", label: "Medium" },
  high: { color: "bg-red-500", label: "High" },
};

const typeIcons = {
  missing_info: AlertTriangle,
  enhancement_failed: Clock,
  logo_missing: Building2,
};

interface ClientNotificationsProps {
  className?: string;
}

export default function ClientNotifications({ className }: ClientNotificationsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery<ClientNotification[]>({
    queryKey: ["/api/notifications/client-updates"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const resolveNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/notifications/${id}/resolve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/client-updates"] });
      toast({
        title: "Success",
        description: "Notification resolved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to resolve notification",
        variant: "destructive",
      });
    },
  });

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleResolve = (id: string) => {
    resolveNotificationMutation.mutate(id);
  };

  const unreadNotifications = notifications?.filter(n => !n.resolved) || [];
  const highPriorityCount = unreadNotifications.filter(n => n.priority === 'high').length;
  
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Client Updates</CardTitle>
          <CardDescription>Loading notifications...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (unreadNotifications.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center">
            <CheckCircle className="h-5 w-5 mr-2 text-green-500" />
            Client Updates
          </CardTitle>
          <CardDescription>All client information is up to date</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-orange-500" />
            Client Updates
          </div>
          <div className="flex items-center gap-2">
            {highPriorityCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {highPriorityCount} High Priority
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {unreadNotifications.length} Total
            </Badge>
          </div>
        </CardTitle>
        <CardDescription>
          Client information that needs attention
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {unreadNotifications.slice(0, 5).map((notification) => {
          const Icon = typeIcons[notification.type];
          const isExpanded = expandedIds.has(notification.id);
          const priority = priorityConfig[notification.priority];

          return (
            <div
              key={notification.id}
              className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex-shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground mt-0.5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground">
                        {notification.clientName}
                      </p>
                      <div 
                        className={`w-2 h-2 rounded-full ${priority.color}`}
                        title={`${priority.label} Priority`}
                      />
                    </div>
                    
                    <p className={`text-sm text-muted-foreground ${
                      isExpanded ? '' : 'line-clamp-2'
                    }`}>
                      {notification.message}
                    </p>
                    
                    {notification.message.length > 100 && (
                      <button
                        onClick={() => toggleExpanded(notification.id)}
                        className="text-xs text-primary hover:underline mt-1"
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResolve(notification.id)}
                    disabled={resolveNotificationMutation.isPending}
                    className="ml-2 p-1 h-6 w-6"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(notification.createdAt).toLocaleDateString()} at{' '}
                  {new Date(notification.createdAt).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </p>
              </div>
            </div>
          );
        })}

        {unreadNotifications.length > 5 && (
          <div className="text-center pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              {unreadNotifications.length - 5} more notifications...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
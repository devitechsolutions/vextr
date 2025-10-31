import { useEffect, useRef } from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { Bell, X, Calendar, MessageSquare, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";

interface NotificationPanelProps {
  onClose: () => void;
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const { notifications, markAllAsRead } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscapeKey);
    
    // Mark notifications as read when panel is opened
    markAllAsRead();
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
    };
  }, [onClose, markAllAsRead]);
  
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "application":
      case "new_candidate":
        return <Bell className="h-4 w-4 text-primary" />;
      case "interview":
      case "interview_scheduled":
        return <Calendar className="h-4 w-4 text-accent" />;
      case "feedback":
        return <MessageSquare className="h-4 w-4 text-secondary" />;
      case "job":
      case "new_vacancy":
        return <Briefcase className="h-4 w-4 text-primary" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  const getNotificationTime = (date: Date) => {
    // If less than a day, show relative time, otherwise show the full date
    const now = new Date();
    const diff = Math.abs(now.getTime() - new Date(date).getTime());
    const oneDayInMs = 24 * 60 * 60 * 1000;
    
    if (diff < oneDayInMs) {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } else {
      return format(new Date(date), 'MMM d, h:mm a');
    }
  };

  return (
    <div className="fixed inset-0 bg-neutral-darkest bg-opacity-50 z-20 flex justify-end">
      <div ref={panelRef} className="w-80 bg-white h-full shadow-lg dark:bg-gray-800">
        <div className="p-4 border-b border-neutral-medium dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-semibold text-neutral-darkest dark:text-white">Notifications</h3>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="text-neutral-dark hover:text-neutral-darkest dark:text-gray-400 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-0 overflow-y-auto h-full pb-20">
          {notifications.length > 0 ? (
            <div className="space-y-2 p-2">
              {notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className={`p-3 rounded-lg ${
                    notification.isRead 
                      ? "border border-neutral-medium dark:border-gray-700" 
                      : "bg-primary-light dark:bg-blue-900"
                  }`}
                >
                  <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-neutral-darkest dark:text-white">
                        {notification.title}
                      </p>
                      <p className="text-xs text-neutral-dark dark:text-gray-400 mt-1">
                        {notification.description}
                      </p>
                      <p className="text-xs text-neutral-dark dark:text-gray-400 mt-1">
                        {getNotificationTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 p-4">
              <Bell className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-muted-foreground text-center">No notifications to display</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "@shared/schema";

interface Notification {
  id: number;
  title: string;
  description: string;
  type: string;
  createdAt: Date;
  isRead: boolean;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  
  const { data: activities } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
  });
  
  // Convert activities to notifications
  useEffect(() => {
    if (activities) {
      const mappedNotifications = activities.map((activity) => {
        let title = "Notification";
        
        switch (activity.type) {
          case "application":
            title = "New candidate application";
            break;
          case "new_candidate":
            title = "New candidate added";
            break;
          case "interview":
          case "interview_scheduled":
            title = "Interview scheduled";
            break;
          case "feedback":
            title = "Feedback received";
            break;
          case "job":
          case "new_vacancy":
            title = "New job posted";
            break;
          default:
            title = "Notification";
        }
        
        // In a real app, read status would be stored in the database
        // Here we simulate by just setting newer ones as unread
        const isRead = new Date(activity.createdAt).getTime() < Date.now() - 3600000;
        
        return {
          id: activity.id,
          title,
          description: activity.description,
          type: activity.type,
          createdAt: new Date(activity.createdAt),
          isRead,
        };
      });
      
      // Sort by date (newest first)
      mappedNotifications.sort((a, b) => 
        b.createdAt.getTime() - a.createdAt.getTime()
      );
      
      setNotifications(mappedNotifications);
      
      // Check if there are any unread notifications
      setHasUnread(mappedNotifications.some(notification => !notification.isRead));
    }
  }, [activities]);
  
  // Mark all notifications as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prevNotifications => 
      prevNotifications.map(notification => ({
        ...notification,
        isRead: true
      }))
    );
    setHasUnread(false);
  }, []);
  
  // Mark a specific notification as read
  const markAsRead = useCallback((id: number) => {
    setNotifications(prevNotifications => 
      prevNotifications.map(notification => 
        notification.id === id
          ? { ...notification, isRead: true }
          : notification
      )
    );
    
    // Check if there are still unread notifications
    setNotifications(prevNotifications => {
      setHasUnread(prevNotifications.some(notification => !notification.isRead));
      return prevNotifications;
    });
  }, []);
  
  return {
    notifications,
    hasUnread,
    markAllAsRead,
    markAsRead
  };
}

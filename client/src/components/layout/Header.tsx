import { useState } from "react";
import { Menu, Search, Bell, HelpCircle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import NotificationPanel from "@/components/common/NotificationPanel";
import { useNotifications } from "@/hooks/use-notifications";


interface HeaderProps {
  title: string;
  toggleSidebar: () => void;
}

export default function Header({ title, toggleSidebar }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const { hasUnread } = useNotifications();

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  return (
    <header className="bg-white shadow-sm z-10 dark:bg-gray-800">
      <div className="flex items-center justify-between h-16 px-4 md:px-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={toggleSidebar}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5 text-neutral-dark" />
          </Button>
          <h1 className="ml-2 md:ml-0 text-xl font-semibold text-neutral-darkest dark:text-white">
            {title}
          </h1>
        </div>

        <div className="flex items-center space-x-4">
          {/* Search Bar */}
          <div className="hidden md:block relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-neutral-dark dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search..."
              className="w-64 pl-10 pr-4 py-2 rounded-md border border-neutral-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleNotifications}
              aria-label="Notifications"
            >
              {hasUnread && (
                <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-accent"></span>
              )}
              <Bell className="h-5 w-5 text-neutral-dark dark:text-gray-400" />
            </Button>
          </div>

          {/* Help */}
          <Button variant="ghost" size="icon" aria-label="Help">
            <HelpCircle className="h-5 w-5 text-neutral-dark dark:text-gray-400" />
          </Button>
        </div>
      </div>

      {/* Notification Panel */}
      {showNotifications && (
        <NotificationPanel onClose={toggleNotifications} />
      )}
    </header>
  );
}

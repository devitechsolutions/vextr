import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart3,
  Users,
  Briefcase,
  HandshakeIcon,
  FileText,
  FileUp,
  CheckSquare,
  Settings,
  Database,
  Building,
  Link2,
  ChevronDown,
  ChevronRight,
  LogOut,
  UserCog,
  Shield,
  Key
} from "lucide-react";

interface NavItem {
  name: string;
  href: string | undefined;
  icon: React.ElementType;
  submenu?: NavItem[];
}

export default function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);

  
  // Function to toggle submenu expansion
  const toggleMenu = (menuName: string) => {
    if (expandedMenus.includes(menuName)) {
      setExpandedMenus(expandedMenus.filter(name => name !== menuName));
    } else {
      setExpandedMenus([...expandedMenus, menuName]);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account.",
      });
    } catch (error) {
      toast({
        title: "Logout failed",
        description: "There was an error logging out. Please try again.",
        variant: "destructive",
      });
    }
  };

  const navItems: NavItem[] = [
    { name: "Dashboard", href: "/", icon: BarChart3 },
    { name: "Candidates", href: "/candidates", icon: Users },
    { name: "Clients", href: "/clients", icon: Building },
    { name: "Vacancies", href: "/vacancies", icon: Briefcase },
    { name: "Matcher", href: "/matcher", icon: HandshakeIcon },
    { name: "Job Descriptions", href: "/job-descriptions", icon: FileText },
    { name: "CV Formatter", href: "/cv-formatter", icon: FileUp },
    { name: "To-Do List", href: "/todo", icon: CheckSquare },

  ];

  return (
    <aside className="hidden md:flex md:w-64 flex-col fixed inset-y-0 z-10 bg-white shadow-md dark:bg-gray-800 transition-all duration-300 ease-in-out">
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const isParentOfActive = item.submenu && item.submenu.some(subItem => location === subItem.href);
            const isExpanded = expandedMenus.includes(item.name);
            const Icon = item.icon;
            const hasSubmenu = item.submenu && item.submenu.length > 0;

            return (
              <div key={item.name} className="space-y-1">
                {hasSubmenu ? (
                  <div>
                    <div
                      className={cn(
                        "flex items-center justify-between px-4 py-3 text-sm font-medium rounded-md cursor-pointer",
                        isParentOfActive
                          ? "text-primary bg-neutral-light"
                          : "text-neutral-darkest hover:bg-neutral-light hover:text-primary transition-colors dark:text-gray-300 dark:hover:bg-gray-700"
                      )}
                      onClick={() => toggleMenu(item.name)}
                    >
                      <div className="flex items-center">
                        <Icon className="w-5 h-5 mr-3" />
                        {item.name}
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                    
                    {isExpanded && item.submenu && (
                      <div className="mt-1 pl-4 space-y-1">
                        {item.submenu.map((subItem) => {
                          const isSubActive = location === subItem.href;
                          const SubIcon = subItem.icon;
                          
                          return (
                            <Link key={subItem.name} href={subItem.href || "/"}>
                              <div
                                className={cn(
                                  "flex items-center px-4 py-2 text-sm font-medium rounded-md cursor-pointer",
                                  isSubActive
                                    ? "text-white bg-primary"
                                    : "text-neutral-darkest hover:bg-neutral-light hover:text-primary transition-colors dark:text-gray-300 dark:hover:bg-gray-700"
                                )}
                              >
                                <SubIcon className="w-4 h-4 mr-3" />
                                {subItem.name}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <Link href={item.href || "/"}>
                    <div
                      className={cn(
                        "flex items-center px-4 py-3 text-sm font-medium rounded-md cursor-pointer",
                        isActive
                          ? "text-white bg-primary"
                          : "text-neutral-darkest hover:bg-neutral-light hover:text-primary transition-colors dark:text-gray-300 dark:hover:bg-gray-700"
                      )}
                    >
                      <Icon className="w-5 h-5 mr-3" />
                      {item.name}
                    </div>
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </div>
      
      {/* Logo section at bottom */}
      <div className="p-4">
        <div className="flex items-center justify-center mb-4">
          <span className="text-xl font-bold text-neutral-strong dark:text-white">DC People</span>
        </div>
      </div>
      
      <div className="border-t border-neutral-medium p-4 dark:border-gray-700">
        <div className="flex items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-neutral-darkest dark:text-gray-300">{user?.fullName || "User"}</p>
            <p className="text-xs text-neutral-dark dark:text-gray-400">{user?.role || "Recruiter"}</p>
          </div>
          <div className="flex items-center space-x-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Settings">
                  <Settings className="h-4 w-4 text-neutral-dark hover:text-primary dark:text-gray-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {user?.role === "admin" ? (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/admin/users">
                        <div className="flex items-center w-full">
                          <UserCog className="mr-2 h-4 w-4" />
                          User Management
                        </div>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings/vtiger-sync">
                        <div className="flex items-center w-full">
                          <Link2 className="mr-2 h-4 w-4" />
                          Vtiger Sync
                        </div>
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href="/admin/users">
                      <div className="flex items-center w-full">
                        <UserCog className="mr-2 h-4 w-4" />
                        My Account
                      </div>
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Logout">
              <LogOut className="h-4 w-4 text-neutral-dark hover:text-red-500 dark:text-gray-400" />
            </Button>
          </div>
        </div>
      </div>

    </aside>
  );
}

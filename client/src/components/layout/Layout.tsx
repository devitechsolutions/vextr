import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import Sidebar from "./Sidebar";


interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  useEffect(() => {
    // Close sidebar on mobile when navigating
    setSidebarOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-lightest dark:bg-gray-900">
      <Sidebar />
      
      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 md:hidden z-40"
          onClick={toggleSidebar}
        />
      )}
      
      {/* Mobile sidebar */}
      <aside 
        className={`fixed top-0 left-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out z-50 md:hidden ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar />
      </aside>
      
      <div className="flex-1 md:ml-64 flex flex-col overflow-hidden">
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {/* Mobile menu button */}
          <div className="md:hidden mb-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5 text-neutral-dark" />
            </Button>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  UserPlus, 
  Building2, 
  FileText, 
  BriefcaseBusiness,
  Database,
  Upload,
  Users
} from 'lucide-react';


export default function QuickActions() {
  const { toast } = useToast();
  
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-neutral-darkest dark:text-white">
        Quick Actions
      </h2>
      
      <div className="grid grid-cols-2 gap-3">
        <Link href="/candidates">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <UserPlus className="h-7 w-7 text-primary mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              Add Candidate
            </span>
          </div>
        </Link>
        
        <Link href="/clients">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <Building2 className="h-7 w-7 text-accent mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              Add Client
            </span>
          </div>
        </Link>
        
        <Link href="/vacancies">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <BriefcaseBusiness className="h-7 w-7 text-emerald-500 mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              Add Vacancy
            </span>
          </div>
        </Link>
        
        <Link href="/job-descriptions">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <FileText className="h-7 w-7 text-indigo-500 mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              Create Job Description
            </span>
          </div>
        </Link>
        
        <Link href="/settings/vtiger-sync">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <Database className="h-7 w-7 text-blue-500 mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              CRM Settings
            </span>
          </div>
        </Link>
        

        
        <Link href="/matcher">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <Users className="h-7 w-7 text-purple-500 mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              Match Candidates
            </span>
          </div>
        </Link>
        
        <Link href="/cv-formatter">
          <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-neutral-lightest shadow-sm hover:shadow-md transition-all dark:bg-gray-800 dark:border-gray-700 cursor-pointer">
            <Upload className="h-7 w-7 text-amber-500 mb-2" />
            <span className="text-sm font-medium text-center text-neutral-darkest dark:text-white">
              Format CV
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
import { PipelineStage } from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface PipelineSummaryProps {
  stages: PipelineStage[];
  totalCandidates?: number;
}

export default function PipelineSummary({ stages, totalCandidates: vtigerTotal }: PipelineSummaryProps) {
  // Sort stages by their order
  const sortedStages = [...stages].sort((a, b) => a.order - b.order);
  
  // Calculate total candidates across all stages for percentage calculations
  const stagesTotalCandidates = sortedStages.reduce((sum, stage) => sum + stage.count, 0);
  
  // Use VTiger total for Pipeline Health display (authoritative count from VTiger)
  const pipelineHealthTotal = vtigerTotal || stagesTotalCandidates;
  
  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-800">
      <div className="px-6 py-4 border-b border-neutral-medium dark:border-gray-700">
        <h3 className="text-lg font-semibold text-neutral-darkest dark:text-white">Pipeline Health</h3>
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {sortedStages.map((stage) => {
            // Calculate the percentage for the progress bar
            const percentage = stagesTotalCandidates > 0 
              ? Math.round((stage.count / stagesTotalCandidates) * 100) 
              : 0;
              
            return (
              <div key={stage.id}>
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium text-neutral-darkest dark:text-white">{stage.name}</span>
                  <span className="text-sm font-medium text-neutral-dark dark:text-gray-400">{stage.count}</span>
                </div>
                <Progress 
                  value={percentage} 
                  className="h-2 bg-neutral-light dark:bg-gray-700" 
                />
              </div>
            );
          })}
          
          {stages.length === 0 && (
            <div className="py-4 text-center text-neutral-dark dark:text-gray-400">
              <p>No pipeline data available</p>
            </div>
          )}
        </div>
        
        <div className="mt-6">
          <div className="flex items-center justify-between p-4 bg-neutral-light rounded-lg dark:bg-gray-700">
            <div>
              <p className="text-sm font-medium text-neutral-darkest dark:text-white">Active candidates</p>
              <p className="text-xl font-bold text-primary dark:text-blue-400">{pipelineHealthTotal}</p>
            </div>
            <div className="h-16 w-16">
              {/* Placeholder for a small chart */}
              <div 
                className="h-full w-full rounded-full border-4 border-primary border-l-transparent dark:border-blue-500" 
                style={{ transform: "rotate(45deg)" }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

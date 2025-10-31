import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription,
  CardFooter 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { creativeWriting, professionalWriting, casualWriting } from "@/lib/job-templates.tsx";
import { FileText, Wand, Copy, Download, MessageSquare, Sparkles, Tag, Loader2 } from "lucide-react";

interface JobDescriptionResponse {
  description: string;
  responsibilities: string[];
  requirements: string[];
  qualifications: string[];
  benefits: string[];
}

export default function JobDescriptionPage() {
  const { toast } = useToast();
  const [jobTitle, setJobTitle] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [currentSkill, setCurrentSkill] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<string>("");
  const [jobDescription, setJobDescription] = useState<JobDescriptionResponse | null>(null);
  const [tone, setTone] = useState("professional");
  
  const generateMutation = useMutation({
    mutationFn: async () => {
      const data = await apiRequest("POST", "/api/job-description/generate", {
        title: jobTitle,
        skills,
        experience: experienceLevel
      });
      return data as JobDescriptionResponse;
    },
    onSuccess: (data) => {
      setJobDescription(data);
      toast({
        title: "Job description generated",
        description: "Your job description has been created successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Generation failed",
        description: "Failed to generate job description. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  const handleAddSkill = () => {
    if (currentSkill.trim() && !skills.includes(currentSkill.trim())) {
      setSkills([...skills, currentSkill.trim()]);
      setCurrentSkill("");
    }
  };
  
  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter(skill => skill !== skillToRemove));
  };
  
  const handleGenerate = () => {
    if (!jobTitle) {
      toast({
        title: "Missing job title",
        description: "Please enter a job title to generate a description.",
        variant: "destructive",
      });
      return;
    }
    
    generateMutation.mutate();
  };
  
  const handleCopyToClipboard = () => {
    if (!jobDescription) return;
    
    const formattedDescription = `
# ${jobTitle.toUpperCase()}

${jobDescription.description}

## Responsibilities
${jobDescription.responsibilities.map(r => `- ${r}`).join('\n')}

## Requirements
${jobDescription.requirements.map(r => `- ${r}`).join('\n')}

## Qualifications
${jobDescription.qualifications.map(q => `- ${q}`).join('\n')}

## Benefits
${jobDescription.benefits.map(b => `- ${b}`).join('\n')}
    `;
    
    navigator.clipboard.writeText(formattedDescription);
    toast({
      title: "Copied to clipboard",
      description: "Job description has been copied to your clipboard.",
    });
  };
  
  const getToneContent = () => {
    if (!jobDescription) return null;
    
    switch (tone) {
      case "creative":
        return creativeWriting(jobTitle, jobDescription);
      case "casual":
        return casualWriting(jobTitle, jobDescription);
      case "professional":
      default:
        return professionalWriting(jobTitle, jobDescription);
    }
  };
  
  const getRequiredFieldLabel = (label: string) => (
    <div className="flex items-center">
      {label} <span className="text-red-500 ml-1">*</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Description Writer</h1>
        <p className="text-muted-foreground">
          Generate professional job descriptions with AI assistance
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left column - Input form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>
              Enter information about the position to generate a description
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="jobTitle" className="text-sm font-medium">
                {getRequiredFieldLabel("Job Title")}
              </label>
              <Input
                id="jobTitle"
                placeholder="e.g. Senior Software Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="skills" className="text-sm font-medium">
                Required Skills
              </label>
              <div className="flex space-x-2">
                <Input
                  id="skills"
                  placeholder="e.g. React"
                  value={currentSkill}
                  onChange={(e) => setCurrentSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                />
                <Button 
                  type="button" 
                  onClick={handleAddSkill}
                  variant="secondary"
                >
                  Add
                </Button>
              </div>
              {skills.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {skills.map((skill, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {skill}
                      <button 
                        onClick={() => handleRemoveSkill(skill)}
                        className="ml-1 text-xs hover:text-muted-foreground"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <label htmlFor="experience" className="text-sm font-medium">
                Experience Level
              </label>
              <Select 
                value={experienceLevel} 
                onValueChange={setExperienceLevel}
              >
                <SelectTrigger id="experience">
                  <SelectValue placeholder="Select experience level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entry">Entry Level (0-2 years)</SelectItem>
                  <SelectItem value="mid">Mid Level (3-5 years)</SelectItem>
                  <SelectItem value="senior">Senior Level (5+ years)</SelectItem>
                  <SelectItem value="lead">Lead/Manager (7+ years)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 mt-6">
              <Button 
                onClick={handleGenerate} 
                className="w-full"
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand className="mr-2 h-4 w-4" />
                    Generate Description
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Right column - Output and preview */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Generated Description</CardTitle>
                <CardDescription>
                  Preview and customize the generated job description
                </CardDescription>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleCopyToClipboard}
                  disabled={!jobDescription}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={!jobDescription}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardHeader>
          
          {!jobDescription ? (
            <CardContent className="flex items-center justify-center py-10">
              <div className="text-center space-y-3">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-medium">No job description yet</h3>
                <p className="text-sm text-muted-foreground">
                  Fill in the job details and generate a description to see the preview here
                </p>
              </div>
            </CardContent>
          ) : (
            <>
              <div className="px-6 pb-2">
                <div className="text-sm text-muted-foreground mb-2">Tone & Style</div>
                <Tabs defaultValue="professional" value={tone} onValueChange={setTone}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="professional">Professional</TabsTrigger>
                    <TabsTrigger value="casual">Casual</TabsTrigger>
                    <TabsTrigger value="creative">Creative</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              <CardContent className="pt-3">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {getToneContent()}
                </div>
              </CardContent>
              
              <CardFooter className="flex justify-between border-t p-4">
                <div className="text-sm text-muted-foreground flex items-center">
                  <Sparkles className="h-4 w-4 mr-1" /> AI generated content
                </div>
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-4 w-4 mr-2" /> 
                  Refine
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

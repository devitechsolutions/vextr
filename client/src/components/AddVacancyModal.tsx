import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";
import { X, Sparkles, Upload, Globe, Edit, Users, Trash2, RotateCcw, ChevronsUpDown, Check } from "lucide-react";
import { insertVacancySchema, Client, User, Vacancy } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Auto-growing textarea component
interface AutoGrowTextareaProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function AutoGrowTextarea({ value, onChange, placeholder, disabled, className }: AutoGrowTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none overflow-hidden ${className || ''}`}
      rows={1}
    />
  );
}

const formSchema = insertVacancySchema.extend({
  skillsInput: z.string().optional(),
  salaryRangeMin: z.number().optional(),
  salaryRangeMax: z.number().optional(),
  clientName: z.string().min(1, "Client name is required"),
  ownerId: z.number().min(1, "Owner is required"),
  clientId: z.number().optional(), // Allow optional clientId for auto-created clients
});

type FormData = z.infer<typeof formSchema>;

interface AddVacancyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editVacancy?: Vacancy | null;
  viewVacancy?: Vacancy | null;
  preSelectedClientId?: number | null;
  onEdit?: (vacancy: Vacancy) => void;
  onFindCandidates?: (vacancyId: number) => void;
  onDelete?: (vacancyId: number) => void;
}

export function AddVacancyModal({ open, onOpenChange, editVacancy, viewVacancy, preSelectedClientId, onEdit, onFindCandidates, onDelete }: AddVacancyModalProps) {
  const [skillsInput, setSkillsInput] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [openClientCombo, setOpenClientCombo] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Determine if we're in view mode
  const isViewMode = !!viewVacancy && !editVacancy;
  const currentVacancy = viewVacancy || editVacancy;

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      clientName: "",
      ownerId: undefined,
      organization: "",
      function: "",
      jobRequirements: "",
      offer: "",
      location: "",
      employmentType: "full-time",
      experienceLevel: "mid-level",
      educationLevel: "bachelor",
      salaryRangeMin: undefined,
      salaryRangeMax: undefined,
      salaryCurrency: "EUR",
      status: "open",
      skills: [],
      // Matching weights with defaults
      skillsWeight: 40,
      locationWeight: 25,
      experienceWeight: 15,
      titleWeight: 10,
      educationWeight: 5,
      industryWeight: 5,
    },
  });

  // Handle pre-selected client
  useEffect(() => {
    if (preSelectedClientId && clients) {
      const preSelectedClient = clients.find(c => c.id === preSelectedClientId);
      if (preSelectedClient) {
        form.setValue("clientName", preSelectedClient.name);
      }
    }
  }, [preSelectedClientId, clients, form]);

  // Handle editing existing vacancy or viewing vacancy
  useEffect(() => {
    if (currentVacancy && clients) {
      const client = clients.find(c => c.id === currentVacancy.clientId);
      form.reset({
        title: currentVacancy.title || "",
        clientName: client?.name || "",
        ownerId: currentVacancy.ownerId || undefined,
        organization: currentVacancy.organization || "",
        function: currentVacancy.function || "",
        jobRequirements: currentVacancy.jobRequirements || "",
        offer: currentVacancy.offer || "",
        location: currentVacancy.location || "",
        employmentType: currentVacancy.employmentType || "full-time",
        experienceLevel: currentVacancy.experienceLevel || "mid-level",
        educationLevel: currentVacancy.educationLevel || "bachelor",
        salaryRangeMin: currentVacancy.salaryRangeMin || undefined,
        salaryRangeMax: currentVacancy.salaryRangeMax || undefined,
        salaryCurrency: currentVacancy.salaryCurrency || "EUR",
        status: currentVacancy.status || "open",
        skills: currentVacancy.skills || [],
        // Matching weights
        skillsWeight: currentVacancy.skillsWeight || 40,
        locationWeight: currentVacancy.locationWeight || 25,
        experienceWeight: currentVacancy.experienceWeight || 15,
        titleWeight: currentVacancy.titleWeight || 10,
        educationWeight: currentVacancy.educationWeight || 5,
        industryWeight: currentVacancy.industryWeight || 0,
      });
      setSkills(currentVacancy.skills || []);
    } else if (!currentVacancy && !preSelectedClientId) {
      // Reset form when not editing and no pre-selected client
      form.reset({
        title: "",
        clientName: "",
        ownerId: undefined,
        organization: "",
        function: "",
        jobRequirements: "",
        offer: "",
        location: "",
        employmentType: "full-time",
        experienceLevel: "mid-level",
        educationLevel: "bachelor",
        salaryRangeMin: undefined,
        salaryRangeMax: undefined,
        salaryCurrency: "EUR",
        status: "open",
        skills: [],
        // Default matching weights
        skillsWeight: 40,
        locationWeight: 25,
        experienceWeight: 15,
        titleWeight: 10,
        educationWeight: 5,
        industryWeight: 0,
      });
      setSkills([]);
      setSkillsInput("");
    }
  }, [currentVacancy, clients, form, preSelectedClientId]);



  const createVacancyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/vacancies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create vacancy");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      toast({
        title: "Success",
        description: "Vacancy created successfully",
      });
      onOpenChange(false);
      form.reset();
      setSkills([]);
      setSkillsInput("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create vacancy",
        variant: "destructive",
      });
    },
  });

  const updateVacancyMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/vacancies/${editVacancy?.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update vacancy");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      toast({
        title: "Success",
        description: "Vacancy updated successfully",
      });
      onOpenChange(false);
      form.reset();
      setSkills([]);
      setSkillsInput("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update vacancy",
        variant: "destructive",
      });
    },
  });

  const fillWithAiMutation = useMutation({
    mutationFn: async ({ title, clientName }: { title: string, clientName: string }) => {
      const response = await fetch("/api/generate-vacancy-fields", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, clientName }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate fields with AI");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Update form fields with AI-generated content
      if (data.organization) form.setValue("organization", data.organization);
      if (data.function) form.setValue("function", data.function);
      if (data.jobRequirements) form.setValue("jobRequirements", data.jobRequirements);
      if (data.offer) form.setValue("offer", data.offer);
      if (data.location) form.setValue("location", data.location);
      if (data.employmentType) form.setValue("employmentType", data.employmentType);
      if (data.experienceLevel) form.setValue("experienceLevel", data.experienceLevel);
      if (data.educationLevel) form.setValue("educationLevel", data.educationLevel);
      if (data.salaryRangeMin) form.setValue("salaryRangeMin", data.salaryRangeMin);
      if (data.salaryRangeMax) form.setValue("salaryRangeMax", data.salaryRangeMax);
      if (data.skills && data.skills.length > 0) {
        setSkills(data.skills);
        form.setValue("skills", data.skills);
      }

      toast({
        title: "Success",
        description: "Form fields filled with AI suggestions",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate fields with AI",
        variant: "destructive",
      });
    },
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/extract-vacancy-from-file", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error("Failed to extract data from file");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Update form fields with extracted content (except client name - preserve manual input)
      if (data.organization) form.setValue("organization", data.organization);
      if (data.function) form.setValue("function", data.function);
      if (data.jobRequirements) form.setValue("jobRequirements", data.jobRequirements);
      if (data.offer) form.setValue("offer", data.offer);
      if (data.location) form.setValue("location", data.location);
      if (data.employmentType) form.setValue("employmentType", data.employmentType);
      if (data.experienceLevel) form.setValue("experienceLevel", data.experienceLevel);
      if (data.educationLevel) form.setValue("educationLevel", data.educationLevel);
      if (data.salaryRangeMin) form.setValue("salaryRangeMin", data.salaryRangeMin);
      if (data.salaryRangeMax) form.setValue("salaryRangeMax", data.salaryRangeMax);
      if (data.skills && data.skills.length > 0) {
        setSkills(data.skills);
        form.setValue("skills", data.skills);
      }
      
      // Store extracted company info for later use during form submission
      if (data.extractedCompanyInfo) {
        (window as any).extractedCompanyInfo = data.extractedCompanyInfo;
      }
      
      // Only suggest company name if client field is empty
      if (!form.getValues("clientName") && data.companyName) {
        form.setValue("clientName", data.companyName);
      }

      toast({
        title: "Success",
        description: "Form fields filled from uploaded file. Review and adjust client name if needed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to extract data from file",
        variant: "destructive",
      });
    },
  });

  const scrapeUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/scrape-vacancy-from-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to scrape data from URL");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Update form fields with scraped content (except client name - preserve manual input)
      if (data.organization) form.setValue("organization", data.organization);
      if (data.function) form.setValue("function", data.function);
      if (data.jobRequirements) form.setValue("jobRequirements", data.jobRequirements);
      if (data.offer) form.setValue("offer", data.offer);
      if (data.location) form.setValue("location", data.location);
      if (data.employmentType) form.setValue("employmentType", data.employmentType);
      if (data.experienceLevel) form.setValue("experienceLevel", data.experienceLevel);
      if (data.educationLevel) form.setValue("educationLevel", data.educationLevel);
      if (data.salaryRangeMin) form.setValue("salaryRangeMin", data.salaryRangeMin);
      if (data.salaryRangeMax) form.setValue("salaryRangeMax", data.salaryRangeMax);
      if (data.skills && data.skills.length > 0) {
        setSkills(data.skills);
        form.setValue("skills", data.skills);
      }
      
      // Store extracted company info for later use during form submission
      if (data.extractedCompanyInfo) {
        (window as any).extractedCompanyInfo = data.extractedCompanyInfo;
      }
      
      // Only suggest company name if client field is empty
      if (!form.getValues("clientName") && data.companyName) {
        form.setValue("clientName", data.companyName);
      }

      toast({
        title: "Success",
        description: "Form fields filled from scraped URL. Review and adjust client name if needed.",
      });
      setScrapeUrl(""); // Clear the URL input
    },
    onError: (error: any) => {
      // Check if it's a protected site error
      if (error.message && error.message.includes("protected")) {
        toast({
          title: "Protected Website Detected",
          description: (
            <div className="space-y-2">
              <p>This website has anti-bot protection. Here's how to work around it:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Open the job posting in your browser</li>
                <li>Right-click and select "Save as" → "Webpage, HTML only"</li>
                <li>Click "Upload File" button here and select the saved HTML file</li>
              </ol>
              <p className="text-sm font-medium mt-2">Alternative: Copy all text from the job posting, save as .txt file, then upload</p>
            </div>
          ),
          duration: Infinity, // Persistent toast
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to scrape data from URL",
          variant: "destructive",
        });
      }
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      uploadFileMutation.mutate(file);
    }
  };

  const handleScrapeUrl = () => {
    if (!scrapeUrl.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a URL to scrape",
        variant: "destructive",
      });
      return;
    }
    
    scrapeUrlMutation.mutate(scrapeUrl);
  };

  const addSkill = () => {
    if (skillsInput.trim() && !skills.includes(skillsInput.trim())) {
      const newSkills = [...skills, skillsInput.trim()];
      setSkills(newSkills);
      form.setValue("skills", newSkills);
      setSkillsInput("");
    }
  };

  const removeSkill = (skillToRemove: string) => {
    const newSkills = skills.filter(skill => skill !== skillToRemove);
    setSkills(newSkills);
    form.setValue("skills", newSkills);
  };

  const handleFillWithAi = () => {
    const title = form.getValues("title");
    const clientName = form.getValues("clientName");
    
    if (!title || !clientName) {
      toast({
        title: "Missing Information",
        description: "Please enter both Job Title and Client name before using AI fill",
        variant: "destructive",
      });
      return;
    }
    
    fillWithAiMutation.mutate({ title, clientName });
  };

  // Create enhanced client with extracted info if available
  const createEnhancedClientMutation = useMutation({
    mutationFn: async ({ clientName, extractedCompanyInfo }: { clientName: string, extractedCompanyInfo?: any }) => {
      const response = await fetch("/api/create-client-with-info", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientName, extractedCompanyInfo }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create/enhance client");
      }
      
      return response.json();
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      // Check if we have extracted company info from scraping/upload
      const extractedCompanyInfo = (window as any).extractedCompanyInfo;
      
      // For editing: check if client name has changed from the original
      let clientNameChanged = false;
      if (editVacancy && clients) {
        const originalClient = clients.find(c => c.id === editVacancy.clientId);
        clientNameChanged = originalClient?.name !== data.clientName;
      }
      
      // If we have extracted info OR client name changed during editing, handle client creation/enhancement
      if ((extractedCompanyInfo || clientNameChanged) && data.clientName) {
        const clientResult = await createEnhancedClientMutation.mutateAsync({
          clientName: data.clientName,
          extractedCompanyInfo
        });
        
        // Clear the stored extracted info
        delete (window as any).extractedCompanyInfo;
        
        if (clientNameChanged || extractedCompanyInfo) {
          toast({
            title: clientResult.created ? "Client Created" : "Client Enhanced",
            description: `Client "${data.clientName}" ${clientResult.created ? 'created' : 'updated'}.`,
          });
        }
        
        // Refresh clients list
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      }
      
      const vacancyData = {
        ...data,
        skills,
        clientName: data.clientName, // This will be handled by the backend to create/find client
      };
      
      if (editVacancy) {
        updateVacancyMutation.mutate(vacancyData);
      } else {
        createVacancyMutation.mutate(vacancyData);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process client information",
        variant: "destructive",
      });
    }
  };

  // Reset form when modal closes (but not when opening for edit/view)
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !editVacancy && !viewVacancy) {
      // Only reset when closing and not in edit/view mode
      form.reset();
      setSkills([]);
      setSkillsInput("");
      setScrapeUrl("");
      setUploadedFile(null);
      setClientSearchTerm("");
      setOpenClientCombo(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[1000px] max-h-[90vh] overflow-y-auto dialog-content">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>
                {isViewMode ? currentVacancy?.title : editVacancy ? "Edit Vacancy" : "Add New Vacancy"}
              </DialogTitle>
              <DialogDescription>
                {isViewMode 
                  ? "View vacancy details" 
                  : editVacancy 
                    ? "Update the job vacancy details." 
                    : "Create a new job vacancy to start recruiting candidates."
                }
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {isViewMode && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete?.(currentVacancy!.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                  <Button
                    variant="outline" 
                    size="sm"
                    onClick={() => onFindCandidates?.(currentVacancy!.id)}
                  >
                    <Users className="h-4 w-4 mr-1" />
                    Find Candidates
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit?.(currentVacancy!)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                </>
              )}
              {!isViewMode && !editVacancy && (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    form.reset();
                    setSkills([]);
                    setSkillsInput("");
                    setScrapeUrl("");
                    setUploadedFile(null);
                    setClientSearchTerm("");
                  }}
                  className="p-2"
                  title="Clear form"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="p-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Top row: Job Title, Client, Owner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g. Senior Data Center Engineer" 
                        {...field} 
                        disabled={isViewMode}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client *</FormLabel>
                    {!isViewMode ? (
                      <Popover open={openClientCombo} onOpenChange={setOpenClientCombo}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openClientCombo}
                              className="w-full justify-between font-normal"
                            >
                              {field.value || "Select or type client name..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0">
                          <Command>
                            <CommandInput 
                              placeholder="Search or enter new client..." 
                              value={clientSearchTerm}
                              onValueChange={(value) => {
                                setClientSearchTerm(value);
                                field.onChange(value);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  setOpenClientCombo(false);
                                }
                              }}
                            />
                            <CommandList>
                              <CommandEmpty>
                                <div className="p-2 text-sm text-muted-foreground">
                                  Client "{clientSearchTerm}" will be created when you submit the form
                                </div>
                              </CommandEmpty>
                              <CommandGroup>
                                {clients
                                  ?.filter((client) =>
                                    client.name.toLowerCase().includes(clientSearchTerm.toLowerCase())
                                  )
                                  .slice(0, 20)
                                  .map((client) => (
                                    <CommandItem
                                      key={client.id}
                                      value={client.name}
                                      onSelect={(currentValue) => {
                                        field.onChange(currentValue);
                                        setClientSearchTerm(currentValue);
                                        setOpenClientCombo(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          field.value === client.name ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      {client.name}
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <FormControl>
                        <Input 
                          value={field.value}
                          disabled={true}
                        />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Owner *</FormLabel>
                    <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()} disabled={isViewMode}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users?.map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.fullName || user.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Auto-fill Options */}
            {!isViewMode && (
              <div className="flex gap-3 items-center">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleFillWithAi}
                  disabled={fillWithAiMutation.isPending}
                  className="flex items-center gap-2 w-auto"
                >
                  <Sparkles className="h-4 w-4" />
                  {fillWithAiMutation.isPending ? "Generating..." : "Fill with AI"}
                </Button>

                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.html,.htm"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={uploadFileMutation.isPending}
                  />
                  <Button 
                    type="button" 
                    variant="outline" 
                    disabled={uploadFileMutation.isPending}
                    className="flex items-center gap-2 w-auto"
                  >
                    <Upload className="h-4 w-4" />
                    {uploadFileMutation.isPending ? "Processing..." : "Upload File"}
                  </Button>
                </div>

                <div className="relative flex-1">
                  <Input
                    placeholder="Enter job posting URL to scrape..."
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    className="w-full pr-24"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleScrapeUrl}
                    disabled={scrapeUrlMutation.isPending || !scrapeUrl.trim()}
                    className="absolute right-1 top-1 bottom-1 flex items-center gap-1 px-3 h-auto"
                  >
                    <Globe className="h-4 w-4" />
                    {scrapeUrlMutation.isPending ? "Scraping..." : "Scrape"}
                  </Button>
                </div>
              </div>
            )}

            {/* Two-column layout: Left and Right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: All fields until Location */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="organization"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organization</FormLabel>
                      <FormControl>
                        <AutoGrowTextarea 
                          placeholder="Describe the organization, company culture, and working environment..."
                          value={field.value || ""}
                          onChange={field.onChange}
                          disabled={isViewMode}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="function"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Function *</FormLabel>
                      <FormControl>
                        <AutoGrowTextarea 
                          placeholder="Describe the role, main responsibilities, and key tasks..."
                          value={field.value || ""}
                          onChange={field.onChange}
                          disabled={isViewMode}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="jobRequirements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Requirements *</FormLabel>
                      <FormControl>
                        <AutoGrowTextarea 
                          placeholder="Specify required qualifications, skills, experience, and competencies..."
                          value={field.value || ""}
                          onChange={field.onChange}
                          disabled={isViewMode}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="offer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Offer</FormLabel>
                      <FormControl>
                        <AutoGrowTextarea 
                          placeholder="What we offer: benefits, career development, perks, working conditions..."
                          value={field.value || ""}
                          onChange={field.onChange}
                          disabled={isViewMode}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Right Column: Required Skills at top, then Location and other fields */}
              <div className="space-y-4">
                {/* Required Skills Section - Top of Right Column */}
                {!isViewMode && (
                  <div className="space-y-2">
                    <FormLabel>Required Skills</FormLabel>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Add a skill and press Enter"
                        value={skillsInput}
                        onChange={(e) => setSkillsInput(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSkill();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addSkill}>
                        Add
                      </Button>
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  {(!isViewMode || (isViewMode && skills.length > 0)) && <FormLabel>Required Skills</FormLabel>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {skills.map((skill) => (
                      <Badge key={skill} variant="secondary" className="flex items-center gap-1">
                        {skill}
                        {!isViewMode && (
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => removeSkill(skill)}
                          />
                        )}
                      </Badge>
                    ))}
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. Amsterdam, Netherlands" 
                          value={field.value || ""} 
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          name={field.name}
                          ref={field.ref}
                          disabled={isViewMode}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isViewMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="full-time">Full-time</SelectItem>
                          <SelectItem value="part-time">Part-time</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                          <SelectItem value="temporary">Temporary</SelectItem>
                          <SelectItem value="internship">Internship</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="experienceLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Experience Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isViewMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="entry-level">Entry Level</SelectItem>
                          <SelectItem value="junior">Junior</SelectItem>
                          <SelectItem value="mid-level">Mid Level</SelectItem>
                          <SelectItem value="senior">Senior</SelectItem>
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="director">Director</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="educationLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Education Level</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={isViewMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high-school">High School</SelectItem>
                          <SelectItem value="vocational">Vocational Training</SelectItem>
                          <SelectItem value="associate">Associate Degree</SelectItem>
                          <SelectItem value="bachelor">Bachelor's Degree</SelectItem>
                          <SelectItem value="master">Master's Degree</SelectItem>
                          <SelectItem value="doctorate">Doctorate</SelectItem>
                          <SelectItem value="not-specified">Not Specified</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="salaryRangeMin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Min</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="50000"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            disabled={isViewMode}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="salaryRangeMax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary Max</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="75000"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                            disabled={isViewMode}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="salaryCurrency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? "EUR"} disabled={isViewMode}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="GBP">GBP (£)</SelectItem>
                            <SelectItem value="CHF">CHF</SelectItem>
                            <SelectItem value="NOK">NOK</SelectItem>
                            <SelectItem value="SEK">SEK</SelectItem>
                            <SelectItem value="DKK">DKK</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "open"} disabled={isViewMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="filled">Filled</SelectItem>
                          <SelectItem value="on hold">On hold</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Matching Weights Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Candidate Matching Weights</h3>
                    <span className="text-sm text-muted-foreground">(Must sum to 100%)</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="skillsWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Technical Skills %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="40"
                              value={field.value ?? 40}
                              onChange={(e) => field.onChange(e.target.value !== '' ? parseInt(e.target.value) : 0)}
                              disabled={isViewMode}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="locationWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="25"
                              value={field.value ?? 25}
                              onChange={(e) => field.onChange(e.target.value !== '' ? parseInt(e.target.value) : 0)}
                              disabled={isViewMode}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="experienceWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Experience %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="15"
                              value={field.value ?? 15}
                              onChange={(e) => field.onChange(e.target.value !== '' ? parseInt(e.target.value) : 0)}
                              disabled={isViewMode}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="titleWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title/Role %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="10"
                              value={field.value ?? 10}
                              onChange={(e) => field.onChange(e.target.value !== '' ? parseInt(e.target.value) : 0)}
                              disabled={isViewMode}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="educationWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Education %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="5"
                              value={field.value ?? 5}
                              onChange={(e) => field.onChange(e.target.value !== '' ? parseInt(e.target.value) : 0)}
                              disabled={isViewMode}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="industryWeight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Industry %</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              placeholder="5"
                              value={field.value ?? 5}
                              onChange={(e) => field.onChange(e.target.value !== '' ? parseInt(e.target.value) : 0)}
                              disabled={isViewMode}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  {/* Weight validation indicator */}
                  <div className="text-sm text-muted-foreground">
                    Total: {(form.watch("skillsWeight") ?? 40) + (form.watch("locationWeight") ?? 25) + (form.watch("experienceWeight") ?? 15) + (form.watch("titleWeight") ?? 10) + (form.watch("educationWeight") ?? 5) + (form.watch("industryWeight") ?? 5)}%
                    {((form.watch("skillsWeight") ?? 40) + (form.watch("locationWeight") ?? 25) + (form.watch("experienceWeight") ?? 15) + (form.watch("titleWeight") ?? 10) + (form.watch("educationWeight") ?? 5) + (form.watch("industryWeight") ?? 5)) !== 100 && (
                      <span className="text-red-500 ml-2">⚠️ Must equal 100%</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {!isViewMode && (
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createVacancyMutation.isPending || updateVacancyMutation.isPending}
              >
                {editVacancy 
                  ? (updateVacancyMutation.isPending ? "Updating..." : "Update Vacancy")
                  : (createVacancyMutation.isPending ? "Creating..." : "Create Vacancy")
                }
              </Button>
            </div>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
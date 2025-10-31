import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Label } from "@/components/ui/label";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { PDFDocument } from "@/lib/pdf-renderer";
import { UploadCloud, FileUp, Download, Eye, Layout, FileText, Palette, MailIcon, Phone, Loader2, ChevronLeft, ChevronRight, Plus, X, Edit } from "lucide-react";
import dcPeopleLogo from "@assets/DC People Image_1753449062638.png";

export default function CVFormatterPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentRoute, setCurrentRoute] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isParsingCV, setIsParsingCV] = useState(false);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState("edit");
  const template = "modern"; // Fixed to modern template only
  const [primaryColor, setPrimaryColor] = useState("#2563EB");
  const [includeContactInfo, setIncludeContactInfo] = useState(false);
  const [includeRecruiterInfo, setIncludeRecruiterInfo] = useState(true);
  const [detectedLanguage, setDetectedLanguage] = useState("english");
  
  // Candidate assignment functionality - OPTIONAL toggle
  const [addToCandidate, setAddToCandidate] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [candidateSuggestions, setCandidateSuggestions] = useState<any[]>([]);
  const [isSearchingCandidates, setIsSearchingCandidates] = useState(false);
  const [uploadedCvUrl, setUploadedCvUrl] = useState<string | null>(null);
  
  // Candidate data - structured according to new JSON format
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [professionalSummary, setProfessionalSummary] = useState("");
  const [skills, setSkills] = useState<string[]>([""]);
  const [workExperience, setWorkExperience] = useState<{
    title: string;
    company: string;
    dates: string;
    responsibilities: string[];
  }[]>([{
    title: "",
    company: "",
    dates: "",
    responsibilities: [""]
  }]);
  const [education, setEducation] = useState<{
    degree: string;
    institution: string;
    dates: string;
  }[]>([{
    degree: "",
    institution: "",
    dates: ""
  }]);
  const [languages, setLanguages] = useState<{
    language: string;
    proficiency: string;
  }[]>([{
    language: "",
    proficiency: ""
  }]);
  const [courses, setCourses] = useState<{
    courseName: string;
    institution: string;
    completionDate: string;
    certificateNumber?: string;
    description?: string;
  }[]>([{
    courseName: "",
    institution: "",
    completionDate: "",
    certificateNumber: "",
    description: ""
  }]);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const ITEMS_PER_PAGE = 1000; // Words per page for content pagination
  
  // Recruiter data - prefilled with logged-in user's information
  const [recruiterName, setRecruiterName] = useState("");
  const [recruiterCompany, setRecruiterCompany] = useState("DC People");
  const [recruiterEmail, setRecruiterEmail] = useState("");
  const [recruiterPhone, setRecruiterPhone] = useState("");
  
  // Effect to prefill recruiter information when user data is available
  useEffect(() => {
    if (user) {
      setRecruiterName(user.fullName || '');
      setRecruiterEmail(user.email || '');
      setRecruiterPhone(user.phone || '');
    }
  }, [user]);

  // Function to assign CV to selected candidate
  const assignCVToCandidate = async (candidateIdToAssign: number, cvUrl: string) => {
    try {
      const response = await fetch(`/api/candidates/${candidateIdToAssign}/cv`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cvUrl: cvUrl
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to assign CV to candidate');
      }
      
      return true;
    } catch (error) {
      console.error('Error assigning CV to candidate:', error);
      return false;
    }
  };

  // Function to search for candidates based on CV data
  const searchForCandidates = async (cvFirstName: string, cvLastName: string) => {
    if (!cvFirstName && !cvLastName) return;
    
    setIsSearchingCandidates(true);
    try {
      const searchQuery = `${cvFirstName} ${cvLastName}`.trim();
      const response = await fetch(`/api/candidates/search?q=${encodeURIComponent(searchQuery)}`);
      
      if (response.ok) {
        const suggestions = await response.json();
        setCandidateSuggestions(suggestions);
        
        // If there's an exact match, suggest it
        if (suggestions.length > 0) {
          const exactMatch = suggestions.find((candidate: any) => {
            const candidateFullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim().toLowerCase();
            const cvFullName = searchQuery.toLowerCase();
            return candidateFullName === cvFullName;
          });
          
          if (exactMatch) {
            setSelectedCandidateId(exactMatch.id);
          }
        }
      }
    } catch (error) {
      console.error('Error searching candidates:', error);
    } finally {
      setIsSearchingCandidates(false);
    }
  };

  // Effect to parse URL parameters and get candidate information
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const candidateIdParam = urlParams.get('candidateId');
    const cvUrlParam = urlParams.get('cvUrl');
    
    if (candidateIdParam) {
      setCandidateId(parseInt(candidateIdParam));
    }

    // Auto-load CV if cvUrl is provided
    if (cvUrlParam && candidateIdParam) {
      handleAutoLoadCV(parseInt(candidateIdParam));
    }
  }, []);

  // Function to auto-load CV from candidate
  const handleAutoLoadCV = async (candidateId: number) => {
    try {
      setIsParsingCV(true);
      
      // Parse the CV using the backend CV parser
      const response = await fetch(`/api/cv-parser/parse-candidate-cv/${candidateId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to parse CV');
      }

      const cvData = await response.json();
      
      // Populate all the form fields with parsed CV data
      setFirstName(cvData.firstName || '');
      setLastName(cvData.lastName || '');
      setCurrentTitle(cvData.currentTitle || '');
      setEmail(cvData.email || '');
      setPhone(cvData.phone || '');
      setLocation(cvData.location || '');
      setProfessionalSummary(cvData.professionalSummary || '');
      setSkills(cvData.skills || ['']);
      setWorkExperience(cvData.workExperience || [{
        title: '',
        company: '',
        dates: '',
        responsibilities: ['']
      }]);
      setEducation(cvData.education || [{
        degree: '',
        institution: '',
        dates: ''
      }]);
      setLanguages(cvData.languages || [{
        language: '',
        proficiency: ''
      }]);
      setCourses(cvData.courses || [{
        courseName: '',
        institution: '',
        completionDate: '',
        certificateNumber: ''
      }]);
      
      setDetectedLanguage(cvData.detected_language || 'english');
      setNoticePeriod(cvData.noticePeriod || '');
      setNoticePeriodUnit(cvData.noticePeriodUnit || 'Month(s)');
      
      toast({
        title: "CV loaded successfully",
        description: "Original CV has been parsed and loaded into the formatter.",
      });
    } catch (error) {
      console.error('Error auto-loading CV:', error);
      toast({
        title: "Failed to load CV",
        description: "Could not automatically load the original CV. You can upload it manually.",
        variant: "destructive"
      });
    } finally {
      setIsParsingCV(false);
    }
  };
  
  // Notice period data
  const [noticePeriod, setNoticePeriod] = useState("");
  const [noticePeriodUnit, setNoticePeriodUnit] = useState("Month(s)");
  const [noticePeriodNegotiable, setNoticePeriodNegotiable] = useState(false);
  
  // Helper function to calculate text width
  const getTextWidth = (text: string) => {
    if (!text) return 120;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (context) {
      context.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      return Math.ceil(context.measureText(text).width) + 32; // 32px for left+right padding
    }
    return Math.max(120, text.length * 7 + 32);
  };

  // Helper function to enhance locations by adding country
  const enhanceLocation = (locationValue: string): string => {
    if (!locationValue.trim()) return locationValue;
    
    // Database of cities and their countries
    const cityCountryMap: { [key: string]: string } = {
      // The Netherlands
      'Amsterdam': 'The Netherlands',
      'Rotterdam': 'The Netherlands',
      'Den Haag': 'The Netherlands',
      'The Hague': 'The Netherlands',
      'Utrecht': 'The Netherlands',
      'Eindhoven': 'The Netherlands',
      'Tilburg': 'The Netherlands',
      'Groningen': 'The Netherlands',
      'Almere': 'The Netherlands',
      'Breda': 'The Netherlands',
      'Nijmegen': 'The Netherlands',
      'Enschede': 'The Netherlands',
      'Haarlem': 'The Netherlands',
      'Arnhem': 'The Netherlands',
      'Amersfoort': 'The Netherlands',
      'Apeldoorn': 'The Netherlands',
      'Maastricht': 'The Netherlands',
      'Leiden': 'The Netherlands',
      'Dordrecht': 'The Netherlands',
      'Zoetermeer': 'The Netherlands',
      'Zwolle': 'The Netherlands',
      'Deventer': 'The Netherlands',
      'Delft': 'The Netherlands',
      'Alkmaar': 'The Netherlands',
      'Leeuwarden': 'The Netherlands',
      'Gouda': 'The Netherlands',
      'Hilversum': 'The Netherlands',
      
      // Germany
      'Berlin': 'Germany',
      'Munich': 'Germany',
      'Hamburg': 'Germany',
      'Cologne': 'Germany',
      'Frankfurt': 'Germany',
      'Stuttgart': 'Germany',
      'Düsseldorf': 'Germany',
      'Leipzig': 'Germany',
      'Dortmund': 'Germany',
      'Essen': 'Germany',
      'Bremen': 'Germany',
      'Dresden': 'Germany',
      'Hannover': 'Germany',
      'Nuremberg': 'Germany',
      
      // Belgium
      'Brussels': 'Belgium',
      'Antwerp': 'Belgium',
      'Ghent': 'Belgium',
      'Charleroi': 'Belgium',
      'Liège': 'Belgium',
      'Bruges': 'Belgium',
      'Leuven': 'Belgium',
      
      // United Kingdom
      'London': 'United Kingdom',
      'Manchester': 'United Kingdom',
      'Birmingham': 'United Kingdom',
      'Leeds': 'United Kingdom',
      'Glasgow': 'United Kingdom',
      'Sheffield': 'United Kingdom',
      'Bradford': 'United Kingdom',
      'Liverpool': 'United Kingdom',
      'Edinburgh': 'United Kingdom',
      'Bristol': 'United Kingdom',
      
      // France
      'Paris': 'France',
      'Lyon': 'France',
      'Marseille': 'France',
      'Toulouse': 'France',
      'Nice': 'France',
      'Nantes': 'France',
      'Strasbourg': 'France',
      'Montpellier': 'France',
      'Bordeaux': 'France',
      'Lille': 'France',
      
      // United States
      'New York': 'United States',
      'Los Angeles': 'United States',
      'Chicago': 'United States',
      'Houston': 'United States',
      'Phoenix': 'United States',
      'Philadelphia': 'United States',
      'San Antonio': 'United States',
      'San Diego': 'United States',
      'Dallas': 'United States',
      'San Jose': 'United States',
      'Austin': 'United States',
      'Jacksonville': 'United States',
      'San Francisco': 'United States',
      'Columbus': 'United States',
      'Fort Worth': 'United States',
      'Indianapolis': 'United States',
      'Charlotte': 'United States',
      'Seattle': 'United States',
      'Denver': 'United States',
      'Boston': 'United States',
      
      // Canada
      'Toronto': 'Canada',
      'Montreal': 'Canada',
      'Vancouver': 'Canada',
      'Calgary': 'Canada',
      'Edmonton': 'Canada',
      'Ottawa': 'Canada',
      'Winnipeg': 'Canada',
      'Quebec City': 'Canada',
      'Hamilton': 'Canada',
      
      // Other major cities
      'Stockholm': 'Sweden',
      'Copenhagen': 'Denmark',
      'Oslo': 'Norway',
      'Helsinki': 'Finland',
      'Zurich': 'Switzerland',
      'Geneva': 'Switzerland',
      'Vienna': 'Austria',
      'Prague': 'Czech Republic',
      'Warsaw': 'Poland',
      'Madrid': 'Spain',
      'Barcelona': 'Spain',
      'Rome': 'Italy',
      'Milan': 'Italy',
      'Dublin': 'Ireland',
      'Lisbon': 'Portugal',
      'Budapest': 'Hungary',
      'Athens': 'Greece'
    };
    
    // Check if location already has a country (contains common country patterns)
    const hasCountry = /,\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*$/i.test(locationValue) ||
                      /,\s*(USA|UK|US|NL|DE|FR|BE|IT|ES|CA|AU)\s*$/i.test(locationValue);
    
    if (hasCountry) {
      return locationValue; // Already has country specified
    }
    
    // Extract the main city name (first part before comma or the whole string)
    const cityName = locationValue.split(',')[0].trim();
    
    // Look up the city in our database
    const country = cityCountryMap[cityName];
    
    if (country) {
      return `${locationValue}, ${country}`;
    }
    
    return locationValue; // Return as-is if city not found in database
  };

  // Get proficiency levels based on detected language - simplified to 4 levels
  const getProficiencyLevels = () => {
    if (detectedLanguage === "dutch") {
      return [
        "Beginner",
        "Gemiddeld", 
        "Vloeiend",
        "Moedertaal"
      ];
    } else {
      return [
        "Beginner",
        "Intermediate",
        "Fluent",
        "Native"
      ];
    }
  };

  // Get translated notice period units based on detected language
  const getNoticePeriodUnits = () => {
    if (detectedLanguage === "dutch") {
      return {
        "Month(s)": { value: "Month(s)", label: "maand(en)" },
        "Day(s)": { value: "Day(s)", label: "dagen" }
      };
    } else {
      return {
        "Month(s)": { value: "Month(s)", label: "Month(s)" },
        "Day(s)": { value: "Day(s)", label: "Day(s)" }
      };
    }
  };

  // Get display text for notice period unit
  const getNoticePeriodUnitDisplay = (unit: string) => {
    const units = getNoticePeriodUnits();
    return units[unit as keyof typeof units]?.label || unit;
  };

  // Auto-resize Professional Summary textarea on content change
  useEffect(() => {
    const textarea = document.getElementById('professionalSummary') as HTMLTextAreaElement;
    if (textarea && professionalSummary) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(60, textarea.scrollHeight)}px`;
    }
  }, [professionalSummary]);


  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setIsParsingCV(true);
      
      toast({
        title: "CV uploaded",
        description: `${selectedFile.name} has been uploaded. Parsing CV content...`,
      });
      
      try {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('cv', selectedFile);
        
        // Call the backend CV parsing API
        const response = await fetch('/api/cv-parser/upload-and-parse', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to parse CV');
        }
        
        const result = await response.json();
        
        // Remove debug logging now that CV parser is working correctly
        
        if (result.success && result.data) {
          // Store the uploaded CV URL if available
          if (result.cvUrl) {
            setUploadedCvUrl(result.cvUrl);
          }
          
          // Update the form fields with extracted data using new JSON structure
          setFirstName(result.data.first_name || "");
          setLastName(result.data.last_name || "");
          setCurrentTitle(result.data.current_title || "");
          setEmail(result.data.email || "");
          setPhone(result.data.phone || "");
          setLocation(enhanceLocation(result.data.location || ""));
          setProfessionalSummary(result.data.professional_summary || "");
          setDetectedLanguage(result.data.detected_language || "english");
          setSkills(Array.isArray(result.data.skills) ? result.data.skills : []);
          
          // Handle structured work experience and education
          if (Array.isArray(result.data.work_experience)) {
            setWorkExperience(result.data.work_experience);
          } else if (typeof result.data.work_experience === 'string') {
            // Legacy format fallback
            setWorkExperience([{
              title: "Please edit",
              company: "Please edit", 
              dates: "Please edit",
              responsibilities: [result.data.work_experience]
            }]);
          } else {
            setWorkExperience([]);
          }
          
          if (Array.isArray(result.data.education)) {
            setEducation(result.data.education);
          } else if (typeof result.data.education === 'string') {
            // Legacy format fallback
            setEducation([{
              degree: "Please edit",
              institution: "Please edit",
              dates: result.data.education
            }]);
          } else {
            setEducation([]);
          }
          
          // Handle courses
          if (Array.isArray(result.data.courses)) {
            setCourses(result.data.courses.map((course: any) => ({
              ...course,
              description: course.description || ""
            })));
          } else {
            setCourses([{
              courseName: "",
              institution: "",
              completionDate: "",
              certificateNumber: "",
              description: ""
            }]);
          }
          
          // Handle languages
          if (Array.isArray(result.data.languages)) {
            setLanguages(result.data.languages);
          } else {
            setLanguages([]);
          }
          
          // Auto-search for candidates if "Add to candidate" toggle is on
          if (addToCandidate) {
            searchForCandidates(result.data.first_name || "", result.data.last_name || "");
          }
          
          toast({
            title: "CV parsed successfully",
            description: "CV information has been extracted and populated in the form.",
          });
        } else {
          throw new Error('Invalid response from CV parser');
        }
      } catch (error) {
        console.error('Error parsing CV:', error);
        toast({
          title: "CV parsing failed",
          description: error instanceof Error ? error.message : "Failed to parse CV. Please try again.",
          variant: "destructive"
        });
        
        // Clear the file if parsing failed
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } finally {
        setIsParsingCV(false);
      }
    }
  };
  
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleRemoveCV = () => {
    // Clear the file
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Clear all input fields
    setFirstName("");
    setLastName("");
    setCurrentTitle("");
    setEmail("");
    setPhone("");
    setLocation("");
    setProfessionalSummary("");
    setSkills([]);
    setWorkExperience([]);
    setEducation([]);
    setCourses([{
      courseName: "",
      institution: "",
      completionDate: "",
      certificateNumber: "",
      description: ""
    }]);
    
    // Clear recruiter fields
    setRecruiterName("");
    setRecruiterEmail("");
    setRecruiterPhone("");
    
    toast({
      title: "CV removed",
      description: "The uploaded CV and all extracted information have been cleared.",
    });
  };
  
  // Function to save formatted CV to candidate
  const handleSaveToCandidate = async () => {
    if (!candidateId) {
      toast({
        title: "Cannot save to candidate",
        description: "No candidate ID found. Please ensure you accessed the formatter from a candidate profile.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create the PDF data object
      const cvData = {
        firstName,
        lastName,
        currentTitle,
        email,
        phone,
        location,
        professionalSummary,
        skills,
        workExperience,
        education,
        courses,
        languages,
        recruiterName,
        recruiterCompany,
        recruiterEmail,
        recruiterPhone,
        template,
        primaryColor,
        includeContactInfo,
        includeRecruiterInfo,
        detected_language: detectedLanguage,
        noticePeriod,
        noticePeriodUnit,
        noticePeriodNegotiable
      };

      // Generate PDF first
      const response = await fetch('/api/cv-parser/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cvData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();

      // Get upload URL for object storage
      const uploadResponse = await fetch('/api/objects/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }
      
      const { uploadURL } = await uploadResponse.json();
      
      // Upload the PDF to object storage
      const uploadResult = await fetch(uploadURL, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': 'application/pdf',
        },
      });
      
      if (!uploadResult.ok) {
        throw new Error('Failed to upload formatted CV');
      }
      
      // Save the formatted CV URL to the candidate (use the path that will be accessible)
      const formattedCvPath = uploadURL.split('?')[0]; // Remove query parameters to get clean URL
      const saveResponse = await fetch(`/api/candidates/${candidateId}/formatted-cv`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formattedCvUrl: formattedCvPath
        }),
      });
      
      if (!saveResponse.ok) {
        throw new Error('Failed to save formatted CV to candidate');
      }
      
      // If "Add to candidate" is enabled and a candidate is selected, assign both original and formatted CV
      if (addToCandidate && selectedCandidateId && uploadedCvUrl) {
        try {
          // Assign original CV to the selected candidate
          await assignCVToCandidate(selectedCandidateId, uploadedCvUrl);
          
          // Also assign the formatted CV to the selected candidate
          const assignFormattedResponse = await fetch(`/api/candidates/${selectedCandidateId}/formatted-cv`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              formattedCvUrl: formattedCvPath
            }),
          });
          
          if (assignFormattedResponse.ok) {
            toast({
              title: "CV assigned successfully",
              description: `Both original and formatted CV have been assigned to the selected candidate.`,
            });
          }
        } catch (error) {
          console.error('Error assigning CV to candidate:', error);
          toast({
            title: "CV assignment failed",
            description: "Formatted CV was saved, but failed to assign to candidate.",
            variant: "destructive"
          });
        }
      }
      
      // Invalidate candidates cache to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
      
      toast({
        title: "Formatted CV saved successfully",
        description: `CV for ${firstName} ${lastName} has been saved to their candidate profile.`,
      });
      
      // Redirect back to candidates page to see the updated button
      setTimeout(() => {
        setCurrentRoute('/candidates');
      }, 2000);
    } catch (error) {
      console.error('Error saving formatted CV to candidate:', error);
      toast({
        title: "Failed to save formatted CV",
        description: error instanceof Error ? error.message : "Failed to save formatted CV to candidate. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleGeneratePDF = async () => {
    // Only require candidate selection if user chose to add to candidate
    if (addToCandidate && !selectedCandidateId) {
      toast({
        title: "Candidate Required",
        description: "Please select a candidate to attach this CV, or turn off 'Add to candidate' to format without assignment.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Create the PDF data object
      const cvData = {
        firstName,
        lastName,
        currentTitle,
        email,
        phone,
        location,
        professionalSummary,
        skills,
        workExperience,
        education,
        courses,
        languages,
        recruiterName,
        recruiterCompany,
        recruiterEmail,
        recruiterPhone,
        template,
        primaryColor,
        includeContactInfo,
        includeRecruiterInfo,
        detected_language: detectedLanguage,
        noticePeriod,
        noticePeriodUnit,
        noticePeriodNegotiable
      };

      // Call the backend PDF generation API
      const response = await fetch('/api/cv-parser/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cvData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Get the PDF blob
      const blob = await response.blob();
      
      // Create download link with new naming convention
      const candidateName = `${firstName} ${lastName}`;
      const roleTitle = currentTitle || 'Professional';
      const sanitizeFilename = (str: string) => str.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
      const filename = sanitizeFilename(`DC People - ${candidateName} - ${roleTitle}.pdf`);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // If candidateId is available, also save the formatted CV to the candidate
      if (candidateId) {
        try {
          // Get upload URL for object storage
          const uploadResponse = await fetch('/api/objects/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Failed to get upload URL');
          }
          
          const { uploadURL } = await uploadResponse.json();
          
          // Upload the PDF to object storage
          const uploadResult = await fetch(uploadURL, {
            method: 'PUT',
            body: blob,
            headers: {
              'Content-Type': 'application/pdf',
            },
          });
          
          if (!uploadResult.ok) {
            throw new Error('Failed to upload formatted CV');
          }
          
          // Save the formatted CV URL to the candidate (use the path that will be accessible)
          const formattedCvPath = uploadURL.split('?')[0]; // Remove query parameters to get clean URL
          const saveResponse = await fetch(`/api/candidates/${candidateId}/formatted-cv`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              formattedCvUrl: formattedCvPath
            }),
          });
          
          if (!saveResponse.ok) {
            throw new Error('Failed to save formatted CV to candidate');
          }
          
          // If "Add to candidate" is enabled and a candidate is selected, assign both original and formatted CV
          if (addToCandidate && selectedCandidateId && uploadedCvUrl) {
            try {
              // Assign original CV to the selected candidate
              await assignCVToCandidate(selectedCandidateId, uploadedCvUrl);
              
              // Also assign the formatted CV to the selected candidate
              const assignFormattedResponse = await fetch(`/api/candidates/${selectedCandidateId}/formatted-cv`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  formattedCvUrl: formattedCvPath
                }),
              });
              
              if (assignFormattedResponse.ok) {
                toast({
                  title: "CV assigned successfully",
                  description: `Both original and formatted CV have been assigned to the selected candidate.`,
                });
              }
            } catch (error) {
              console.error('Error assigning CV to candidate:', error);
              toast({
                title: "CV assignment failed",
                description: "PDF was generated, but failed to assign to candidate.",
                variant: "destructive"
              });
            }
          }

          // Invalidate candidates cache to refresh the data
          queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
          
          toast({
            title: "PDF generated and saved successfully",
            description: `CV for ${firstName} ${lastName} has been downloaded and saved to candidate profile.`,
          });
          
          // Redirect back to candidates page to see the updated button
          setTimeout(() => {
            setCurrentRoute('/candidates');
          }, 2000);
        } catch (saveError) {
          console.error('Error saving formatted CV to candidate:', saveError);
          toast({
            title: "PDF generated successfully",
            description: `CV for ${firstName} ${lastName} has been downloaded. Note: Could not save to candidate profile.`,
          });
        }
      } else {
        toast({
          title: "PDF generated successfully",
          description: `CV for ${firstName} ${lastName} has been downloaded.`,
        });
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "PDF generation failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const renderTemplatePreview = () => {
    return (
      <div className="p-4 border rounded flex items-center justify-center">
        <div className="h-80 w-full max-w-sm bg-gradient-to-br from-white to-gray-100 shadow-md p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2" style={{ backgroundColor: primaryColor }}></div>
          
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-1">
              <div className="text-lg font-bold" style={{ color: primaryColor }}>{firstName && lastName ? `${firstName} ${lastName}` : ""}</div>
              <div className="text-sm text-gray-600">{currentTitle}</div>
              {location && (
                <div className="text-xs text-gray-500 mt-1">{location}</div>
              )}
            </div>
          </div>
          
          {includeContactInfo && (
            <div className="text-xs text-gray-500 mb-4 flex items-center">
              <MailIcon className="h-3 w-3 mr-1" /> {email}
              <span className="mx-2">•</span>
              <Phone className="h-3 w-3 mr-1" /> {phone}
            </div>
          )}
          
          <div className="text-xs mb-3" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>
            Summary
          </div>
          <div className="text-xs text-gray-600 mb-4 line-clamp-3">
            {professionalSummary}
          </div>
          
          <div className="text-xs mb-1" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>
            Skills
          </div>
          <div className="text-xs text-gray-600 mb-3 line-clamp-2">
            {skills.join(', ')}
          </div>
          
          {(noticePeriod || noticePeriodNegotiable) && (
            <div className="mb-4">
              <div className="text-xs mb-1" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor, padding: "2px 6px", borderRadius: "4px", display: "inline-block" }}>
                Notice Period
              </div>
              <div className="text-xs text-gray-600">
                {noticePeriodNegotiable ? 
                  (noticePeriod ? `${noticePeriod} ${getNoticePeriodUnitDisplay(noticePeriodUnit)} (Negotiable)` : "Negotiable") :
                  (noticePeriod ? `${noticePeriod} ${getNoticePeriodUnitDisplay(noticePeriodUnit)}` : "")
                }
              </div>
            </div>
          )}
          
          {includeRecruiterInfo && (
            <div className="mt-6 pt-3 border-t border-gray-200 text-xs text-gray-500">
              <div className="flex items-center gap-2 mb-2">
                <img src={dcPeopleLogo} alt="DC People" className="h-4 w-4 object-contain" />
                <span className="font-medium text-xs">DC People</span>
              </div>
              Represented by: {recruiterName} | {recruiterCompany}
              <div className="flex items-center mt-1">
                <MailIcon className="h-3 w-3 mr-1" /> {recruiterEmail}
                <span className="mx-2">•</span>
                <Phone className="h-3 w-3 mr-1" /> {recruiterPhone}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CV Formatter</h1>
        <p className="text-muted-foreground">
          Standardize CVs according to your agency's branding
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Upload and edit */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload CV</CardTitle>
              <CardDescription>
                Upload a candidate's CV to format and standardize it
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div 
                className={`border-2 border-dashed rounded-md p-6 text-center transition-colors ${
                  isParsingCV ? 'cursor-not-allowed bg-muted/30' : 'cursor-pointer hover:bg-muted/50'
                }`}
                onClick={!isParsingCV ? handleUploadClick : undefined}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileChange}
                  disabled={isParsingCV}
                />
                {isParsingCV ? (
                  <>
                    <Loader2 className="h-10 w-10 text-primary mx-auto mb-4 animate-spin" />
                    <h3 className="text-lg font-medium mb-1">Parsing CV...</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Extracting information from your CV using AI
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This may take a few seconds
                    </p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-1">Upload CV</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Drag and drop or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supports PDF, DOC, DOCX, and TXT formats
                    </p>
                  </>
                )}
              </div>
              
              {file && (
                <div className="mt-4 p-3 bg-muted/50 rounded-md flex items-center">
                  <FileText className="h-5 w-5 text-muted-foreground mr-2" />
                  <div className="flex-1 truncate">
                    <span className="font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleRemoveCV}>
                    Remove
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Candidate Assignment Section */}
          <Card>
            <CardHeader>
              <CardTitle>Candidate Assignment</CardTitle>
              <CardDescription>
                Assign this CV to an existing candidate profile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="add-to-candidate"
                  checked={addToCandidate}
                  onCheckedChange={setAddToCandidate}
                />
                <Label htmlFor="add-to-candidate">Add to candidate?</Label>
              </div>
              
              {addToCandidate && (
                <div className="space-y-3">
                  {isSearchingCandidates && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching for matching candidates...
                    </div>
                  )}
                  
                  {candidateSuggestions.length > 0 && (
                    <div className="space-y-2">
                      <Label>Select Candidate</Label>
                      <Select 
                        value={selectedCandidateId?.toString() || ""} 
                        onValueChange={(value) => setSelectedCandidateId(value ? parseInt(value) : null)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a candidate..." />
                        </SelectTrigger>
                        <SelectContent>
                          {candidateSuggestions.map((candidate) => (
                            <SelectItem key={candidate.id} value={candidate.id.toString()}>
                              {candidate.firstName} {candidate.lastName}
                              {candidate.company && (
                                <span className="text-muted-foreground ml-2">
                                  • {candidate.company}
                                </span>
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {candidateSuggestions.length === 0 && !isSearchingCandidates && file && (
                    <div className="text-sm text-muted-foreground">
                      No matching candidates found. Try adjusting your search or turn off 'Add to candidate' to format without assignment.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          <Tabs defaultValue="candidate" className="w-full">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="candidate">Candidate Details</TabsTrigger>
              <TabsTrigger value="recruiter">Recruiter Information</TabsTrigger>
            </TabsList>
            
            <TabsContent value="candidate" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Edit Candidate Information</CardTitle>
                  <CardDescription>
                    Review and edit the extracted candidate details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* General Information */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-semibold">General Information</Label>
                    </div>
                    
                    <Card className="border-l-4 border-l-blue-500">
                      <CardContent className="pt-4">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="firstName">First Name</Label>
                              <Input 
                                id="firstName" 
                                value={firstName} 
                                onChange={(e) => setFirstName(e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="lastName">Last Name</Label>
                              <Input 
                                id="lastName" 
                                value={lastName} 
                                onChange={(e) => setLastName(e.target.value)} 
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="currentTitle">Current Title</Label>
                            <Input 
                              id="currentTitle" 
                              value={currentTitle} 
                              onChange={(e) => setCurrentTitle(e.target.value)} 
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="email">Email</Label>
                              <Input 
                                id="email" 
                                type="email"
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="phone">Phone</Label>
                              <Input 
                                id="phone" 
                                value={phone} 
                                onChange={(e) => setPhone(e.target.value)} 
                              />
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input 
                              id="location" 
                              value={location} 
                              onChange={(e) => setLocation(e.target.value)}
                              onBlur={(e) => {
                                const enhanced = enhanceLocation(e.target.value);
                                if (enhanced !== e.target.value) {
                                  setLocation(enhanced);
                                }
                              }}
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <Label htmlFor="professionalSummary">Professional Summary</Label>
                            <Textarea 
                              id="professionalSummary" 
                              value={professionalSummary} 
                              onChange={(e) => setProfessionalSummary(e.target.value)}
                              style={{
                                minHeight: '60px',
                                height: 'auto',
                                resize: 'none',
                                overflow: 'hidden'
                              }}
                              onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = `${Math.max(60, target.scrollHeight)}px`;
                              }}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Work Experience Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-semibold">Work Experience</Label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setWorkExperience([...workExperience, { title: "", company: "", dates: "", responsibilities: [""] }])}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Position
                      </Button>
                    </div>
                    
                    {workExperience.map((exp, index) => (
                      <Card key={index} className="border-l-4 border-l-teal-500">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 space-y-3">
                              <div className={`space-y-3 ${exp.title.length > 25 ? '' : 'md:grid md:grid-cols-2 md:gap-3 md:space-y-0'}`}>
                                <div>
                                  <Label className="text-sm font-medium">Job Title</Label>
                                  <Input 
                                    value={exp.title}
                                    onChange={(e) => {
                                      const newExp = [...workExperience];
                                      newExp[index].title = e.target.value;
                                      setWorkExperience(newExp);
                                    }}
                                    placeholder="e.g., Senior UX Designer"
                                    className="w-full"
                                  />
                                </div>
                                <div>
                                  <Label className="text-sm font-medium">Company</Label>
                                  <Input 
                                    value={exp.company}
                                    onChange={(e) => {
                                      const newExp = [...workExperience];
                                      newExp[index].company = e.target.value;
                                      setWorkExperience(newExp);
                                    }}
                                    placeholder="e.g., APG, seconded at Kandoor"
                                    className="w-full"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Dates</Label>
                                <Input 
                                  value={exp.dates}
                                  onChange={(e) => {
                                    const newExp = [...workExperience];
                                    newExp[index].dates = e.target.value;
                                    setWorkExperience(newExp);
                                  }}
                                  placeholder="e.g., 04/2023 – present"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Key Responsibilities</Label>
                                {exp.responsibilities.map((resp, respIndex) => (
                                  <div key={respIndex} className="flex items-center space-x-2 mt-2">
                                    <Textarea 
                                      value={resp}
                                      onChange={(e) => {
                                        const newExp = [...workExperience];
                                        newExp[index].responsibilities[respIndex] = e.target.value;
                                        setWorkExperience(newExp);
                                      }}
                                      placeholder="• Key responsibility or achievement"
                                      rows={2}
                                      className="flex-1"
                                    />
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      onClick={() => {
                                        const newExp = [...workExperience];
                                        newExp[index].responsibilities.splice(respIndex, 1);
                                        setWorkExperience(newExp);
                                      }}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => {
                                    const newExp = [...workExperience];
                                    newExp[index].responsibilities.push("");
                                    setWorkExperience(newExp);
                                  }}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Responsibility
                                </Button>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                const newExp = workExperience.filter((_, i) => i !== index);
                                setWorkExperience(newExp);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {/* Skills Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-semibold">Skills</Label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSkills([...skills, ""])}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Skill
                      </Button>
                    </div>
                    
                    <Card className="border-l-4 border-l-orange-500">
                      <CardContent className="pt-4">
                        <div className="flex flex-wrap gap-2">
                          {skills.map((skill, index) => (
                            <div key={index} className="flex items-center gap-1 max-w-full">
                              <Input 
                                value={skill}
                                onChange={(e) => {
                                  const newSkills = [...skills];
                                  newSkills[index] = e.target.value;
                                  setSkills(newSkills);
                                }}
                                placeholder="Enter skill"
                                className="min-w-[120px] max-w-[400px]"
                                style={{ 
                                  width: `${Math.min(400, Math.max(120, getTextWidth(skill || 'Enter skill')))}px`
                                }}
                              />
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  const newSkills = skills.filter((_, i) => i !== index);
                                  setSkills(newSkills);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Education Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-semibold">Education</Label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setEducation([...education, { degree: "", institution: "", dates: "" }])}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Education
                      </Button>
                    </div>
                    
                    {education.map((edu, index) => (
                      <Card key={index} className="border-l-4 border-l-green-500">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-3">
                              <div>
                                <Label className="text-sm font-medium">Degree</Label>
                                <Input 
                                  value={edu.degree}
                                  onChange={(e) => {
                                    const newEdu = [...education];
                                    newEdu[index].degree = e.target.value;
                                    setEducation(newEdu);
                                  }}
                                  placeholder="e.g., Bachelor Communication and Multimedia Design"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Institution</Label>
                                <Input 
                                  value={edu.institution}
                                  onChange={(e) => {
                                    const newEdu = [...education];
                                    newEdu[index].institution = e.target.value;
                                    setEducation(newEdu);
                                  }}
                                  placeholder="e.g., Hogeschool van Amsterdam"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Dates</Label>
                                <Input 
                                  value={edu.dates}
                                  onChange={(e) => {
                                    const newEdu = [...education];
                                    newEdu[index].dates = e.target.value;
                                    setEducation(newEdu);
                                  }}
                                  placeholder="e.g., 2017 - 2021"
                                />
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                const newEdu = education.filter((_, i) => i !== index);
                                setEducation(newEdu);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {/* Courses & Certifications Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-semibold">Courses & Certifications</Label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setCourses([...courses, { courseName: "", institution: "", completionDate: "", certificateNumber: "", description: "" }])}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Course
                      </Button>
                    </div>
                    
                    {courses.map((course, index) => (
                      <Card key={index} className="border-l-4 border-l-purple-500">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-3">
                              <div>
                                <Label className="text-sm font-medium">Course Name</Label>
                                <Input 
                                  value={course.courseName}
                                  onChange={(e) => {
                                    const newCourses = [...courses];
                                    newCourses[index].courseName = e.target.value;
                                    setCourses(newCourses);
                                  }}
                                  placeholder="e.g., Project Management Professional (PMP)"
                                />
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Institution / Provider</Label>
                                <Input 
                                  value={course.institution}
                                  onChange={(e) => {
                                    const newCourses = [...courses];
                                    newCourses[index].institution = e.target.value;
                                    setCourses(newCourses);
                                  }}
                                  placeholder="e.g., Project Management Institute"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-sm font-medium">Completion Date</Label>
                                  <Input 
                                    value={course.completionDate}
                                    onChange={(e) => {
                                      const newCourses = [...courses];
                                      newCourses[index].completionDate = e.target.value;
                                      setCourses(newCourses);
                                    }}
                                    placeholder="e.g., March 2024"
                                  />
                                </div>
                                <div>
                                  <Label className="text-sm font-medium">Certificate Number (Optional)</Label>
                                  <Input 
                                    value={course.certificateNumber || ""}
                                    onChange={(e) => {
                                      const newCourses = [...courses];
                                      newCourses[index].certificateNumber = e.target.value;
                                      setCourses(newCourses);
                                    }}
                                    placeholder="e.g., PMP123456"
                                  />
                                </div>
                              </div>
                              <div>
                                <Label className="text-sm font-medium">Description (Optional)</Label>
                                <textarea 
                                  value={course.description || ""}
                                  onChange={(e) => {
                                    const newCourses = [...courses];
                                    newCourses[index].description = e.target.value;
                                    setCourses(newCourses);
                                  }}
                                  placeholder="e.g., Training involving methods to flash memory can be read by connecting directly with an eMMC or eMCP chip."
                                  className="w-full p-2 border border-gray-300 rounded-md text-sm"
                                  rows={3}
                                />
                              </div>
                            </div>
                            {courses.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newCourses = courses.filter((_, i) => i !== index);
                                  setCourses(newCourses);
                                }}
                                className="ml-2 text-red-600 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {/* Languages Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-semibold">Languages</Label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setLanguages([...languages, { language: "", proficiency: "" }])}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Language
                      </Button>
                    </div>
                    
                    {languages.map((lang, index) => (
                      <Card key={index} className="border-l-4 border-l-indigo-500">
                        <CardContent className="pt-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-sm font-medium">Language</Label>
                                  <Input 
                                    value={lang.language}
                                    onChange={(e) => {
                                      const newLanguages = [...languages];
                                      newLanguages[index].language = e.target.value;
                                      setLanguages(newLanguages);
                                    }}
                                    placeholder="e.g., Dutch, English, German"
                                  />
                                </div>
                                <div>
                                  <Label className="text-sm font-medium">Proficiency Level</Label>
                                  <Select 
                                    value={lang.proficiency}
                                    onValueChange={(value) => {
                                      const newLanguages = [...languages];
                                      newLanguages[index].proficiency = value;
                                      setLanguages(newLanguages);
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select proficiency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getProficiencyLevels().map((level) => (
                                        <SelectItem key={level} value={level}>
                                          {level}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                const newLanguages = languages.filter((_, i) => i !== index);
                                setLanguages(newLanguages);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {/* Pagination Navigation */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center space-x-4 mt-6 py-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-2" />
                        Previous
                      </Button>
                      
                      <div className="flex space-x-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="recruiter" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Recruiter Information</CardTitle>
                  <CardDescription>
                    Add your contact details to be included in the formatted CV
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="includeRecruiterInfo" className="font-medium">
                      Include recruiter information
                    </Label>
                    <Switch
                      id="includeRecruiterInfo"
                      checked={includeRecruiterInfo}
                      onCheckedChange={setIncludeRecruiterInfo}
                    />
                  </div>
                  
                  {includeRecruiterInfo && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="recruiterName">Your Name</Label>
                          <Input 
                            id="recruiterName" 
                            value={recruiterName} 
                            onChange={(e) => setRecruiterName(e.target.value)} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recruiterCompany">Company Name</Label>
                          <Input 
                            id="recruiterCompany" 
                            value={recruiterCompany} 
                            onChange={(e) => setRecruiterCompany(e.target.value)} 
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="recruiterEmail">Email</Label>
                          <Input 
                            id="recruiterEmail" 
                            type="email"
                            value={recruiterEmail} 
                            onChange={(e) => setRecruiterEmail(e.target.value)} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="recruiterPhone">Phone</Label>
                          <Input 
                            id="recruiterPhone" 
                            value={recruiterPhone} 
                            onChange={(e) => setRecruiterPhone(e.target.value)} 
                          />
                        </div>
                      </div>
                      

                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        
        {/* Right column - Format and preview */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CV Format Options</CardTitle>
              <CardDescription>
                Customize the appearance of the formatted CV
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="primaryColor" className="font-medium">Primary Color</Label>
                <div className="flex space-x-2">
                  <Input 
                    id="primaryColor"
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-12 h-10 p-1"
                  />
                  <Input
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="includeContactInfo" className="font-medium">
                  Add candidate's contact information
                </Label>
                <Switch
                  id="includeContactInfo"
                  checked={includeContactInfo}
                  onCheckedChange={setIncludeContactInfo}
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="noticePeriod" className="font-medium">Notice Period</Label>
                  <div className="flex gap-2 items-center">
                    <Input 
                      id="noticePeriod"
                      value={noticePeriod}
                      onChange={(e) => {
                        // Limit to 2 characters and only numbers
                        const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                        setNoticePeriod(value);
                      }}
                      placeholder="0"
                      className="w-16"
                      maxLength={2}
                    />
                    <Select 
                      value={noticePeriodUnit}
                      onValueChange={setNoticePeriodUnit}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(getNoticePeriodUnits()).map(([key, unit]) => (
                          <SelectItem key={key} value={unit.value}>{unit.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <Label htmlFor="noticePeriodNegotiable" className="font-medium">
                    Negotiable
                  </Label>
                  <Switch
                    id="noticePeriodNegotiable"
                    checked={noticePeriodNegotiable}
                    onCheckedChange={setNoticePeriodNegotiable}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    Preview how the formatted CV will look
                  </CardDescription>
                </div>
                <div>
                  <Tabs defaultValue="edit" value={previewMode} onValueChange={setPreviewMode}>
                    <TabsList>
                      <TabsTrigger value="edit" className="text-xs">
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </TabsTrigger>
                      <TabsTrigger value="layout" className="text-xs">
                        <Layout className="h-3 w-3 mr-1" />
                        Layout
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {previewMode === "edit" ? (
                renderTemplatePreview()
              ) : (
                <div className="p-4 border rounded flex items-center justify-center">
                  <div className="h-80 w-full max-w-sm bg-white shadow-md p-4 overflow-hidden">
                    <div className="w-full h-5 bg-gray-200 mb-3 rounded"></div>
                    <div className="h-12 flex space-x-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1">
                        <div className="w-2/3 h-4 bg-gray-200 mb-2 rounded"></div>
                        <div className="w-1/2 h-3 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                    
                    <div className="mt-3 space-y-1">
                      <div className="w-1/3 h-3 bg-gray-200 rounded"></div>
                      <div className="w-full h-2 bg-gray-200 rounded"></div>
                      <div className="w-full h-2 bg-gray-200 rounded"></div>
                      <div className="w-2/3 h-2 bg-gray-200 rounded"></div>
                    </div>
                    
                    <div className="mt-4 space-y-1">
                      <div className="w-1/3 h-3 bg-gray-200 rounded"></div>
                      <div className="w-full h-2 bg-gray-200 rounded"></div>
                      <div className="w-full h-2 bg-gray-200 rounded"></div>
                    </div>
                    
                    <div className="mt-4 space-y-1">
                      <div className="w-1/3 h-3 bg-gray-200 rounded"></div>
                      <div className="flex space-x-1">
                        <div className="w-1/5 h-6 bg-gray-200 rounded"></div>
                        <div className="w-1/5 h-6 bg-gray-200 rounded"></div>
                        <div className="w-1/5 h-6 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                    
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="w-full h-px bg-gray-200 mb-2"></div>
                      <div className="w-2/3 h-2 bg-gray-200 rounded mb-1"></div>
                      <div className="w-1/2 h-2 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between border-t p-4">
              <div className="text-sm text-muted-foreground">
                {firstName && lastName ? `${firstName} ${lastName}` : "No CV uploaded"}
              </div>
              <div className="flex gap-2">
                {candidateId && (
                  <Button 
                    onClick={handleSaveToCandidate} 
                    disabled={!firstName || !lastName}
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Save to Candidate
                  </Button>
                )}
                <Button onClick={handleGeneratePDF} disabled={!firstName || !lastName}>
                  <Download className="mr-2 h-4 w-4" />
                  Generate PDF
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, MoreHorizontal, Filter, MapPin, Building, DollarSign, Clock, ChevronUp, ChevronDown, User } from "lucide-react";
import { Vacancy, Client } from "@shared/schema";
import { AddVacancyModal } from "@/components/AddVacancyModal";
import { apiRequest } from "@/lib/queryClient";

export default function VacanciesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewVacancy, setViewVacancy] = useState<Vacancy | null>(null);
  const [editVacancy, setEditVacancy] = useState<Vacancy | null>(null);
  const [preSelectedClientId, setPreSelectedClientId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<keyof Vacancy | "owner" | "">("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check URL parameters for auto-opening add modal
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shouldAdd = urlParams.get('add') === 'true';
    const clientId = urlParams.get('client');
    
    if (shouldAdd) {
      setShowAddModal(true);
      if (clientId) {
        setPreSelectedClientId(parseInt(clientId));
      }
      // Clean up URL parameters
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);
  
  const { data: vacancies, isLoading: vacanciesLoading } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
  });
  
  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });
  
  const isLoading = vacanciesLoading || clientsLoading;
  
  const filteredVacancies = vacancies?.filter(
    (vacancy) =>
      vacancy.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vacancy.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vacancy.employmentType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vacancy.experienceLevel?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vacancy.skills?.some(skill => 
        skill.toLowerCase().includes(searchTerm.toLowerCase())
      )
  );
  
  const getClientName = (clientId: number) => {
    const client = clients?.find(c => c.id === clientId);
    return client ? client.name : "Unknown Client";
  };

  // Mutation for closing vacancy
  const closeVacancyMutation = useMutation({
    mutationFn: async (vacancyId: number) => {
      return apiRequest(`/api/vacancies/${vacancyId}`, {
        method: "PUT",
        body: JSON.stringify({ status: "closed" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      toast({
        title: "Success",
        description: "Vacancy closed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to close vacancy",
        variant: "destructive",
      });
    },
  });

  // Delete vacancy mutation
  const deleteVacancyMutation = useMutation({
    mutationFn: async (vacancyId: number) => {
      return apiRequest(`/api/vacancies/${vacancyId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
      toast({
        title: "Success",
        description: "Vacancy deleted successfully",
      });
      setViewVacancy(null); // Close the modal
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete vacancy",
        variant: "destructive",
      });
    },
  });

  // Action handlers
  const handleEdit = (vacancy: Vacancy) => {
    setEditVacancy(vacancy);
    setShowAddModal(true);
  };

  const handleFindCandidates = (vacancyId: number) => {
    setLocation(`/matcher?vacancy=${vacancyId}`);
  };

  const handleDeleteVacancy = (vacancyId: number) => {
    if (window.confirm("Are you sure you want to delete this vacancy? This action cannot be undone.")) {
      deleteVacancyMutation.mutate(vacancyId);
    }
  };

  // Update vacancy status mutation
  const updateVacancyStatusMutation = useMutation({
    mutationFn: async ({ vacancyId, status }: { vacancyId: number; status: string }) => {
      const response = await apiRequest(`/api/vacancies/${vacancyId}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Status updated",
        description: "Vacancy status has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vacancies"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (vacancyId: number, newStatus: string) => {
    console.log('Attempting to update vacancy status:', { vacancyId, newStatus });
    updateVacancyStatusMutation.mutate({ 
      vacancyId, 
      status: newStatus 
    });
  };

  // Sorting functionality
  const handleSort = (field: keyof Vacancy | "owner") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortVacancies = (vacancies: Vacancy[]) => {
    if (!sortField) return vacancies;
    
    return [...vacancies].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      // Handle owner field
      if (sortField === "owner") {
        aValue = ((a as any).ownerName || "Unassigned").toLowerCase();
        bValue = ((b as any).ownerName || "Unassigned").toLowerCase();
      } else {
        aValue = a[sortField];
        bValue = b[sortField];

        // Handle date fields
        if (sortField === "createdAt" || sortField === "updatedAt") {
          aValue = new Date(aValue as string).getTime();
          bValue = new Date(bValue as string).getTime();
        }

        // Handle string fields
        if (typeof aValue === "string" && typeof bValue === "string") {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };

  const getSortIcon = (field: keyof Vacancy | "owner") => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Reusable status dropdown component
  const StatusDropdown = ({ vacancy }: { vacancy: Vacancy }) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case "open": return "bg-green-500";
        case "filled": return "bg-blue-500"; 
        case "on hold": return "bg-orange-500";
        case "closed": return "bg-gray-500";
        default: return "bg-gray-500";
      }
    };

    return (
      <Select
        value={vacancy.status}
        onValueChange={(value) => handleStatusChange(vacancy.id, value)}
        disabled={updateVacancyStatusMutation.isPending}
      >
        <SelectTrigger className="w-32 h-8">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(vacancy.status)}`} />
            <span className="capitalize text-sm">{vacancy.status}</span>
          </div>
        </SelectTrigger>
        <SelectContent side="top" align="start">
          <SelectItem value="open">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Open
            </div>
          </SelectItem>
          <SelectItem value="filled">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              Filled
            </div>
          </SelectItem>
          <SelectItem value="on hold">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              On hold
            </div>
          </SelectItem>
          <SelectItem value="closed">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
              Closed
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const handleCloseVacancy = (vacancyId: number) => {
    closeVacancyMutation.mutate(vacancyId);
  };

  const handleRowClick = (vacancy: Vacancy) => {
    setViewVacancy(vacancy);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vacancies</h1>
          <p className="text-muted-foreground">
            Manage job openings and track application progress
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Vacancy
        </Button>
      </div>
      
      <Card>
        <CardHeader className="p-4">
          <div className="flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search vacancies..."
                className="w-full pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="open">
            <div className="px-4">
              <TabsList className="h-10">
                <TabsTrigger value="all" className="text-sm">All</TabsTrigger>
                <TabsTrigger value="open" className="text-sm">Open</TabsTrigger>
                <TabsTrigger value="filled" className="text-sm">Filled</TabsTrigger>
                <TabsTrigger value="on hold" className="text-sm">On hold</TabsTrigger>
                <TabsTrigger value="closed" className="text-sm">Closed</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="all" className="p-0">
              {isLoading ? (
                <div className="p-4">
                  {Array(5).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center space-x-4 py-3">
                      <Skeleton className="h-12 w-4 rounded" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("title")}
                        >
                          <div className="flex items-center gap-2">
                            Title
                            {getSortIcon("title")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("clientId")}
                        >
                          <div className="flex items-center gap-2">
                            Client
                            {getSortIcon("clientId")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("location")}
                        >
                          <div className="flex items-center gap-2">
                            Location
                            {getSortIcon("location")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("owner")}
                        >
                          <div className="flex items-center gap-2">
                            Owner
                            {getSortIcon("owner")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("experienceLevel")}
                        >
                          <div className="flex items-center gap-2">
                            Experience
                            {getSortIcon("experienceLevel")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("createdAt")}
                        >
                          <div className="flex items-center gap-2">
                            Created on
                            {getSortIcon("createdAt")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:text-blue-600" 
                          onClick={() => handleSort("status")}
                        >
                          <div className="flex items-center gap-2">
                            Status
                            {getSortIcon("status")}
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVacancies && filteredVacancies.length > 0 ? (
                        sortVacancies(filteredVacancies).map((vacancy) => (
                          <TableRow 
                            key={vacancy.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleRowClick(vacancy)}
                          >
                            <TableCell className="font-medium">{vacancy.title}</TableCell>
                            <TableCell>
                              {getClientName(vacancy.clientId)}
                            </TableCell>
                            <TableCell>
                              {vacancy.location || "Remote"}
                            </TableCell>
                            <TableCell>
                              {(vacancy as any).ownerName || "Unassigned"}
                            </TableCell>
                            <TableCell>{vacancy.experienceLevel || "Any"}</TableCell>
                            <TableCell>
                              <div className="text-sm text-muted-foreground">
                                {formatDate(vacancy.createdAt.toString())}
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <StatusDropdown vacancy={vacancy} />
                            </TableCell>

                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                            {searchTerm ? "No vacancies match your search criteria." : "No vacancies found."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="open" className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("title")}
                      >
                        <div className="flex items-center gap-2">
                          Title
                          {getSortIcon("title")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("clientId")}
                      >
                        <div className="flex items-center gap-2">
                          Client
                          {getSortIcon("clientId")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("location")}
                      >
                        <div className="flex items-center gap-2">
                          Location
                          {getSortIcon("location")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("owner")}
                      >
                        <div className="flex items-center gap-2">
                          Owner
                          {getSortIcon("owner")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("experienceLevel")}
                      >
                        <div className="flex items-center gap-2">
                          Experience
                          {getSortIcon("experienceLevel")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("createdAt")}
                      >
                        <div className="flex items-center gap-2">
                          Created on
                          {getSortIcon("createdAt")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center gap-2">
                          Status
                          {getSortIcon("status")}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!isLoading && sortVacancies(filteredVacancies?.filter(v => v.status === "open") || []).map((vacancy) => (
                      <TableRow 
                        key={vacancy.id}
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => handleRowClick(vacancy)}
                      >
                        <TableCell className="font-medium">{vacancy.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Building className="h-4 w-4 mr-1 text-muted-foreground" />
                            {getClientName(vacancy.clientId)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {vacancy.location ? (
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                              {vacancy.location}
                            </div>
                          ) : "Remote"}
                        </TableCell>
                        <TableCell>
                          {(vacancy as any).ownerName || "Unassigned"}
                        </TableCell>
                        <TableCell>{vacancy.experienceLevel || "Any"}</TableCell>
                        <TableCell>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Clock className="h-4 w-4 mr-1" />
                            {formatDate(vacancy.createdAt.toString())}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <StatusDropdown vacancy={vacancy} />
                        </TableCell>

                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="filled" className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("title")}
                      >
                        <div className="flex items-center gap-2">
                          Title
                          {getSortIcon("title")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("clientId")}
                      >
                        <div className="flex items-center gap-2">
                          Client
                          {getSortIcon("clientId")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("location")}
                      >
                        <div className="flex items-center gap-2">
                          Location
                          {getSortIcon("location")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("owner")}
                      >
                        <div className="flex items-center gap-2">
                          Owner
                          {getSortIcon("owner")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("experienceLevel")}
                      >
                        <div className="flex items-center gap-2">
                          Experience
                          {getSortIcon("experienceLevel")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("createdAt")}
                      >
                        <div className="flex items-center gap-2">
                          Created on
                          {getSortIcon("createdAt")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center gap-2">
                          Status
                          {getSortIcon("status")}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!isLoading && sortVacancies(filteredVacancies?.filter(v => v.status === "filled") || []).map((vacancy) => (
                      <TableRow 
                        key={vacancy.id}
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => handleRowClick(vacancy)}
                      >
                        <TableCell className="font-medium">{vacancy.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Building className="h-4 w-4 mr-1 text-muted-foreground" />
                            {getClientName(vacancy.clientId)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {vacancy.location ? (
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                              {vacancy.location}
                            </div>
                          ) : "Remote"}
                        </TableCell>
                        <TableCell>
                          {(vacancy as any).ownerName || "Unassigned"}
                        </TableCell>
                        <TableCell>{vacancy.experienceLevel || "Any"}</TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(vacancy.createdAt.toString())}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <StatusDropdown vacancy={vacancy} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="on hold" className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("title")}
                      >
                        <div className="flex items-center gap-2">
                          Title
                          {getSortIcon("title")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("clientId")}
                      >
                        <div className="flex items-center gap-2">
                          Client
                          {getSortIcon("clientId")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("location")}
                      >
                        <div className="flex items-center gap-2">
                          Location
                          {getSortIcon("location")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("owner")}
                      >
                        <div className="flex items-center gap-2">
                          Owner
                          {getSortIcon("owner")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("experienceLevel")}
                      >
                        <div className="flex items-center gap-2">
                          Experience
                          {getSortIcon("experienceLevel")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("createdAt")}
                      >
                        <div className="flex items-center gap-2">
                          Created on
                          {getSortIcon("createdAt")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center gap-2">
                          Status
                          {getSortIcon("status")}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!isLoading && sortVacancies(filteredVacancies?.filter(v => v.status === "on hold") || []).map((vacancy) => (
                      <TableRow 
                        key={vacancy.id}
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => handleRowClick(vacancy)}
                      >
                        <TableCell className="font-medium">{vacancy.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Building className="h-4 w-4 mr-1 text-muted-foreground" />
                            {getClientName(vacancy.clientId)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {vacancy.location ? (
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                              {vacancy.location}
                            </div>
                          ) : "Remote"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {vacancy.skills?.slice(0, 3).map((skill, i) => (
                              <Badge key={i} variant="secondary">{skill}</Badge>
                            ))}
                            {vacancy.skills && vacancy.skills.length > 3 && (
                              <Badge variant="outline">+{vacancy.skills.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{vacancy.experienceLevel || "Any"}</TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(vacancy.createdAt.toString())}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <StatusDropdown vacancy={vacancy} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            
            <TabsContent value="closed" className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("title")}
                      >
                        <div className="flex items-center gap-2">
                          Title
                          {getSortIcon("title")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("clientId")}
                      >
                        <div className="flex items-center gap-2">
                          Client
                          {getSortIcon("clientId")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("location")}
                      >
                        <div className="flex items-center gap-2">
                          Location
                          {getSortIcon("location")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("owner")}
                      >
                        <div className="flex items-center gap-2">
                          Owner
                          {getSortIcon("owner")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("experienceLevel")}
                      >
                        <div className="flex items-center gap-2">
                          Experience
                          {getSortIcon("experienceLevel")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("createdAt")}
                      >
                        <div className="flex items-center gap-2">
                          Created on
                          {getSortIcon("createdAt")}
                        </div>
                      </TableHead>
                      <TableHead 
                        className="cursor-pointer hover:text-blue-600" 
                        onClick={() => handleSort("status")}
                      >
                        <div className="flex items-center gap-2">
                          Status
                          {getSortIcon("status")}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!isLoading && sortVacancies(filteredVacancies?.filter(v => v.status === "closed") || []).map((vacancy) => (
                      <TableRow 
                        key={vacancy.id}
                        className="cursor-pointer hover:text-blue-600"
                        onClick={() => handleRowClick(vacancy)}
                      >
                        <TableCell className="font-medium">{vacancy.title}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Building className="h-4 w-4 mr-1 text-muted-foreground" />
                            {getClientName(vacancy.clientId)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {vacancy.location ? (
                            <div className="flex items-center">
                              <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                              {vacancy.location}
                            </div>
                          ) : "Remote"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {vacancy.skills?.slice(0, 3).map((skill, i) => (
                              <Badge key={i} variant="secondary">{skill}</Badge>
                            ))}
                            {vacancy.skills && vacancy.skills.length > 3 && (
                              <Badge variant="outline">+{vacancy.skills.length - 3}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{vacancy.experienceLevel || "Any"}</TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(vacancy.createdAt.toString())}
                          </div>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <StatusDropdown vacancy={vacancy} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AddVacancyModal
        open={showAddModal}
        onOpenChange={(open) => {
          setShowAddModal(open);
          if (!open) {
            setEditVacancy(null);
            setPreSelectedClientId(null);
          }
        }}
        editVacancy={editVacancy}
        preSelectedClientId={preSelectedClientId}
      />
      
      <AddVacancyModal
        open={!!viewVacancy}
        onOpenChange={(open) => {
          if (!open) {
            setViewVacancy(null);
          }
        }}
        viewVacancy={viewVacancy}
        onEdit={(vacancy) => {
          setViewVacancy(null);
          setEditVacancy(vacancy);
          setShowAddModal(true);
        }}
        onFindCandidates={(vacancyId) => {
          setViewVacancy(null);
          handleFindCandidates(vacancyId);
        }}
        onDelete={handleDeleteVacancy}
      />
    </div>
  );
}

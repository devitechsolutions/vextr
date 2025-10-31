import { useState, useMemo } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, MoreHorizontal, Filter, Phone, Mail, ChevronUp, ChevronDown } from "lucide-react";
import { Client } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import AddClientModal from "./components/AddClientModal";
import EditClientModal from "./components/EditClientModal";

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Sorting state
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  
  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: vacancies } = useQuery<any[]>({
    queryKey: ["/api/vacancies"],
  });

  // Precompute vacancy counts to avoid O(m) filtering operations during sorting
  const vacancyCountMap = useMemo(() => {
    if (!vacancies) return new Map<number, number>();
    
    const countMap = new Map<number, number>();
    
    // Single pass through vacancies to count per client
    vacancies.forEach(vacancy => {
      if (vacancy.clientId) {
        const currentCount = countMap.get(vacancy.clientId) || 0;
        countMap.set(vacancy.clientId, currentCount + 1);
      }
    });
    
    return countMap;
  }, [vacancies]);

  // Mutation for deleting client
  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: number) => {
      return apiRequest(`/api/clients/${clientId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete client",
        variant: "destructive",
      });
    },
  });

  // Action handlers
  const handleEdit = (client: Client) => {
    setEditClient(client);
    setIsEditModalOpen(true);
  };

  const handleAddVacancy = (client: Client) => {
    // Navigate to vacancies page and open add modal with client pre-selected
    setLocation(`/vacancies?client=${client.id}&add=true`);
  };

  const handleDelete = (client: Client) => {
    const vacancyCount = vacancyCountMap.get(client.id) || 0;
    
    if (vacancyCount > 0) {
      toast({
        title: "Cannot delete client",
        description: `This client has ${vacancyCount} active ${vacancyCount === 1 ? 'vacancy' : 'vacancies'}. Please remove all vacancies first.`,
        variant: "destructive",
      });
      return;
    }
    
    deleteClientMutation.mutate(client.id);
  };

  const handleRowClick = (client: Client) => {
    handleEdit(client);
  };

  // Sorting helper functions
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortClients = (clients: Client[]) => {
    if (!sortField) return clients;

    return [...clients].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case "company":
          aValue = (a.name || "").toLowerCase();
          bValue = (b.name || "").toLowerCase();
          break;
        case "location":
          aValue = (a.location || "").toLowerCase();
          bValue = (b.location || "").toLowerCase();
          break;
        case "contact":
          aValue = (a.contactName || "").toLowerCase();
          bValue = (b.contactName || "").toLowerCase();
          break;
        case "vacancies":
          aValue = vacancyCountMap.get(a.id) || 0;
          bValue = vacancyCountMap.get(b.id) || 0;
          break;
        default:
          return 0;
      }

      // Handle numeric sorting
      if (sortField === "vacancies") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      // Handle string sorting (case-insensitive)
      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  };
  
  const filteredAndSortedClients = (() => {
    const filtered = clients?.filter(
      (client) =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.contactEmail?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return sortField ? sortClients(filtered) : filtered;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">
            Manage your data center clients and their hiring needs
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>
      
      <Card>
        <CardHeader className="p-4">
          <div className="flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search clients..."
                className="w-full pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <Filter className="mr-2 h-4 w-4" /> Filter
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">Columns</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>Name</DropdownMenuItem>
                  <DropdownMenuItem>Location</DropdownMenuItem>
                  <DropdownMenuItem>Contact</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              {Array(5).fill(0).map((_, i) => (
                <div key={i} className="flex items-center space-x-4 py-3">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2">
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
                      onClick={() => handleSort("company")}
                      data-testid="header-company"
                    >
                      <div className="flex items-center gap-1">
                        Company
                        {sortField === "company" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("location")}
                      data-testid="header-location"
                    >
                      <div className="flex items-center gap-1">
                        Location
                        {sortField === "location" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("contact")}
                      data-testid="header-contact"
                    >
                      <div className="flex items-center gap-1">
                        Contact Person
                        {sortField === "contact" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-blue-600"
                      onClick={() => handleSort("vacancies")}
                      data-testid="header-vacancies"
                    >
                      <div className="flex items-center gap-1">
                        Vacancies
                        {sortField === "vacancies" && (
                          sortDirection === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedClients && filteredAndSortedClients.length > 0 ? (
                    filteredAndSortedClients.map((client) => (
                      <TableRow 
                        key={client.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleRowClick(client)}
                      >
                        <TableCell className="font-medium">
                          {client.name}
                        </TableCell>
                        <TableCell>
                          {client.location || "—"}
                        </TableCell>
                        <TableCell>
                          {client.contactName ? (
                            <div>
                              <div>{client.contactName}</div>
                              <div className="flex items-center text-xs text-muted-foreground">
                                {client.contactEmail && (
                                  <Mail className="h-3 w-3 mr-1" />
                                )}
                                {client.contactEmail}
                              </div>
                              <div className="flex items-center text-xs text-muted-foreground">
                                {client.contactPhone && (
                                  <Phone className="h-3 w-3 mr-1" />
                                )}
                                {client.contactPhone}
                              </div>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {vacancyCountMap.get(client.id) || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(client);
                              }}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleAddVacancy(client);
                              }}>
                                Add Vacancy
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(client);
                              }}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        {searchTerm ? "No clients match your search criteria." : "No clients found."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <AddClientModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      
      <EditClientModal
        client={editClient}
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditClient(null);
        }}
      />
    </div>
  );
}
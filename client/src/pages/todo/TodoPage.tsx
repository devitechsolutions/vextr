import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { insertTodoSchema } from "@shared/schema";
import { 
  CheckCircle, 
  Plus, 
  MoreHorizontal, 
  Calendar, 
  Clock, 
  Tag, 
  Flag, 
  Filter, 
  Search, 
  CalendarIcon,
  Trash2,
  Check,
  ChevronsUpDown,
  Edit,
  Trash
} from "lucide-react";
import { Todo, Candidate, Client, Vacancy } from "@shared/schema";
import { useAuth } from "@/context/AuthContext";

const todoFormSchema = insertTodoSchema.extend({
  dueDate: z.date().optional(),
});

type TodoFormValues = z.infer<typeof todoFormSchema>;

export default function TodoPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [openCandidateCombo, setOpenCandidateCombo] = useState(false);
  const [candidateSearchTerm, setCandidateSearchTerm] = useState("");
  
  // Fetch data
  const { data: todos, isLoading: todosLoading } = useQuery<Todo[]>({
    queryKey: ["/api/todos"],
  });
  
  const { data: candidates } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });
  
  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });
  
  const { data: vacancies } = useQuery<Vacancy[]>({
    queryKey: ["/api/vacancies"],
  });
  
  // Create todo mutation
  const createTodoMutation = useMutation({
    mutationFn: async (data: TodoFormValues) => {
      const res = await apiRequest("/api/todos", {
        method: "POST",
        body: JSON.stringify(data)
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/todos"] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Task created",
        description: "Your task has been created successfully.",
      });
      form.reset({
        userId: user?.id || 1,
        title: "",
        description: "",
        priority: "medium",
        status: "pending",
        relatedType: undefined,
        relatedId: undefined,
      });
    },
    onError: () => {
      toast({
        title: "Failed to create task",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Update todo mutation
  const updateTodoMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TodoFormValues> }) => {
      const res = await apiRequest(`/api/todos/${id}`, {
        method: "PUT",
        body: JSON.stringify(data)
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/todos"] });
      if (editingTodo) {
        setIsEditDialogOpen(false);
        setEditingTodo(null);
        toast({
          title: "Task updated",
          description: "Your task has been updated successfully.",
        });
        form.reset({
          userId: user?.id || 1,
          title: "",
          description: "",
          priority: "medium",
          status: "pending",
          relatedType: undefined,
          relatedId: undefined,
        });
      }
    },
    onError: (error: any) => {
      console.error("Update error:", error);
      toast({
        title: "Failed to update task",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Delete todo mutation
  const deleteTodoMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/todos/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        }
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status}: ${text || response.statusText}`);
      }
      
      // Don't try to parse JSON for 204 responses
      return response.status === 204 ? null : await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/todos"] });
      toast({
        title: "Task deleted",
        description: "Your task has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Delete error:", error);
      toast({
        title: "Failed to delete task",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Form
  const form = useForm<TodoFormValues>({
    resolver: zodResolver(todoFormSchema),
    defaultValues: {
      userId: user?.id || 1, // Use current authenticated user's ID
      title: "",
      description: "",
      priority: "medium",
      status: "pending",
      relatedType: undefined,
      relatedId: undefined,
    },
  });
  
  const onSubmit = (data: TodoFormValues) => {
    if (editingTodo) {
      // Update existing todo
      updateTodoMutation.mutate({
        id: editingTodo.id,
        data: {
          ...data,
          userId: editingTodo.userId // Keep original userId
        }
      });
    } else {
      // Create new todo
      createTodoMutation.mutate(data);
    }
  };
  
  const handleToggleStatus = (todo: Todo) => {
    const newStatus = todo.status === "completed" ? "pending" : "completed";
    updateTodoMutation.mutate({ id: todo.id, data: { status: newStatus } });
  };

  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setIsEditDialogOpen(true);
    // Reset form with existing todo data
    form.reset({
      userId: todo.userId,
      title: todo.title,
      description: todo.description || "",
      priority: todo.priority,
      status: todo.status,
      dueDate: todo.dueDate ? new Date(todo.dueDate) : undefined,
      relatedType: todo.relatedType || undefined,
      relatedId: todo.relatedId || undefined,
    });
  };

  const handleDeleteTodo = (todo: Todo) => {
    if (confirm(`Are you sure you want to delete the task "${todo.title}"?`)) {
      deleteTodoMutation.mutate(todo.id);
    }
  };
  
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "No due date";
    
    const dateObj = new Date(date);
    
    if (isToday(dateObj)) {
      return `Today, ${format(dateObj, "h:mm a")}`;
    } else if (isTomorrow(dateObj)) {
      return `Tomorrow, ${format(dateObj, "h:mm a")}`;
    } else if (isYesterday(dateObj)) {
      return `Yesterday, ${format(dateObj, "h:mm a")}`;
    } else {
      return format(dateObj, "MMM d, h:mm a");
    }
  };
  
  const getRelatedEntity = (type: string | undefined, id: number | undefined) => {
    if (!type || !id) return null;
    
    switch (type) {
      case "candidate":
        return candidates?.find(c => c.id === id);
      case "client":
        return clients?.find(c => c.id === id);
      case "vacancy":
        return vacancies?.find(v => v.id === id);
      default:
        return null;
    }
  };
  
  const getRelatedEntityName = (todo: Todo) => {
    const entity = getRelatedEntity(todo.relatedType || undefined, todo.relatedId || undefined);
    
    if (!entity) return null;
    
    switch (todo.relatedType) {
      case "candidate":
        return `${(entity as Candidate).firstName} ${(entity as Candidate).lastName}`;
      case "client":
        return (entity as Client).name;
      case "vacancy":
        return (entity as Vacancy).title;
      default:
        return null;
    }
  };
  
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-500 dark:text-red-400";
      case "medium":
        return "text-amber-500 dark:text-amber-400";
      case "low":
        return "text-green-500 dark:text-green-400";
      default:
        return "text-gray-500";
    }
  };
  
  const filteredTodos = todos?.filter(todo => {
    // Filter by tab
    if (selectedTab !== "all" && todo.status !== selectedTab) return false;
    
    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        todo.title.toLowerCase().includes(searchLower) ||
        (todo.description && todo.description.toLowerCase().includes(searchLower))
      );
    }
    
    return true;
  });
  
  // Sort todos: pending (by due date) first, then completed
  const sortedTodos = filteredTodos?.sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    
    if (a.status !== "completed" && b.status !== "completed") {
      // Sort by priority first
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      // @ts-ignore
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // Then by due date
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
    }
    
    // Sort completed tasks by completion time (most recent first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">To-Do List</h1>
          <p className="text-muted-foreground">
            Manage your tasks and stay organized
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Task
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left sidebar - filters and tags */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Button 
                variant={selectedTab === "all" ? "default" : "ghost"} 
                className="w-full justify-start" 
                onClick={() => setSelectedTab("all")}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                All Tasks
                <Badge className="ml-auto" variant="secondary">
                  {todos?.length || 0}
                </Badge>
              </Button>
              <Button 
                variant={selectedTab === "pending" ? "default" : "ghost"} 
                className="w-full justify-start" 
                onClick={() => setSelectedTab("pending")}
              >
                <Clock className="mr-2 h-4 w-4" />
                Pending
                <Badge className="ml-auto" variant="secondary">
                  {todos?.filter(t => t.status === "pending").length || 0}
                </Badge>
              </Button>
              <Button 
                variant={selectedTab === "completed" ? "default" : "ghost"} 
                className="w-full justify-start" 
                onClick={() => setSelectedTab("completed")}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Completed
                <Badge className="ml-auto" variant="secondary">
                  {todos?.filter(t => t.status === "completed").length || 0}
                </Badge>
              </Button>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="mb-2 text-sm font-medium">Priority</h3>
              <div className="space-y-1">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                >
                  <Flag className="mr-2 h-4 w-4 text-red-500" />
                  High Priority
                  <Badge className="ml-auto" variant="outline">
                    {todos?.filter(t => t.priority === "high").length || 0}
                  </Badge>
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                >
                  <Flag className="mr-2 h-4 w-4 text-amber-500" />
                  Medium Priority
                  <Badge className="ml-auto" variant="outline">
                    {todos?.filter(t => t.priority === "medium").length || 0}
                  </Badge>
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start"
                >
                  <Flag className="mr-2 h-4 w-4 text-green-500" />
                  Low Priority
                  <Badge className="ml-auto" variant="outline">
                    {todos?.filter(t => t.priority === "low").length || 0}
                  </Badge>
                </Button>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="mb-2 text-sm font-medium">Related To</h3>
              <div className="space-y-1">
                <Button variant="ghost" className="w-full justify-start">
                  Candidates
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  Clients
                </Button>
                <Button variant="ghost" className="w-full justify-start">
                  Vacancies
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Main content - task list */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0">
              <CardTitle>Tasks</CardTitle>
              <div className="flex space-x-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search tasks..."
                    className="w-full pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {todosLoading ? (
              <div className="space-y-4">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="flex items-start space-x-2">
                    <Skeleton className="h-4 w-4 mt-1" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedTodos && sortedTodos.length > 0 ? (
              <div className="space-y-4">
                {sortedTodos.map((todo) => (
                  <div key={todo.id} className="flex items-start space-x-3">
                    <Checkbox 
                      className="mt-1"
                      checked={todo.status === "completed"}
                      onCheckedChange={() => handleToggleStatus(todo)}
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <h3 
                          className={`font-medium ${
                            todo.status === "completed" 
                              ? "line-through text-muted-foreground" 
                              : ""
                          }`}
                        >
                          {todo.title}
                        </h3>
                        <div className="flex items-center gap-2">
                          <Flag 
                            className={`h-4 w-4 ${getPriorityColor(todo.priority)}`} 
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditTodo(todo)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteTodo(todo)}
                                className="text-destructive"
                              >
                                <Trash className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      
                      {todo.description && (
                        <p className={`text-sm ${
                          todo.status === "completed" 
                            ? "text-muted-foreground line-through" 
                            : "text-muted-foreground"
                        }`}>
                          {todo.description}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-2 mt-2">
                        {todo.dueDate && (
                          <div className={`flex items-center text-xs ${
                            todo.status === "completed" 
                              ? "text-muted-foreground" 
                              : "text-muted-foreground"
                          }`}>
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(todo.dueDate)}
                          </div>
                        )}
                        
                        {todo.relatedType && todo.relatedId && (
                          <Badge variant="outline" className="text-xs">
                            {todo.relatedType}: {getRelatedEntityName(todo)}
                          </Badge>
                        )}
                        
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            todo.priority === "high" 
                              ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" 
                              : todo.priority === "medium"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
                                : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                          }`}
                        >
                          {todo.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="text-lg font-medium mb-1">No tasks found</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchTerm 
                    ? "No tasks match your search criteria" 
                    : selectedTab === "completed"
                      ? "You haven't completed any tasks yet"
                      : "Your task list is empty"}
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Add Task
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Create Task Dialog */}
      <Dialog 
        open={isCreateDialogOpen} 
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) {
            form.reset({
              userId: user?.id || 1,
              title: "",
              description: "",
              priority: "medium",
              status: "pending",
              relatedType: undefined,
              relatedId: undefined,
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Add New Task</DialogTitle>
            <DialogDescription>
              Create a new task with details and due date.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter task title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Add more details about this task" 
                        className="resize-none" 
                        {...field}
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""}
                          onChange={(e) => {
                            field.onChange(e.target.value ? new Date(e.target.value) : undefined);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="relatedType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related To</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select relation type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="candidate">Candidate</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="vacancy">Vacancy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="relatedId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Entity</FormLabel>
                      {form.watch("relatedType") === "candidate" ? (
                        <Popover open={openCandidateCombo} onOpenChange={setOpenCandidateCombo}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCandidateCombo}
                                className="w-full justify-between"
                                disabled={!form.watch("relatedType")}
                              >
                                {field.value
                                  ? candidates?.find((candidate) => candidate.id === field.value)
                                    ? `${candidates.find((candidate) => candidate.id === field.value)?.firstName} ${candidates.find((candidate) => candidate.id === field.value)?.lastName}`
                                    : "Select candidate..."
                                  : "Select candidate..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput 
                                placeholder="Search candidates..." 
                                value={candidateSearchTerm}
                                onValueChange={setCandidateSearchTerm}
                              />
                              <CommandList>
                                <CommandEmpty>No candidate found.</CommandEmpty>
                                <CommandGroup>
                                  {candidates
                                    ?.filter((candidate) =>
                                      `${candidate.firstName} ${candidate.lastName}`
                                        .toLowerCase()
                                        .includes(candidateSearchTerm.toLowerCase())
                                    )
                                    .slice(0, 50) // Limit to 50 results for performance
                                    .map((candidate) => (
                                      <CommandItem
                                        key={candidate.id}
                                        value={`${candidate.firstName} ${candidate.lastName}`}
                                        onSelect={() => {
                                          field.onChange(candidate.id);
                                          setOpenCandidateCombo(false);
                                          setCandidateSearchTerm("");
                                        }}
                                      >
                                        <Check
                                          className={`mr-2 h-4 w-4 ${
                                            field.value === candidate.id ? "opacity-100" : "opacity-0"
                                          }`}
                                        />
                                        {candidate.firstName} {candidate.lastName}
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <Select 
                          onValueChange={(value) => field.onChange(parseInt(value))} 
                          defaultValue={field.value?.toString()}
                          disabled={!form.watch("relatedType")}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select entity" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {form.watch("relatedType") === "client" && clients?.map((client) => (
                              <SelectItem key={client.id} value={client.id.toString()}>
                                {client.name}
                              </SelectItem>
                            ))}
                            {form.watch("relatedType") === "vacancy" && vacancies?.map((vacancy) => (
                              <SelectItem key={vacancy.id} value={vacancy.id.toString()}>
                                {vacancy.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={createTodoMutation.isPending}
                >
                  {createTodoMutation.isPending ? "Creating..." : "Create Task"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog 
        open={isEditDialogOpen} 
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingTodo(null);
            form.reset({
              userId: user?.id || 1,
              title: "",
              description: "",
              priority: "medium",
              status: "pending",
              relatedType: undefined,
              relatedId: undefined,
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details and due date.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter task title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Add more details about this task" 
                        className="resize-none" 
                        {...field}
                        value={field.value || ""} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value ? new Date(field.value).toISOString().slice(0, 10) : ""}
                          onChange={(e) => {
                            field.onChange(e.target.value ? new Date(e.target.value) : undefined);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="relatedType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related To</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          form.setValue("relatedId", undefined);
                        }}
                        defaultValue={field.value}
                        value={field.value || ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select relation type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="candidate">Candidate</SelectItem>
                          <SelectItem value="client">Client</SelectItem>
                          <SelectItem value="vacancy">Vacancy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="relatedId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Related Entity</FormLabel>
                      {form.watch("relatedType") === "candidate" ? (
                        <Popover open={openCandidateCombo} onOpenChange={setOpenCandidateCombo}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openCandidateCombo}
                                className="w-full justify-between"
                                disabled={!form.watch("relatedType")}
                              >
                                {field.value
                                  ? candidates?.find((candidate) => candidate.id === field.value)
                                    ? `${candidates.find((candidate) => candidate.id === field.value)?.firstName} ${candidates.find((candidate) => candidate.id === field.value)?.lastName}`
                                    : "Select candidate..."
                                  : "Select candidate..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-full p-0">
                            <Command>
                              <CommandInput 
                                placeholder="Search candidates..." 
                                value={candidateSearchTerm}
                                onValueChange={setCandidateSearchTerm}
                              />
                              <CommandList>
                                <CommandEmpty>No candidate found.</CommandEmpty>
                                <CommandGroup>
                                  {candidates
                                    ?.filter((candidate) =>
                                      `${candidate.firstName} ${candidate.lastName}`
                                        .toLowerCase()
                                        .includes(candidateSearchTerm.toLowerCase())
                                    )
                                    .slice(0, 50)
                                    .map((candidate) => (
                                      <CommandItem
                                        key={candidate.id}
                                        value={`${candidate.firstName} ${candidate.lastName}`}
                                        onSelect={() => {
                                          field.onChange(candidate.id);
                                          setOpenCandidateCombo(false);
                                          setCandidateSearchTerm("");
                                        }}
                                      >
                                        <Check
                                          className={`mr-2 h-4 w-4 ${
                                            field.value === candidate.id ? "opacity-100" : "opacity-0"
                                          }`}
                                        />
                                        {candidate.firstName} {candidate.lastName}
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
                            placeholder="Select relation type first"
                            disabled={true}
                          />
                        </FormControl>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTodoMutation.isPending}>
                  {updateTodoMutation.isPending ? "Updating..." : "Update Task"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

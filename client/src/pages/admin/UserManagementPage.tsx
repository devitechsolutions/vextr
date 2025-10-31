import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { UserPlus, Trash2, Shield, User, Mail, Edit, Key } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const inviteUserSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  fullName: z.string().min(1, "Full name is required"),
  role: z.enum(["admin", "recruiter"], { required_error: "Please select a role" }),
});

type InviteUserForm = z.infer<typeof inviteUserSchema>;

const editUserSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  role: z.enum(["admin", "recruiter"], { required_error: "Please select a role" }),
  isActive: z.boolean(),
  newPassword: z.string().optional()
    .refine((password) => {
      if (!password || password.length === 0) return true; // Optional, so empty is ok
      return password.length >= 8 && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password);
    }, "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number"),
});

type EditUserForm = z.infer<typeof editUserSchema>;

interface User {
  id: number;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  inviteTokenExpiry: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function UserManagementPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const isAdmin = currentUser?.role === "admin";

  const form = useForm<InviteUserForm>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      fullName: "",
      role: "recruiter",
    },
  });

  const editForm = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      role: "recruiter",
      isActive: false,
      newPassword: "",
    },
  });

  // Fetch users - admins get all users, regular users get only themselves
  const { data: usersData, isLoading } = useQuery({
    queryKey: isAdmin ? ["/api/auth/users"] : ["/api/auth/me"],
    queryFn: async () => {
      const endpoint = isAdmin ? "/api/auth/users" : "/api/auth/me";
      const response = await apiRequest(endpoint);
      if (!response.success) {
        throw new Error(response.message || "Failed to fetch user data");
      }
      
      // For regular users, wrap the single user in an array for consistent handling
      if (!isAdmin && response.user) {
        return { success: true, users: [response.user] };
      }
      
      return response;
    },
  });

  // Create user invite mutation
  const inviteUserMutation = useMutation({
    mutationFn: async (data: InviteUserForm) => {
      const response = await apiRequest("/api/auth/invite-user", {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!response.success) {
        throw new Error(response.message || "Failed to send invite");
      }
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Invite sent!",
        description: "User invitation has been sent successfully.",
      });
      form.reset();
      setIsInviteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: isAdmin ? ["/api/auth/users"] : ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send invite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: EditUserForm }) => {
      const response = await apiRequest(`/api/auth/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!response.success) {
        throw new Error(response.message || "Failed to update user");
      }
      return response;
    },
    onSuccess: () => {
      toast({
        title: "User updated",
        description: "User has been updated successfully.",
      });
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: isAdmin ? ["/api/auth/users"] : ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest(`/api/auth/users/${userId}`, {
        method: "DELETE",
      });
      if (!response.success) {
        throw new Error(response.message || "Failed to delete user");
      }
      return { ...response, userId };
    },
    onSuccess: (data) => {
      const isOwnAccount = data.userId === currentUser?.id;
      
      if (isOwnAccount) {
        toast({
          title: "Account deleted",
          description: "Your account has been deleted. You will be logged out.",
        });
        // Log out the user since they deleted their own account
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      } else {
        toast({
          title: "User deleted",
          description: "User has been deleted successfully.",
        });
        queryClient.invalidateQueries({ queryKey: isAdmin ? ["/api/auth/users"] : ["/api/auth/me"] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InviteUserForm) => {
    inviteUserMutation.mutate(data);
  };

  const onEditSubmit = (data: EditUserForm) => {
    if (editingUser) {
      editUserMutation.mutate({ userId: editingUser.id, data });
    }
  };

  const handleDeleteUser = (userId: number, userEmail: string) => {
    const isOwnAccount = userId === currentUser?.id;
    const confirmMessage = isOwnAccount 
      ? `Are you sure you want to delete your own admin account? This action cannot be undone and you will be logged out immediately.`
      : `Are you sure you want to delete user: ${userEmail}?`;
    
    if (window.confirm(confirmMessage)) {
      deleteUserMutation.mutate(userId);
    }
  };

  // Update edit form when editingUser changes
  const handleEditUser = (user: User) => {
    setEditingUser(user);
    editForm.reset({
      fullName: user.fullName || "",
      email: user.email,
      phone: user.phone || "",
      role: user.role as "admin" | "recruiter",
      isActive: user.isActive,
      newPassword: "",
    });
  };

  // Filter users based on permissions
  const allUsers = usersData?.users || [];
  const users = isAdmin ? allUsers : allUsers.filter((user: User) => user.id === currentUser?.id);

  const getRoleIcon = (role: string) => {
    return role === "admin" ? <Shield className="h-4 w-4" /> : <User className="h-4 w-4" />;
  };

  const getStatusBadge = (user: User) => {
    if (!user.isActive && user.inviteTokenExpiry) {
      const isExpired = new Date(user.inviteTokenExpiry) < new Date();
      return (
        <Badge variant={isExpired ? "destructive" : "secondary"}>
          {isExpired ? "Invite Expired" : "Invite Pending"}
        </Badge>
      );
    }
    return <Badge variant="default">Active</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isAdmin ? "User Management" : "My Account"}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Manage user accounts and send invitations" : "Manage your account information and password"}
          </p>
        </div>
        
        {isAdmin && (
          <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite User
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Send an invitation to a new user. They will receive an email with instructions to set up their account.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@example.com"
                  {...form.register("email")}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  {...form.register("fullName")}
                />
                {form.formState.errors.fullName && (
                  <p className="text-sm text-red-600">{form.formState.errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select 
                  value={form.watch("role")} 
                  onValueChange={(value) => form.setValue("role", value as "admin" | "recruiter")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.role && (
                  <p className="text-sm text-red-600">{form.formState.errors.role.message}</p>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteUserMutation.isPending}>
                  {inviteUserMutation.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "Users" : "Account Information"}</CardTitle>
          <CardDescription>
            {isAdmin ? "View and manage all user accounts" : "View and edit your account details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-muted-foreground">Loading users...</div>
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-muted-foreground">No users found</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user: User) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{user.fullName || "No name"}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.phone || <span className="text-muted-foreground">No phone</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {getRoleIcon(user.role)}
                        <span className="capitalize">{user.role}</span>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(user)}</TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            disabled={deleteUserMutation.isPending}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and permissions.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Full Name</Label>
              <Input
                id="edit-fullName"
                {...editForm.register("fullName")}
                placeholder="Enter full name"
              />
              {editForm.formState.errors.fullName && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {editForm.formState.errors.fullName.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                {...editForm.register("email")}
                placeholder="Enter email address"
              />
              {editForm.formState.errors.email && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {editForm.formState.errors.email.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                {...editForm.register("phone")}
                placeholder="Enter phone number"
              />
              {editForm.formState.errors.phone && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {editForm.formState.errors.phone.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>

{isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Select 
                  value={editForm.watch("role")} 
                  onValueChange={(value) => editForm.setValue("role", value as "admin" | "recruiter")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {editForm.formState.errors.role && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {editForm.formState.errors.role.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-newPassword">
                <div className="flex items-center space-x-2">
                  <Key className="h-4 w-4" />
                  <span>New Password (leave empty to keep current password)</span>
                </div>
              </Label>
              <Input
                id="edit-newPassword"
                type="password"
                {...editForm.register("newPassword")}
                placeholder="Enter new password"
              />
              <div className="text-sm text-gray-600 space-y-1">
                <div className="font-medium">Password requirements:</div>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>At least 8 characters long</li>
                  <li>At least one uppercase letter (A-Z)</li>
                  <li>At least one lowercase letter (a-z)</li>
                  <li>At least one number (0-9)</li>
                </ul>
              </div>
              {editForm.formState.errors.newPassword && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {editForm.formState.errors.newPassword.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>

{isAdmin && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-isActive"
                  {...editForm.register("isActive")}
                  className="h-4 w-4"
                />
                <Label htmlFor="edit-isActive">Active Account</Label>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editUserMutation.isPending}
              >
                {editUserMutation.isPending ? "Updating..." : "Update User"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
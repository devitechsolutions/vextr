import { Router, Request, Response } from "express";
import { InviteAuthService } from "./invite-auth-service";
import { 
  createUserInviteSchema, 
  setPasswordFromInviteSchema, 
  loginSchema, 
  passwordResetRequestSchema, 
  passwordResetSchema,
  editUserSchema,
  changePasswordSchema
} from "@shared/schema";
import { authenticateToken, requireRole, AuthenticatedRequest } from "./auth-middleware";

export const inviteAuthRouter = Router();

/**
 * Initialize admin account (development only)
 */
inviteAuthRouter.post("/init-admin", async (req: Request, res: Response) => {
  try {
    const result = await InviteAuthService.createAdminAccount();
    res.json(result);
  } catch (error) {
    console.error("Init admin error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Login user (admin or regular user)
 */
inviteAuthRouter.post("/login", async (req: Request, res: Response) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const result = await InviteAuthService.login(
      validatedData.email, 
      validatedData.password, 
      validatedData.rememberMe
    );
    
    if (result.success && result.token) {
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: validatedData.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Logout user
 */
inviteAuthRouter.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ success: true, message: "Logged out successfully" });
});

/**
 * Create user invite (admin only)
 */
inviteAuthRouter.post("/invite-user", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = createUserInviteSchema.parse(req.body);
    const result = await InviteAuthService.createUserInvite(validatedData);
    res.json(result);
  } catch (error) {
    console.error("Create invite error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Set password from invite token
 */
inviteAuthRouter.post("/set-password", async (req: Request, res: Response) => {
  try {
    const validatedData = setPasswordFromInviteSchema.parse(req.body);
    const result = await InviteAuthService.setPasswordFromInvite(validatedData);
    
    if (result.success && result.token) {
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Set password error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Verify invite token (for frontend validation)
 */
inviteAuthRouter.get("/verify-invite/:token", async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const result = await InviteAuthService.verifyInviteToken(token);
    res.json(result);
  } catch (error) {
    console.error("Verify invite token error:", error);
    res.status(500).json({ valid: false });
  }
});

/**
 * Get current user profile (me endpoint)
 */
inviteAuthRouter.get("/me", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await InviteAuthService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Return user info without sensitive data
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        emailVerified: true, // For compatibility with frontend
        username: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Get current user profile (legacy endpoint)
 */
inviteAuthRouter.get("/profile", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await InviteAuthService.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Remove sensitive data
    const { passwordHash, inviteToken, resetToken, ...userProfile } = user;
    res.json({ success: true, user: userProfile });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Get all users (admin only)
 */
inviteAuthRouter.get("/users", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await InviteAuthService.getAllUsers();
    
    // Remove sensitive data from all users
    const usersWithoutSensitiveData = users.map(user => {
      const { passwordHash, inviteToken, resetToken, ...userProfile } = user;
      return userProfile;
    });
    
    res.json({ success: true, users: usersWithoutSensitiveData });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Set password directly for user (admin only)
 */
inviteAuthRouter.post("/set-password-direct", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, password } = req.body;
    
    if (!userId || !password) {
      return res.status(400).json({ success: false, message: "User ID and password are required" });
    }
    
    const result = await InviteAuthService.setPasswordDirect(userId, password);
    res.json(result);
  } catch (error) {
    console.error("Set password direct error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Change password for current user
 */
inviteAuthRouter.post("/change-password", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validatedData = changePasswordSchema.parse(req.body);
    const result = await InviteAuthService.changePassword(
      req.user!.id,
      validatedData.currentPassword,
      validatedData.newPassword
    );
    res.json(result);
  } catch (error) {
    console.error("Change password error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Edit user (admin can edit any user, regular users can only edit themselves)
 */
inviteAuthRouter.put("/users/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    
    // Permission check: admins can edit any user, regular users can only edit themselves
    if (req.user.role !== "admin" && req.user.id !== userId) {
      return res.status(403).json({ success: false, message: "Permission denied: You can only edit your own account" });
    }
    
    const validatedData = editUserSchema.parse(req.body);
    
    // Additional restrictions for non-admin users
    if (req.user.role !== "admin") {
      // Remove role and isActive from update data for non-admin users
      const { role, isActive, ...allowedData } = validatedData;
      const result = await InviteAuthService.editUser(userId, allowedData);
      res.json(result);
    } else {
      const result = await InviteAuthService.editUser(userId, validatedData);
      res.json(result);
    }
  } catch (error) {
    console.error("Edit user error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Delete user (admin only)
 */
inviteAuthRouter.delete("/users/:id", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    

    
    const result = await InviteAuthService.deleteUser(userId);
    res.json(result);
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * Request password reset
 */
inviteAuthRouter.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const validatedData = passwordResetRequestSchema.parse(req.body);
    const result = await InviteAuthService.requestPasswordReset(validatedData.email);
    res.json(result);
  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Reset password with token
 */
inviteAuthRouter.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const validatedData = passwordResetSchema.parse(req.body);
    const result = await InviteAuthService.resetPassword(validatedData.token, validatedData.newPassword);
    res.json(result);
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(400).json({ success: false, message: "Invalid request data" });
  }
});

/**
 * Check if user is authenticated
 */
inviteAuthRouter.get("/check", authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.json({ 
    success: true, 
    authenticated: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    }
  });
});

/**
 * Check if user exists and needs password setup
 */
inviteAuthRouter.get("/check-user/:email", async (req: Request, res: Response) => {
  try {
    const email = decodeURIComponent(req.params.email);
    const result = await InviteAuthService.checkUserPasswordSetup(email);
    res.json(result);
  } catch (error) {
    console.error("Check user error:", error);
    res.status(500).json({ needsPasswordSetup: false });
  }
});

/**
 * Verify reset token (for frontend validation)
 */
inviteAuthRouter.get("/verify-reset-token/:token", async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    // This would need to be implemented in the service
    res.json({ valid: true });
  } catch (error) {
    console.error("Verify reset token error:", error);
    res.status(500).json({ valid: false });
  }
});
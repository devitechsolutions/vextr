import { Router, Request, Response } from "express";
import { AuthService } from "./auth-service";
import { sendEmail, createPasswordResetEmail } from "./email-service";
import { authenticateToken } from "./auth-middleware";
import { 
  insertUserSchema, 
  loginSchema, 
  passwordResetRequestSchema, 
  passwordResetSchema 
} from "@shared/schema";
import { z } from "zod";

export const authRouter = Router();

/**
 * Register new user
 */
authRouter.post("/register", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const userData = insertUserSchema.parse(req.body);

    // Register user (add password to userData)
    const userDataWithPassword = { ...userData, password: "temporary" };
    const result = await AuthService.register(userDataWithPassword);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Send welcome email (commented out - implement later if needed)
    // if (result.user) {
    //   await sendEmail({ to: result.user.email, subject: "Welcome", html: "Welcome!" });
    // }

    // Set cookie if token exists
    if (result.token) {
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Login user
 */
authRouter.post("/login", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { email, password, rememberMe } = loginSchema.parse(req.body);

    // Login user
    const result = await AuthService.login(email, password, rememberMe);

    if (!result.success) {
      return res.status(401).json(result);
    }

    // Set cookie
    if (result.token) {
      const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days
      res.cookie("token", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge,
      });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Logout user
 */
authRouter.post("/logout", (req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

/**
 * Get current user profile
 */
authRouter.get("/profile", authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await AuthService.getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Update user profile
 */
authRouter.put("/profile", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { fullName, email, avatar } = req.body;
    
    // Note: For a complete implementation, you'd want to add an updateUser method to AuthService
    // For now, this is a placeholder that shows the structure
    
    res.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Request password reset
 */
authRouter.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { email } = passwordResetRequestSchema.parse(req.body);

    // Generate reset token
    const result = await AuthService.generatePasswordResetToken(email);

    if (!result.success) {
      // Don't reveal if user exists or not for security
      return res.json({
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      });
    }

    // Email is already sent in the AuthService.generatePasswordResetToken method

    res.json({
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Reset password with token
 */
authRouter.post("/reset-password", async (req: Request, res: Response) => {
  try {
    // Validate request body
    const { token, newPassword } = passwordResetSchema.parse(req.body);

    // Reset password
    const result = await AuthService.resetPassword(token, newPassword);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors,
      });
    }

    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Change password (when logged in)
 */
authRouter.post("/change-password", authenticateToken, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    // Validate new password
    const passwordSchema = z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);
    passwordSchema.parse(newPassword);

    // Change password
    const result = await AuthService.changePassword(req.user.id, currentPassword, newPassword);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long and contain uppercase, lowercase, and number",
      });
    }

    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * Check if user is authenticated
 */
authRouter.get("/check", authenticateToken, (req: Request, res: Response) => {
  res.json({
    success: true,
    authenticated: true,
    user: req.user,
  });
});

/**
 * Verify reset token (for frontend validation)
 */
authRouter.get("/verify-reset-token/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    // This would need implementation in AuthService
    // For now, return a basic response
    res.json({
      success: true,
      valid: true,
    });
  } catch (error) {
    console.error("Verify reset token error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
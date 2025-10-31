import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "./db";
import { users, type User, type CreateUserInvite, type SetPasswordFromInvite } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sendEmailViaGraph, createUserInvitationEmail, createPasswordResetEmail } from "./graph-email-service";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key-change-this-in-production";
const JWT_EXPIRES_IN = "30d"; // Extended for development
const JWT_EXPIRES_IN_REMEMBER = "90d"; // Extended for development
const INVITE_TOKEN_EXPIRY = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface InviteResult {
  success: boolean;
  message?: string;
  inviteToken?: string;
  inviteLink?: string;
}

export class InviteAuthService {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against a hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  static generateToken(user: User, rememberMe = false): string {
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    
    const expiresIn = rememberMe ? JWT_EXPIRES_IN_REMEMBER : JWT_EXPIRES_IN;
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Create admin account - used for seeding
   */
  static async createAdminAccount(): Promise<AuthResult> {
    try {
      // Check if admin already exists
      const existingAdmin = await db
        .select()
        .from(users)
        .where(eq(users.email, "nils@peopleperfect.nl"))
        .limit(1);

      if (existingAdmin.length > 0) {
        return {
          success: false,
          message: "Admin account already exists",
        };
      }

      // Create admin account
      const passwordHash = await this.hashPassword("HFrY.v@o2TWQxhWn");
      const [admin] = await db
        .insert(users)
        .values({
          email: "nils@peopleperfect.nl",
          fullName: "Nils Admin",
          passwordHash,
          role: "admin",
          isActive: true,
        })
        .returning();

      return {
        success: true,
        user: admin,
        message: "Admin account created successfully",
      };
    } catch (error) {
      console.error("Create admin error:", error);
      return {
        success: false,
        message: "Failed to create admin account",
      };
    }
  }

  /**
   * Login user (admin or regular user)
   */
  static async login(email: string, password: string, rememberMe = false): Promise<AuthResult> {
    try {
      // Find user by email
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user) {
        return {
          success: false,
          message: "Invalid email or password",
        };
      }

      // Check if user is active
      if (!user.isActive) {
        return {
          success: false,
          message: "Account is not activated. Please check your email for activation instructions.",
        };
      }

      // Check if password is set
      if (!user.passwordHash) {
        return {
          success: false,
          message: "Account password not set. Please check your email for setup instructions.",
        };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        return {
          success: false,
          message: "Invalid email or password",
        };
      }

      // Update last login
      await db
        .update(users)
        .set({ 
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Generate token
      const token = this.generateToken(user, rememberMe);

      return {
        success: true,
        user,
        token,
        message: "Login successful",
      };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        message: "Login failed",
      };
    }
  }

  /**
   * Create user invite (admin only)
   */
  static async createUserInvite(inviteData: CreateUserInvite): Promise<InviteResult> {
    try {
      // Check if user already exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, inviteData.email))
        .limit(1);

      if (existingUser.length > 0) {
        return {
          success: false,
          message: "User with this email already exists",
        };
      }

      // Generate invite token
      const inviteToken = this.generateSecureToken();
      const inviteTokenExpiry = new Date(Date.now() + INVITE_TOKEN_EXPIRY);

      // Create user record with invite token
      const [user] = await db
        .insert(users)
        .values({
          email: inviteData.email,
          fullName: inviteData.fullName, // Set from invitation data
          role: inviteData.role,
          inviteToken,
          inviteTokenExpiry,
          isActive: false,
        })
        .returning();

      // Send invitation email - always use production URL
      const baseUrl = 'https://recruit-pro.replit.app';
      const inviteLink = `${baseUrl}/set-password/${inviteToken}`;
      
      const emailTemplate = createUserInvitationEmail(inviteData.fullName || inviteData.email, inviteLink);
      
      const emailSent = await sendEmailViaGraph({
        to: inviteData.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });

      if (!emailSent) {
        console.error('Failed to send invitation email to:', inviteData.email);
      }

      return {
        success: true,
        message: emailSent ? "User invite created and email sent successfully." : "User invite created but email sending failed. Provide the link manually.",
        inviteToken,
        inviteLink,
      };
    } catch (error) {
      console.error("Create invite error:", error);
      return {
        success: false,
        message: "Failed to create user invite",
      };
    }
  }

  /**
   * Set password from invite token
   */
  static async setPasswordFromInvite(data: SetPasswordFromInvite): Promise<AuthResult> {
    try {
      // Find user by invite token
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.inviteToken, data.token))
        .limit(1);

      if (!user) {
        return {
          success: false,
          message: "Invalid or expired invite token",
        };
      }

      // Check if token is expired
      if (!user.inviteTokenExpiry || user.inviteTokenExpiry < new Date()) {
        return {
          success: false,
          message: "Invite token has expired",
        };
      }

      // Hash password and activate user
      const passwordHash = await this.hashPassword(data.password);
      const [updatedUser] = await db
        .update(users)
        .set({
          fullName: data.fullName,
          phone: data.phone || null,
          passwordHash,
          isActive: true,
          inviteToken: null,
          inviteTokenExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      // Generate login token
      const token = this.generateToken(updatedUser);

      return {
        success: true,
        user: updatedUser,
        token,
        message: "Password set successfully",
      };
    } catch (error) {
      console.error("Set password error:", error);
      return {
        success: false,
        message: "Failed to set password",
      };
    }
  }

  /**
   * Verify invite token (for frontend validation)
   */
  static async verifyInviteToken(token: string): Promise<{ valid: boolean; email?: string; fullName?: string }> {
    try {
      const [user] = await db
        .select({ email: users.email, fullName: users.fullName, inviteTokenExpiry: users.inviteTokenExpiry })
        .from(users)
        .where(eq(users.inviteToken, token))
        .limit(1);

      if (!user || !user.inviteTokenExpiry || user.inviteTokenExpiry < new Date()) {
        return { valid: false };
      }

      return { valid: true, email: user.email, fullName: user.fullName || undefined };
    } catch (error) {
      console.error("Verify invite token error:", error);
      return { valid: false };
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(id: number): Promise<User | null> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return user || null;
    } catch (error) {
      console.error("Get user error:", error);
      return null;
    }
  }

  /**
   * Get all users (admin only)
   */
  static async getAllUsers(): Promise<User[]> {
    try {
      return await db.select().from(users);
    } catch (error) {
      console.error("Get all users error:", error);
      return [];
    }
  }

  /**
   * Edit user (admin only)
   */
  static async editUser(userId: number, updateData: { fullName?: string; email?: string; phone?: string; role?: string; isActive?: boolean; newPassword?: string }): Promise<{ success: boolean; message: string; user?: User }> {
    try {
      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // If email is being changed, check if new email already exists
      if (updateData.email && updateData.email !== existingUser.email) {
        const [emailCheck] = await db
          .select()
          .from(users)
          .where(eq(users.email, updateData.email))
          .limit(1);

        if (emailCheck) {
          return {
            success: false,
            message: "Email already exists",
          };
        }
      }

      // Prepare update data, handle password separately
      const { newPassword, ...userUpdateData } = updateData;
      const finalUpdateData: any = {
        ...userUpdateData,
        updatedAt: new Date(),
      };

      // If password is provided, hash it
      if (newPassword && newPassword.trim() !== "") {
        finalUpdateData.passwordHash = await this.hashPassword(newPassword);
      }

      // Update user
      const [updatedUser] = await db
        .update(users)
        .set(finalUpdateData)
        .where(eq(users.id, userId))
        .returning();

      return {
        success: true,
        message: "User updated successfully",
        user: updatedUser,
      };
    } catch (error) {
      console.error("Edit user error:", error);
      return {
        success: false,
        message: "Failed to update user",
      };
    }
  }

  /**
   * Set password directly for user (admin only)
   */
  static async setPasswordDirect(userId: number, password: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!existingUser) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Hash the password
      const passwordHash = await bcrypt.hash(password, 10);

      // Update user with password and activate account
      await db
        .update(users)
        .set({
          passwordHash,
          isActive: true,
          mustChangePassword: true,
          inviteToken: null,
          inviteTokenExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        message: "Password set successfully",
      };
    } catch (error) {
      console.error("Set password direct error:", error);
      return {
        success: false,
        message: "Failed to set password",
      };
    }
  }

  /**
   * Change password for any user
   */
  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get current user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Verify current password
      if (user.passwordHash && !(await this.verifyPassword(currentPassword, user.passwordHash))) {
        return {
          success: false,
          message: "Current password is incorrect",
        };
      }

      // Hash new password
      const newPasswordHash = await this.hashPassword(newPassword);

      // Update password and clear mustChangePassword flag
      await db
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        message: "Password changed successfully",
      };
    } catch (error) {
      console.error("Change password error:", error);
      return {
        success: false,
        message: "Failed to change password",
      };
    }
  }

  /**
   * Delete user (admin only)
   */
  static async deleteUser(userId: number): Promise<{ success: boolean; message: string }> {
    try {
      const result = await db
        .delete(users)
        .where(eq(users.id, userId))
        .returning();

      if (result.length === 0) {
        return {
          success: false,
          message: "User not found",
        };
      }

      return {
        success: true,
        message: "User deleted successfully",
      };
    } catch (error) {
      console.error("Delete user error:", error);
      return {
        success: false,
        message: "Failed to delete user",
      };
    }
  }

  /**
   * Reset password request
   */
  static async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!user || !user.isActive) {
        // Don't reveal if user exists
        return {
          success: true,
          message: "If an account exists, a reset link has been sent",
        };
      }

      const resetToken = this.generateSecureToken();
      const resetTokenExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days

      await db
        .update(users)
        .set({
          resetToken,
          resetTokenExpiry,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      // Always use production URL for emails
      const baseUrl = 'https://recruit-pro.replit.app';
      const resetLink = `${baseUrl}/reset-password/${resetToken}`;
      const emailTemplate = createPasswordResetEmail(user.fullName || "User", resetLink);
      await sendEmailViaGraph({
        to: email,
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });

      return {
        success: true,
        message: "If an account exists, a reset link has been sent",
      };
    } catch (error) {
      console.error("Password reset request error:", error);
      return {
        success: false,
        message: "Failed to process reset request",
      };
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.resetToken, token))
        .limit(1);

      if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        return {
          success: false,
          message: "Invalid or expired reset token",
        };
      }

      const passwordHash = await this.hashPassword(newPassword);
      const [updatedUser] = await db
        .update(users)
        .set({
          passwordHash,
          resetToken: null,
          resetTokenExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      return {
        success: true,
        user: updatedUser,
        message: "Password reset successfully",
      };
    } catch (error) {
      console.error("Reset password error:", error);
      return {
        success: false,
        message: "Failed to reset password",
      };
    }
  }

  /**
   * Check if user exists and needs password setup
   */
  static async checkUserPasswordSetup(email: string): Promise<{ needsPasswordSetup: boolean; resetToken?: string }> {
    try {
      const userResult = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (userResult.length === 0) {
        return { needsPasswordSetup: false };
      }

      const user = userResult[0];

      // If user has no password hash but has a reset token, they need password setup
      const needsPasswordSetup = !user.passwordHash && !!user.resetToken;

      return {
        needsPasswordSetup,
        resetToken: needsPasswordSetup ? user.resetToken || undefined : undefined,
      };
    } catch (error) {
      console.error("Check user password setup error:", error);
      return { needsPasswordSetup: false };
    }
  }
}
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import type { User, InsertUser } from "@shared/schema";
import { sendEmailViaGraph, createPasswordResetEmail } from "./graph-email-service";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";
const JWT_EXPIRES_IN = "7d";
const RESET_TOKEN_EXPIRES_IN = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  message?: string;
}

export interface ResetTokenResult {
  success: boolean;
  token?: string;
  message?: string;
}

export class AuthService {
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
    const expiresIn = rememberMe ? "30d" : JWT_EXPIRES_IN;
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        fullName: user.fullName,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn }
    );
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  /**
   * Register a new user
   */
  static async register(userData: InsertUser & { password: string }): Promise<AuthResult> {
    try {
      // Check if user already exists
      const existingUser = await db.select()
        .from(users)
        .where(eq(users.email, userData.email))
        .limit(1);

      if (existingUser.length > 0) {
        return {
          success: false,
          message: "User with this email already exists"
        };
      }

      // No username check needed as we don't have username field

      // Hash password
      const hashedPassword = await this.hashPassword(userData.password);

      // Create user
      const newUser = await db.insert(users)
        .values({
          ...userData,
          passwordHash: hashedPassword,
        })
        .returning();

      const user = newUser[0];
      const token = this.generateToken(user);

      return {
        success: true,
        user: { ...user, passwordHash: null } as User,
        token,
        message: "User registered successfully"
      };
    } catch (error) {
      console.error("Registration error:", error);
      return {
        success: false,
        message: "Registration failed"
      };
    }
  }

  /**
   * Login user
   */
  static async login(email: string, password: string, rememberMe = false): Promise<AuthResult> {
    try {
      // Find user by email
      const userResult = await db.select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (userResult.length === 0) {
        return {
          success: false,
          message: "Invalid email or password"
        };
      }

      const user = userResult[0];

      // Verify password
      const isPasswordValid = await this.verifyPassword(password, user.passwordHash || '');
      if (!isPasswordValid) {
        return {
          success: false,
          message: "Invalid email or password"
        };
      }

      // Generate token
      const token = this.generateToken(user, rememberMe);

      return {
        success: true,
        user: { ...user, passwordHash: null } as User,
        token,
        message: "Login successful"
      };
    } catch (error) {
      console.error("Login error:", error);
      return {
        success: false,
        message: "Login failed"
      };
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(id: number): Promise<User | null> {
    try {
      const userResult = await db.select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (userResult.length === 0) {
        return null;
      }

      const user = userResult[0];
      return { ...user, passwordHash: null } as User;
    } catch (error) {
      console.error("Get user by ID error:", error);
      return null;
    }
  }

  /**
   * Generate password reset token and send email
   */
  static async generatePasswordResetToken(email: string): Promise<ResetTokenResult> {
    try {
      // Find user by email
      const userResult = await db.select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (userResult.length === 0) {
        // For security, don't reveal if email exists
        return {
          success: true,
          message: "If the email exists in our system, a password reset link has been sent."
        };
      }

      const user = userResult[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + RESET_TOKEN_EXPIRES_IN);

      // Update user with reset token
      await db.update(users)
        .set({
          resetToken,
          resetTokenExpiry,
        })
        .where(eq(users.email, email));

      // Send password reset email - always use production URL
      const baseUrl = 'https://recruit-pro.replit.app';
      const resetLink = `${baseUrl}/reset-password/${resetToken}`;
      
      const emailTemplate = createPasswordResetEmail(user.fullName || user.email, resetLink);
      
      const emailSent = await sendEmailViaGraph({
        to: user.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });

      if (!emailSent) {
        console.error('Failed to send password reset email to:', user.email);
      }

      return {
        success: true,
        token: resetToken,
        message: "If the email exists in our system, a password reset link has been sent."
      };
    } catch (error) {
      console.error("Generate reset token error:", error);
      return {
        success: false,
        message: "Failed to generate reset token"
      };
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    try {
      // Find user by reset token
      const userResult = await db.select()
        .from(users)
        .where(and(
          eq(users.resetToken, token),
          // Check if token is not expired
        ))
        .limit(1);

      if (userResult.length === 0) {
        return {
          success: false,
          message: "Invalid or expired reset token"
        };
      }

      const user = userResult[0];

      // Check if token is expired
      if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
        return {
          success: false,
          message: "Reset token has expired"
        };
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update user password and clear reset token
      await db.update(users)
        .set({
          passwordHash: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
        })
        .where(eq(users.id, user.id));

      return {
        success: true,
        message: "Password reset successful"
      };
    } catch (error) {
      console.error("Reset password error:", error);
      return {
        success: false,
        message: "Password reset failed"
      };
    }
  }

  /**
   * Change user password (when logged in)
   */
  static async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<AuthResult> {
    try {
      // Find user
      const userResult = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (userResult.length === 0) {
        return {
          success: false,
          message: "User not found"
        };
      }

      const user = userResult[0];

      // Verify current password
      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, user.passwordHash || '');
      if (!isCurrentPasswordValid) {
        return {
          success: false,
          message: "Current password is incorrect"
        };
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password
      await db.update(users)
        .set({
          passwordHash: hashedPassword,
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        message: "Password changed successfully"
      };
    } catch (error) {
      console.error("Change password error:", error);
      return {
        success: false,
        message: "Password change failed"
      };
    }
  }
}
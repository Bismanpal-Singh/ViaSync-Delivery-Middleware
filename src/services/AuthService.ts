import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import crypto from 'crypto';

interface UserSession {
  sessionId: string;
  userId: string;
  companyId: string;
  employeeId: string;
  bearerToken: string;
  tokenExpiry: Date;
  createdAt: Date;
  lastActivity: Date;
}

interface LoginCredentials {
  employeeID: string;
  companyID: string;
  employeePassword: string;
}

interface DecodedToken {
  exp: number;
  unique_name: string;
  role: string;
  nbf: number;
  iat: number;
}

/**
 * Manages user authentication and session management for multi-tenancy.
 * Handles QuickFlora API authentication and stores user context for API calls.
 */
export class AuthService {
  private sessions: Map<string, UserSession> = new Map();
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  private readonly TOKEN_BUFFER = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clean up expired sessions every hour
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  /**
   * Authenticates a user with QuickFlora API and creates a session.
   * @param credentials User login credentials
   * @returns Session information including session token
   */
  public async login(credentials: LoginCredentials): Promise<{
    sessionId: string;
    userId: string;
    companyId: string;
    message: string;
  }> {
    try {
      console.log(`🔐 Attempting login for employee: ${credentials.employeeID} at company: ${credentials.companyID}`);

      // Call QuickFlora login API
      const response = await axios.post(
        'https://quickflora-new.com/QuickFloraCoreAPI/Account/login',
        credentials,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const token = response.data.token || response.data;
      
      if (typeof token !== 'string' || !token) {
        throw new Error('Token not found in login response.');
      }

      // Decode token to get user information
      const decodedToken = jwtDecode<DecodedToken>(token);
      const expiryTimestamp = decodedToken.exp * 1000;

      // Create session
      const sessionId = this.generateSessionId();
      const session: UserSession = {
        sessionId,
        userId: credentials.employeeID,
        companyId: credentials.companyID,
        employeeId: credentials.employeeID,
        bearerToken: token,
        tokenExpiry: new Date(expiryTimestamp),
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      // Store session
      this.sessions.set(sessionId, session);

      console.log(`✅ Login successful for ${credentials.employeeID} at ${credentials.companyID}`);
      console.log(`📅 Session expires at: ${session.tokenExpiry.toLocaleString()}`);

      return {
        sessionId,
        userId: credentials.employeeID,
        companyId: credentials.companyID,
        message: 'Login successful',
      };
    } catch (error) {
      console.error('❌ Login failed:', error);
      if (axios.isAxiosError(error) && error.response) {
        console.error('Error Response:', error.response.data);
        throw new Error(`Login failed: ${error.response.data.message || 'Invalid credentials'}`);
      }
      throw new Error('Login failed: Could not authenticate with QuickFlora API');
    }
  }

  /**
   * Validates a session and returns user context.
   * @param sessionId Session identifier
   * @returns User session if valid
   */
  public getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check if session has expired
    if (Date.now() > session.lastActivity.getTime() + this.SESSION_TIMEOUT) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Gets a valid bearer token for a session, checking QuickFlora status if needed.
   * @param sessionId Session identifier
   * @returns Valid bearer token
   */
  public async getValidBearerToken(sessionId: string): Promise<string> {
    const session = this.getSession(sessionId);
    
    if (!session) {
      throw new Error('Invalid or expired session');
    }

    // Check if token is expiring soon or if we should verify with QuickFlora
    if (session.tokenExpiry.getTime() <= Date.now() + this.TOKEN_BUFFER) {
      console.log('🔄 Token expiring soon, checking QuickFlora session status...');
      const isStillValid = await this.checkQuickFloraSessionStatus(sessionId);
      
      if (!isStillValid) {
        console.log('❌ QuickFlora session expired, removing local session');
        this.sessions.delete(sessionId);
        throw new Error('Session expired - please login again');
      }
      
      // Update last activity
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    }

    return session.bearerToken;
  }

  /**
   * Checks if a QuickFlora session is still valid using login-status endpoint.
   * @param sessionId Session identifier
   */
  public async checkQuickFloraSessionStatus(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    try {
      // Check session status with QuickFlora API
      const response = await axios.get(
        'https://quickflora-new.com/QuickFloraCoreAPI/Account/login-status',
        {
          headers: {
            'Authorization': `Bearer ${session.bearerToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // If we get a successful response, session is still valid
      return response.status === 200;
    } catch (error) {
      console.log('❌ QuickFlora session expired or invalid');
      return false;
    }
  }

  /**
   * Logs out from QuickFlora API and removes local session.
   * @param sessionId Session identifier
   */
  public async logoutFromQuickFlora(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return false;
    }

    try {
      // Logout from QuickFlora API
      await axios.post(
        'https://quickflora-new.com/QuickFloraCoreAPI/Account/logout',
        {},
        {
          headers: {
            'Authorization': `Bearer ${session.bearerToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ Logged out from QuickFlora API');
    } catch (error) {
      console.log('⚠️ QuickFlora logout failed, but removing local session anyway');
    }

    // Remove local session regardless of QuickFlora response
    const removed = this.sessions.delete(sessionId);
    if (removed) {
      console.log(`👋 User logged out, session ${sessionId} removed`);
    }
    return removed;
  }

  /**
   * Logs out a user by removing their session.
   * @param sessionId Session identifier
   */
  public logout(sessionId: string): boolean {
    const removed = this.sessions.delete(sessionId);
    if (removed) {
      console.log(`👋 User logged out, session ${sessionId} removed`);
    }
    return removed;
  }

  /**
   * Generates a unique session identifier.
   * @returns Unique session ID
   */
  private generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Cleans up expired sessions.
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now > session.lastActivity.getTime() + this.SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired sessions`);
    }
  }

  /**
   * Gets session statistics for monitoring.
   * @returns Session statistics
   */
  public getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
  } {
    const now = Date.now();
    let activeCount = 0;

    for (const session of this.sessions.values()) {
      if (now <= session.lastActivity.getTime() + this.SESSION_TIMEOUT) {
        activeCount++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeCount,
    };
  }
} 
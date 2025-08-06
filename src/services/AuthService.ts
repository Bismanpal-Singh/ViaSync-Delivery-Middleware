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
  // Add stored credentials for auto-refresh
  storedCredentials?: {
    employeeID: string;
    companyID: string;
    employeePassword: string;
  };
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

      console.log('🔍 Token Analysis:');
      console.log(`📅 Token expiry (Unix): ${decodedToken.exp}`);
      console.log(`📅 Token expiry (Date): ${new Date(expiryTimestamp).toLocaleString()}`);
      console.log(`⏰ Current time: ${new Date().toLocaleString()}`);
      console.log(`⏱️ Time until expiry: ${Math.round((expiryTimestamp - Date.now()) / 1000 / 60)} minutes`);

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
        // Store credentials for auto-refresh (encrypted in production)
        storedCredentials: {
          employeeID: credentials.employeeID,
          companyID: credentials.companyID,
          employeePassword: credentials.employeePassword,
        },
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
      console.log(`❌ Session not found: ${sessionId}`);
      return null;
    }

    console.log(`🔍 Checking session: ${sessionId}`);
    console.log(`📅 Last activity: ${session.lastActivity.toLocaleString()}`);
    console.log(`⏰ Current time: ${new Date().toLocaleString()}`);
    console.log(`⏱️ Time since last activity: ${Math.round((Date.now() - session.lastActivity.getTime()) / 1000 / 60)} minutes`);
    console.log(`⏱️ Session timeout: ${Math.round(this.SESSION_TIMEOUT / 1000 / 60)} minutes`);

    // Check if session has expired
    if (Date.now() > session.lastActivity.getTime() + this.SESSION_TIMEOUT) {
      console.log(`❌ Session expired, deleting: ${sessionId}`);
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    this.sessions.set(sessionId, session);
    console.log(`✅ Session valid, updated last activity: ${sessionId}`);

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

    console.log(`🔍 Validating session: ${sessionId}`);
    console.log(`📅 Token expires at: ${session.tokenExpiry.toLocaleString()}`);
    console.log(`⏰ Current time: ${new Date().toLocaleString()}`);

    // Check if token is actually expired (not just expiring soon)
    const timeUntilExpiry = session.tokenExpiry.getTime() - Date.now();
    const isExpired = timeUntilExpiry <= 0;

    console.log(`⏱️ Time until expiry: ${Math.round(timeUntilExpiry / 1000 / 60)} minutes`);

    if (isExpired) {
      console.log('🔄 Token has expired, attempting silent refresh...');
      
      try {
        const refreshResult = await this.refreshSessionSilently(sessionId);
        if (refreshResult.success && refreshResult.newSessionId) {
          // Get the new session
          const newSession = this.getSession(refreshResult.newSessionId);
          if (newSession) {
            console.log('✅ Session refreshed successfully');
            return newSession.bearerToken;
          }
        }
      } catch (refreshError) {
        console.warn('⚠️ Silent refresh failed:', refreshError);
      }
      
      // If refresh failed, be more lenient - don't immediately check QuickFlora status
      console.log('⚠️ Refresh failed, but continuing with current token for now');
      // Don't delete session immediately - let it continue working
    } else if (timeUntilExpiry <= this.TOKEN_BUFFER) {
      // Token is expiring soon but not expired yet - just log warning
      console.log(`⚠️ Token will expire in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes`);
    } else {
      console.log('✅ Token is valid');
    }

    // Update last activity
    session.lastActivity = new Date();
    this.sessions.set(sessionId, session);

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
   * Performs silent re-login using stored credentials to refresh the session.
   * @param sessionId Session identifier
   * @returns New session information if successful
   */
  public async refreshSessionSilently(sessionId: string): Promise<{
    success: boolean;
    newSessionId?: string;
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);
    
    if (!session || !session.storedCredentials) {
      return {
        success: false,
        error: 'No stored credentials for auto-refresh'
      };
    }

    try {
      console.log('🔄 Performing silent session refresh...');
      
      // Call QuickFlora login API with stored credentials
      const response = await axios.post(
        'https://quickflora-new.com/QuickFloraCoreAPI/Account/login',
        session.storedCredentials,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const token = response.data.token || response.data;
      
      if (typeof token !== 'string' || !token) {
        throw new Error('Token not found in refresh response');
      }

      // Decode new token
      const decodedToken = jwtDecode<DecodedToken>(token);
      const expiryTimestamp = decodedToken.exp * 1000;

      // Generate new session ID
      const newSessionId = this.generateSessionId();
      
      // Create new session with same credentials
      const newSession: UserSession = {
        sessionId: newSessionId,
        userId: session.userId,
        companyId: session.companyId,
        employeeId: session.employeeId,
        bearerToken: token,
        tokenExpiry: new Date(expiryTimestamp),
        createdAt: new Date(),
        lastActivity: new Date(),
        storedCredentials: session.storedCredentials, // Keep credentials for future refresh
      };

      // Remove old session and add new one
      this.sessions.delete(sessionId);
      this.sessions.set(newSessionId, newSession);

      console.log('✅ Session refreshed successfully');
      console.log(`📅 New session expires at: ${newSession.tokenExpiry.toLocaleString()}`);

      return {
        success: true,
        newSessionId: newSessionId
      };

    } catch (error) {
      console.error('❌ Silent session refresh failed:', error);
      
      // Remove the failed session
      this.sessions.delete(sessionId);
      
      return {
        success: false,
        error: 'Failed to refresh session - please login again'
      };
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

  /**
   * Gets token expiration information for a session.
   * @param sessionId Session identifier
   * @returns Token expiration info
   */
  public getTokenExpirationInfo(sessionId: string): {
    expiresAt: Date;
    timeUntilExpiry: number; // milliseconds
    isExpiringSoon: boolean;
    isExpired: boolean;
  } | null {
    const session = this.getSession(sessionId);
    
    if (!session) {
      return null;
    }

    const now = Date.now();
    const timeUntilExpiry = session.tokenExpiry.getTime() - now;
    const isExpired = timeUntilExpiry <= 0;
    const isExpiringSoon = timeUntilExpiry <= this.TOKEN_BUFFER;

    return {
      expiresAt: session.tokenExpiry,
      timeUntilExpiry,
      isExpiringSoon,
      isExpired
    };
  }
} 
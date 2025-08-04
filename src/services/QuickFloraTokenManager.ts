import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

interface DecodedToken {
  exp: number;
  // Add other properties from the token payload if needed
}

/**
 * Manages fetching and caching of QuickFlora API bearer tokens.
 * This class ensures that a valid token is always used for API requests,
 * and handles automatic renewal when a token is expired or missing.
 */
export class QuickFloraTokenManager {
  private cachedToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor() {
    // Ensure required environment variables are set
    if (
      !process.env.QUICKFLORA_EMPLOYEE_ID ||
      !process.env.QUICKFLORA_COMPANY_ID ||
      !process.env.QUICKFLORA_EMPLOYEE_PASSWORD
    ) {
      throw new Error(
        'Missing required QuickFlora credentials in .env file. Please set QUICKFLORA_EMPLOYEE_ID, QUICKFLORA_COMPANY_ID, and QUICKFLORA_EMPLOYEE_PASSWORD.'
      );
    }
  }

  /**
   * Retrieves a valid bearer token, fetching a new one if necessary.
   * @returns A promise that resolves to a valid bearer token.
   */
  public async getValidToken(): Promise<string> {
    // Check if the cached token exists and is not expired (with a 60-second buffer)
    if (this.cachedToken && this.tokenExpiry && this.tokenExpiry.getTime() > Date.now() + 60000) {
      console.log('✅ Returning cached token.');
      return this.cachedToken;
    }

    console.log('🔄 Token is missing or expired. Fetching a new one...');
    return this.fetchNewToken();
  }

  /**
   * Fetches a new token from the QuickFlora login endpoint.
   * @returns A promise that resolves to a new bearer token.
   */
  private async fetchNewToken(): Promise<string> {
    try {
      const response = await axios.post(
        'https://quickflora-new.com/QuickFloraCoreAPI/Account/login',
        {
          employeeID: process.env.QUICKFLORA_EMPLOYEE_ID,
          companyID: process.env.QUICKFLORA_COMPANY_ID,
          employeePassword: process.env.QUICKFLORA_EMPLOYEE_PASSWORD,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      // The token is often in the response body directly or in a data object
      const token = response.data.token || response.data;
      
      if (typeof token !== 'string' || !token) {
        throw new Error('Token not found in login response.');
      }

      // Decode the token to get its expiration time
      const decodedToken = jwtDecode<DecodedToken>(token);
      const expiryTimestamp = decodedToken.exp * 1000; // Convert seconds to milliseconds

      this.cachedToken = token;
      this.tokenExpiry = new Date(expiryTimestamp);

      console.log(`🎉 Successfully fetched new token. Expires at: ${this.tokenExpiry.toLocaleString()}`);

      return this.cachedToken;
    } catch (error) {
      console.error('❌ Failed to fetch new token from QuickFlora API.');
      if (axios.isAxiosError(error) && error.response) {
        console.error('Error Response:', error.response.data);
      }
      throw new Error('Could not authenticate with QuickFlora API.');
    }
  }
}

// Uber Service - DISABLED
// This service is temporarily disabled until Uber Direct API access is obtained

export class UberService {
  constructor() {
    console.log('🚫 Uber Service is disabled - Uber Direct API access required');
  }

  async getDeliveryQuote(): Promise<any> {
    console.log('🚫 Uber delivery quotes are disabled');
    throw new Error('Uber delivery quotes are disabled - Uber Direct API access required');
  }

  async getDeliveryQuotesForMultipleLocations(): Promise<any[]> {
    console.log('🚫 Uber delivery quotes are disabled');
    throw new Error('Uber delivery quotes are disabled - Uber Direct API access required');
  }
} 
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UberService = void 0;
class UberService {
    constructor() {
        console.log('🚫 Uber Service is disabled - Uber Direct API access required');
    }
    async getDeliveryQuote() {
        console.log('🚫 Uber delivery quotes are disabled');
        throw new Error('Uber delivery quotes are disabled - Uber Direct API access required');
    }
    async getDeliveryQuotesForMultipleLocations() {
        console.log('🚫 Uber delivery quotes are disabled');
        throw new Error('Uber delivery quotes are disabled - Uber Direct API access required');
    }
}
exports.UberService = UberService;
//# sourceMappingURL=UberService.js.map
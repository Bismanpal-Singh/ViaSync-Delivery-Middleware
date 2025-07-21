export declare const config: {
    port: string | number;
    nodeEnv: string;
    supabase: {
        url: string;
        anonKey: string;
        serviceKey: string;
    };
    uber: {
        clientId: string;
        clientSecret: string;
        customerId: string;
        baseUrl: string;
    };
    shop: {
        address: string;
        name: string;
    };
    timeouts: {
        supabase: number;
        uber: number;
    };
};
export declare function validateEnvironment(): void;
//# sourceMappingURL=environment.d.ts.map
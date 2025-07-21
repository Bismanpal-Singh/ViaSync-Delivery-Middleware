import { Request, Response } from 'express';
export declare const optimizeDelivery: (req: Request, res: Response) => Promise<void>;
export declare const optimizeDeliveryFromDatabase: (req: Request, res: Response) => Promise<void>;
export declare const healthCheck: (_req: Request, res: Response) => Promise<void>;
export declare const getAllDeliveries: (req: Request, res: Response) => Promise<void>;
export declare const getDeliveryById: (req: Request, res: Response) => Promise<void>;
export declare const updateDeliveryStatus: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=deliveryController.d.ts.map
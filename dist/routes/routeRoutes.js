"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const routeController_1 = require("../controllers/routeController");
const router = (0, express_1.Router)();
router.get('/driver/:routeId/:vehicleId', routeController_1.getRouteForDriver);
router.put('/driver/:routeId/:vehicleId/:locationId/progress', routeController_1.updateDeliveryProgress);
router.put('/driver/:routeId/:vehicleId/location', routeController_1.updateDriverLocation);
router.get('/shop/:routeId', routeController_1.getRouteForShopOwner);
router.get('/shop/active', routeController_1.getActiveRoutes);
router.get('/shop/date-range', routeController_1.getRoutesByDateRange);
router.put('/shop/:routeId/status', routeController_1.updateRouteStatus);
exports.default = router;
//# sourceMappingURL=routeRoutes.js.map
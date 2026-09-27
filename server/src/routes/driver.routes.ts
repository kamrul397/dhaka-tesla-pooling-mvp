import { Router } from 'express';
import { DriverController } from '../controllers/driver.controller';

const router = Router();

router.get('/', DriverController.listDrivers);
router.get('/:driverId/dashboard', DriverController.getDashboard);
router.get('/requests/available', DriverController.getAvailableRequests);
router.post('/pools/match', DriverController.matchRequest);
router.post('/pools/:poolId/status', DriverController.updateStatus);

export default router;
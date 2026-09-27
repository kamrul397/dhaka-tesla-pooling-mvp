import { Router } from 'express';
import { SimulationController } from '../controllers/simulation.controller';

const router = Router();

router.post('/banani-rush-hour', SimulationController.runBananiRushHour);

export default router;
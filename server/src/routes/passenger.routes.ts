import { Router } from 'express';
import { PassengerController } from '../controllers/passenger.controller';

const router = Router();

router.get('/estimate', PassengerController.estimateFare);
router.get('/', PassengerController.listPassengers);
router.post('/requests', PassengerController.requestRide);
router.get('/requests/:requestId', PassengerController.getRequestById);
router.post('/requests/:requestId/cancel', PassengerController.cancelRide);
router.get('/:passengerId/history', PassengerController.getPassengerHistory);

export default router;
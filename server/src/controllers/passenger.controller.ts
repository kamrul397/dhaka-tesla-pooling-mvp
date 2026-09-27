import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { RideService } from '../services/ride.service';
import { calculateFare } from '../services/fare.service';

const CreateRideRequestSchema = z.object({
    passengerId: z.string().uuid(),
    pickupZone: z.string().min(2),
    destinationZone: z.string().min(2),
    requestedSeats: z.number().int().min(1).max(3).default(1),
});

export class PassengerController {
    // Estimate fare before booking
    static async estimateFare(req: Request, res: Response) {
        try {
            const { pickupZone, destinationZone } = req.query;
            if (!pickupZone || !destinationZone) {
                return res.status(400).json({ error: 'pickupZone and destinationZone are required' });
            }

            const soloFare = calculateFare(String(pickupZone), String(destinationZone), false);
            const pooledFare = calculateFare(String(pickupZone), String(destinationZone), true);

            return res.json({ soloFare, pooledFare });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Create a new ride request
    static async requestRide(req: Request, res: Response) {
        try {
            const parseResult = CreateRideRequestSchema.safeParse(req.body);
            if (!parseResult.success) {
                return res.status(400).json({ error: 'Validation failed', details: parseResult.error.format() });
            }

            const { passengerId, pickupZone, destinationZone, requestedSeats } = parseResult.data;
            const request = await RideService.createRideRequest(
                passengerId,
                pickupZone,
                destinationZone,
                requestedSeats
            );

            return res.status(201).json(request);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Get single ride request details (privacy isolation: each passenger sees their own status & fare)
    static async getRequestById(req: Request, res: Response) {
        try {
            const requestId = req.params.requestId as string;
            const request = await prisma.rideRequest.findUnique({
                where: { id: requestId },
                include: {
                    passenger: { select: { id: true, name: true, email: true, walletBalancePoysha: true } },
                    pool: {
                        include: {
                            driver: { select: { id: true, name: true } },
                            vehicle: { select: { name: true, plateNumber: true, totalCapacity: true } },
                        },
                    },
                    auditLogs: { orderBy: { timestamp: 'desc' } },
                },
            });

            if (!request) {
                return res.status(404).json({ error: 'Ride request not found' });
            }

            return res.json(request);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Passenger ride history
    static async getPassengerHistory(req: Request, res: Response) {
        try {
            const passengerId = req.params.passengerId as string;
            const history = await prisma.rideRequest.findMany({
                where: { passengerId },
                orderBy: { createdAt: 'desc' },
                include: {
                    pool: {
                        include: {
                            driver: { select: { name: true } },
                            vehicle: { select: { name: true } },
                        },
                    },
                },
            });

            return res.json(history);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Cancel ride request
    static async cancelRide(req: Request, res: Response) {
        try {
            const requestId = req.params.requestId as string;
            const { passengerId, reason } = req.body;

            if (!passengerId) {
                return res.status(400).json({ error: 'passengerId is required in body' });
            }

            const cancelled = await RideService.cancelRideRequest(passengerId, requestId, reason);
            return res.json({ message: 'Ride cancelled successfully', ride: cancelled });
        } catch (err: any) {
            if (err.name === 'UnauthorizedRideAccessError') {
                return res.status(403).json({ error: err.message });
            }
            if (err.name === 'InvalidStateTransitionError') {
                return res.status(400).json({ error: err.message });
            }
            return res.status(500).json({ error: err.message });
        }
    }

    // List all passengers (Nusrat, Rafiq, Shirin) for easy demo switching
    static async listPassengers(_req: Request, res: Response) {
        try {
            const passengers = await prisma.user.findMany({
                where: { role: 'PASSENGER' },
                select: { id: true, name: true, email: true, walletBalancePoysha: true },
            });
            return res.json(passengers);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }
}
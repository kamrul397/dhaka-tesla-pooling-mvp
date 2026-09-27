import { Request, Response } from 'express';
import { PoolStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { RideService } from '../services/ride.service';

export class DriverController {
    // Get Driver Dashboard (Bullet status, capacity, current pool)
    static async getDashboard(req: Request, res: Response) {
        try {
            const driverId = req.params.driverId as string;
            const driver = await prisma.user.findUnique({
                where: { id: driverId },
                include: {
                    vehicles: true,
                    poolsAsDriver: {
                        where: { status: { notIn: [PoolStatus.COMPLETED, PoolStatus.CANCELLED] } },
                        include: {
                            requests: {
                                include: { passenger: { select: { id: true, name: true, email: true } } },
                            },
                        },
                    },
                },
            });

            if (!driver) {
                return res.status(404).json({ error: 'Driver not found' });
            }

            return res.json(driver);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // List available pending requests waiting for a Tesla
    static async getAvailableRequests(_req: Request, res: Response) {
        try {
            const requests = await prisma.rideRequest.findMany({
                where: { status: 'REQUESTED' },
                orderBy: { createdAt: 'asc' },
                include: { passenger: { select: { id: true, name: true, email: true } } },
            });
            return res.json(requests);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    // Match / Accept a passenger request into Bullet's pool (Atomic & Concurrency-Safe)
    static async matchRequest(req: Request, res: Response) {
        try {
            const { driverId, requestId } = req.body;
            if (!driverId || !requestId) {
                return res.status(400).json({ error: 'driverId and requestId are required' });
            }

            const result = await RideService.matchRequestToPool(driverId, requestId);
            return res.json({ message: 'Request successfully matched to pool', ...result });
        } catch (err: any) {
            if (err.name === 'ConcurrencyConflictError') {
                return res.status(409).json({ error: err.message }); // 409 Conflict: Seat capacity reached!
            }
            if (err.name === 'InvalidStateTransitionError') {
                return res.status(400).json({ error: err.message });
            }
            return res.status(500).json({ error: err.message });
        }
    }

    // Update pool lifecycle: DRIVER_ARRIVED -> STARTED -> COMPLETED
    static async updateStatus(req: Request, res: Response) {
        try {
            const poolId = req.params.poolId as string;
            const { driverId, status } = req.body;

            if (!driverId || !status) {
                return res.status(400).json({ error: 'driverId and status are required' });
            }

            const updatedPool = await RideService.updatePoolStatus(driverId, poolId, status as PoolStatus);
            return res.json({ message: `Pool updated to ${status}`, pool: updatedPool });
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

    // List all drivers (Jashim)
    static async listDrivers(_req: Request, res: Response) {
        try {
            const drivers = await prisma.user.findMany({
                where: { role: 'DRIVER' },
                include: { vehicles: true },
            });
            return res.json(drivers);
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }
}
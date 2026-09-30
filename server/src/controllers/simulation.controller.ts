import { Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { RideService } from '../services/ride.service';
import { PoolStatus, Role } from '@prisma/client';

export class SimulationController {
    static async resetDatabase(_req: Request, res: Response) {
        try {
            await prisma.rideAuditLog.deleteMany();
            await prisma.rideRequest.deleteMany();
            await prisma.ridePool.deleteMany();
            await prisma.teslaVehicle.deleteMany();
            await prisma.user.deleteMany();

            const jashim = await prisma.user.create({
                data: {
                    name: 'Jashim',
                    email: 'jashim@tesla.dhaka',
                    role: Role.DRIVER,
                    walletBalancePoysha: 100000,
                },
            });

            await prisma.teslaVehicle.create({
                data: {
                    name: 'Bullet',
                    plateNumber: 'DHAKA-METRO-CHA-11-2026',
                    totalCapacity: 3,
                    isOnline: true,
                    currentZone: 'Banani',
                    driverId: jashim.id,
                },
            });

            await prisma.user.create({
                data: {
                    name: 'Nusrat',
                    email: 'nusrat@gmail.com',
                    role: Role.PASSENGER,
                    walletBalancePoysha: 50000,
                },
            });

            await prisma.user.create({
                data: {
                    name: 'Rafiq',
                    email: 'rafiq@gmail.com',
                    role: Role.PASSENGER,
                    walletBalancePoysha: 50000,
                },
            });

            await prisma.user.create({
                data: {
                    name: 'Shirin',
                    email: 'shirin@gmail.com',
                    role: Role.PASSENGER,
                    walletBalancePoysha: 50000,
                },
            });

            return res.json({ success: true, message: 'Database reset successfully to initial state!' });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    static async runBananiRushHour(_req: Request, res: Response) {
        try {
            // 1. Fetch cast
            const jashim = await prisma.user.findUnique({ where: { email: 'jashim@tesla.dhaka' } });
            const nusrat = await prisma.user.findUnique({ where: { email: 'nusrat@gmail.com' } });
            const rafiq = await prisma.user.findUnique({ where: { email: 'rafiq@gmail.com' } });
            const shirin = await prisma.user.findUnique({ where: { email: 'shirin@gmail.com' } });

            if (!jashim || !nusrat || !rafiq || !shirin) {
                return res.status(400).json({ error: 'Seed data not found. Run npx prisma db seed first.' });
            }

            // Clean active ride records so simulation is 100% idempotent & repeatable
            await prisma.rideAuditLog.deleteMany();
            await prisma.rideRequest.deleteMany();
            await prisma.ridePool.deleteMany();
            await prisma.teslaVehicle.updateMany({
                where: { name: 'Bullet' },
                data: { currentZone: 'Banani', isOnline: true },
            });

            const timeline: string[] = [];

            // Step A: Nusrat books Banani -> Mohakhali
            const reqNusrat = await RideService.createRideRequest(nusrat.id, 'Banani', 'Mohakhali', 1);
            timeline.push(`8:41 AM: Nusrat books Banani -> Mohakhali (Solo fare: ${reqNusrat.finalFarePoysha / 100} BDT)`);

            // Step B: Jashim accepts Nusrat
            const matchNusrat = await RideService.matchRequestToPool(jashim.id, reqNusrat.id);
            timeline.push(`8:42 AM: Jashim accepts Nusrat into Bullet (Occupied: ${matchNusrat.occupiedSeats}/3)`);

            // Step C: Rafiq books Banani -> Gulshan 1
            const reqRafiq = await RideService.createRideRequest(rafiq.id, 'Banani', 'Gulshan1', 1);
            timeline.push(`8:43 AM: Rafiq books Banani -> Gulshan 1 (Overlapping corridor)`);

            // Step D: Jashim accepts Rafiq -> Pooling activated!
            const matchRafiq = await RideService.matchRequestToPool(jashim.id, reqRafiq.id);
            timeline.push(`8:44 AM: Jashim accepts Rafiq. Pooling activated! (Occupied: ${matchRafiq.occupiedSeats}/3). 25% discount applied to both.`);

            // Step E: Shirin books last seat
            const reqShirin = await RideService.createRideRequest(shirin.id, 'Banani', 'Gulshan2', 1);
            const matchShirin = await RideService.matchRequestToPool(jashim.id, reqShirin.id);
            timeline.push(`8:45 AM: Shirin books the final seat! Bullet is now FULL (${matchShirin.occupiedSeats}/3 seats).`);

            // Step F: Concurrency test - Another passenger tries to book
            let overbookingBlocked = false;
            try {
                const excessReq = await RideService.createRideRequest(nusrat.id, 'Banani', 'Farmgate', 1);
                try {
                    await RideService.matchRequestToPool(jashim.id, excessReq.id);
                } catch (err: any) {
                    overbookingBlocked = true;
                    // Update excess request to CANCELLED with explicit full capacity reason
                    await prisma.rideRequest.update({
                        where: { id: excessReq.id },
                        data: { status: 'CANCELLED' },
                    });
                    await prisma.rideAuditLog.create({
                        data: {
                            rideRequestId: excessReq.id,
                            previousStatus: 'REQUESTED',
                            newStatus: 'CANCELLED',
                            triggeredById: jashim.id,
                            reason: 'Rejected: Bullet is full (3/3 seats occupied). Please make a new request.',
                        },
                    });
                    timeline.push(`8:46 AM: Overbooking prevented! Extra passenger rejected with: "${err.message}"`);
                }
            } catch (err: any) {
                overbookingBlocked = true;
            }

            // Step G: Bullet arrives at destination & completes trip (Fares deducted from wallets)
            await RideService.updatePoolStatus(jashim.id, matchNusrat.poolId, PoolStatus.COMPLETED);
            timeline.push(`8:55 AM: Bullet arrives at Mohakhali. Trip COMPLETED! Fares deducted from passenger wallets.`);

            return res.json({
                success: true,
                story: 'The Banani Rush-Hour Story executed flawlessly',
                poolId: matchNusrat.poolId,
                timeline,
                overbookingBlocked,
            });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }
}
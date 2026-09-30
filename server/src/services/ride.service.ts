import { Prisma, PoolStatus, RideRequestStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { calculateFare } from './fare.service';
import { areTripsCompatible } from './geography.service';

// Custom Domain Errors for clean HTTP status handling
export class ConcurrencyConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConcurrencyConflictError';
    }
}

export class InvalidStateTransitionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidStateTransitionError';
    }
}

export class UnauthorizedRideAccessError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnauthorizedRideAccessError';
    }
}

// Valid Lifecycle Transitions State Machine
const VALID_REQUEST_TRANSITIONS: Record<RideRequestStatus, RideRequestStatus[]> = {
    [RideRequestStatus.REQUESTED]: [RideRequestStatus.MATCHED, RideRequestStatus.CANCELLED],
    [RideRequestStatus.MATCHED]: [RideRequestStatus.DRIVER_ARRIVED, RideRequestStatus.CANCELLED],
    [RideRequestStatus.DRIVER_ARRIVED]: [RideRequestStatus.IN_PROGRESS, RideRequestStatus.CANCELLED],
    [RideRequestStatus.IN_PROGRESS]: [RideRequestStatus.COMPLETED], // Cancellation NOT allowed once started
    [RideRequestStatus.COMPLETED]: [],
    [RideRequestStatus.CANCELLED]: [],
};

export class RideService {
    /**
     * Passenger creates a new ride request
     */
    static async createRideRequest(
        passengerId: string,
        pickupZone: string,
        destinationZone: string,
        requestedSeats: number = 1
    ) {
        if (requestedSeats < 1 || requestedSeats > 3) {
            throw new Error('Requested seats must be between 1 and 3');
        }

        const initialFare = calculateFare(pickupZone, destinationZone, false);

        const request = await prisma.rideRequest.create({
            data: {
                passengerId,
                pickupZone,
                destinationZone,
                requestedSeats,
                status: RideRequestStatus.REQUESTED,
                baseFarePoysha: initialFare.baseFarePoysha,
                distanceChargePoysha: initialFare.distanceChargePoysha,
                poolDiscountPoysha: 0,
                finalFarePoysha: initialFare.finalFarePoysha,
            },
            include: { passenger: true },
        });

        // Create initial audit log
        await prisma.rideAuditLog.create({
            data: {
                rideRequestId: request.id,
                previousStatus: 'NONE',
                newStatus: RideRequestStatus.REQUESTED,
                triggeredById: passengerId,
                reason: 'Passenger requested ride',
            },
        });

        return request;
    }

    /**
     * Driver accepts a ride request into an active pool (or creates a new pool).
     * 
     * SOLVES THE CONCURRENCY PROBLEM (Section 12):
     * Uses an atomic database transaction with PostgreSQL Row-Level Lock (`FOR UPDATE`)
     * to guarantee that if 2 requests arrive at the same millisecond for the last seat,
     * one will succeed and the second will receive a 409 ConcurrencyConflictError.
     */
    static async matchRequestToPool(
        driverId: string,
        requestId: string
    ) {
        return await prisma.$transaction(async (tx) => {
            // 1. Fetch driver & vehicle
            const vehicle = await tx.teslaVehicle.findFirst({
                where: { driverId, isOnline: true },
            });
            if (!vehicle) {
                throw new Error('Driver is offline or has no registered Tesla');
            }

            // 2. Fetch the ride request
            const request = await tx.rideRequest.findUnique({
                where: { id: requestId },
                include: { passenger: true },
            });

            if (!request) {
                throw new Error('Ride request not found');
            }

            if (request.status !== RideRequestStatus.REQUESTED) {
                throw new InvalidStateTransitionError(
                    `Cannot match request with status ${request.status}`
                );
            }

            // 3. Find or create active RidePool for this driver
            let pool = await tx.ridePool.findFirst({
                where: {
                    driverId,
                    status: { in: [PoolStatus.IDLE, PoolStatus.ASSIGNED, PoolStatus.DRIVER_ARRIVED] },
                },
            });

            if (!pool) {
                // Create new pool
                pool = await tx.ridePool.create({
                    data: {
                        driverId,
                        vehicleId: vehicle.id,
                        status: PoolStatus.ASSIGNED,
                        maxCapacity: vehicle.totalCapacity, // 3 seats
                        occupiedSeats: 0,
                        routeCorridor: `${request.pickupZone}_CORRIDOR`,
                    },
                });
            }

            // 4. CRITICAL: Row-Level Lock on the RidePool row (`SELECT ... FOR UPDATE`)
            // Prevents concurrent writes from corrupting seat count
            const lockedPool = await tx.$queryRaw<Array<{ id: string; occupiedSeats: number; maxCapacity: number }>>`
        SELECT id, "occupiedSeats", "maxCapacity" 
        FROM "RidePool" 
        WHERE id = ${pool.id} 
        FOR UPDATE
      `;

            if (!lockedPool || lockedPool.length === 0) {
                throw new Error('Failed to acquire pool lock');
            }

            const currentOccupied = lockedPool[0].occupiedSeats;
            const maxCapacity = lockedPool[0].maxCapacity;

            // 5. Enforce Capacity Constraint
            if (currentOccupied + request.requestedSeats > maxCapacity) {
                throw new ConcurrencyConflictError(
                    `Cannot book ${request.requestedSeats} seat(s). Only ${maxCapacity - currentOccupied} seat(s) available in Bullet.`
                );
            }

            // 6. Update pool occupancy
            const newOccupiedSeats = currentOccupied + request.requestedSeats;
            await tx.ridePool.update({
                where: { id: pool.id },
                data: {
                    occupiedSeats: newOccupiedSeats,
                    status: PoolStatus.ASSIGNED,
                },
            });

            // 7. Update the ride request to MATCHED
            const updatedRequest = await tx.rideRequest.update({
                where: { id: request.id },
                data: {
                    poolId: pool.id,
                    status: RideRequestStatus.MATCHED,
                },
            });

            // 8. Recalculate Fares for all pooled passengers (apply 25% discount if multiple requests)
            const allActiveRequests = await tx.rideRequest.findMany({
                where: { poolId: pool.id, status: { notIn: [RideRequestStatus.CANCELLED] } },
            });

            const isPooled = allActiveRequests.length > 1;

            for (const req of allActiveRequests) {
                const fare = calculateFare(req.pickupZone, req.destinationZone, isPooled);
                await tx.rideRequest.update({
                    where: { id: req.id },
                    data: {
                        poolDiscountPoysha: fare.poolDiscountPoysha,
                        finalFarePoysha: fare.finalFarePoysha,
                    },
                });
            }

            // 9. Audit Log
            await tx.rideAuditLog.create({
                data: {
                    rideRequestId: request.id,
                    poolId: pool.id,
                    previousStatus: RideRequestStatus.REQUESTED,
                    newStatus: RideRequestStatus.MATCHED,
                    triggeredById: driverId,
                    reason: `Driver assigned request to pool (Occupancy: ${newOccupiedSeats}/${maxCapacity})`,
                },
            });

            // 9b. When Bullet reaches full capacity (occupiedSeats >= maxCapacity),
            // automatically reject all remaining pending requests in the incoming queue
            if (newOccupiedSeats >= maxCapacity) {
                const excessPending = await tx.rideRequest.findMany({
                    where: {
                        status: RideRequestStatus.REQUESTED,
                        id: { not: request.id },
                    },
                });

                for (const pending of excessPending) {
                    await tx.rideRequest.update({
                        where: { id: pending.id },
                        data: { status: RideRequestStatus.CANCELLED },
                    });

                    await tx.rideAuditLog.create({
                        data: {
                            rideRequestId: pending.id,
                            previousStatus: RideRequestStatus.REQUESTED,
                            newStatus: RideRequestStatus.CANCELLED,
                            triggeredById: driverId,
                            reason: 'Rejected: Bullet is full (3/3 seats occupied). Please make a new request.',
                        },
                    });
                }
            }

            return { poolId: pool.id, request: updatedRequest, occupiedSeats: newOccupiedSeats };
        });
    }

    /**
     * Driver updates the trip status (DRIVER_ARRIVED -> STARTED -> COMPLETED)
     */
    static async updatePoolStatus(driverId: string, poolId: string, targetStatus: PoolStatus) {
        return await prisma.$transaction(async (tx) => {
            const pool = await tx.ridePool.findUnique({
                where: { id: poolId },
                include: { requests: true },
            });

            if (!pool) {
                throw new Error('Ride pool not found');
            }

            if (pool.driverId !== driverId) {
                throw new UnauthorizedRideAccessError('You are not the assigned driver for this pool');
            }

            // Determine corresponding request status
            let targetRequestStatus: RideRequestStatus;
            let startedAt: Date | undefined;
            let completedAt: Date | undefined;

            if (targetStatus === PoolStatus.DRIVER_ARRIVED) {
                targetRequestStatus = RideRequestStatus.DRIVER_ARRIVED;
            } else if (targetStatus === PoolStatus.STARTED) {
                targetRequestStatus = RideRequestStatus.IN_PROGRESS;
                startedAt = new Date();
            } else if (targetStatus === PoolStatus.COMPLETED) {
                targetRequestStatus = RideRequestStatus.COMPLETED;
                completedAt = new Date();
            } else {
                throw new InvalidStateTransitionError(`Unsupported target status: ${targetStatus}`);
            }

            // Validate transitions for all active requests
            for (const req of pool.requests) {
                if (req.status === RideRequestStatus.CANCELLED) continue;

                const allowed = VALID_REQUEST_TRANSITIONS[req.status];
                if (!allowed.includes(targetRequestStatus)) {
                    throw new InvalidStateTransitionError(
                        `Invalid state transition: Cannot change request from ${req.status} to ${targetRequestStatus}`
                    );
                }

                // Update request status
                await tx.rideRequest.update({
                    where: { id: req.id },
                    data: {
                        status: targetRequestStatus,
                        paymentStatus:
                            targetRequestStatus === RideRequestStatus.COMPLETED
                                ? PaymentStatus.PAID
                                : req.paymentStatus,
                    },
                });

                // Audit log for request
                await tx.rideAuditLog.create({
                    data: {
                        rideRequestId: req.id,
                        poolId: pool.id,
                        previousStatus: req.status,
                        newStatus: targetRequestStatus,
                        triggeredById: driverId,
                        reason: `Driver transitioned pool to ${targetStatus}`,
                    },
                });
            }

            // Update pool
            const updatedPool = await tx.ridePool.update({
                where: { id: poolId },
                data: {
                    status: targetStatus,
                    startedAt: startedAt || pool.startedAt,
                    completedAt: completedAt || pool.completedAt,
                },
                include: { requests: true },
            });

            // When driver starts arrival or trip, auto-reject any unassigned pending requests in queue
            if (targetStatus === PoolStatus.DRIVER_ARRIVED || targetStatus === PoolStatus.STARTED) {
                const unassignedRequests = await tx.rideRequest.findMany({
                    where: { status: RideRequestStatus.REQUESTED },
                });
                for (const pending of unassignedRequests) {
                    await tx.rideRequest.update({
                        where: { id: pending.id },
                        data: { status: RideRequestStatus.CANCELLED },
                    });
                    await tx.rideAuditLog.create({
                        data: {
                            rideRequestId: pending.id,
                            previousStatus: RideRequestStatus.REQUESTED,
                            newStatus: RideRequestStatus.CANCELLED,
                            triggeredById: driverId,
                            reason: 'Rejected: Bullet is full & en route (3/3 seats occupied). Please make a new request.',
                        },
                    });
                }
            }

            // Physical Continuity: If trip completes, Bullet's location moves to the last passenger dropoff zone!
            if (targetStatus === PoolStatus.COMPLETED) {
                const activeRequests = pool.requests.filter(r => r.status !== RideRequestStatus.CANCELLED);
                const finalDestination = activeRequests.length > 0 
                    ? activeRequests[activeRequests.length - 1].destinationZone 
                    : 'Mohakhali';
                
                await tx.teslaVehicle.update({
                    where: { id: pool.vehicleId },
                    data: { currentZone: finalDestination }
                });
            }

            return updatedPool;
        });
    }

    /**
     * Driver explicitly rejects an incoming ride request (e.g. Bullet full)
     */
    static async rejectRideRequest(
        driverId: string,
        requestId: string,
        reason: string = 'Rejected: Bullet is full (3/3 seats occupied). Please make a new request.'
    ) {
        return await prisma.$transaction(async (tx) => {
            const request = await tx.rideRequest.findUnique({
                where: { id: requestId },
            });

            if (!request) {
                throw new Error('Ride request not found');
            }

            if (request.status !== RideRequestStatus.REQUESTED) {
                throw new InvalidStateTransitionError(`Cannot reject a request in ${request.status} status`);
            }

            const updated = await tx.rideRequest.update({
                where: { id: requestId },
                data: { status: RideRequestStatus.CANCELLED },
            });

            await tx.rideAuditLog.create({
                data: {
                    rideRequestId: requestId,
                    previousStatus: RideRequestStatus.REQUESTED,
                    newStatus: RideRequestStatus.CANCELLED,
                    triggeredById: driverId,
                    reason,
                },
            });

            return updated;
        });
    }

    /**
     * Passenger cancels a ride request
     * (Allowed only before the trip is STARTED)
     */
    static async cancelRideRequest(passengerId: string, requestId: string, reason: string = 'User cancelled') {
        return await prisma.$transaction(async (tx) => {
            const request = await tx.rideRequest.findUnique({
                where: { id: requestId },
                include: { pool: true },
            });

            if (!request) {
                throw new Error('Ride request not found');
            }

            if (request.passengerId !== passengerId) {
                throw new UnauthorizedRideAccessError('You do not own this ride request');
            }

            // Check if cancellation is allowed
            const allowed = VALID_REQUEST_TRANSITIONS[request.status];
            if (!allowed.includes(RideRequestStatus.CANCELLED)) {
                throw new InvalidStateTransitionError(
                    `Cannot cancel a ride that has already started or completed (Current status: ${request.status})`
                );
            }

            // Update request status to CANCELLED
            const updated = await tx.rideRequest.update({
                where: { id: requestId },
                data: { status: RideRequestStatus.CANCELLED },
            });

            // If it was assigned to a pool, release the seats!
            if (request.poolId && request.pool) {
                const remainingOccupied = Math.max(0, request.pool.occupiedSeats - request.requestedSeats);
                await tx.ridePool.update({
                    where: { id: request.poolId },
                    data: { occupiedSeats: remainingOccupied },
                });

                // Recalculate fares for remaining passengers
                const remainingRequests = await tx.rideRequest.findMany({
                    where: {
                        poolId: request.poolId,
                        id: { not: requestId },
                        status: { notIn: [RideRequestStatus.CANCELLED] },
                    },
                });

                const isStillPooled = remainingRequests.length > 1;
                for (const req of remainingRequests) {
                    const fare = calculateFare(req.pickupZone, req.destinationZone, isStillPooled);
                    await tx.rideRequest.update({
                        where: { id: req.id },
                        data: {
                            poolDiscountPoysha: fare.poolDiscountPoysha,
                            finalFarePoysha: fare.finalFarePoysha,
                        },
                    });
                }
            }

            // Audit Log
            await tx.rideAuditLog.create({
                data: {
                    rideRequestId: requestId,
                    poolId: request.poolId,
                    previousStatus: request.status,
                    newStatus: RideRequestStatus.CANCELLED,
                    triggeredById: passengerId,
                    reason,
                },
            });

            return updated;
        });
    }
}
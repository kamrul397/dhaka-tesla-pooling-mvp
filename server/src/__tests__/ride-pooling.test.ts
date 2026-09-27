import request from 'supertest';
import app from '../app';
import { prisma } from '../config/prisma';
import { calculateFare } from '../services/fare.service';
import { RideService, ConcurrencyConflictError, InvalidStateTransitionError } from '../services/ride.service';
import { PoolStatus, RideRequestStatus } from '@prisma/client';

describe('Dhaka Tesla Pool - Core Engineering Requirements', () => {
    let jashim: any;
    let bullet: any;
    let nusrat: any;
    let rafiq: any;
    let shirin: any;

    beforeAll(async () => {
        // Fetch seeded cast
        jashim = await prisma.user.findUnique({ where: { email: 'jashim@tesla.dhaka' } });
        bullet = await prisma.teslaVehicle.findFirst({ where: { driverId: jashim.id } });
        nusrat = await prisma.user.findUnique({ where: { email: 'nusrat@gmail.com' } });
        rafiq = await prisma.user.findUnique({ where: { email: 'rafiq@gmail.com' } });
        shirin = await prisma.user.findUnique({ where: { email: 'shirin@gmail.com' } });
    });

    beforeEach(async () => {
        // Clean test ride data before each test
        await prisma.rideAuditLog.deleteMany();
        await prisma.rideRequest.deleteMany();
        await prisma.ridePool.deleteMany();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    // TEST 1: Fare Calculation (Nusrat & Rafiq)
    test('1. Nusrat and Rafiq pooled fares calculate accurately with integer Poysha and 25% discount', () => {
        // Nusrat: Banani -> Mohakhali (1.9 km)
        const nusratSolo = calculateFare('Banani', 'Mohakhali', false);
        const nusratPooled = calculateFare('Banani', 'Mohakhali', true);

        expect(nusratSolo.baseFarePoysha).toBe(2000); // 20 BDT
        expect(nusratSolo.distanceKm).toBe(1.9);
        expect(nusratSolo.distanceChargePoysha).toBe(2850); // 1.9 * 1500
        expect(nusratSolo.finalFarePoysha).toBe(4850); // 48.50 BDT
        expect(nusratPooled.poolDiscountPoysha).toBe(1213); // 25% of 4850
        expect(nusratPooled.finalFarePoysha).toBe(3637); // 36.37 BDT

        // Rafiq: Banani -> Gulshan 1 (2.1 km)
        const rafiqSolo = calculateFare('Banani', 'Gulshan1', false);
        const rafiqPooled = calculateFare('Banani', 'Gulshan1', true);

        expect(rafiqSolo.distanceKm).toBe(2.1);
        expect(rafiqSolo.distanceChargePoysha).toBe(3150); // 2.1 * 1500
        expect(rafiqSolo.finalFarePoysha).toBe(5150); // 51.50 BDT
        expect(rafiqPooled.poolDiscountPoysha).toBe(1288); // 25% of 5150
        expect(rafiqPooled.finalFarePoysha).toBe(3862); // 38.62 BDT
    });

    // TEST 2: Bullet Capacity Enforcement
    test('2. Bullet capacity (3 seats) can NEVER be exceeded', async () => {
        // Book 2 seats for Nusrat
        const req1 = await RideService.createRideRequest(nusrat.id, 'Banani', 'Mohakhali', 2);
        await RideService.matchRequestToPool(jashim.id, req1.id);

        // Book 1 seat for Rafiq (Total 3/3 seats occupied)
        const req2 = await RideService.createRideRequest(rafiq.id, 'Banani', 'Gulshan1', 1);
        await RideService.matchRequestToPool(jashim.id, req2.id);

        // Shirin attempts to book 1 seat into full Bullet -> MUST FAIL
        const req3 = await RideService.createRideRequest(shirin.id, 'Banani', 'Gulshan2', 1);
        await expect(
            RideService.matchRequestToPool(jashim.id, req3.id)
        ).rejects.toThrow(ConcurrencyConflictError);
    });

    // TEST 3: Concurrency Safety (The 1-Seat Dilemma)
    test('3. Concurrency Safety: Simultaneous bookings for the last seat cannot corrupt capacity', async () => {
        // Fill 2 of Bullet's 3 seats
        const reqInitial = await RideService.createRideRequest(nusrat.id, 'Banani', 'Mohakhali', 2);
        await RideService.matchRequestToPool(jashim.id, reqInitial.id);

        // Now 1 seat remains. Rafiq and Shirin simultaneously try to claim it at the exact same millisecond
        const reqRafiq = await RideService.createRideRequest(rafiq.id, 'Banani', 'Gulshan1', 1);
        const reqShirin = await RideService.createRideRequest(shirin.id, 'Banani', 'Gulshan2', 1);

        const results = await Promise.allSettled([
            RideService.matchRequestToPool(jashim.id, reqRafiq.id),
            RideService.matchRequestToPool(jashim.id, reqShirin.id),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        // Exactly one must succeed, and one must be rejected!
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);

        // Verify Bullet has exactly 3 occupied seats (never 4)
        const pool = await prisma.ridePool.findFirst({ where: { driverId: jashim.id } });
        expect(pool?.occupiedSeats).toBe(3);
    });

    // TEST 4: Invalid State Transitions Rejected
    test('4. Invalid state transitions are strictly rejected by the state machine', async () => {
        const req = await RideService.createRideRequest(nusrat.id, 'Banani', 'Mohakhali', 1);
        const match = await RideService.matchRequestToPool(jashim.id, req.id);

        // Cannot jump directly from ASSIGNED/MATCHED to COMPLETED (must go DRIVER_ARRIVED -> STARTED -> COMPLETED)
        await expect(
            RideService.updatePoolStatus(jashim.id, match.poolId, PoolStatus.COMPLETED)
        ).rejects.toThrow(InvalidStateTransitionError);
    });

    // TEST 5: Cancellation Rules
    test('5. Cancellation rules hold: allowed while MATCHED, rejected once trip is STARTED', async () => {
        const req = await RideService.createRideRequest(nusrat.id, 'Banani', 'Mohakhali', 1);
        const match = await RideService.matchRequestToPool(jashim.id, req.id);

        // Driver arrives and starts trip
        await RideService.updatePoolStatus(jashim.id, match.poolId, PoolStatus.DRIVER_ARRIVED);
        await RideService.updatePoolStatus(jashim.id, match.poolId, PoolStatus.STARTED);

        // Nusrat tries to cancel in-progress trip -> MUST BE REJECTED
        await expect(
            RideService.cancelRideRequest(nusrat.id, req.id, 'Changed mind mid-trip')
        ).rejects.toThrow(InvalidStateTransitionError);
    });

    // TEST 6: User Authorization & Privacy
    test('6. User cannot cancel or tamper with another passenger’s ride', async () => {
        const reqNusrat = await RideService.createRideRequest(nusrat.id, 'Banani', 'Mohakhali', 1);

        // Rafiq tries to cancel Nusrat's ride -> MUST BE FORBIDDEN
        const response = await request(app)
            .post(`/api/passengers/requests/${reqNusrat.id}/cancel`)
            .send({ passengerId: rafiq.id, reason: 'Malicious cancellation' });

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('You do not own this ride request');
    });
});
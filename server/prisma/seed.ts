import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding Dhaka Tesla Pool cast into PostgreSQL...');

    // Clean old rows if any exist so seed is reproducible
    await prisma.rideAuditLog.deleteMany();
    await prisma.rideRequest.deleteMany();
    await prisma.ridePool.deleteMany();
    await prisma.teslaVehicle.deleteMany();
    await prisma.user.deleteMany();

    // 1. Driver: Jashim
    const jashim = await prisma.user.create({
        data: {
            name: 'Jashim',
            email: 'jashim@tesla.dhaka',
            role: Role.DRIVER,
            walletBalancePoysha: 100000, // 1000 BDT in integer Poysha
        },
    });

    // 2. Jashim's Electric Tesla: Bullet (Strict Capacity: 3 Seats)
    const bullet = await prisma.teslaVehicle.create({
        data: {
            name: 'Bullet',
            plateNumber: 'DHAKA-METRO-CHA-11-2026',
            totalCapacity: 3, // Capacity = 3 (Key assessment constraint!)
            isOnline: true,
            currentZone: 'Banani',
            driverId: jashim.id,
        },
    });

    // 3. Passengers: Nusrat, Rafiq, and Shirin
    const nusrat = await prisma.user.create({
        data: {
            name: 'Nusrat',
            email: 'nusrat@gmail.com',
            role: Role.PASSENGER,
            walletBalancePoysha: 50000, // 500 BDT
        },
    });

    const rafiq = await prisma.user.create({
        data: {
            name: 'Rafiq',
            email: 'rafiq@gmail.com',
            role: Role.PASSENGER,
            walletBalancePoysha: 50000, // 500 BDT
        },
    });

    const shirin = await prisma.user.create({
        data: {
            name: 'Shirin',
            email: 'shirin@gmail.com',
            role: Role.PASSENGER,
            walletBalancePoysha: 50000, // 500 BDT
        },
    });

    console.log('✅ Seeding completed:');
    console.log(`  Driver: ${jashim.name} (${jashim.email})`);
    console.log(`  Tesla: ${bullet.name} (Capacity: ${bullet.totalCapacity}, Plate: ${bullet.plateNumber})`);
    console.log(`  Passengers: ${nusrat.name}, ${rafiq.name}, ${shirin.name}`);
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
import { calculateDistanceKm } from './geography.service';

export interface FareBreakdown {
    distanceKm: number;
    baseFarePoysha: number;       // Integer Poysha (20 BDT = 2000 Poysha)
    distanceChargePoysha: number; // 15 BDT/km = 1500 Poysha/km
    poolDiscountPoysha: number;   // 25% discount when shared
    finalFarePoysha: number;
    finalFareBdt: number;         // For UI display convenience (farePoysha / 100)
    isPooled: boolean;
}

export const BASE_FARE_POYSHA = 2000;         // 20.00 BDT
export const RATE_PER_KM_POYSHA = 1500;       // 15.00 BDT / km
export const POOL_DISCOUNT_PERCENTAGE = 0.25; // 25% discount

/**
 * Calculates fare strictly using integer arithmetic (in Poysha)
 * to avoid IEEE 754 floating-point errors (e.g., 0.1 + 0.2 !== 0.3)
 */
export function calculateFare(
    pickupZone: string,
    destinationZone: string,
    isPooled: boolean = false
): FareBreakdown {
    const distanceKm = calculateDistanceKm(pickupZone, destinationZone);

    const baseFarePoysha = BASE_FARE_POYSHA;
    const distanceChargePoysha = Math.round(distanceKm * RATE_PER_KM_POYSHA);
    const subtotalPoysha = baseFarePoysha + distanceChargePoysha;

    const poolDiscountPoysha = isPooled
        ? Math.round(subtotalPoysha * POOL_DISCOUNT_PERCENTAGE)
        : 0;

    const finalFarePoysha = subtotalPoysha - poolDiscountPoysha;

    return {
        distanceKm,
        baseFarePoysha,
        distanceChargePoysha,
        poolDiscountPoysha,
        finalFarePoysha,
        finalFareBdt: finalFarePoysha / 100,
        isPooled,
    };
}
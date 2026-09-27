export interface DhakaZone {
    id: string;
    name: string;
    lat: number;
    lng: number;
    corridor: string;
}

export const DHAKA_ZONES: Record<string, DhakaZone> = {
    Banani: {
        id: 'Banani',
        name: 'Banani',
        lat: 23.7937,
        lng: 90.4066,
        corridor: 'BANANI_CORRIDOR',
    },
    Mohakhali: {
        id: 'Mohakhali',
        name: 'Mohakhali',
        lat: 23.7776,
        lng: 90.4005,
        corridor: 'BANANI_CORRIDOR', // Compatible with Banani
    },
    Gulshan1: {
        id: 'Gulshan1',
        name: 'Gulshan 1',
        lat: 23.7785,
        lng: 90.4182,
        corridor: 'BANANI_CORRIDOR', // Compatible with Banani & Mohakhali
    },
    Gulshan2: {
        id: 'Gulshan2',
        name: 'Gulshan 2',
        lat: 23.7949,
        lng: 90.4143,
        corridor: 'BANANI_CORRIDOR',
    },
    Farmgate: {
        id: 'Farmgate',
        name: 'Farmgate',
        lat: 23.7561,
        lng: 90.3872,
        corridor: 'CENTRAL_CORRIDOR',
    },
    Dhanmondi: {
        id: 'Dhanmondi',
        name: 'Dhanmondi',
        lat: 23.7461,
        lng: 90.3742,
        corridor: 'WEST_CORRIDOR',
    },
    Uttara: {
        id: 'Uttara',
        name: 'Uttara',
        lat: 23.8759,
        lng: 90.3795,
        corridor: 'NORTH_CORRIDOR',
    },
    Mirpur: {
        id: 'Mirpur',
        name: 'Mirpur',
        lat: 23.807,
        lng: 90.3686,
        corridor: 'NORTH_WEST_CORRIDOR',
    },
};

/**
 * Calculates straight-line distance in kilometers using the Haversine formula
 */
export function calculateDistanceKm(pickupZoneName: string, dropoffZoneName: string): number {
    const pickup = DHAKA_ZONES[pickupZoneName];
    const dropoff = DHAKA_ZONES[dropoffZoneName];

    if (!pickup || !dropoff) {
        return 3.0; // Default fallback distance if arbitrary zone is entered
    }

    if (pickup.id === dropoff.id) {
        return 0.5; // Short local trip
    }

    const R = 6371; // Earth radius in km
    const dLat = ((dropoff.lat - pickup.lat) * Math.PI) / 180;
    const dLng = ((dropoff.lng - pickup.lng) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((pickup.lat * Math.PI) / 180) *
        Math.cos((dropoff.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Round to 1 decimal place
    return Math.round(distance * 10) / 10;
}

/**
 * Matching Rule:
 * Two trips are compatible to pool together if:
 * 1. They share the same pickup zone (e.g. Banani), OR
 * 2. Their pickup and dropoffs belong to the same corridor (BANANI_CORRIDOR).
 */
export function areTripsCompatible(
    pickupA: string,
    dropoffA: string,
    pickupB: string,
    dropoffB: string
): boolean {
    // If same pickup hub, easy match (e.g. Banani -> Mohakhali & Banani -> Gulshan 1)
    if (pickupA === pickupB) {
        return true;
    }

    const zoneA1 = DHAKA_ZONES[pickupA];
    const zoneA2 = DHAKA_ZONES[dropoffA];
    const zoneB1 = DHAKA_ZONES[pickupB];
    const zoneB2 = DHAKA_ZONES[dropoffB];

    if (zoneA1 && zoneA2 && zoneB1 && zoneB2) {
        return zoneA1.corridor === zoneB1.corridor && zoneA2.corridor === zoneB2.corridor;
    }

    return false;
}
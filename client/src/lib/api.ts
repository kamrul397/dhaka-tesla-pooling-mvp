const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function fetchPassengers() {
    const res = await fetch(`${API_BASE}/passengers`);
    if (!res.ok) throw new Error('Failed to fetch passengers');
    return res.json();
}

export async function fetchDrivers() {
    const res = await fetch(`${API_BASE}/drivers`);
    if (!res.ok) throw new Error('Failed to fetch drivers');
    return res.json();
}

export async function fetchDriverDashboard(driverId: string) {
    const res = await fetch(`${API_BASE}/drivers/${driverId}/dashboard`);
    if (!res.ok) throw new Error('Failed to fetch driver dashboard');
    return res.json();
}

export async function fetchAvailableRequests() {
    const res = await fetch(`${API_BASE}/drivers/requests/available`);
    if (!res.ok) throw new Error('Failed to fetch available requests');
    return res.json();
}

export async function estimateFare(pickupZone: string, destinationZone: string) {
    const res = await fetch(
        `${API_BASE}/passengers/estimate?pickupZone=${pickupZone}&destinationZone=${destinationZone}`
    );
    if (!res.ok) throw new Error('Failed to estimate fare');
    return res.json();
}

export async function requestRide(data: {
    passengerId: string;
    pickupZone: string;
    destinationZone: string;
    requestedSeats: number;
}) {
    const res = await fetch(`${API_BASE}/passengers/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to request ride');
    }
    return res.json();
}

export async function cancelRide(requestId: string, passengerId: string, reason?: string) {
    const res = await fetch(`${API_BASE}/passengers/requests/${requestId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passengerId, reason: reason || 'Passenger cancelled' }),
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to cancel ride');
    }
    return res.json();
}

export async function fetchPassengerHistory(passengerId: string) {
    const res = await fetch(`${API_BASE}/passengers/${passengerId}/history`);
    if (!res.ok) throw new Error('Failed to fetch passenger history');
    return res.json();
}

export async function matchDriverRequest(driverId: string, requestId: string) {
    const res = await fetch(`${API_BASE}/drivers/pools/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, requestId }),
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to match request to pool');
    }
    return res.json();
}

export async function updatePoolStatus(poolId: string, driverId: string, status: string) {
    const res = await fetch(`${API_BASE}/drivers/pools/${poolId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, status }),
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update pool status');
    }
    return res.json();
}

export async function runSimulation() {
    const res = await fetch(`${API_BASE}/simulation/banani-rush-hour`, {
        method: 'POST',
    });
    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to run simulation');
    }
    return res.json();
}
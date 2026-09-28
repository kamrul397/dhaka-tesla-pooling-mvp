'use client';

import React, { useState, useEffect } from 'react';
import {
  Zap,
  Users,
  Car,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Ban,
  ArrowRight,
} from 'lucide-react';
import {
  fetchPassengers,
  fetchDrivers,
  fetchDriverDashboard,
  fetchAvailableRequests,
  estimateFare,
  requestRide,
  cancelRide,
  fetchPassengerHistory,
  matchDriverRequest,
  updatePoolStatus,
  runSimulation,
} from '../lib/api';

const DHAKA_ZONES = [
  'Banani',
  'Mohakhali',
  'Gulshan1',
  'Gulshan2',
  'Farmgate',
  'Dhanmondi',
  'Uttara',
  'Mirpur',
];

export default function DhakaTeslaApp() {
  // Global Data
  const [passengers, setPassengers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'passenger' | 'driver'>('passenger');

  // Selected Actors
  const [selectedPassengerId, setSelectedPassengerId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  // Passenger State
  const [pickupZone, setPickupZone] = useState<string>('Banani');
  const [destinationZone, setDestinationZone] = useState<string>('Mohakhali');
  const [requestedSeats, setRequestedSeats] = useState<number>(1);
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [passengerHistory, setPassengerHistory] = useState<any[]>([]);
  const [passengerLoading, setPassengerLoading] = useState<boolean>(false);

  // Driver State
  const [driverDashboard, setDriverDashboard] = useState<any>(null);
  const [availableRequests, setAvailableRequests] = useState<any[]>([]);

  // Simulation State
  const [simulationData, setSimulationData] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Initial Load
  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const pList = await fetchPassengers();
      const dList = await fetchDrivers();
      setPassengers(pList);
      setDrivers(dList);

      if (pList.length > 0) setSelectedPassengerId(pList[0].id); // Nusrat default
      if (dList.length > 0) setSelectedDriverId(dList[0].id); // Jashim default
    } catch (err: any) {
      console.error('Initialization error:', err);
    }
  }

  // Reload passenger history when passenger changes
  useEffect(() => {
    if (selectedPassengerId) {
      refreshPassengerData();
    }
  }, [selectedPassengerId]);

  // Reload driver dashboard when driver changes
  useEffect(() => {
    if (selectedDriverId) {
      refreshDriverData();
    }
  }, [selectedDriverId]);

  // Recalculate fare preview
  useEffect(() => {
    if (pickupZone && destinationZone) {
      estimateFare(pickupZone, destinationZone)
        .then(setFareEstimate)
        .catch(console.error);
    }
  }, [pickupZone, destinationZone]);

  async function refreshPassengerData() {
    if (!selectedPassengerId) return;
    try {
      const history = await fetchPassengerHistory(selectedPassengerId);
      setPassengerHistory(history);
    } catch (err) {
      console.error(err);
    }
  }

  async function refreshDriverData() {
    if (!selectedDriverId) return;
    try {
      const dash = await fetchDriverDashboard(selectedDriverId);
      const avail = await fetchAvailableRequests();
      setDriverDashboard(dash);
      setAvailableRequests(avail);
    } catch (err) {
      console.error(err);
    }
  }

  // Passenger Actions
  async function handleBookRide() {
    setPassengerLoading(true);
    setStatusMessage(null);
    try {
      await requestRide({
        passengerId: selectedPassengerId,
        pickupZone,
        destinationZone,
        requestedSeats,
      });
      setStatusMessage({ type: 'success', text: 'Tesla ride requested successfully!' });
      await refreshPassengerData();
      await refreshDriverData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setPassengerLoading(false);
    }
  }

  async function handleCancelRide(requestId: string) {
    try {
      await cancelRide(requestId, selectedPassengerId);
      setStatusMessage({ type: 'success', text: 'Ride cancelled and seat released.' });
      await refreshPassengerData();
      await refreshDriverData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // Driver Actions
  async function handleMatchRequest(requestId: string) {
    setStatusMessage(null);
    try {
      await matchDriverRequest(selectedDriverId, requestId);
      setStatusMessage({ type: 'success', text: 'Passenger accepted into Bullet pool!' });
      await refreshDriverData();
      await refreshPassengerData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  async function handleUpdateStatus(poolId: string, status: string) {
    try {
      await updatePoolStatus(poolId, selectedDriverId, status);
      setStatusMessage({ type: 'success', text: `Pool transitioned to ${status}` });
      await refreshDriverData();
      await refreshPassengerData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // 1-Click Simulation
  async function handleRunSimulation() {
    setSimulating(true);
    setStatusMessage(null);
    try {
      const result = await runSimulation();
      setSimulationData(result);
      setStatusMessage({ type: 'success', text: 'Banani Rush-Hour Story executed flawlessly!' });
      await refreshPassengerData();
      await refreshDriverData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setSimulating(false);
    }
  }

  const currentPassenger = passengers.find((p) => p.id === selectedPassengerId);
  const currentDriver = drivers.find((d) => d.id === selectedDriverId);
  const activePool = driverDashboard?.poolsAsDriver?.[0];
  const occupiedSeats = activePool?.occupiedSeats || 0;
  const maxCapacity = driverDashboard?.vehicles?.[0]?.totalCapacity || 3;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-300 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20 font-black text-xl">
              ⚡
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-white">Dhaka Tesla Pool</span>
                <span className="text-xs uppercase bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded border border-emerald-500/30">
                  MVP
                </span>
              </div>
              <p className="text-xs text-slate-400">Share a seat. Split the fare. Survive Dhaka traffic.</p>
            </div>
          </div>

          {/* Quick Simulation Trigger */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRunSimulation}
              disabled={simulating}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold rounded-lg shadow-lg shadow-orange-500/20 transition disabled:opacity-50 text-sm cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>{simulating ? 'Running Story...' : '🚀 1-Click Rush-Hour Story'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {statusMessage && (
        <div
          className={`px-4 py-3 border-b text-sm flex items-center justify-center space-x-2 ${statusMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/70 border-rose-800 text-rose-300'
            }`}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {/* Story Simulation Banner (if executed) */}
        {simulationData && (
          <div className="p-5 rounded-2xl bg-slate-800/80 border border-amber-500/30 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-amber-400 flex items-center space-x-2">
                <span>⚡ The Banani Rush-Hour Story Timeline</span>
              </h3>
              <button
                onClick={() => setSimulationData(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="space-y-1.5 text-xs text-slate-300 font-mono">
              {simulationData.timeline.map((line: string, i: number) => (
                <div key={i} className="flex items-start space-x-2">
                  <span className="text-amber-400 font-bold">›</span>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View Switcher Tabs */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('passenger')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${activeTab === 'passenger'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
            >
              <Users className="w-4 h-4" />
              <span>Passenger Portal (Nusrat, Rafiq, Shirin)</span>
            </button>
            <button
              onClick={() => setActiveTab('driver')}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition cursor-pointer ${activeTab === 'driver'
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
            >
              <Car className="w-4 h-4" />
              <span>Driver Portal (Jashim & Bullet)</span>
            </button>
          </div>

          {/* Actor Profile Selector */}
          <div className="flex items-center space-x-3 text-xs bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
            <span className="text-slate-400 font-medium">Switch Active Actor:</span>
            {activeTab === 'passenger' ? (
              <select
                value={selectedPassengerId}
                onChange={(e) => setSelectedPassengerId(e.target.value)}
                className="bg-slate-900 text-emerald-400 font-bold rounded px-2 py-1 border border-slate-700 focus:outline-none"
              >
                {passengers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.walletBalancePoysha / 100} BDT)
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="bg-slate-900 text-amber-400 font-bold rounded px-2 py-1 border border-slate-700 focus:outline-none"
              >
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} (Bullet Driver)
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* PASSENGER VIEW */}
        {activeTab === 'passenger' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Booking Form Card */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 space-y-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg text-white flex items-center space-x-2">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                  <span>Book a Tesla Easybike</span>
                </h2>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded">
                  Passenger: <strong className="text-white">{currentPassenger?.name}</strong>
                </span>
              </div>

              {/* Pickup & Dropoff Selectors */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Pickup Zone</label>
                  <select
                    value={pickupZone}
                    onChange={(e) => setPickupZone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {DHAKA_ZONES.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Destination Zone</label>
                  <select
                    value={destinationZone}
                    onChange={(e) => setDestinationZone(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  >
                    {DHAKA_ZONES.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Seats to Book</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRequestedSeats(num)}
                        className={`py-2 text-xs font-bold rounded-lg border transition ${requestedSeats === num
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                      >
                        {num} {num === 1 ? 'Seat' : 'Seats'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Fare Preview */}
              {fareEstimate && (
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 space-y-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Est. Distance</span>
                    <span className="font-semibold text-white">{fareEstimate.soloFare.distanceKm} km</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Solo Fare</span>
                    <span className="font-semibold text-white line-through">
                      {fareEstimate.soloFare.finalFareBdt} BDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                    <span className="font-bold text-emerald-400 flex items-center space-x-1">
                      <span>Pooled Fare (-25%)</span>
                    </span>
                    <span className="font-extrabold text-lg text-emerald-400">
                      {fareEstimate.pooledFare.finalFareBdt} BDT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 italic">
                    Calculated in integer Poysha: Base 20 BDT + (15 BDT/km) - 25% Pool Discount
                  </p>
                </div>
              )}

              <button
                onClick={handleBookRide}
                disabled={passengerLoading || pickupZone === destinationZone}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 text-sm cursor-pointer"
              >
                {passengerLoading ? 'Requesting Tesla...' : 'Request Ride'}
              </button>
            </div>

            {/* Passenger History & Active Trip Cards */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-base flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-emerald-400" />
                    <span>My Trips & Status ({currentPassenger?.name})</span>
                  </h3>
                  <button
                    onClick={refreshPassengerData}
                    className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>

                {passengerHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No rides booked yet. Request a ride on the left!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {passengerHistory.map((ride) => (
                      <div
                        key={ride.id}
                        className="p-4 rounded-xl bg-slate-900 border border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">
                              {ride.pickupZone} <ArrowRight className="inline w-3 h-3 text-slate-500" /> {ride.destinationZone}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${ride.status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : ride.status === 'CANCELLED'
                                    ? 'bg-rose-500/20 text-rose-400'
                                    : ride.status === 'IN_PROGRESS'
                                      ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                                      : 'bg-amber-500/20 text-amber-400'
                                }`}
                            >
                              {ride.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center space-x-3">
                            <span>Seats: <strong>{ride.requestedSeats}</strong></span>
                            <span>•</span>
                            <span>
                              Tesla: <strong>{ride.pool?.vehicle?.name || 'Waiting match...'}</strong>
                            </span>
                            <span>•</span>
                            <span>Driver: <strong>{ride.pool?.driver?.name || 'Unassigned'}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end space-x-4">
                          <div className="text-right">
                            <div className="text-base font-black text-white">
                              {ride.finalFarePoysha / 100} BDT
                            </div>
                            {ride.poolDiscountPoysha > 0 && (
                              <div className="text-[10px] text-emerald-400 font-semibold">
                                -{ride.poolDiscountPoysha / 100} BDT Pooled Discount
                              </div>
                            )}
                          </div>

                          {/* Cancellation button (Section 3: cancel while valid) */}
                          {['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'].includes(ride.status) && (
                            <button
                              onClick={() => handleCancelRide(ride.id)}
                              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold rounded-lg transition"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DRIVER VIEW */}
        {activeTab === 'driver' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tesla & Capacity Card */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Electric Tesla Easybike</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                    ONLINE
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white mt-1">
                  Bullet <span className="text-xs font-normal text-slate-400 font-mono">DHAKA-METRO-CHA-11-2026</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">Driver: {currentDriver?.name} (Zone: Banani)</p>
              </div>

              {/* 3-Seat Capacity Visual Indicator (Mandated by Section 3 & 12) */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Live Seat Capacity</span>
                  <span className="font-extrabold text-white">
                    {occupiedSeats} / {maxCapacity} Seats Occupied
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: maxCapacity }).map((_, index) => {
                    const isOccupied = index < occupiedSeats;
                    return (
                      <div
                        key={index}
                        className={`py-3 px-2 rounded-lg border text-center flex flex-col items-center space-y-1 transition ${isOccupied
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-400 shadow-md shadow-amber-500/10'
                            : 'bg-slate-800/60 border-slate-700 text-slate-500'
                          }`}
                      >
                        <Users className="w-5 h-5" />
                        <span className="text-[10px] font-bold uppercase">
                          {isOccupied ? 'Passenger' : 'Available'}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[11px] text-slate-400">
                  {occupiedSeats >= maxCapacity ? (
                    <span className="text-rose-400 font-bold flex items-center space-x-1">
                      <Ban className="w-3 h-3" />
                      <span>Bullet is Full! Extra requests will be rejected.</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400">
                      {maxCapacity - occupiedSeats} seat(s) remaining for Banani corridor.
                    </span>
                  )}
                </div>
              </div>

              {/* Active Pool Controls */}
              {activePool ? (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Trip Lifecycle Actions
                  </span>
                  {activePool.status === 'ASSIGNED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'DRIVER_ARRIVED')}
                      className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-sm transition"
                    >
                      Mark Arrival at Banani
                    </button>
                  )}
                  {activePool.status === 'DRIVER_ARRIVED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'STARTED')}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm transition"
                    >
                      Start Trip (Passengers Boarded)
                    </button>
                  )}
                  {activePool.status === 'STARTED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'COMPLETED')}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-xl text-sm transition"
                    >
                      Complete Trip & Collect Fares
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-4 bg-slate-900/50 rounded-xl border border-slate-800">
                  No active pool. Accept a request below to start Bullet!
                </div>
              )}
            </div>

            {/* Active Pool Onboard Passengers & Incoming Requests */}
            <div className="lg:col-span-2 space-y-6">
              {/* Active Pool Passengers */}
              {activePool && (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-base flex items-center space-x-2">
                      <Car className="w-5 h-5 text-amber-400" />
                      <span>Onboard Bullet Passengers ({activePool.requests?.length || 0})</span>
                    </h3>
                    <span className="text-xs bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded">
                      Status: {activePool.status}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activePool.requests?.map((req: any) => (
                      <div
                        key={req.id}
                        className="p-3 bg-slate-900 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-white text-sm">{req.passenger.name}</span>
                          <span className="text-slate-400 ml-2">
                            ({req.pickupZone} <ArrowRight className="inline w-3 h-3 text-slate-500" /> {req.destinationZone})
                          </span>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="bg-slate-800 px-2 py-1 rounded text-slate-300 font-semibold">
                            {req.requestedSeats} Seat(s)
                          </span>
                          <span className="font-bold text-emerald-400">{req.finalFarePoysha / 100} BDT</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming Corridor Requests */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base">Incoming Passenger Requests</h3>
                    <p className="text-xs text-slate-400">Banani & Gulshan/Mohakhali corridor match queue</p>
                  </div>
                  <button
                    onClick={refreshDriverData}
                    className="text-xs text-slate-400 hover:text-white flex items-center space-x-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>

                {availableRequests.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">
                    No pending ride requests waiting in Banani.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {availableRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-4 rounded-xl bg-slate-900 border border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-white text-sm">{req.passenger.name}</span>
                            <span className="text-xs text-slate-400">
                              ({req.pickupZone} <ArrowRight className="inline w-3 h-3 text-slate-500" /> {req.destinationZone})
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Requested Seats: <strong className="text-slate-300">{req.requestedSeats}</strong> • Fare: {req.finalFarePoysha / 100} BDT
                          </div>
                        </div>

                        <button
                          onClick={() => handleMatchRequest(req.id)}
                          disabled={occupiedSeats + req.requestedSeats > maxCapacity}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold rounded-lg text-xs transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {occupiedSeats + req.requestedSeats > maxCapacity
                            ? 'Over Capacity'
                            : 'Accept into Bullet'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Dhaka Tesla Pool MVP • Built for Banani Rush-Hour (Jashim, Bullet, Nusrat, Rafiq, Shirin)
      </footer>
    </div>
  );
}
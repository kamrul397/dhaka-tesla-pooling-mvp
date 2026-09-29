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
  Ban,
  ArrowRight,
  X,
  Sparkles,
  BatteryCharging,
  Navigation,
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

const CORRIDOR_POINTS = [
  { id: 'Banani', label: 'Banani' },
  { id: 'Gulshan2', label: 'Gulshan 2' },
  { id: 'Gulshan1', label: 'Gulshan 1' },
  { id: 'Mohakhali', label: 'Mohakhali' },
  { id: 'Farmgate', label: 'Farmgate' },
];

export default function DhakaTeslaApp() {
  const [passengers, setPassengers] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'passenger' | 'driver'>('passenger');

  const [selectedPassengerId, setSelectedPassengerId] = useState<string>('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');

  const [pickupZone, setPickupZone] = useState<string>('Banani');
  const [destinationZone, setDestinationZone] = useState<string>('Mohakhali');
  const [requestedSeats, setRequestedSeats] = useState<number>(1);
  const [fareEstimate, setFareEstimate] = useState<any>(null);
  const [passengerHistory, setPassengerHistory] = useState<any[]>([]);
  const [passengerLoading, setPassengerLoading] = useState<boolean>(false);

  const [driverDashboard, setDriverDashboard] = useState<any>(null);
  const [availableRequests, setAvailableRequests] = useState<any[]>([]);

  const [simulationData, setSimulationData] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  const [toast, setToast] = useState<{
    id: number;
    type: 'success' | 'error' | 'pool' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  function triggerToast(type: 'success' | 'error' | 'pool' | 'warning', title: string, message: string) {
    const id = Date.now();
    setToast({ id, type, title, message });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4000);
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    try {
      const pList = await fetchPassengers();
      const dList = await fetchDrivers();
      setPassengers(pList);
      setDrivers(dList);
      if (pList.length > 0) setSelectedPassengerId(pList[0].id);
      if (dList.length > 0) setSelectedDriverId(dList[0].id);
    } catch (err: any) {
      triggerToast('error', 'Database Error', 'PostgreSQL container is not reachable on port 5432.');
    }
  }

  useEffect(() => {
    if (selectedPassengerId) refreshPassengerData();
  }, [selectedPassengerId]);

  useEffect(() => {
    if (selectedDriverId) refreshDriverData();
  }, [selectedDriverId]);

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

  async function handleBookRide() {
    setPassengerLoading(true);
    try {
      await requestRide({
        passengerId: selectedPassengerId,
        pickupZone,
        destinationZone,
        requestedSeats,
      });
      triggerToast('success', 'Ride Requested', `${currentPassenger?.name} booked ${requestedSeats} seat(s) to ${destinationZone}.`);
      await refreshPassengerData();
      await refreshDriverData();
    } catch (err: any) {
      triggerToast('error', 'Booking Failed', err.message);
    } finally {
      setPassengerLoading(false);
    }
  }

  async function handleCancelRide(requestId: string) {
    try {
      await cancelRide(requestId, selectedPassengerId);
      triggerToast('warning', 'Ride Cancelled', 'Booking cancelled and seat released.');
      await refreshPassengerData();
      await refreshDriverData();
    } catch (err: any) {
      triggerToast('error', 'Cancellation Error', err.message);
    }
  }

  async function handleMatchRequest(requestId: string) {
    try {
      const res = await matchDriverRequest(selectedDriverId, requestId);
      if (res.occupiedSeats > 1) {
        triggerToast('pool', '⚡ 25% Pooling Activated!', 'Passengers share Bullet. Both get 25% discount!');
      } else {
        triggerToast('success', 'Passenger Boarded', `Bullet now has ${res.occupiedSeats}/3 seats.`);
      }
      await refreshDriverData();
      await refreshPassengerData();
    } catch (err: any) {
      triggerToast('error', 'Seat Conflict', err.message);
    }
  }

  async function handleUpdateStatus(poolId: string, status: string) {
    try {
      await updatePoolStatus(poolId, selectedDriverId, status);
      triggerToast('success', 'Trip Updated', `Trip status: ${status.replace('_', ' ')}.`);
      await refreshDriverData();
      await refreshPassengerData();
    } catch (err: any) {
      triggerToast('error', 'Status Error', err.message);
    }
  }

  async function handleRunSimulation() {
    setSimulating(true);
    try {
      const result = await runSimulation();
      setSimulationData(result);
      triggerToast('pool', 'Story Completed!', 'Nusrat, Rafiq & Shirin booked. Concurrency lock verified.');
      await refreshPassengerData();
      await refreshDriverData();
    } catch (err: any) {
      triggerToast('error', 'Simulation Failed', err.message);
    } finally {
      setSimulating(false);
    }
  }

  const currentPassenger = passengers.find((p) => p.id === selectedPassengerId);
  const currentDriver = drivers.find((d) => d.id === selectedDriverId);
  const activePool = driverDashboard?.poolsAsDriver?.[0];
  const occupiedSeats = activePool?.occupiedSeats || 0;
  const maxCapacity = driverDashboard?.vehicles?.[0]?.totalCapacity || 3;
  const isPooled = (activePool?.requests?.length || 0) > 1;
  const onboardRequests = activePool?.requests || [];

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      {/* FLOATING TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm w-full shadow-2xl transition-all">
          <div
            className={`p-3.5 rounded-xl border backdrop-blur-xl flex items-start space-x-3 shadow-2xl ${
              toast.type === 'pool'
                ? 'bg-gradient-to-r from-teal-950/95 to-emerald-950/95 border-cyan-500/50 text-cyan-200'
                : toast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/50 text-amber-200'
                : 'bg-rose-950/95 border-rose-500/50 text-rose-200'
            }`}
          >
            <div className="p-1.5 rounded-lg bg-black/40 shrink-0">
              {toast.type === 'pool' ? (
                <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
              ) : toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : toast.type === 'warning' ? (
                <AlertCircle className="w-4 h-4 text-amber-400" />
              ) : (
                <Ban className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <div className="flex-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-white text-xs">{toast.title}</span>
                <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <p className="text-slate-300 mt-0.5 leading-snug">{toast.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* COMPACT TOP NAVBAR */}
      <header className="border-b border-slate-800 bg-[#0c1322] sticky top-0 z-30 py-2">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-2">
          {/* Logo & Subtitle */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-cyan-400 flex items-center justify-center text-slate-950 font-black text-base shadow">
              ⚡
            </div>
            <div>
              <div className="flex items-center space-x-2 leading-none">
                <span className="font-black text-base text-white">Dhaka Tesla Pool</span>
                <span className="text-[9px] uppercase bg-emerald-500/20 text-emerald-300 font-extrabold px-1.5 py-0.5 rounded border border-emerald-500/30">
                  MVP
                </span>
              </div>
              <span className="text-[10px] text-slate-400">Share a seat. Split the fare.</span>
            </div>
          </div>

          {/* ULTRA-COMPACT CORRIDOR STRIP (INLINE IN HEADER) */}
          <div className="hidden md:flex items-center space-x-1 bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg text-[10px]">
            <Navigation className="w-3 h-3 text-emerald-400 mr-1 shrink-0" />
            <span className="text-slate-500 font-semibold uppercase text-[9px] mr-1">Corridor:</span>
            {CORRIDOR_POINTS.map((pt, idx) => {
              const isPickup = pickupZone === pt.id;
              const isDrop = destinationZone === pt.id;
              return (
                <React.Fragment key={pt.id}>
                  <span
                    className={`px-1.5 py-0.5 rounded font-bold transition ${
                      isPickup
                        ? 'bg-emerald-500 text-black'
                        : isDrop
                        ? 'bg-cyan-400 text-black'
                        : 'text-slate-300 bg-slate-800/60'
                    }`}
                  >
                    {pt.label}
                  </span>
                  {idx < CORRIDOR_POINTS.length - 1 && <span className="text-slate-600 text-[9px]">→</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* 1-Click Simulation Button */}
          <button
            onClick={handleRunSimulation}
            disabled={simulating}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold rounded-lg shadow text-xs transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span>{simulating ? 'Simulating...' : '1-Click Story'}</span>
          </button>
        </div>
      </header>

      {/* COMPACT MAIN CONTAINER (FIT IN ONE PAGE) */}
      <main className="max-w-7xl mx-auto px-4 py-3 flex-1 w-full flex flex-col space-y-3">
        {/* COMPACT SIMULATION TIMELINE (IF RUN) */}
        {simulationData && (
          <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/40 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 overflow-x-auto py-0.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex space-x-3 text-[11px] font-mono text-slate-300 whitespace-nowrap">
                {simulationData.timeline.map((line: string, i: number) => (
                  <span key={i} className="border-r border-slate-700 pr-3 last:border-none">
                    <strong className="text-amber-400">›</strong> {line}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={() => setSimulationData(null)}
              className="text-[10px] text-slate-400 hover:text-white shrink-0 ml-3 bg-slate-800 px-2 py-0.5 rounded"
            >
              ✕
            </button>
          </div>
        )}

        {/* COMPACT TAB SELECTOR & ACTOR SWITCHER */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex space-x-1.5">
            <button
              onClick={() => setActiveTab('passenger')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeTab === 'passenger'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-800/70 text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Passenger (Nusrat / Rafiq / Shirin)</span>
            </button>
            <button
              onClick={() => setActiveTab('driver')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                activeTab === 'driver'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-800/70 text-slate-400 hover:text-white'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>Driver (Jashim & Bullet)</span>
            </button>
          </div>

          <div className="flex items-center space-x-2 text-[11px] bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700">
            <span className="text-slate-400">Actor:</span>
            {activeTab === 'passenger' ? (
              <select
                value={selectedPassengerId}
                onChange={(e) => setSelectedPassengerId(e.target.value)}
                className="bg-slate-900 text-emerald-400 font-bold rounded px-1.5 py-0.5 border border-slate-700 text-xs focus:outline-none"
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
                className="bg-slate-900 text-amber-400 font-bold rounded px-1.5 py-0.5 border border-slate-700 text-xs focus:outline-none"
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

        {/* ===================== PASSENGER PORTAL ===================== */}
        {activeTab === 'passenger' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
            {/* Booking Card (5 Cols) */}
            <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <span className="font-extrabold text-sm text-white flex items-center space-x-1.5">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Book Shared Tesla</span>
                  </span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-bold px-2 py-0.5 rounded">
                    {currentPassenger?.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Pickup</label>
                    <select
                      value={pickupZone}
                      onChange={(e) => setPickupZone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                    >
                      {DHAKA_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Destination</label>
                    <select
                      value={destinationZone}
                      onChange={(e) => setDestinationZone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none"
                    >
                      {DHAKA_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Seats</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRequestedSeats(num)}
                        className={`py-1 text-xs font-bold rounded-lg border transition ${
                          requestedSeats === num
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {num} {num === 1 ? 'Seat' : 'Seats'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compact Fare Box */}
                {fareEstimate && (
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Est. Distance</span>
                      <span className="font-semibold text-white">{fareEstimate.soloFare.distanceKm} km</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                      <div>
                        <span className="font-extrabold text-cyan-400 flex items-center space-x-1 text-xs">
                          <Zap className="w-3 h-3 text-cyan-400" />
                          <span>Pooled Fare (-25%)</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Solo: <s className="text-slate-500">{fareEstimate.soloFare.finalFareBdt} BDT</s>
                        </span>
                      </div>
                      <span className="font-black text-lg text-emerald-400">
                        {fareEstimate.pooledFare.finalFareBdt} BDT
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleBookRide}
                disabled={passengerLoading || pickupZone === destinationZone}
                className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 font-black rounded-lg text-xs shadow transition disabled:opacity-40 cursor-pointer"
              >
                {passengerLoading ? 'Requesting...' : 'Request Ride'}
              </button>
            </div>

            {/* Trips List (7 Cols) */}
            <div className="lg:col-span-7 bg-[#0e1626] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                <span className="font-bold text-xs text-white flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>My Trips ({currentPassenger?.name})</span>
                </span>
                <button
                  onClick={refreshPassengerData}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center space-x-1 bg-slate-800 px-2 py-0.5 rounded"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1">
                {passengerHistory.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No rides booked yet. Request a ride on the left!
                  </div>
                ) : (
                  passengerHistory.map((ride) => (
                    <div
                      key={ride.id}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-extrabold text-white text-xs">
                            {ride.pickupZone} → {ride.destinationZone}
                          </span>
                          <span
                            className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded ${
                              ride.status === 'COMPLETED'
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
                        <div className="text-[10px] text-slate-400">
                          Tesla: <strong>{ride.pool?.vehicle?.name || 'Unassigned'}</strong> • Driver:{' '}
                          <strong>{ride.pool?.driver?.name || 'Unassigned'}</strong> • Seats: {ride.requestedSeats}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2.5">
                        <div className="text-right">
                          <span className="font-black text-white text-sm block">
                            {ride.finalFarePoysha / 100} BDT
                          </span>
                          {ride.poolDiscountPoysha > 0 && (
                            <span className="text-[9px] text-cyan-400 font-bold block">
                              -{ride.poolDiscountPoysha / 100} BDT (25%)
                            </span>
                          )}
                        </div>

                        {['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'].includes(ride.status) && (
                          <button
                            onClick={() => handleCancelRide(ride.id)}
                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold rounded transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===================== DRIVER PORTAL ===================== */}
        {activeTab === 'driver' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1">
            {/* Visual Rickshaw Diagram (5 Cols) */}
            <div className="lg:col-span-5 bg-[#0e1626] border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <div className="flex items-center space-x-1.5">
                    <BatteryCharging className="w-4 h-4 text-emerald-400" />
                    <span className="font-black text-sm text-white">Bullet (3-Seater Tesla)</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-extrabold">
                    ONLINE
                  </span>
                </div>

                {/* THE 3-SEATER CABIN DIAGRAM (COMPACT) */}
                <div className="border border-slate-700/80 rounded-2xl p-3 bg-slate-950/70 space-y-2">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-bold">Bullet Cabin Layout</span>
                    <span
                      className={`font-black text-[10px] px-1.5 py-0.5 rounded ${
                        occupiedSeats >= maxCapacity
                          ? 'bg-rose-500/20 text-rose-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}
                    >
                      {occupiedSeats} / {maxCapacity} SEATS FULL
                    </span>
                  </div>

                  {/* Driver Cockpit */}
                  <div className="w-full py-1.5 px-2.5 rounded-lg bg-slate-800/80 border border-amber-500/40 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-amber-400 font-black text-xs">⚡</span>
                      <span className="font-extrabold text-white text-xs">Jashim (Driver)</span>
                    </div>
                    <span className="text-[9px] text-slate-300 bg-black/40 px-2 py-0.5 rounded font-mono border border-slate-700">
                      📍 Zone: {driverDashboard?.vehicles?.[0]?.currentZone || 'Banani'}
                    </span>
                  </div>

                  {/* 3 Passenger Seats */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {[0, 1, 2].map((seatIdx) => {
                      const req = onboardRequests[seatIdx];
                      const isOcc = seatIdx < occupiedSeats;
                      return (
                        <div
                          key={seatIdx}
                          className={`min-h-[64px] rounded-lg p-1.5 flex flex-col justify-between border text-center transition ${
                            isOcc
                              ? isPooled
                                ? 'bg-cyan-950/40 border-cyan-500/70 text-cyan-200'
                                : 'bg-emerald-950/40 border-emerald-500/70 text-emerald-200'
                              : 'bg-slate-900/60 border-dashed border-slate-700 text-slate-500'
                          }`}
                        >
                          <div className="flex justify-between text-[9px] text-slate-400">
                            <span>S{seatIdx + 1}</span>
                            <Users className={`w-2.5 h-2.5 ${isOcc ? 'text-emerald-400' : 'text-slate-600'}`} />
                          </div>
                          <div className="my-auto py-0.5">
                            {isOcc ? (
                              <span className="font-black text-[11px] text-white block truncate">
                                {req?.passenger?.name || `Passenger`}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-600 font-semibold">Vacant</span>
                            )}
                          </div>
                          <span className="text-[8px] font-black uppercase text-slate-400">
                            {isOcc ? 'Onboard' : 'Empty'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Trip Lifecycle Action */}
              {activePool ? (
                <div className="pt-1">
                  {activePool.status === 'ASSIGNED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'DRIVER_ARRIVED')}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition cursor-pointer"
                    >
                      Mark Arrival at Banani
                    </button>
                  )}
                  {activePool.status === 'DRIVER_ARRIVED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'STARTED')}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs transition cursor-pointer"
                    >
                      Start Trip (Board Passengers)
                    </button>
                  )}
                  {activePool.status === 'STARTED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'COMPLETED')}
                      className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs transition cursor-pointer"
                    >
                      Complete Trip & Collect Fares
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-slate-500 text-center py-2 bg-slate-900/50 rounded-lg border border-slate-800">
                  Bullet is idle. Accept incoming corridor requests.
                </div>
              )}
            </div>

            {/* Incoming Requests & Active Pool Passengers (7 Cols) */}
            <div className="lg:col-span-7 bg-[#0e1626] border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col space-y-3">
              {/* Onboard List (if active) */}
              {activePool && activePool.requests?.length > 0 && (
                <div className="border-b border-slate-800 pb-2">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-extrabold text-white">Onboard Bullet</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded font-bold">
                      {activePool.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {activePool.requests.map((r: any) => (
                      <div
                        key={r.id}
                        className="p-1.5 bg-slate-900 rounded-lg border border-slate-800 flex justify-between items-center text-[11px]"
                      >
                        <span className="font-bold text-white">
                          {r.passenger.name} ({r.pickupZone} → {r.destinationZone})
                        </span>
                        <span className="font-black text-emerald-400">{r.finalFarePoysha / 100} BDT</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Incoming Requests Queue */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between pb-1.5 mb-1.5">
                  <span className="font-extrabold text-xs text-white">Incoming Queue</span>
                  <button
                    onClick={refreshDriverData}
                    className="text-[10px] text-slate-400 hover:text-white flex items-center space-x-1 bg-slate-800 px-2 py-0.5 rounded"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Refresh</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1">
                  {availableRequests.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-xs">
                      No pending requests in Banani. Switch to Passenger Portal to create one!
                    </div>
                  ) : (
                    availableRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-white block">
                            {req.passenger.name} ({req.pickupZone} → {req.destinationZone})
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Seats: {req.requestedSeats} • Fare: {req.finalFarePoysha / 100} BDT
                          </span>
                        </div>

                        <button
                          onClick={() => handleMatchRequest(req.id)}
                          disabled={occupiedSeats + req.requestedSeats > maxCapacity}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition disabled:opacity-30 cursor-pointer"
                        >
                          {occupiedSeats + req.requestedSeats > maxCapacity ? 'Full' : 'Accept'}
                        </button>
                      </div>
                    ))
                  )}
                  </div>
                </div>
              </div>
            </div>
          )}
      </main>

      {/* MINIMAL FOOTER */}
      <footer className="border-t border-slate-800/80 bg-[#0c1322] py-1.5 text-center text-[10px] text-slate-500">
        Dhaka Tesla Pool MVP • Banani Rush-Hour (Jashim, Bullet, Nusrat, Rafiq, Shirin)
      </footer>
    </div>
  );
}
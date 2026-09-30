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
  BookOpen,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  Check,
  UserX,
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
  rejectDriverRequest,
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

interface StoryStep {
  time: string;
  stepNum: number;
  actor: string;
  avatar: string;
  title: string;
  badge: string;
  badgeColor: string;
  route?: string;
  fareDetail?: string;
  description: string;
  techNote: string;
}

const STORY_STEPS: StoryStep[] = [
  {
    time: '8:41 AM',
    stepNum: 1,
    actor: 'Nusrat',
    avatar: '👩',
    title: 'Nusrat Books Solo Ride from Banani to Mohakhali',
    badge: 'Solo Request',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    route: 'Banani → Mohakhali',
    fareDetail: 'Solo Fare: 48.50 BDT (4,850 Poysha)',
    description:
      'Nusrat is rushing for her morning work shift. She requests a solo seat on Bullet from Banani Road 11 to Mohakhali.',
    techNote:
      'Calculated via Haversine distance matrix with integer Poysha precision (zero floating-point currency drift).',
  },
  {
    time: '8:42 AM',
    stepNum: 2,
    actor: 'Jashim',
    avatar: '🛺',
    title: 'Jashim Dispatches Bullet & Accepts Nusrat',
    badge: '1/3 Seats Occupied',
    badgeColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    route: 'Cabin: Seat 1 Claimed',
    fareDetail: 'Status: MATCHED / EN ROUTE',
    description:
      'Jashim receives the dispatch on his driver terminal and accepts Nusrat. Seat 1 in Bullet’s cabin lights up.',
    techNote:
      'Ride state transitions strictly from REQUESTED → MATCHED via state machine validation.',
  },
  {
    time: '8:43 AM',
    stepNum: 3,
    actor: 'Rafiq',
    avatar: '👨',
    title: 'Rafiq Requests Overlapping Gulshan 1 Corridor',
    badge: 'Corridor Overlap',
    badgeColor: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    route: 'Banani → Gulshan 1',
    fareDetail: 'Corridor: Shares Banani Spine',
    description:
      'Rafiq enters the app two minutes later heading to Gulshan 1. The spatial matching engine detects overlapping corridors with Nusrat’s trip.',
    techNote:
      'Corridor geometry verifies pickup proximity (within 1.5 km threshold) for frictionless pooling.',
  },
  {
    time: '8:44 AM',
    stepNum: 4,
    actor: 'System',
    avatar: '⚡',
    title: 'Pooling Activated! 25% Fare Discount Applied to Both',
    badge: '⚡ 25% Fare Cut',
    badgeColor: 'bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-cyan-300 border-cyan-500/40',
    route: 'Shared Cabin: 2/3 Seats',
    fareDetail: 'New Fare: 36.37 BDT (Saved 12.13 BDT each)',
    description:
      'Jashim accepts Rafiq into Bullet. The pooling engine recalculates both passenger manifests, slashing their fares by 25%. Jashim earns 72.74 BDT total instead of 48.50 BDT, while both riders save money!',
    techNote:
      'Integer arithmetic: Math.round(4850 * 0.75) = 3637 Poysha. Guaranteed atomic ledger updates in PostgreSQL.',
  },
  {
    time: '8:45 AM',
    stepNum: 5,
    actor: 'Shirin',
    avatar: '👩',
    title: 'Shirin Claims the Final Remaining Seat',
    badge: 'Cabin FULL (3/3)',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    route: 'Banani → Gulshan 2',
    fareDetail: 'Bullet at 100% Legal Capacity',
    description:
      'Shirin requests the last vacant seat. Bullet’s 3-passenger cabin is now completely full (3/3 seats occupied).',
    techNote:
      'Database row is queried under transaction to confirm occupiedSeats (2) + requestedSeats (1) <= maxCapacity (3).',
  },
  {
    time: '8:46 AM',
    stepNum: 6,
    actor: 'Concurrency Lock',
    avatar: '🛡️',
    title: 'Overcapacity Prevented! Concurrency Lock Blocks 4th Rider',
    badge: '🛡️ Concurrency Locked',
    badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    route: 'Excess Request REJECTED',
    fareDetail: 'Error: Cannot exceed vehicle capacity (3 seats)',
    description:
      'A 4th commuter attempts to book a seat on Bullet. The backend executes PostgreSQL row-level locking (SELECT ... FOR UPDATE) and immediately rejects the request. Overloading is physically and digitally prevented!',
    techNote:
      'SELECT ... FOR UPDATE locks the ride pool row. Race conditions are blocked, preventing illegal 4-passenger overload.',
  },
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
  const [showStoryReader, setShowStoryReader] = useState<boolean>(false);

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
    }, 4500);
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
      triggerToast('error', 'Connection Error', 'Backend API is currently starting or unreachable.');
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
      triggerToast(
        'success',
        'Ride Requested!',
        `${currentPassenger?.name} booked ${requestedSeats} seat(s) to ${destinationZone}.`
      );
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

  async function handleRejectRequest(requestId: string) {
    try {
      await rejectDriverRequest(
        selectedDriverId,
        requestId,
        'Rejected: Bullet is full (3/3 seats occupied). Please make a new request.'
      );
      triggerToast('warning', 'Passenger Rejected', 'Excess request rejected because Bullet is full.');
      await refreshDriverData();
      await refreshPassengerData();
    } catch (err: any) {
      triggerToast('error', 'Rejection Error', err.message);
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
      setShowStoryReader(true); // Open reading mode automatically so the user can clearly read it!
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
    <div className="min-h-screen bg-[#080C15] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black text-sm">
      {/* FLOATING TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 max-w-md w-full shadow-2xl transition-all animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`p-4 rounded-xl border backdrop-blur-xl flex items-start space-x-3.5 shadow-2xl ${
              toast.type === 'pool'
                ? 'bg-gradient-to-r from-teal-950/95 to-emerald-950/95 border-cyan-500/60 text-cyan-100'
                : toast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100'
                : toast.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/60 text-amber-100'
                : 'bg-rose-950/95 border-rose-500/60 text-rose-100'
            }`}
          >
            <div className="p-2 rounded-lg bg-black/50 shrink-0">
              {toast.type === 'pool' ? (
                <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
              ) : toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : toast.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 text-amber-400" />
              ) : (
                <Ban className="w-5 h-5 text-rose-400" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-white text-sm">{toast.title}</span>
                <button
                  onClick={() => setToast(null)}
                  className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-slate-200 text-xs sm:text-sm mt-1 leading-relaxed">{toast.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* TOP NAVIGATION BAR */}
      <header className="border-b border-slate-800 bg-[#0c1322] sticky top-0 z-30 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Logo & Subtitle */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 flex items-center justify-center text-slate-950 font-black text-xl shadow-md">
              ⚡
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <span className="font-black text-lg sm:text-xl text-white tracking-tight">
                  Dhaka Tesla Pool
                </span>
                <span className="text-xs uppercase bg-emerald-500/20 text-emerald-300 font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/40">
                  MVP Live
                </span>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline-block">
                Share a seat. Split the fare. Survive Dhaka traffic.
              </span>
            </div>
          </div>

          {/* CORRIDOR STRIP (IN HEADER) */}
          <div className="hidden lg:flex items-center space-x-1.5 bg-slate-900/95 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
            <Navigation className="w-3.5 h-3.5 text-emerald-400 mr-1 shrink-0" />
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] mr-1">Corridor:</span>
            {CORRIDOR_POINTS.map((pt, idx) => {
              const isPickup = pickupZone === pt.id;
              const isDrop = destinationZone === pt.id;
              return (
                <React.Fragment key={pt.id}>
                  <span
                    className={`px-2 py-1 rounded-md font-bold transition text-xs ${
                      isPickup
                        ? 'bg-emerald-500 text-black shadow-sm'
                        : isDrop
                        ? 'bg-cyan-400 text-black shadow-sm'
                        : 'text-slate-300 bg-slate-800/80 hover:bg-slate-800'
                    }`}
                  >
                    {pt.label}
                  </span>
                  {idx < CORRIDOR_POINTS.length - 1 && (
                    <span className="text-slate-600 font-bold">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* 1-Click Story Trigger Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowStoryReader(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-xl text-xs sm:text-sm transition cursor-pointer"
              title="Open Reading Mode"
            >
              <BookOpen className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Story Reading Mode</span>
              <span className="sm:hidden">Story</span>
            </button>

            <button
              onClick={handleRunSimulation}
              disabled={simulating}
              className="flex items-center space-x-2 px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-xl shadow-md text-xs sm:text-sm transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>{simulating ? 'Executing Story...' : '1-Click Story'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 📖 VERTICAL STORY READING MODE MODAL / FULL PANEL                         */}
      {/* ========================================================================= */}
      {showStoryReader && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-[#0c1424] border border-amber-500/40 rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#0e172a] flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-xl">
                  📖
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white flex items-center space-x-2">
                    <span>The Banani Rush-Hour Story</span>
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      Reading Mode
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Step-by-step vertical timeline: Jashim, Bullet, Nusrat, Rafiq & Shirin
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRunSimulation}
                  disabled={simulating}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{simulating ? 'Running...' : 'Re-Run Simulation'}</span>
                </button>
                <button
                  onClick={() => setShowStoryReader(false)}
                  className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: VERTICAL STORY FEED */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-xs sm:text-sm text-slate-300 flex items-start space-x-2.5">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <p>
                  <strong>Context:</strong> It is 8:41 AM on Banani Road 11. Commuters struggle to reach Mohakhali and Gulshan during morning peak congestion. Follow each event below to see how easybike ride-pooling cuts fares by 25% while enforcing strict database row-level locking.
                </p>
              </div>

              {/* VERTICAL TIMELINE LIST */}
              <div className="relative pl-6 sm:pl-8 border-l-2 border-slate-800 space-y-6 my-4">
                {STORY_STEPS.map((step) => (
                  <div key={step.stepNum} className="relative group">
                    {/* Circle Node on Timeline */}
                    <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 border-2 border-amber-500 flex items-center justify-center text-sm shadow-md">
                      <span>{step.avatar}</span>
                    </div>

                    {/* Step Card */}
                    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-5 transition shadow-md space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                            {step.time}
                          </span>
                          <span className="font-bold text-xs text-slate-400">Step {step.stepNum}</span>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${step.badgeColor}`}>
                          {step.badge}
                        </span>
                      </div>

                      <h3 className="text-sm sm:text-base font-black text-white leading-snug">
                        {step.title}
                      </h3>

                      {step.route && (
                        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-300 font-semibold bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                          <span className="text-emerald-400 flex items-center space-x-1">
                            <Navigation className="w-3.5 h-3.5" />
                            <span>{step.route}</span>
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className="text-cyan-300 font-mono">{step.fareDetail}</span>
                        </div>
                      )}

                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        {step.description}
                      </p>

                      <div className="pt-2 border-t border-slate-800/70 text-[11px] sm:text-xs text-slate-400 flex items-start space-x-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          <strong className="text-slate-300">Under the Hood:</strong> {step.techNote}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-[#0e172a] flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Verified with PostgreSQL row locks & 6 automated Jest test cases.
              </span>
              <button
                onClick={() => setShowStoryReader(false)}
                className="w-full sm:w-auto px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm transition cursor-pointer"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA (FITS ON ONE PAGE)                                      */}
      {/* ========================================================================= */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex-1 w-full flex flex-col space-y-3">
        {/* ROLE TABS & ACTOR SWITCHER */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('passenger')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                activeTab === 'passenger'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Passenger Portal (Nusrat / Rafiq / Shirin)</span>
            </button>
            <button
              onClick={() => setActiveTab('driver')}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                activeTab === 'driver'
                  ? 'bg-emerald-500 text-slate-950 shadow-md'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Driver Portal (Jashim & Bullet)</span>
            </button>
          </div>

          <div className="flex items-center space-x-2.5 text-xs sm:text-sm bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
            <span className="text-slate-400 font-bold">Active Persona:</span>
            {activeTab === 'passenger' ? (
              <select
                value={selectedPassengerId}
                onChange={(e) => setSelectedPassengerId(e.target.value)}
                className="bg-slate-950 text-emerald-400 font-bold rounded-lg px-2.5 py-1 border border-slate-700 text-xs sm:text-sm focus:outline-none"
              >
                {passengers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Wallet: {p.walletBalancePoysha / 100} BDT)
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                className="bg-slate-950 text-amber-400 font-bold rounded-lg px-2.5 py-1 border border-slate-700 text-xs sm:text-sm focus:outline-none"
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

        {/* ========================================================================= */}
        {/* PASSENGER PORTAL TAB                                                      */}
        {/* ========================================================================= */}
        {activeTab === 'passenger' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
            {/* Booking Card (5 Cols) */}
            <div className="lg:col-span-5 bg-[#0e1628] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <span className="font-black text-base sm:text-lg text-white flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-emerald-400" />
                    <span>Book Shared Tesla</span>
                  </span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                    {currentPassenger?.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Pickup Zone</label>
                    <select
                      value={pickupZone}
                      onChange={(e) => setPickupZone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      {DHAKA_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Destination Zone</label>
                    <select
                      value={destinationZone}
                      onChange={(e) => setDestinationZone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
                    >
                      {DHAKA_ZONES.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Requested Seats</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setRequestedSeats(num)}
                        className={`py-2 text-sm font-black rounded-xl border transition ${
                          requestedSeats === num
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >
                        {num} {num === 1 ? 'Seat' : 'Seats'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fare Breakdown Box */}
                {fareEstimate && (
                  <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700 space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between text-slate-300 font-medium">
                      <span>Corridor Distance:</span>
                      <span className="font-bold text-white">{fareEstimate.soloFare.distanceKm} km</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <div>
                        <span className="font-black text-cyan-400 flex items-center space-x-1.5 text-xs sm:text-sm">
                          <Zap className="w-4 h-4 text-cyan-400" />
                          <span>Pooled Fare (-25% Discount)</span>
                        </span>
                        <span className="text-xs text-slate-400 mt-0.5 block">
                          Solo Price: <s className="text-slate-500">{fareEstimate.soloFare.finalFareBdt} BDT</s>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-xl sm:text-2xl text-emerald-400 block leading-tight">
                          {fareEstimate.pooledFare.finalFareBdt} BDT
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          ({fareEstimate.pooledFare.finalFarePoysha} Poysha)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleBookRide}
                disabled={passengerLoading || pickupZone === destinationZone}
                className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 font-black rounded-xl text-sm sm:text-base shadow-lg transition disabled:opacity-40 cursor-pointer"
              >
                {passengerLoading ? 'Processing Request...' : 'Request Ride'}
              </button>
            </div>

            {/* Trips List (7 Cols) */}
            <div className="lg:col-span-7 bg-[#0e1628] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                <span className="font-bold text-sm sm:text-base text-white flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Ride History & Status ({currentPassenger?.name})</span>
                </span>
                <button
                  onClick={refreshPassengerData}
                  className="text-xs text-slate-300 hover:text-white flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[440px] space-y-3 pr-1">
                {passengerHistory.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm">
                    No rides booked yet. Request a shared ride on the left!
                  </div>
                ) : (
                  passengerHistory.map((ride) => {
                    const isRejectedBulletFull =
                      ride.status === 'CANCELLED' &&
                      (ride.auditLogs?.[0]?.reason?.toLowerCase().includes('bullet is full') ||
                        ride.auditLogs?.[0]?.reason?.toLowerCase().includes('capacity') ||
                        ride.auditLogs?.[0]?.reason?.toLowerCase().includes('en route') ||
                        ride.auditLogs?.[0]?.reason?.toLowerCase().includes('rejected'));

                    return (
                      <div
                        key={ride.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm transition ${
                          isRejectedBulletFull
                            ? 'bg-rose-950/30 border-rose-500/50'
                            : 'bg-slate-900 border-slate-800'
                        }`}
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-white text-sm sm:text-base">
                              {ride.pickupZone} → {ride.destinationZone}
                            </span>
                            {isRejectedBulletFull ? (
                              <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center space-x-1">
                                <UserX className="w-3.5 h-3.5 inline mr-1 text-rose-400" />
                                <span>REJECTED • BULLET FULL</span>
                              </span>
                            ) : (
                              <span
                                className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${
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
                            )}
                          </div>
                          <div className="text-xs text-slate-400">
                            Tesla: <strong className="text-slate-200">{ride.pool?.vehicle?.name || 'Bullet (3-Seater)'}</strong> • Driver:{' '}
                            <strong className="text-slate-200">{ride.pool?.driver?.name || 'Jashim'}</strong> • Seats: {ride.requestedSeats}
                          </div>

                          {/* REJECTION REASON & MAKE NEW REQUEST BUTTON */}
                          {isRejectedBulletFull && (
                            <div className="mt-2 pt-2 border-t border-rose-900/50 text-xs text-rose-200 space-y-2">
                              <p className="flex items-start space-x-1.5">
                                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                <span>
                                  {ride.auditLogs?.[0]?.reason ||
                                    'Ride rejected: Bullet reached full capacity (3/3 seats). Please make a new request for the next Tesla.'}
                                </span>
                              </p>
                              <button
                                onClick={() => {
                                  setPickupZone(ride.pickupZone);
                                  setDestinationZone(ride.destinationZone);
                                  setRequestedSeats(ride.requestedSeats);
                                  triggerToast(
                                    'pool',
                                    'Route Pre-filled!',
                                    `Route pre-filled (${ride.pickupZone} → ${ride.destinationZone}). Click Request Ride to book the next Tesla.`
                                  );
                                }}
                                className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-black rounded-lg flex items-center space-x-1.5 transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Make a New Request for Ride</span>
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-end space-x-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                          <div className="text-left sm:text-right">
                            <span className="font-black text-white text-base sm:text-lg block">
                              {ride.finalFarePoysha / 100} BDT
                            </span>
                            {ride.poolDiscountPoysha > 0 && (
                              <span className="text-xs text-cyan-400 font-bold block">
                                -{ride.poolDiscountPoysha / 100} BDT (25% off)
                              </span>
                            )}
                          </div>

                          {['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'].includes(ride.status) && (
                            <button
                              onClick={() => handleCancelRide(ride.id)}
                              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/40 text-xs font-bold rounded-lg transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* DRIVER PORTAL TAB                                                         */}
        {/* ========================================================================= */}
        {activeTab === 'driver' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
            {/* Visual Rickshaw Diagram (5 Cols) */}
            <div className="lg:col-span-5 bg-[#0e1628] border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <BatteryCharging className="w-5 h-5 text-emerald-400" />
                    <span className="font-black text-base sm:text-lg text-white">Bullet (3-Seater Tesla)</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold border border-emerald-500/30">
                    ONLINE
                  </span>
                </div>

                {/* THE 3-SEATER CABIN DIAGRAM */}
                <div className="border border-slate-700 rounded-2xl p-4 bg-slate-950/80 space-y-3">
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-slate-300 font-bold">Physical Cabin Layout</span>
                    <span
                      className={`font-black text-xs px-2.5 py-1 rounded-full ${
                        occupiedSeats >= maxCapacity
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}
                    >
                      {occupiedSeats} / {maxCapacity} SEATS OCCUPIED
                    </span>
                  </div>

                  {/* Driver Cockpit */}
                  <div className="w-full py-2 px-3 rounded-xl bg-slate-800/90 border border-amber-500/50 flex items-center justify-between text-xs sm:text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="text-amber-400 font-black text-base">⚡</span>
                      <span className="font-extrabold text-white">Jashim (Driver)</span>
                    </div>
                    <span className="text-xs text-slate-300 bg-black/50 px-2.5 py-1 rounded-md font-mono border border-slate-700">
                      📍 Zone: {driverDashboard?.vehicles?.[0]?.currentZone || 'Banani'}
                    </span>
                  </div>

                  {/* 3 Passenger Seats */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                    {[0, 1, 2].map((seatIdx) => {
                      const req = onboardRequests[seatIdx];
                      const isOcc = seatIdx < occupiedSeats;
                      return (
                        <div
                          key={seatIdx}
                          className={`min-h-[85px] rounded-xl p-2.5 flex flex-col justify-between border text-center transition ${
                            isOcc
                              ? isPooled
                                ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200 shadow-md'
                                : 'bg-emerald-950/50 border-emerald-500 text-emerald-200 shadow-md'
                              : 'bg-slate-900/60 border-dashed border-slate-700 text-slate-500'
                          }`}
                        >
                          <div className="flex justify-between text-xs text-slate-400">
                            <span className="font-bold">Seat {seatIdx + 1}</span>
                            <Users className={`w-3.5 h-3.5 ${isOcc ? 'text-emerald-400' : 'text-slate-600'}`} />
                          </div>
                          <div className="my-auto py-1">
                            {isOcc ? (
                              <span className="font-black text-xs sm:text-sm text-white block truncate">
                                {req?.passenger?.name || `Passenger`}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500 font-semibold">Vacant</span>
                            )}
                          </div>
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
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
                <div className="pt-2">
                  {activePool.status === 'ASSIGNED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'DRIVER_ARRIVED')}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-sm transition cursor-pointer"
                    >
                      Mark Arrival at Banani
                    </button>
                  )}
                  {activePool.status === 'DRIVER_ARRIVED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'STARTED')}
                      className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-sm transition cursor-pointer"
                    >
                      Start Trip (Board Passengers)
                    </button>
                  )}
                  {activePool.status === 'STARTED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'COMPLETED')}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm transition cursor-pointer"
                    >
                      Complete Trip & Settle Fares
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs sm:text-sm text-slate-400 text-center py-3 bg-slate-900/60 rounded-xl border border-slate-800">
                  Bullet is idle in Banani. Accept incoming corridor requests.
                </div>
              )}
            </div>

            {/* Incoming Requests & Active Pool Passengers (7 Cols) */}
            <div className="lg:col-span-7 bg-[#0e1628] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col space-y-4">
              {/* Onboard List (if active) */}
              {activePool && activePool.requests?.length > 0 && (
                <div className="border-b border-slate-800 pb-3">
                  <div className="flex justify-between items-center text-xs sm:text-sm mb-2">
                    <span className="font-black text-white">Passengers Currently Onboard</span>
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      Status: {activePool.status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {activePool.requests.map((r: any) => (
                      <div
                        key={r.id}
                        className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center text-xs sm:text-sm"
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
                <div className="flex items-center justify-between pb-2 mb-2">
                  <span className="font-black text-sm sm:text-base text-white">Incoming Passenger Queue</span>
                  <button
                    onClick={refreshDriverData}
                    className="text-xs text-slate-300 hover:text-white flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Bullet Full Alert Banner */}
                {occupiedSeats >= maxCapacity && (
                  <div className="mb-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 flex items-center justify-between text-xs sm:text-sm text-rose-200">
                    <div className="flex items-center space-x-2.5">
                      <UserX className="w-5 h-5 text-rose-400 shrink-0" />
                      <div>
                        <strong className="text-white block">Bullet is FULL (3/3 Seats Occupied)</strong>
                        <span className="text-xs text-rose-300">
                          Excess passengers are blocked. Reject excess requests so passengers can re-book.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto max-h-[350px] space-y-2.5 pr-1">
                  {availableRequests.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 text-sm">
                      No pending requests in Banani. Switch to Passenger Portal to create one!
                    </div>
                  ) : (
                    availableRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs sm:text-sm"
                      >
                        <div>
                          <span className="font-bold text-white block text-sm sm:text-base">
                            {req.passenger.name} ({req.pickupZone} → {req.destinationZone})
                          </span>
                          <span className="text-xs text-slate-400 mt-0.5 block">
                            Requested Seats: <strong>{req.requestedSeats}</strong> • Fare: <strong>{req.finalFarePoysha / 100} BDT</strong>
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {occupiedSeats + req.requestedSeats > maxCapacity ? (
                            <button
                              onClick={() => handleRejectRequest(req.id)}
                              className="px-3.5 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/50 font-black rounded-xl text-xs sm:text-sm flex items-center space-x-1.5 transition cursor-pointer"
                              title="Reject Passenger (Bullet Full)"
                            >
                              <UserX className="w-4 h-4 text-rose-400" />
                              <span>Reject (Bullet Full)</span>
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleMatchRequest(req.id)}
                                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition cursor-pointer"
                              >
                                Accept Ride
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req.id)}
                                className="p-2 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 rounded-xl transition cursor-pointer"
                                title="Reject Passenger"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-[#0c1322] py-2.5 text-center text-xs text-slate-400">
        Dhaka Tesla Pool MVP • Banani Rush-Hour Story (Jashim, Bullet, Nusrat, Rafiq, Shirin) • PostgreSQL Row Locking
      </footer>
    </div>
  );
}
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
  Columns,
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
  resetDatabase,
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
  const [activeTab, setActiveTab] = useState<'passenger' | 'driver' | 'split'>('split');
  const [resetting, setResetting] = useState<boolean>(false);

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

  // Automatic background polling every 2s for live real-time updates
  useEffect(() => {
    const timer = setInterval(() => {
      if (selectedPassengerId) refreshPassengerData();
      if (selectedDriverId) refreshDriverData();
    }, 2000);
    return () => clearInterval(timer);
  }, [selectedPassengerId, selectedDriverId]);

  // Reactive trip lifecycle listener: fires notifications when driver accepts, arrives, starts, or completes
  const prevRideStatusRef = React.useRef<string | null>(null);
  useEffect(() => {
    const currentRide = passengerHistory[0];
    if (!currentRide) {
      prevRideStatusRef.current = null;
      return;
    }

    const prevStatus = prevRideStatusRef.current;
    const currentStatus = currentRide.status;

    if (prevStatus && prevStatus !== currentStatus) {
      if (currentStatus === 'MATCHED') {
        triggerToast('pool', '⚡ Request Accepted!', 'Driver Jashim accepted your ride! Bullet (3-Seater) is assigned.');
      } else if (currentStatus === 'DRIVER_ARRIVED') {
        triggerToast('success', '📍 Driver Arrived!', 'Bullet has arrived at pickup in Banani. Please board the easybike.');
      } else if (currentStatus === 'IN_PROGRESS') {
        triggerToast('pool', '🛺 Ride Started (In Ride)!', 'Bullet is now on the road heading to your destination.');
      } else if (currentStatus === 'COMPLETED') {
        triggerToast('success', '✅ Trip Completed!', 'You have arrived safely! Fare deducted from wallet.');
      } else if (currentStatus === 'CANCELLED') {
        const isFull =
          currentRide.auditLogs?.[0]?.reason?.toLowerCase().includes('full') ||
          currentRide.auditLogs?.[0]?.reason?.toLowerCase().includes('capacity');
        triggerToast(
          'error',
          isFull ? '🚫 Ride Rejected (Bullet Full)' : 'Ride Cancelled',
          isFull
            ? 'Bullet is at full capacity (3/3 seats). Please make a new request.'
            : 'Ride was cancelled.'
        );
      }
    }

    prevRideStatusRef.current = currentStatus;
  }, [passengerHistory]);

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
      const pList = await fetchPassengers();
      setPassengers(pList);
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
      const dList = await fetchDrivers();
      setDrivers(dList);
      const pList = await fetchPassengers();
      setPassengers(pList);
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

  async function handleResetDatabase() {
    setResetting(true);
    try {
      await resetDatabase();
      setSimulationData(null);
      setShowStoryReader(false);
      triggerToast('success', 'Database Reset', 'Clean database restored with Jashim, Bullet & 500 BDT wallets.');
      await loadInitialData();
      if (selectedPassengerId) await refreshPassengerData();
      if (selectedDriverId) await refreshDriverData();
    } catch (err: any) {
      triggerToast('error', 'Reset Failed', err.message);
    } finally {
      setResetting(false);
    }
  }


  const currentPassenger = passengers.find((p) => p.id === selectedPassengerId);
  const currentDriver = drivers.find((d) => d.id === selectedDriverId);
  const activePool = driverDashboard?.poolsAsDriver?.[0];
  const occupiedSeats = activePool?.occupiedSeats || 0;
  const maxCapacity = driverDashboard?.vehicles?.[0]?.totalCapacity || 3;
  const isPooled = (activePool?.requests?.length || 0) > 1;
  const onboardRequests = activePool?.requests || [];

  // Story availability logic
  const isOngoingTrip =
    Boolean(activePool) &&
    activePool.status !== 'COMPLETED' &&
    activePool.status !== 'CANCELLED' &&
    ((activePool.occupiedSeats || 0) > 0 ||
      activePool.status === 'DRIVER_ARRIVED' ||
      activePool.status === 'IN_PROGRESS' ||
      activePool.status === 'STARTED');

  const hasPendingManualRequests = availableRequests.length > 0;
  const hasAlreadyExecutedStory = simulationData !== null;

  // The 1-click story is active and available when there is no ongoing manual trip,
  // no pending manual requests, not already executed, and not currently simulating/resetting.
  const isStoryAvailable =
    !simulating &&
    !resetting &&
    !isOngoingTrip &&
    !hasPendingManualRequests &&
    !hasAlreadyExecutedStory;

  let storyButtonText = '1-Click Story';
  let storyButtonTitle = 'Execute the Banani Rush-Hour Story';

  if (simulating) {
    storyButtonText = 'Executing Story...';
    storyButtonTitle = 'Simulation is currently running';
  } else if (resetting) {
    storyButtonText = 'Resetting...';
    storyButtonTitle = 'Database is being reset';
  } else if (hasAlreadyExecutedStory) {
    storyButtonText = 'Story Executed (Reset DB to Re-Run)';
    storyButtonTitle = 'The 1-Click Story was already executed. Click "Reset Database" to run it again.';
  } else if (isOngoingTrip) {
    storyButtonText = 'Story Unavailable (Trip In Progress)';
    storyButtonTitle = 'Bullet is currently in transit with active passengers. Story will be available after ride completes or database reset.';
  } else if (hasPendingManualRequests) {
    storyButtonText = 'Story Unavailable (Requests Pending)';
    storyButtonTitle = 'There are pending ride requests awaiting driver approval.';
  } else {
    storyButtonText = '1-Click Story (Available)';
    storyButtonTitle = 'Story is available! Click to execute the Banani Rush-Hour simulation.';
  }

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
              onClick={handleResetDatabase}
              disabled={resetting}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/50 text-slate-200 hover:text-rose-200 font-bold rounded-xl text-xs sm:text-sm transition cursor-pointer disabled:opacity-50"
              title="Reset Database & Seed Initial Cast"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-rose-400 ${resetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{resetting ? 'Resetting...' : 'Reset Database'}</span>
              <span className="sm:hidden">Reset</span>
            </button>

            <button
              onClick={() => setShowStoryReader(true)}
              className={`flex items-center space-x-1.5 px-3 py-2 border font-bold rounded-xl text-xs sm:text-sm transition cursor-pointer ${
                hasAlreadyExecutedStory
                  ? 'bg-cyan-950/70 hover:bg-cyan-900/70 border-cyan-500/60 text-cyan-200 shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
              }`}
              title={hasAlreadyExecutedStory ? 'Story Results Available! Click to view timeline' : 'Open Reading Mode Walkthrough'}
            >
              <BookOpen className={`w-4 h-4 ${hasAlreadyExecutedStory ? 'text-cyan-300' : 'text-cyan-400'}`} />
              <span className="hidden sm:inline">
                {hasAlreadyExecutedStory ? 'Story Available (View)' : 'Story Reading Mode'}
              </span>
              <span className="sm:hidden">Story</span>
              {hasAlreadyExecutedStory && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse ml-0.5"></span>
              )}
            </button>

            <button
              onClick={handleRunSimulation}
              disabled={!isStoryAvailable}
              className={`flex items-center space-x-2 px-3.5 py-2 font-black rounded-xl text-xs sm:text-sm transition ${
                isStoryAvailable
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 ring-1 ring-amber-400/50 cursor-pointer animate-pulse'
                  : 'bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
              }`}
              title={storyButtonTitle}
            >
              <Play className={`w-4 h-4 ${isStoryAvailable ? 'fill-slate-950 text-slate-950' : 'fill-slate-500 text-slate-500'}`} />
              <span>{storyButtonText}</span>
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

              {simulationData?.timeline && (
                <div className="bg-emerald-950/70 border border-emerald-500/50 rounded-xl p-4 text-xs sm:text-sm text-emerald-200 space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2 font-bold text-emerald-300">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>Live Simulation Execution Log ({simulationData.timeline.length} Events Verified):</span>
                  </div>
                  <ul className="space-y-1.5 font-mono text-xs pl-2">
                    {simulationData.timeline.map((line: string, i: number) => (
                      <li key={i} className="flex items-start space-x-2">
                        <span className="text-emerald-400 font-bold">✓</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('split')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                activeTab === 'split'
                  ? 'bg-cyan-500 text-slate-950 shadow-md ring-2 ring-cyan-400/50'
                  : 'bg-slate-800/80 text-cyan-300 hover:text-white hover:bg-slate-800 border border-cyan-500/30'
              }`}
            >
              <Columns className="w-4 h-4" />
              <span>📺 Side-by-Side (Demo Video Mode)</span>
            </button>
            <button
              onClick={() => setActiveTab('passenger')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                activeTab === 'passenger'
                  ? 'bg-emerald-500 text-slate-950 shadow-md ring-2 ring-emerald-400/50'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Passenger Portal</span>
            </button>
            <button
              onClick={() => setActiveTab('driver')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-pointer ${
                activeTab === 'driver'
                  ? 'bg-emerald-500 text-slate-950 shadow-md ring-2 ring-emerald-400/50'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>Driver Portal</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm">
            {activeTab === 'split' ? (
              <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400 text-xs font-bold pl-1">Passenger:</span>
                  <select
                    value={selectedPassengerId}
                    onChange={(e) => setSelectedPassengerId(e.target.value)}
                    className="bg-slate-950 text-emerald-400 font-bold rounded-lg px-2 py-1 border border-slate-700 text-xs focus:outline-none"
                  >
                    {passengers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.walletBalancePoysha / 100} BDT)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="h-4 w-px bg-slate-800 hidden sm:block" />
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-400 text-xs font-bold">Driver:</span>
                  <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="bg-slate-950 text-amber-400 font-bold rounded-lg px-2 py-1 border border-slate-700 text-xs focus:outline-none"
                  >
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} (Bullet)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : activeTab === 'passenger' ? (
              <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400 font-bold text-xs">Passenger Persona:</span>
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
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-slate-400 font-bold text-xs">Driver Persona:</span>
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
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PASSENGER PORTAL COMPONENT HELPER                                         */}
        {/* ========================================================================= */}
        {(() => {
          // Check if passenger has any active ride waiting for approval or ongoing
          const activeRide = passengerHistory.find((r) =>
            ['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'IN_PROGRESS'].includes(r.status)
          );
          const isWaitingApproval = activeRide?.status === 'REQUESTED';
          const isDriverAccepted = activeRide?.status === 'MATCHED';
          const isDriverArrived = activeRide?.status === 'DRIVER_ARRIVED';
          const isInRide = activeRide?.status === 'IN_PROGRESS';
          const hasActiveRide = Boolean(activeRide);

          // Check if Bullet is currently driving on the road (STARTED) or full
          const isBulletInTransit = activePool?.status === 'STARTED';
          const isBulletFull = occupiedSeats >= maxCapacity;
          // Passenger can only request when driver is assigning (after previous trip completes)
          const isDriverAssigning = !isBulletInTransit && !isBulletFull;

          // Current ride to highlight on live status banner:
          // Prefer activeRide if exists; otherwise latest past ride in history
          const currentRide = activeRide || passengerHistory[0];

          const isRejectedBulletFull =
            currentRide?.status === 'CANCELLED' &&
            (currentRide?.auditLogs?.[0]?.reason?.toLowerCase().includes('bullet is full') ||
              currentRide?.auditLogs?.[0]?.reason?.toLowerCase().includes('capacity') ||
              currentRide?.auditLogs?.[0]?.reason?.toLowerCase().includes('rejected') ||
              currentRide?.auditLogs?.[0]?.reason?.toLowerCase().includes('en route'));

          const isRequested = currentRide?.status === 'REQUESTED';
          const isMatched = currentRide?.status === 'MATCHED';
          const isArrived = currentRide?.status === 'DRIVER_ARRIVED';
          const isInProgress = currentRide?.status === 'IN_PROGRESS';
          const isCompleted = currentRide?.status === 'COMPLETED';

          const renderPassengerCard = (
            <div className="bg-[#0e1628] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl flex flex-col justify-between">
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="font-black text-sm sm:text-base text-white flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Book Shared Tesla</span>
                  </span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    {currentPassenger?.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Pickup Zone</label>
                    <select
                      value={pickupZone}
                      onChange={(e) => setPickupZone(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
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
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
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
                        className={`py-1.5 text-xs sm:text-sm font-black rounded-xl border transition ${
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
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-300 font-medium">
                      <span>Corridor Distance:</span>
                      <span className="font-bold text-white">{fareEstimate.soloFare.distanceKm} km</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-800">
                      <div>
                        <span className="font-black text-cyan-400 flex items-center space-x-1 text-xs">
                          <Zap className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Pooled (-25% Discount)</span>
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          Solo Price: <s className="text-slate-500">{fareEstimate.soloFare.finalFareBdt} BDT</s>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-lg sm:text-xl text-emerald-400 block leading-tight">
                          {fareEstimate.pooledFare.finalFareBdt} BDT
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({fareEstimate.pooledFare.finalFarePoysha} Poysha)
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={handleBookRide}
                disabled={passengerLoading || pickupZone === destinationZone || hasActiveRide || !isDriverAssigning}
                className="w-full mt-3 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm shadow-lg transition disabled:opacity-50 cursor-pointer"
              >
                {passengerLoading
                  ? 'Processing Request...'
                  : isWaitingApproval
                  ? 'Waiting for Driver Approval'
                  : isDriverAccepted
                  ? 'Driver Accepted (In Progress)'
                  : isDriverArrived
                  ? 'Driver Arrived (Boarding Now)'
                  : isInRide
                  ? 'In Ride (Available After Ride Completes)'
                  : isBulletInTransit
                  ? 'Bullet In Transit (Available After Ride Completes)'
                  : isBulletFull
                  ? 'Bullet Full (3/3 Seats Occupied)'
                  : pickupZone === destinationZone
                  ? 'Select Different Destination'
                  : 'Request Ride'}
              </button>

              {isBulletInTransit && !hasActiveRide && (
                <div className="mt-2.5 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center space-x-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Bullet is currently on the road. Next bookings will open as soon as driver completes this trip.</span>
                </div>
              )}
            </div>
          );

          const renderStatusCard = (
            <div className="bg-[#0e1628] border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="font-bold text-xs sm:text-sm text-white flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    <span>Active Ride Status ({currentPassenger?.name})</span>
                  </span>
                  <button
                    onClick={refreshPassengerData}
                    className="text-xs text-slate-300 hover:text-white flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {!currentRide ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    No active ride requested yet. Book a ride to see live updates!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* PROMINENT LIVE ALERT BANNER */}
                    <div
                      className={`p-3.5 sm:p-4 rounded-xl border-2 flex items-start space-x-3 transition shadow-lg ${
                        isRejectedBulletFull
                          ? 'bg-rose-950/40 border-rose-500/60 text-rose-200'
                          : isCompleted
                          ? 'bg-emerald-950/60 border-emerald-400 text-emerald-100 shadow-emerald-950/50'
                          : isInProgress
                          ? 'bg-amber-950/60 border-amber-400 text-amber-100 shadow-amber-950/50 animate-pulse'
                          : isArrived
                          ? 'bg-blue-950/60 border-blue-400 text-blue-100 shadow-blue-950/50'
                          : isMatched
                          ? 'bg-cyan-950/70 border-cyan-400 text-cyan-100 shadow-cyan-950/50 ring-2 ring-cyan-400/30'
                          : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                      }`}
                    >
                      <div className="p-2 sm:p-2.5 rounded-xl bg-black/50 shrink-0">
                        {isRejectedBulletFull ? (
                          <Ban className="w-5 h-5 text-rose-400" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        ) : isInProgress ? (
                          <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
                        ) : isArrived ? (
                          <MapPin className="w-5 h-5 text-blue-400 animate-bounce" />
                        ) : isMatched ? (
                          <Car className="w-5 h-5 text-cyan-400 animate-pulse" />
                        ) : (
                          <Clock className="w-5 h-5 text-amber-400 animate-spin" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5">
                          <h4 className="font-black text-white text-xs sm:text-sm md:text-base leading-snug">
                            {isRejectedBulletFull
                              ? '🚫 RIDE REJECTED (BULLET FULL)'
                              : isCompleted
                              ? '✅ TRIP COMPLETED & FARE DEDUCTED!'
                              : isInProgress
                              ? '⚡ IN RIDE (TRIP IN PROGRESS)!'
                              : isArrived
                              ? '📍 DRIVER ARRIVED AT BANANI!'
                              : isMatched
                              ? '🎉 DRIVER ACCEPTED YOUR RIDE!'
                              : '🕒 WAITING FOR DRIVER APPROVAL...'}
                          </h4>
                          <span
                            className={`text-[10px] sm:text-xs font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                              isRejectedBulletFull
                                ? 'bg-rose-500 text-white'
                                : isCompleted
                                ? 'bg-emerald-500 text-slate-950'
                                : isInProgress
                                ? 'bg-amber-500 text-slate-950'
                                : isArrived
                                ? 'bg-blue-500 text-white'
                                : isMatched
                                ? 'bg-cyan-400 text-slate-950'
                                : 'bg-amber-400 text-slate-950'
                            }`}
                          >
                            {isRejectedBulletFull
                              ? 'Full (3/3)'
                              : isCompleted
                              ? 'Completed'
                              : isInProgress
                              ? 'On The Road'
                              : isArrived
                              ? 'Boarding'
                              : isMatched
                              ? 'Bullet Assigned'
                              : 'Pending Approval'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                          {isRejectedBulletFull
                            ? 'Bullet is at legal maximum capacity (3/3 seats). Please submit a new ride request.'
                            : isCompleted
                            ? `You arrived at ${currentRide.destinationZone}! ${currentRide.finalFarePoysha / 100} BDT deducted from your wallet balance.`
                            : isInProgress
                            ? `Bullet is on the road heading to ${currentRide.destinationZone} with Jashim.`
                            : isArrived
                            ? 'Bullet has arrived at Banani pickup point. Please meet Jashim and board the easybike!'
                            : isMatched
                            ? `Driver Jashim accepted your request in Bullet (Plate: DHAKA-METRO-CHA-11-2026). Vehicle is on the way!`
                            : 'Your ride request is waiting for Driver Jashim’s approval in the Banani corridor.'}
                        </p>

                        {isMatched && (
                          <div className="mt-2 pt-2 border-t border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200">
                            <span>Vehicle: <strong>Bullet (3-Seater Tesla)</strong></span>
                            <span>Fare: <strong className="text-white font-mono">{currentRide.finalFarePoysha / 100} BDT</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Trip Info Row */}
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white">
                          {currentRide.pickupZone} → {currentRide.destinationZone}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-emerald-400 text-xs sm:text-sm">
                            {isRejectedBulletFull ? '0.00 BDT' : `${currentRide.finalFarePoysha / 100} BDT`}
                          </span>
                          {['REQUESTED', 'MATCHED', 'DRIVER_ARRIVED'].includes(currentRide.status) && !isRejectedBulletFull && (
                            <button
                              onClick={() => handleCancelRide(currentRide.id)}
                              className="px-2 py-0.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold rounded transition cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 5-Step Visual Progress Stepper */}
                      {!isRejectedBulletFull && (
                        <div className="pt-2 border-t border-slate-800/80 grid grid-cols-5 gap-1 text-center text-[9px] font-bold tracking-tight">
                          <div
                            className={`py-1 px-0.5 rounded transition ${
                              isRequested || isMatched || isArrived || isInProgress || isCompleted
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-900 text-slate-600'
                            }`}
                          >
                            1. Requested
                          </div>
                          <div
                            className={`py-1 px-0.5 rounded transition ${
                              isMatched || isArrived || isInProgress || isCompleted
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-slate-900 text-slate-600'
                            }`}
                          >
                            2. Accepted
                          </div>
                          <div
                            className={`py-1 px-0.5 rounded transition ${
                              isArrived || isInProgress || isCompleted
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-slate-900 text-slate-600'
                            }`}
                          >
                            3. Arrived
                          </div>
                          <div
                            className={`py-1 px-0.5 rounded transition ${
                              isInProgress || isCompleted
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                                : 'bg-slate-900 text-slate-600'
                            }`}
                          >
                            4. In Ride
                          </div>
                          <div
                            className={`py-1 px-0.5 rounded transition ${
                              isCompleted
                                ? 'bg-emerald-500 text-slate-950 font-black'
                                : 'bg-slate-900 text-slate-600'
                            }`}
                          >
                            5. Completed
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ALL RIDE HISTORY (Shows both completed & auto-rejected rides!) */}
                    {passengerHistory.length > 0 && (
                      <div className="pt-2.5 border-t border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                          <span>All Ride History ({passengerHistory.length})</span>
                          <span className="text-[10px] text-slate-500 font-normal">Past & current requests</span>
                        </div>
                        <div className="overflow-y-auto max-h-[140px] space-y-1.5 pr-1">
                          {passengerHistory.map((pastRide) => {
                            const isPastRejected =
                              pastRide.status === 'CANCELLED' &&
                              (pastRide.auditLogs?.[0]?.reason?.toLowerCase().includes('bullet is full') ||
                                pastRide.auditLogs?.[0]?.reason?.toLowerCase().includes('capacity') ||
                                pastRide.auditLogs?.[0]?.reason?.toLowerCase().includes('rejected') ||
                                pastRide.auditLogs?.[0]?.reason?.toLowerCase().includes('en route'));

                            return (
                              <div
                                key={pastRide.id}
                                className={`p-2 rounded-lg border text-xs flex items-center justify-between transition ${
                                  pastRide.status === 'COMPLETED'
                                    ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-200'
                                    : isPastRejected
                                    ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                                    : pastRide.status === 'CANCELLED'
                                    ? 'bg-slate-900 border-slate-800 text-slate-400'
                                    : pastRide.status === 'MATCHED'
                                    ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
                                    : pastRide.status === 'DRIVER_ARRIVED'
                                    ? 'bg-blue-950/30 border-blue-500/40 text-blue-200'
                                    : pastRide.status === 'IN_PROGRESS'
                                    ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                                    : 'bg-slate-900 border-slate-800 text-slate-300'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-white truncate">
                                      {pastRide.pickupZone} → {pastRide.destinationZone}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      ({pastRide.requestedSeats} {pastRide.requestedSeats === 1 ? 'seat' : 'seats'})
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 block truncate">
                                    {isPastRejected
                                      ? 'Auto-Rejected (Bullet 3/3 Full)'
                                      : pastRide.status === 'COMPLETED'
                                      ? 'Trip Completed • Paid'
                                      : pastRide.status === 'CANCELLED'
                                      ? 'Cancelled'
                                      : pastRide.status === 'MATCHED'
                                      ? 'Accepted by Jashim'
                                      : pastRide.status === 'DRIVER_ARRIVED'
                                      ? 'Bullet Arrived at Pickup'
                                      : pastRide.status === 'IN_PROGRESS'
                                      ? 'In Transit to Destination'
                                      : 'Waiting for Driver Approval'}
                                  </span>
                                </div>

                                <div className="text-right shrink-0 flex flex-col items-end">
                                  <span className="font-mono font-bold text-xs text-white">
                                    {isPastRejected || pastRide.status === 'CANCELLED' ? '0.00 BDT' : `${pastRide.finalFarePoysha / 100} BDT`}
                                  </span>
                                  <span
                                    className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                      pastRide.status === 'COMPLETED'
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        : isPastRejected
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                        : pastRide.status === 'MATCHED'
                                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                        : pastRide.status === 'REQUESTED'
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {isPastRejected ? 'Rejected' : pastRide.status.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );

          const renderDriverCockpit = (
            <div className="bg-[#0e1628] border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-xl flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <BatteryCharging className="w-5 h-5 text-emerald-400" />
                    <span className="font-black text-sm sm:text-base text-white">Bullet (3-Seater Tesla)</span>
                  </div>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-extrabold border border-emerald-500/30">
                    ONLINE
                  </span>
                </div>

                {/* THE 3-SEATER CABIN DIAGRAM */}
                <div className="border border-slate-700 rounded-xl p-3 bg-slate-950/80 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-bold">Physical Cabin Layout</span>
                    <span
                      className={`font-black text-[11px] px-2 py-0.5 rounded-full ${
                        occupiedSeats >= maxCapacity
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      }`}
                    >
                      {occupiedSeats} / {maxCapacity} SEATS OCCUPIED
                    </span>
                  </div>

                  {/* Driver Cockpit */}
                  <div className="w-full py-1.5 px-3 rounded-xl bg-slate-800/90 border border-amber-500/50 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="text-amber-400 font-black">⚡</span>
                      <span className="font-extrabold text-white">Jashim (Driver)</span>
                    </div>
                    <span className="text-[11px] text-slate-300 bg-black/50 px-2 py-0.5 rounded font-mono border border-slate-700">
                      📍 {driverDashboard?.vehicles?.[0]?.currentZone || 'Banani'}
                    </span>
                  </div>

                  {/* 3 Passenger Seats */}
                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((seatIdx) => {
                      const req = onboardRequests[seatIdx];
                      const isOcc = seatIdx < occupiedSeats;
                      return (
                        <div
                          key={seatIdx}
                          className={`min-h-[75px] rounded-xl p-2 flex flex-col justify-between border text-center transition ${
                            isOcc
                              ? isPooled
                                ? 'bg-cyan-950/50 border-cyan-500 text-cyan-200 shadow-md'
                                : 'bg-emerald-950/50 border-emerald-500 text-emerald-200 shadow-md'
                              : 'bg-slate-900/60 border-dashed border-slate-700 text-slate-500'
                          }`}
                        >
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span className="font-bold">Seat {seatIdx + 1}</span>
                            <Users className={`w-3 h-3 ${isOcc ? 'text-emerald-400' : 'text-slate-600'}`} />
                          </div>
                          <div className="my-auto py-0.5">
                            {isOcc ? (
                              <span className="font-black text-xs text-white block truncate">
                                {req?.passenger?.name || `Passenger`}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-semibold">Vacant</span>
                            )}
                          </div>
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
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
                      className="w-full py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs sm:text-sm transition cursor-pointer"
                    >
                      Mark Arrival at Banani
                    </button>
                  )}
                  {activePool.status === 'DRIVER_ARRIVED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'STARTED')}
                      className="w-full py-2.5 sm:py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition cursor-pointer"
                    >
                      Start Trip (Board Passengers)
                    </button>
                  )}
                  {activePool.status === 'STARTED' && (
                    <button
                      onClick={() => handleUpdateStatus(activePool.id, 'COMPLETED')}
                      className="w-full py-2.5 sm:py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition cursor-pointer"
                    >
                      Complete Trip & Settle Fares
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 text-center py-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
                  Bullet is idle in Banani. Accept incoming corridor requests.
                </div>
              )}
            </div>
          );

          const renderDriverQueue = (
            <div className="bg-[#0e1628] border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col space-y-3">
              {/* Onboard List (if active) */}
              {activePool && activePool.requests?.length > 0 && (
                <div className="border-b border-slate-800 pb-2.5">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-black text-white">Passengers Currently Onboard</span>
                    <span className="text-[11px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      Status: {activePool.status}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activePool.requests.map((r: any) => (
                      <div
                        key={r.id}
                        className="p-2 bg-slate-900 rounded-xl border border-slate-800 flex justify-between items-center text-xs"
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
                <div className="flex items-center justify-between pb-2 mb-1">
                  <span className="font-black text-xs sm:text-sm text-white">Incoming Passenger Queue</span>
                  <button
                    onClick={refreshDriverData}
                    className="text-xs text-slate-300 hover:text-white flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Bullet Full Alert Banner */}
                {occupiedSeats >= maxCapacity && (
                  <div className="mb-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-300">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[11px]">Bullet FULL (3/3 Seats) — Excess requests auto-rejected.</span>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-2 pr-1">
                  {availableRequests.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      No pending requests in Banani. Create one from the Passenger Portal!
                    </div>
                  ) : (
                    availableRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-white block">
                            {req.passenger.name} ({req.pickupZone} → {req.destinationZone})
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            Seats: <strong>{req.requestedSeats}</strong> • Fare: <strong>{req.finalFarePoysha / 100} BDT</strong>
                          </span>
                        </div>

                        <div>
                          {occupiedSeats + req.requestedSeats > maxCapacity ? (
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                              Auto-Rejected (Full)
                            </span>
                          ) : (
                            <button
                              onClick={() => handleMatchRequest(req.id)}
                              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-lg text-xs transition cursor-pointer"
                            >
                              Accept Ride
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );

          if (activeTab === 'split') {
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1">
                {/* Left Column: Passenger Portal */}
                <div className="space-y-3 flex flex-col">
                  <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                    <span className="text-emerald-400 font-black flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5" />
                      <span>Passenger View ({currentPassenger?.name})</span>
                    </span>
                    <span className="text-slate-400 font-mono">Wallet: {currentPassenger ? currentPassenger.walletBalancePoysha / 100 : 0} BDT</span>
                  </div>
                  {renderPassengerCard}
                  {renderStatusCard}
                </div>

                {/* Right Column: Driver Portal */}
                <div className="space-y-3 flex flex-col">
                  <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                    <span className="text-amber-400 font-black flex items-center space-x-1.5">
                      <Car className="w-3.5 h-3.5" />
                      <span>Driver View (Jashim & Bullet)</span>
                    </span>
                    <span className="text-slate-400 font-mono">Zone: {driverDashboard?.vehicles?.[0]?.currentZone || 'Banani'}</span>
                  </div>
                  {renderDriverCockpit}
                  {renderDriverQueue}
                </div>
              </div>
            );
          }

          if (activeTab === 'passenger') {
            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
                <div className="lg:col-span-5">{renderPassengerCard}</div>
                <div className="lg:col-span-7">{renderStatusCard}</div>
              </div>
            );
          }

          if (activeTab === 'driver') {
            return (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
                <div className="lg:col-span-5">{renderDriverCockpit}</div>
                <div className="lg:col-span-7">{renderDriverQueue}</div>
              </div>
            );
          }

          return null;
        })()}
      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-800 bg-[#0c1322] py-2.5 text-center text-xs text-slate-400">
        Dhaka Tesla Pool MVP • Banani Rush-Hour Story (Jashim, Bullet, Nusrat, Rafiq, Shirin) • PostgreSQL Row Locking
      </footer>
    </div>
  );
}
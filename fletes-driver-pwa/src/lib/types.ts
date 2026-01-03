export type JobStatus = 'PENDING' | 'TO_PICKUP' | 'LOADING' | 'TO_DROPOFF' | 'UNLOADING' | 'DONE';
export interface LocationData { address: string; lat: number; lng: number; }
export interface Driver {
  id: string;
  name: string;
  code: string;
  phone?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  jobId?: string | null;
  updatedAt: string;
}
export interface Job {
  id: string; clientName: string; clientPhone?: string; description?: string; pickup: LocationData; dropoff: LocationData; extraStops?: LocationData[];
  notes?: string; helpersCount?: number; estimatedDurationMinutes?: number | null; status: JobStatus; driverId?: string | null;
  chargedAmount?: number | null;
  stopIndex?: number | null;
  distanceMeters?: number | null;
  distanceKm?: number | null;
  scheduledDate?: string; scheduledTime?: string; scheduledAt?: number;
  flags: { nearPickupSent: boolean; arrivedPickupSent: boolean; nearDropoffSent: boolean; arrivedDropoffSent: boolean; };
  timestamps: { startJobAt?: string; startLoadingAt?: string; endLoadingAt?: string; startTripAt?: string; endTripAt?: string; startUnloadingAt?: string; endUnloadingAt?: string; };
  createdAt: string; updatedAt: string;
}

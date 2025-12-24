export type JobStatus = 'PENDING' | 'TO_PICKUP' | 'LOADING' | 'TO_DROPOFF' | 'UNLOADING' | 'DONE';
export interface LocationData { address: string; lat: number; lng: number; }
export interface Job {
  id: string; clientName: string; clientPhone?: string; pickup: LocationData; dropoff: LocationData;
  notes?: string; status: JobStatus;
  scheduledDate?: string; scheduledTime?: string; scheduledAt?: number;
  flags: { nearPickupSent: boolean; arrivedPickupSent: boolean; nearDropoffSent: boolean; arrivedDropoffSent: boolean; };
  timestamps: { startJobAt?: string; startLoadingAt?: string; endLoadingAt?: string; startTripAt?: string; endTripAt?: string; startUnloadingAt?: string; endUnloadingAt?: string; };
  createdAt: string; updatedAt: string;
}

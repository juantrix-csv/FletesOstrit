import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos((lat1*Math.PI)/180) * Math.cos((lat2*Math.PI)/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};
export const formatDuration = (start?: string, end?: string) => {
  if (!start || !end) return "N/A";
  const diffMins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return diffMins + " min";
};
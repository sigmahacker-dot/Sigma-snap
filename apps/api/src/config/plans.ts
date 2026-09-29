import type { Plan } from '@prisma/client';

export interface PlanLimits {
  /** Max single-file size in MB */
  photoMB: number;
  videoMB: number;
  audioMB: number;
  /** Total storage quota in MB */
  storageMB: number;
  label: string;
  priceMonthlyUSD: number;
  features: string[];
}

/** Per-plan upload caps. FREE: photo 10MB / video 100MB / audio 20MB;
 *  PRO: 25/500/50; CREATOR: 50/2000/200 (per product spec). */
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    photoMB: 10,
    videoMB: 100,
    audioMB: 20,
    storageMB: 1024,
    label: 'Free',
    priceMonthlyUSD: 0,
    features: ['720p uploads', 'Standard lenses', '1 GB storage'],
  },
  PRO: {
    photoMB: 25,
    videoMB: 500,
    audioMB: 50,
    storageMB: 10240,
    label: 'Pro',
    priceMonthlyUSD: 4.99,
    features: ['1080p uploads', 'Premium lenses', 'AI captions & ideas', '10 GB storage'],
  },
  CREATOR: {
    photoMB: 50,
    videoMB: 2000,
    audioMB: 200,
    storageMB: 102400,
    label: 'Creator',
    priceMonthlyUSD: 11.99,
    features: [
      '4K uploads',
      'All premium lenses & templates',
      'Full AI studio',
      'Advanced analytics',
      '100 GB storage',
    ],
  },
};

const ORDER: Plan[] = ['FREE', 'PRO', 'CREATOR'];

/** True when `plan` is at least `required` in the plan hierarchy. */
export function planAtLeast(plan: Plan, required: Plan): boolean {
  return ORDER.indexOf(plan) >= ORDER.indexOf(required);
}

export function maxFileBytes(plan: Plan, kind: 'PHOTO' | 'VIDEO' | 'AUDIO' | 'THUMBNAIL'): number {
  const limits = PLAN_LIMITS[plan];
  const mb =
    kind === 'PHOTO' || kind === 'THUMBNAIL'
      ? limits.photoMB
      : kind === 'VIDEO'
        ? limits.videoMB
        : limits.audioMB;
  return mb * 1024 * 1024;
}

export function storageQuotaBytes(plan: Plan): number {
  return PLAN_LIMITS[plan].storageMB * 1024 * 1024;
}

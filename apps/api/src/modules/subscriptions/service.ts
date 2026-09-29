import type { Plan } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { PLAN_LIMITS } from '../../config/plans';
import { notFound, providerNotConfigured } from '../../utils/errors';
import { recordAudit } from '../../middleware/audit';

export function listPlans() {
  return (Object.keys(PLAN_LIMITS) as Plan[]).map((plan) => ({
    plan,
    ...PLAN_LIMITS[plan],
  }));
}

export async function mySubscription(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['TRIALING', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  return { plan: user?.plan ?? 'FREE', subscription: sub };
}

/**
 * Checkout is a provider abstraction. Without a configured billing provider we
 * return 501 — never a fake checkout URL.
 */
export async function checkout(userId: string, plan: Plan) {
  if (!env.SUBSCRIPTION_PROVIDER || !env.SUBSCRIPTION_API_KEY) {
    throw providerNotConfigured(
      'Checkout is not configured (SUBSCRIPTION_PROVIDER / SUBSCRIPTION_API_KEY missing)',
    );
  }
  throw providerNotConfigured(
    `Billing provider "${env.SUBSCRIPTION_PROVIDER}" is not implemented in this build`,
  );
}

export async function cancel(userId: string) {
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['TRIALING', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) throw notFound('NO_SUBSCRIPTION', 'No active subscription to cancel');
  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: 'CANCELLED', endsAt: new Date() },
  });
  await prisma.user.update({ where: { id: userId }, data: { plan: 'FREE' } });
  await recordAudit({
    actorId: userId,
    action: 'subscription.cancel',
    entityType: 'Subscription',
    entityId: sub.id,
  });
  return updated;
}

export async function featureFlags(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const flags = await prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  const resolved: Record<string, { enabled: boolean; config: unknown }> = {};
  for (const f of flags) {
    resolved[f.key] = {
      enabled: f.enabled && (f.plans.length === 0 || f.plans.includes(user?.plan ?? 'FREE')),
      config: f.config,
    };
  }
  return resolved;
}

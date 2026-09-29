import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const plans = ah(async (_req: Request, res: Response) => {
  res.json(await service.listPlans());
});

export const me = ah(async (req: Request, res: Response) => {
  res.json(await service.mySubscription(req.user!.id));
});

export const checkout = ah(async (req: Request, res: Response) => {
  res.json(await service.checkout(req.user!.id, req.body.plan));
});

export const cancel = ah(async (req: Request, res: Response) => {
  res.json(await service.cancel(req.user!.id));
});

export const features = ah(async (req: Request, res: Response) => {
  res.json(await service.featureFlags(req.user!.id));
});

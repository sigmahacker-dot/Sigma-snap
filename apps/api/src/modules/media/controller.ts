import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';
import { optionalAuth } from '../../middleware/auth';

export const presign = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.presign(req.user!.id, req.user!.plan, req.body));
});

export const completeUpload = ah(async (req: Request, res: Response) => {
  res.json(await service.completeUpload(req.user!.id, req.params.id, req.body));
});

export const getAsset = [
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    res.json(await service.getAsset(req.user?.id, req.params.id));
  }),
];

import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listEffects(req.query.category as string | undefined));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getEffect(req.params.id));
});

export const adminCreate = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.adminCreateEffect(req.user!.id, req.body, req.ip));
});

export const adminPatch = ah(async (req: Request, res: Response) => {
  res.json(await service.adminPatchEffect(req.user!.id, req.params.id, req.body, req.ip));
});

export const adminDelete = ah(async (req: Request, res: Response) => {
  res.json(await service.adminDeleteEffect(req.user!.id, req.params.id, req.ip));
});

import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listLenses(req.query.category as never));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getLens(req.params.id));
});

export const use = ah(async (req: Request, res: Response) => {
  res.json(await service.useLens(req.user!.id, req.user!.plan, req.params.id, req.body.assetId));
});

export const adminCreate = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.adminCreateLens(req.user!.id, req.body, req.ip));
});

export const adminPatch = ah(async (req: Request, res: Response) => {
  res.json(await service.adminPatchLens(req.user!.id, req.params.id, req.body, req.ip));
});

export const adminDelete = ah(async (req: Request, res: Response) => {
  res.json(await service.adminDeleteLens(req.user!.id, req.params.id, req.ip));
});

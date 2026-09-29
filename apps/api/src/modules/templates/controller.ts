import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listTemplates(req.query.category as never));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getTemplate(req.params.id));
});

export const use = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.useTemplate(req.user!.id, req.user!.plan, req.params.id, req.body));
});

export const adminCreate = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.adminCreateTemplate(req.user!.id, req.body, req.ip));
});

export const adminPatch = ah(async (req: Request, res: Response) => {
  res.json(await service.adminPatchTemplate(req.user!.id, req.params.id, req.body, req.ip));
});

export const adminDelete = ah(async (req: Request, res: Response) => {
  res.json(await service.adminDeleteTemplate(req.user!.id, req.params.id, req.ip));
});

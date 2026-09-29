import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const create = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createCall(req.user!.id, req.body));
});

export const history = ah(async (req: Request, res: Response) => {
  res.json(await service.callHistory(req.user!.id, req.query.cursor as string | undefined, req.query.limit));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getCall(req.user!.id, req.params.id));
});

export const end = ah(async (req: Request, res: Response) => {
  res.json(await service.endCall(req.user!.id, req.params.id));
});

import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listNotifications(req.user!.id, req.query.cursor as string | undefined, req.query.limit));
});

export const markRead = ah(async (req: Request, res: Response) => {
  res.json(await service.markRead(req.user!.id, req.params.id));
});

export const markAllRead = ah(async (req: Request, res: Response) => {
  res.json(await service.markAllRead(req.user!.id));
});

export const registerPushToken = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.registerPushToken(req.user!.id, req.body.token, req.body.platform));
});

export const deletePushToken = ah(async (req: Request, res: Response) => {
  res.json(await service.deletePushToken(req.user!.id, req.body.token));
});

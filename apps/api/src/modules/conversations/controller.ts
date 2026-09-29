import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listConversations(req.user!.id));
});

export const create = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createConversation(req.user!.id, req.body));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getConversation(req.user!.id, req.params.id));
});

export const patch = ah(async (req: Request, res: Response) => {
  res.json(await service.patchConversation(req.user!.id, req.params.id, req.body));
});

export const leave = ah(async (req: Request, res: Response) => {
  res.json(await service.leaveConversation(req.user!.id, req.params.id));
});

export const sendMessage = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.sendMessage(req.user!.id, req.params.id, req.body));
});

export const markRead = ah(async (req: Request, res: Response) => {
  res.json(await service.markRead(req.user!.id, req.params.id, req.body.lastReadAt));
});

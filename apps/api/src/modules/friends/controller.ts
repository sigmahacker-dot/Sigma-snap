import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listFriends(req.user!.id));
});

export const listRequests = ah(async (req: Request, res: Response) => {
  res.json(await service.listRequests(req.user!.id, (req.query.dir as 'incoming' | 'outgoing') ?? 'incoming'));
});

export const sendRequest = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.sendRequest(req.user!.id, req.body.toUserId));
});

export const acceptRequest = ah(async (req: Request, res: Response) => {
  res.json(await service.acceptRequest(req.user!.id, req.params.id));
});

export const rejectRequest = ah(async (req: Request, res: Response) => {
  res.json(await service.rejectRequest(req.user!.id, req.params.id));
});

export const removeFriend = ah(async (req: Request, res: Response) => {
  res.json(await service.removeFriend(req.user!.id, req.params.userId));
});

export const listClose = ah(async (req: Request, res: Response) => {
  res.json(await service.listCloseFriends(req.user!.id));
});

export const addClose = ah(async (req: Request, res: Response) => {
  res.json(await service.addCloseFriend(req.user!.id, req.params.userId));
});

export const removeClose = ah(async (req: Request, res: Response) => {
  res.json(await service.removeCloseFriend(req.user!.id, req.params.userId));
});

export const discover = ah(async (req: Request, res: Response) => {
  const contactsPermission = req.query.contactsPermission ?? req.body.contactsPermission;
  const limit = req.query.limit ?? req.body.limit;
  res.json(await service.discover(req.user!.id, contactsPermission, limit));
});

import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const search = ah(async (req: Request, res: Response) => {
  res.json(await service.searchUsers(req.user!.id, req.query.q as string, req.query.limit));
});

export const suggestions = ah(async (req: Request, res: Response) => {
  res.json(await service.suggestions(req.user!.id));
});

export const getProfile = ah(async (req: Request, res: Response) => {
  res.json(await service.getProfile(req.user?.id, req.params.username));
});

export const updateMe = ah(async (req: Request, res: Response) => {
  res.json(await service.updateMe(req.user!.id, req.body));
});

export const changeUsername = ah(async (req: Request, res: Response) => {
  res.json(await service.changeUsername(req.user!.id, req.body.username));
});

export const setAvatar = ah(async (req: Request, res: Response) => {
  res.json(await service.setAvatar(req.user!.id, req.body.assetId));
});

export const updatePrivacy = ah(async (req: Request, res: Response) => {
  res.json(await service.updatePrivacy(req.user!.id, req.body));
});

export const updateNotificationPrefs = ah(async (req: Request, res: Response) => {
  res.json(await service.updateNotificationPrefs(req.user!.id, req.body));
});

export const updateLocation = ah(async (req: Request, res: Response) => {
  res.json(await service.updateLocation(req.user!.id, req.body));
});

export const followers = ah(async (req: Request, res: Response) => {
  res.json(await service.followers(req.params.id, req.query.cursor as string | undefined, req.query.limit));
});

export const following = ah(async (req: Request, res: Response) => {
  res.json(await service.following(req.params.id, req.query.cursor as string | undefined, req.query.limit));
});

export const follow = ah(async (req: Request, res: Response) => {
  res.json(await service.follow(req.user!.id, req.params.id));
});

export const unfollow = ah(async (req: Request, res: Response) => {
  res.json(await service.unfollow(req.user!.id, req.params.id));
});

export const block = ah(async (req: Request, res: Response) => {
  res.json(await service.block(req.user!.id, req.params.id));
});

export const unblock = ah(async (req: Request, res: Response) => {
  res.json(await service.unblock(req.user!.id, req.params.id));
});

export const mute = ah(async (req: Request, res: Response) => {
  res.json(await service.mute(req.user!.id, req.params.id));
});

export const unmute = ah(async (req: Request, res: Response) => {
  res.json(await service.unmute(req.user!.id, req.params.id));
});

export const blockedList = ah(async (req: Request, res: Response) => {
  res.json(await service.blockedList(req.user!.id));
});

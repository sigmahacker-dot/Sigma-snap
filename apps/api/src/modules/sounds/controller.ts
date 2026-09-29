import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(await service.listSounds(req.query.q as string | undefined, (req.query.sort as 'trending' | 'new') ?? 'trending'));
});

export const create = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createSound(req.user!.id, req.body));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getSound(req.params.id));
});

export const posts = ah(async (req: Request, res: Response) => {
  res.json(await service.soundPosts(req.params.id));
});

export const remove = ah(async (req: Request, res: Response) => {
  res.json(await service.deleteSound(req.user!.id, req.user!.role, req.params.id, req.ip));
});

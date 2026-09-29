import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const caption = ah(async (req: Request, res: Response) => {
  res.json(await service.caption(req.user!.id, req.body));
});
export const hashtags = ah(async (req: Request, res: Response) => {
  res.json(await service.hashtags(req.user!.id, req.body));
});
export const title = ah(async (req: Request, res: Response) => {
  res.json(await service.title(req.user!.id, req.body));
});
export const script = ah(async (req: Request, res: Response) => {
  res.json(await service.script(req.user!.id, req.body));
});
export const ideas = ah(async (req: Request, res: Response) => {
  res.json(await service.ideas(req.user!.id, req.body));
});
export const thumbnail = ah(async (req: Request, res: Response) => {
  res.json(await service.thumbnail(req.user!.id, req.body));
});
export const subtitles = ah(async (req: Request, res: Response) => {
  res.json(await service.subtitles(req.user!.id, req.body));
});
export const translate = ah(async (req: Request, res: Response) => {
  res.json(await service.translate(req.user!.id, req.body));
});
export const voice = ah(async (req: Request, res: Response) => {
  res.json(await service.voice(req.user!.id, req.body));
});
export const background = ah(async (req: Request, res: Response) => {
  res.json(await service.background(req.user!.id, req.body));
});
export const effect = ah(async (req: Request, res: Response) => {
  res.json(await service.effect(req.user!.id, req.body));
});

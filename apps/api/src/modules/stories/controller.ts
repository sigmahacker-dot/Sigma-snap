import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const create = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createStory(req.user!.id, req.body));
});

export const feed = ah(async (req: Request, res: Response) => {
  res.json(await service.storyFeed(req.user!.id));
});

export const userStories = ah(async (req: Request, res: Response) => {
  res.json(await service.userStories(req.user!.id, req.params.userId));
});

export const getOne = ah(async (req: Request, res: Response) => {
  res.json(await service.getStory(req.user!.id, req.params.id));
});

export const remove = ah(async (req: Request, res: Response) => {
  res.json(await service.deleteStory(req.user!.id, req.params.id));
});

export const view = ah(async (req: Request, res: Response) => {
  res.json(await service.viewStory(req.user!.id, req.params.id));
});

export const viewers = ah(async (req: Request, res: Response) => {
  res.json(await service.storyViewers(req.user!.id, req.params.id));
});

export const react = ah(async (req: Request, res: Response) => {
  res.json(await service.reactToStory(req.user!.id, req.params.id, req.body.emoji));
});

export const reply = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.replyToStory(req.user!.id, req.params.id, req.body.text));
});

export const archive = ah(async (req: Request, res: Response) => {
  res.json(await service.archive(req.user!.id));
});

export const listHighlights = ah(async (req: Request, res: Response) => {
  res.json(await service.listHighlights(req.user!.id));
});

export const createHighlight = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createHighlight(req.user!.id, req.body));
});

export const updateHighlight = ah(async (req: Request, res: Response) => {
  res.json(await service.updateHighlight(req.user!.id, req.params.id, req.body));
});

export const deleteHighlight = ah(async (req: Request, res: Response) => {
  res.json(await service.deleteHighlight(req.user!.id, req.params.id));
});

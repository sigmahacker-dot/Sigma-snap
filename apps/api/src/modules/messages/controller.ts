import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const list = ah(async (req: Request, res: Response) => {
  res.json(
    await service.listMessages(
      req.user!.id,
      req.params.id,
      req.query.cursor as string | undefined,
      req.query.limit,
    ),
  );
});

export const edit = ah(async (req: Request, res: Response) => {
  res.json(await service.editMessage(req.user!.id, req.params.id, req.body.text));
});

export const remove = ah(async (req: Request, res: Response) => {
  res.json(await service.deleteMessage(req.user!.id, req.user!.role, req.params.id));
});

export const react = ah(async (req: Request, res: Response) => {
  res.json(await service.reactToMessage(req.user!.id, req.params.id, req.body.emoji));
});

export const unreact = ah(async (req: Request, res: Response) => {
  res.json(await service.removeReaction(req.user!.id, req.params.id, req.params.emoji));
});

export const forward = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.forwardMessage(req.user!.id, req.params.id, req.body.toConversationId));
});

export const save = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.saveMessage(req.user!.id, req.params.id));
});

export const unsave = ah(async (req: Request, res: Response) => {
  res.json(await service.unsaveMessage(req.user!.id, req.params.id));
});

export const listSaved = ah(async (req: Request, res: Response) => {
  res.json(await service.listSavedMessages(req.user!.id, req.query.limit));
});

import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';
import type { SearchType } from './service';

export const search = ah(async (req: Request, res: Response) => {
  res.json(
    await service.search(req.user!.id, req.query.q as string, (req.query.type as SearchType) ?? 'all'),
  );
});

export const trending = ah(async (_req: Request, res: Response) => {
  res.json(await service.trending());
});

export const suggestions = ah(async (req: Request, res: Response) => {
  res.json(await service.suggestions(req.query.q as string));
});

export const history = ah(async (req: Request, res: Response) => {
  res.json(await service.history(req.user!.id));
});

export const clearHistory = ah(async (req: Request, res: Response) => {
  res.json(await service.clearHistory(req.user!.id));
});

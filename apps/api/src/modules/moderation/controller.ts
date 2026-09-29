import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';

export const createReport = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createReport(req.user!.id, req.body));
});

export const myReports = ah(async (req: Request, res: Response) => {
  res.json(await service.myReports(req.user!.id));
});

export const createAppeal = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createAppeal(req.user!.id, req.body));
});

export const myAppeals = ah(async (req: Request, res: Response) => {
  res.json(await service.myAppeals(req.user!.id));
});

import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';
import * as cms from './cms';

export const stats = ah(async (_req: Request, res: Response) => {
  res.json(await service.stats());
});

export const listUsers = ah(async (req: Request, res: Response) => {
  res.json(await service.listUsers(req.query.q as string | undefined, req.query.filter as never, req.query.limit));
});

export const banUser = ah(async (req: Request, res: Response) => {
  res.json(await service.banUser(req.user!.id, req.params.id, req.body.days, req.body.reason, req.ip));
});
export const unbanUser = ah(async (req: Request, res: Response) => {
  res.json(await service.unbanUser(req.user!.id, req.params.id, req.ip));
});
export const suspendUser = ah(async (req: Request, res: Response) => {
  res.json(await service.suspendUser(req.user!.id, req.params.id, req.body.days, req.body.reason, req.ip));
});
export const unsuspendUser = ah(async (req: Request, res: Response) => {
  res.json(await service.unsuspendUser(req.user!.id, req.params.id, req.ip));
});
export const setPlan = ah(async (req: Request, res: Response) => {
  res.json(await service.setPlan(req.user!.id, req.params.id, req.body.plan, req.ip));
});
export const setRole = ah(async (req: Request, res: Response) => {
  res.json(await service.setRole(req.user!.id, req.params.id, req.body.role, req.ip));
});

export const listReports = ah(async (req: Request, res: Response) => {
  res.json(await service.listReports(req.query.status as never));
});
export const resolveReport = ah(async (req: Request, res: Response) => {
  res.json(await service.resolveReport(req.user!.id, req.params.id, req.body, req.ip));
});
export const moderationActions = ah(async (_req: Request, res: Response) => {
  res.json(await service.moderationActions());
});
export const listAppeals = ah(async (_req: Request, res: Response) => {
  res.json(await service.listAppeals());
});
export const resolveAppeal = ah(async (req: Request, res: Response) => {
  res.json(await service.resolveAppeal(req.user!.id, req.params.id, req.body.status, req.ip));
});

export const contentList = ah(async (req: Request, res: Response) => {
  res.json(
    await service.contentList(
      req.params.type as 'posts' | 'stories' | 'comments',
      req.query.q as string | undefined,
      req.query.limit,
    ),
  );
});
export const deleteContent = ah(async (req: Request, res: Response) => {
  res.json(
    await service.deleteContent(
      req.user!.id,
      req.params.type as 'posts' | 'stories' | 'comments',
      req.params.id,
      req.ip,
    ),
  );
});
export const featureContent = ah(async (req: Request, res: Response) => {
  res.json(
    await service.featureContent(
      req.user!.id,
      req.params.type as 'posts' | 'stories' | 'comments',
      req.params.id,
      req.body.featured,
      req.ip,
    ),
  );
});

export const aiUsage = ah(async (_req: Request, res: Response) => {
  res.json(await service.aiUsage());
});
export const auditLogs = ah(async (req: Request, res: Response) => {
  res.json(await service.auditLogs(req.query.limit));
});
export const storage = ah(async (_req: Request, res: Response) => {
  res.json(await service.storageStats());
});
export const getFeatureFlags = ah(async (_req: Request, res: Response) => {
  res.json(await service.getFeatureFlags());
});
export const putFeatureFlags = ah(async (req: Request, res: Response) => {
  res.json(await service.putFeatureFlags(req.user!.id, req.body.flags, req.ip));
});
export const broadcast = ah(async (req: Request, res: Response) => {
  res.json(await service.broadcast(req.user!.id, req.body, req.ip));
});

// ─── Admin CMS ─────────────────────────────────────────────────────────

export const listAnnouncements = ah(async (req: Request, res: Response) => {
  res.json(await cms.listAnnouncements(req.query.limit));
});
export const createAnnouncement = ah(async (req: Request, res: Response) => {
  res.status(201).json(await cms.createAnnouncement(req.user!.id, req.body, req.ip));
});
export const updateAnnouncement = ah(async (req: Request, res: Response) => {
  res.json(await cms.updateAnnouncement(req.user!.id, req.params.id, req.body, req.ip));
});
export const deleteAnnouncement = ah(async (req: Request, res: Response) => {
  res.json(await cms.deleteAnnouncement(req.user!.id, req.params.id, req.ip));
});

export const patchFeatureFlag = ah(async (req: Request, res: Response) => {
  res.json(await cms.patchFeatureFlag(req.user!.id, req.params.key, req.body, req.ip));
});

export const listManagedLenses = ah(async (req: Request, res: Response) => {
  res.json(await cms.listManagedLenses(req.query.limit));
});
export const createManagedLens = ah(async (req: Request, res: Response) => {
  res.status(201).json(await cms.createManagedLens(req.user!.id, req.body, req.ip));
});
export const updateManagedLens = ah(async (req: Request, res: Response) => {
  res.json(await cms.updateManagedLens(req.user!.id, req.params.id, req.body, req.ip));
});
export const deleteManagedLens = ah(async (req: Request, res: Response) => {
  res.json(await cms.deleteManagedLens(req.user!.id, req.params.id, req.ip));
});

// ─── Public remote config (authenticated users) ────────────────────────

export const publicConfig = ah(async (_req: Request, res: Response) => {
  res.json(await cms.publicConfig());
});

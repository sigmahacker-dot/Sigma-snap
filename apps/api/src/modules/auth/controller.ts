import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import * as service from './service';
import { cookieHelpers } from './service';

export const register = ah(async (req: Request, res: Response) => {
  const result = await service.register(req.body);
  cookieHelpers.setRefreshCookie(res, result.refreshToken);
  res.status(201).json({ user: result.user, accessToken: result.accessToken });
});

export const login = ah(async (req: Request, res: Response) => {
  const result = await service.login(req.body.emailOrUsername, req.body.password);
  cookieHelpers.setRefreshCookie(res, result.refreshToken);
  res.json({ user: result.user, accessToken: result.accessToken });
});

export const refresh = ah(async (req: Request, res: Response) => {
  const result = await service.refresh(req.cookies?.[cookieHelpers.REFRESH_COOKIE]);
  cookieHelpers.setRefreshCookie(res, result.refreshToken);
  res.json({ user: result.user, accessToken: result.accessToken });
});

export const logout = ah(async (req: Request, res: Response) => {
  await service.logout(req.user!.id, req.cookies?.[cookieHelpers.REFRESH_COOKIE]);
  cookieHelpers.clearRefreshCookie(res);
  res.json({ ok: true });
});

export const getMe = ah(async (req: Request, res: Response) => {
  res.json(await service.me(req.user!.id));
});

export const changePassword = ah(async (req: Request, res: Response) => {
  await service.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  res.json({ ok: true });
});

export const oauth = ah(async (req: Request, res: Response) => {
  await service.oauth(req.params.provider);
  res.json({ ok: true });
});

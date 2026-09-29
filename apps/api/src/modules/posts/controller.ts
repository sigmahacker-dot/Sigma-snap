import type { Request, Response } from 'express';
import { ah } from '../../utils/errors';
import { optionalAuth } from '../../middleware/auth';
import * as service from './service';

export const create = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.createPost(req.user!.id, req.body));
});

export const feed = ah(async (req: Request, res: Response) => {
  res.json(await service.getFeed(req.user!.id, req.query.cursor as string | undefined, req.query.limit));
});

export const followingFeed = ah(async (req: Request, res: Response) => {
  res.json(
    await service.getFollowingFeed(req.user!.id, req.query.cursor as string | undefined, req.query.limit),
  );
});

export const getOne = [
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    res.json(await service.getPost(req.user?.id, req.params.id));
  }),
];

export const patch = ah(async (req: Request, res: Response) => {
  res.json(await service.patchPost(req.user!.id, req.params.id, req.body));
});

export const remove = ah(async (req: Request, res: Response) => {
  res.json(await service.deletePost(req.user!.id, req.user!.role, req.params.id));
});

export const like = ah(async (req: Request, res: Response) => {
  res.json(await service.likePost(req.user!.id, req.params.id));
});

export const unlike = ah(async (req: Request, res: Response) => {
  res.json(await service.unlikePost(req.user!.id, req.params.id));
});

export const likes = ah(async (req: Request, res: Response) => {
  res.json(await service.postLikes(req.params.id));
});

export const addComment = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.addComment(req.user!.id, req.params.id, req.body));
});

export const listComments = ah(async (req: Request, res: Response) => {
  res.json(await service.listComments(req.params.id));
});

export const deleteComment = ah(async (req: Request, res: Response) => {
  res.json(await service.deleteComment(req.user!.id, req.user!.role, req.params.id));
});

export const likeComment = ah(async (req: Request, res: Response) => {
  res.json(await service.likeComment(req.user!.id, req.params.id));
});

export const unlikeComment = ah(async (req: Request, res: Response) => {
  res.json(await service.unlikeComment(req.user!.id, req.params.id));
});

export const share = ah(async (req: Request, res: Response) => {
  res.json(await service.sharePost(req.user!.id, req.params.id, req.body.target));
});

export const save = ah(async (req: Request, res: Response) => {
  res.json(await service.savePost(req.user!.id, req.params.id));
});

export const unsave = ah(async (req: Request, res: Response) => {
  res.json(await service.unsavePost(req.user!.id, req.params.id));
});

export const saved = ah(async (req: Request, res: Response) => {
  res.json(await service.savedPosts(req.user!.id));
});

export const report = ah(async (req: Request, res: Response) => {
  res.status(201).json(await service.reportPost(req.user!.id, req.params.id, req.body.reason, req.body.details));
});

export const creatorAnalytics = ah(async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 365);
  res.json(await service.creatorAnalytics(req.user!.id, days));
});

export const creatorDrafts = ah(async (req: Request, res: Response) => {
  res.json(await service.creatorDrafts(req.user!.id));
});

export const creatorPosts = ah(async (req: Request, res: Response) => {
  res.json(await service.creatorPosts(req.user!.id));
});

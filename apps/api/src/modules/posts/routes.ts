import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  createPostSchema,
  patchPostSchema,
  commentSchema,
  shareSchema,
  reportPostSchema,
} from './schemas';

export const routes = Router();

// creator dashboard (§19)
routes.get('/creator/analytics', requireAuth, controller.creatorAnalytics);
routes.get('/creator/drafts', requireAuth, controller.creatorDrafts);
routes.get('/creator/posts', requireAuth, controller.creatorPosts);

// feed (top-level paths)
routes.get('/feed', requireAuth, controller.feed);
routes.get('/feed/following', requireAuth, controller.followingFeed);

// saved
routes.get('/users/me/saved', requireAuth, controller.saved);

// posts
routes.post('/posts', requireAuth, validate({ body: createPostSchema }), controller.create);
routes.get('/posts/:id', ...controller.getOne);
routes.patch('/posts/:id', requireAuth, validate({ body: patchPostSchema }), controller.patch);
routes.delete('/posts/:id', requireAuth, controller.remove);

routes.post('/posts/:id/like', requireAuth, controller.like);
routes.delete('/posts/:id/like', requireAuth, controller.unlike);
routes.get('/posts/:id/likes', requireAuth, controller.likes);

routes.post('/posts/:id/comments', requireAuth, validate({ body: commentSchema }), controller.addComment);
routes.get('/posts/:id/comments', requireAuth, controller.listComments);

routes.post('/posts/:id/share', requireAuth, validate({ body: shareSchema }), controller.share);
routes.post('/posts/:id/save', requireAuth, controller.save);
routes.delete('/posts/:id/save', requireAuth, controller.unsave);
routes.post('/posts/:id/report', requireAuth, validate({ body: reportPostSchema }), controller.report);

// comments
routes.delete('/comments/:id', requireAuth, controller.deleteComment);
routes.post('/comments/:id/like', requireAuth, controller.likeComment);
routes.delete('/comments/:id/like', requireAuth, controller.unlikeComment);

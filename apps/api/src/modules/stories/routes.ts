import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  createStorySchema,
  reactSchema,
  replySchema,
  createHighlightSchema,
  updateHighlightSchema,
} from './schemas';

export const routes = Router();

// static paths before /stories/:id
routes.post('/stories', requireAuth, validate({ body: createStorySchema }), controller.create);
routes.get('/stories/feed', requireAuth, controller.feed);
routes.get('/stories/archive', requireAuth, controller.archive);
routes.get('/stories/highlights', requireAuth, controller.listHighlights);
routes.post('/stories/highlights', requireAuth, validate({ body: createHighlightSchema }), controller.createHighlight);
routes.patch('/stories/highlights/:id', requireAuth, validate({ body: updateHighlightSchema }), controller.updateHighlight);
routes.delete('/stories/highlights/:id', requireAuth, controller.deleteHighlight);
routes.get('/stories/user/:userId', requireAuth, controller.userStories);

routes.get('/stories/:id', requireAuth, controller.getOne);
routes.delete('/stories/:id', requireAuth, controller.remove);
routes.post('/stories/:id/view', requireAuth, controller.view);
routes.get('/stories/:id/viewers', requireAuth, controller.viewers);
routes.post('/stories/:id/react', requireAuth, validate({ body: reactSchema }), controller.react);
routes.post('/stories/:id/reply', requireAuth, validate({ body: replySchema }), controller.reply);

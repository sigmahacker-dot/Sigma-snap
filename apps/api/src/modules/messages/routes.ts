import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  listMessagesQuery,
  editMessageSchema,
  reactMessageSchema,
  forwardMessageSchema,
  messageIdParam,
  conversationIdParam,
  emojiParam,
} from './schemas';

export const routes = Router();

routes.get(
  '/conversations/:id/messages',
  requireAuth,
  validate({ params: conversationIdParam, query: listMessagesQuery }),
  controller.list,
);
routes.patch('/messages/:id', requireAuth, validate({ params: messageIdParam, body: editMessageSchema }), controller.edit);
routes.delete('/messages/:id', requireAuth, validate({ params: messageIdParam }), controller.remove);
routes.post(
  '/messages/:id/react',
  requireAuth,
  validate({ params: messageIdParam, body: reactMessageSchema }),
  controller.react,
);
routes.delete('/messages/:id/react/:emoji', requireAuth, validate({ params: emojiParam }), controller.unreact);
routes.post(
  '/messages/:id/forward',
  requireAuth,
  validate({ params: messageIdParam, body: forwardMessageSchema }),
  controller.forward,
);

// Saved (bookmarked) messages — registered before any param collisions.
routes.get('/messages/saved', requireAuth, controller.listSaved);
routes.post('/messages/:id/save', requireAuth, validate({ params: messageIdParam }), controller.save);
routes.delete('/messages/:id/save', requireAuth, validate({ params: messageIdParam }), controller.unsave);

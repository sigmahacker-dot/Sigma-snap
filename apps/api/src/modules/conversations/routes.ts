import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  createConversationSchema,
  patchConversationSchema,
  readConversationSchema,
  sendMessageSchema,
  conversationIdParam,
} from './schemas';

export const routes = Router();

routes.get('/conversations', requireAuth, controller.list);
routes.post('/conversations', requireAuth, validate({ body: createConversationSchema }), controller.create);
routes.get('/conversations/:id', requireAuth, validate({ params: conversationIdParam }), controller.getOne);
routes.patch(
  '/conversations/:id',
  requireAuth,
  validate({ params: conversationIdParam, body: patchConversationSchema }),
  controller.patch,
);
routes.post('/conversations/:id/leave', requireAuth, validate({ params: conversationIdParam }), controller.leave);
routes.post(
  '/conversations/:id/messages',
  requireAuth,
  validate({ params: conversationIdParam, body: sendMessageSchema }),
  controller.sendMessage,
);
routes.post(
  '/conversations/:id/read',
  requireAuth,
  validate({ params: conversationIdParam, body: readConversationSchema }),
  controller.markRead,
);

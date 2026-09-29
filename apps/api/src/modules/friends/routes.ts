import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  requestFriendSchema,
  requestsQuerySchema,
  requestIdSchema,
  userIdParamSchema,
  discoverSchema,
  discoverQuerySchema,
} from './schemas';

export const routes = Router();

routes.get('/friends', requireAuth, controller.list);
routes.get('/friends/requests', requireAuth, validate({ query: requestsQuerySchema }), controller.listRequests);
routes.post('/friends/requests', requireAuth, validate({ body: requestFriendSchema }), controller.sendRequest);
routes.post('/friends/requests/:id/accept', requireAuth, validate({ params: requestIdSchema }), controller.acceptRequest);
routes.post('/friends/requests/:id/reject', requireAuth, validate({ params: requestIdSchema }), controller.rejectRequest);
routes.delete('/friends/:userId', requireAuth, validate({ params: userIdParamSchema }), controller.removeFriend);
routes.get('/friends/close', requireAuth, controller.listClose);
routes.post('/friends/close/:userId', requireAuth, validate({ params: userIdParamSchema }), controller.addClose);
routes.delete('/friends/close/:userId', requireAuth, validate({ params: userIdParamSchema }), controller.removeClose);
routes.get('/friends/discover', requireAuth, validate({ query: discoverQuerySchema }), controller.discover);
routes.post('/friends/discover', requireAuth, validate({ body: discoverSchema }), controller.discover);

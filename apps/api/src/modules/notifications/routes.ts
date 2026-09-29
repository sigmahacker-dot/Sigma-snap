import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { pushTokenSchema, deletePushTokenSchema } from './schemas';

export const routes = Router();

routes.get('/notifications', requireAuth, controller.list);
routes.patch('/notifications/:id/read', requireAuth, controller.markRead);
routes.post('/notifications/read-all', requireAuth, controller.markAllRead);
routes.post('/devices/push-token', requireAuth, validate({ body: pushTokenSchema }), controller.registerPushToken);
routes.delete('/devices/push-token', requireAuth, validate({ body: deletePushTokenSchema }), controller.deletePushToken);

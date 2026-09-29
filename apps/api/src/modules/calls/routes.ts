import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { createCallSchema } from './schemas';

export const routes = Router();

routes.post('/calls', requireAuth, validate({ body: createCallSchema }), controller.create);
routes.get('/calls/history', requireAuth, controller.history);
routes.get('/calls/:id', requireAuth, controller.getOne);
routes.post('/calls/:id/end', requireAuth, controller.end);

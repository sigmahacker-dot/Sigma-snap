import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { checkoutSchema } from './schemas';

export const routes = Router();

routes.get('/plans', controller.plans);
routes.get('/subscriptions/me', requireAuth, controller.me);
routes.post('/subscriptions/checkout', requireAuth, validate({ body: checkoutSchema }), controller.checkout);
routes.post('/subscriptions/cancel', requireAuth, controller.cancel);
routes.get('/features', requireAuth, controller.features);

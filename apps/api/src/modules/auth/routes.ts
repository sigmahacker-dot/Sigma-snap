import { Router } from 'express';
import cookieParser from 'cookie-parser';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { authLimiter } from '../../middleware/rateLimit';
import * as controller from './controller';
import { registerSchema, loginSchema, changePasswordSchema, oauthProviderSchema } from './schemas';

export const routes = Router();

routes.post('/auth/register', authLimiter, validate({ body: registerSchema }), controller.register);
routes.post('/auth/login', authLimiter, validate({ body: loginSchema }), controller.login);
routes.post('/auth/refresh', cookieParser(), controller.refresh);
routes.post('/auth/logout', cookieParser(), requireAuth, controller.logout);
routes.get('/auth/me', requireAuth, controller.getMe);
routes.post('/auth/change-password', requireAuth, validate({ body: changePasswordSchema }), controller.changePassword);
routes.post(
  '/auth/oauth/:provider',
  authLimiter,
  validate({ params: oauthProviderSchema }),
  controller.oauth,
);

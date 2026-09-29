import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { writeLimiter } from '../../middleware/rateLimit';
import * as controller from './controller';
import { createReportSchema, createAppealSchema } from './schemas';

export const routes = Router();

routes.post('/reports', requireAuth, writeLimiter, validate({ body: createReportSchema }), controller.createReport);
routes.get('/reports/me', requireAuth, controller.myReports);
routes.post('/appeals', requireAuth, writeLimiter, validate({ body: createAppealSchema }), controller.createAppeal);
routes.get('/appeals/me', requireAuth, controller.myAppeals);

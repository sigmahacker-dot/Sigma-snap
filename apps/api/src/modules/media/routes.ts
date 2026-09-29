import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { presignSchema, completeUploadSchema } from './schemas';

export const routes = Router();

routes.post('/media/presign', requireAuth, validate({ body: presignSchema }), controller.presign);
routes.post(
  '/media/:id/complete',
  requireAuth,
  validate({ body: completeUploadSchema }),
  controller.completeUpload,
);
routes.get('/media/:id', ...controller.getAsset);

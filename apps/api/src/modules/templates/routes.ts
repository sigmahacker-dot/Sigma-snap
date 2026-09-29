import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { listTemplatesQuery, useTemplateSchema, createTemplateSchema, patchTemplateSchema } from './schemas';

export const routes = Router();

routes.get('/templates', requireAuth, validate({ query: listTemplatesQuery }), controller.list);
routes.get('/templates/:id', requireAuth, controller.getOne);
routes.post('/templates/:id/use', requireAuth, validate({ body: useTemplateSchema }), controller.use);

// Admin writes live on the same paths (ADMIN role required).
routes.post('/templates', requireAuth, requireRole('ADMIN'), validate({ body: createTemplateSchema }), controller.adminCreate);
routes.patch('/templates/:id', requireAuth, requireRole('ADMIN'), validate({ body: patchTemplateSchema }), controller.adminPatch);
routes.delete('/templates/:id', requireAuth, requireRole('ADMIN'), controller.adminDelete);

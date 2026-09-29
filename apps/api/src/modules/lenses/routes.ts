import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { listLensesQuery, useLensSchema, createLensSchema, patchLensSchema } from './schemas';

export const routes = Router();

routes.get('/lenses', requireAuth, validate({ query: listLensesQuery }), controller.list);
routes.get('/lenses/:id', requireAuth, controller.getOne);
routes.post('/lenses/:id/use', requireAuth, validate({ body: useLensSchema }), controller.use);

// Admin writes live on the same paths (ADMIN role required).
routes.post('/lenses', requireAuth, requireRole('ADMIN'), validate({ body: createLensSchema }), controller.adminCreate);
routes.patch('/lenses/:id', requireAuth, requireRole('ADMIN'), validate({ body: patchLensSchema }), controller.adminPatch);
routes.delete('/lenses/:id', requireAuth, requireRole('ADMIN'), controller.adminDelete);

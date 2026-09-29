import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { listEffectsQuery, createEffectSchema, patchEffectSchema } from './schemas';

export const routes = Router();

routes.get('/effects', requireAuth, validate({ query: listEffectsQuery }), controller.list);
routes.get('/effects/:id', requireAuth, controller.getOne);

// Admin writes live on the same paths (ADMIN role required).
routes.post('/effects', requireAuth, requireRole('ADMIN'), validate({ body: createEffectSchema }), controller.adminCreate);
routes.patch('/effects/:id', requireAuth, requireRole('ADMIN'), validate({ body: patchEffectSchema }), controller.adminPatch);
routes.delete('/effects/:id', requireAuth, requireRole('ADMIN'), controller.adminDelete);

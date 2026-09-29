import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { listSoundsQuery, createSoundSchema } from './schemas';

export const routes = Router();

routes.get('/sounds', requireAuth, validate({ query: listSoundsQuery }), controller.list);
routes.post('/sounds', requireAuth, validate({ body: createSoundSchema }), controller.create);
routes.get('/sounds/:id', requireAuth, controller.getOne);
routes.get('/sounds/:id/posts', requireAuth, controller.posts);
routes.delete('/sounds/:id', requireAuth, controller.remove);

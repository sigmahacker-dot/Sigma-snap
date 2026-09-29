import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import { searchSchema, suggestionsSchema } from './schemas';

export const routes = Router();

routes.get('/search', requireAuth, validate({ query: searchSchema }), controller.search);
routes.get('/search/trending', requireAuth, controller.trending);
routes.get('/search/suggestions', requireAuth, validate({ query: suggestionsSchema }), controller.suggestions);
routes.get('/search/history', requireAuth, controller.history);
routes.delete('/search/history', requireAuth, controller.clearHistory);

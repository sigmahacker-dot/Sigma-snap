import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  captionSchema,
  hashtagsSchema,
  titleSchema,
  scriptSchema,
  ideasSchema,
  thumbnailSchema,
  subtitlesSchema,
  translateSchema,
  voiceSchema,
  backgroundSchema,
  effectSchema,
} from './schemas';

export const routes = Router();

routes.post('/ai/caption', requireAuth, validate({ body: captionSchema }), controller.caption);
routes.post('/ai/hashtags', requireAuth, validate({ body: hashtagsSchema }), controller.hashtags);
routes.post('/ai/title', requireAuth, validate({ body: titleSchema }), controller.title);
routes.post('/ai/script', requireAuth, validate({ body: scriptSchema }), controller.script);
routes.post('/ai/ideas', requireAuth, validate({ body: ideasSchema }), controller.ideas);
routes.post('/ai/thumbnail', requireAuth, validate({ body: thumbnailSchema }), controller.thumbnail);
routes.post('/ai/subtitles', requireAuth, validate({ body: subtitlesSchema }), controller.subtitles);
routes.post('/ai/translate', requireAuth, validate({ body: translateSchema }), controller.translate);
routes.post('/ai/voice', requireAuth, validate({ body: voiceSchema }), controller.voice);
routes.post('/ai/background', requireAuth, validate({ body: backgroundSchema }), controller.background);
routes.post('/ai/effect', requireAuth, validate({ body: effectSchema }), controller.effect);

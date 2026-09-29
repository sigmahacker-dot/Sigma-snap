import { Router } from 'express';
import { requireAuth, optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  searchQuerySchema,
  updateMeSchema,
  changeUsernameSchema,
  setAvatarSchema,
  updatePrivacySchema,
  updateNotificationPrefsSchema,
  updateLocationSchema,
  idParamSchema,
  usernameParamSchema,
} from './schemas';

export const routes = Router();

// NOTE: static /users/* paths must be registered before /users/:username
routes.get('/users/search', requireAuth, validate({ query: searchQuerySchema }), controller.search);
routes.get('/users/suggestions', requireAuth, controller.suggestions);
routes.get('/users/me/blocked', requireAuth, controller.blockedList);
routes.patch('/users/me', requireAuth, validate({ body: updateMeSchema }), controller.updateMe);
routes.patch('/users/me/username', requireAuth, validate({ body: changeUsernameSchema }), controller.changeUsername);
routes.patch('/users/me/avatar', requireAuth, validate({ body: setAvatarSchema }), controller.setAvatar);
routes.patch('/users/me/privacy', requireAuth, validate({ body: updatePrivacySchema }), controller.updatePrivacy);
routes.patch(
  '/users/me/notifications',
  requireAuth,
  validate({ body: updateNotificationPrefsSchema }),
  controller.updateNotificationPrefs,
);
routes.patch('/users/me/location', requireAuth, validate({ body: updateLocationSchema }), controller.updateLocation);

routes.get('/users/:id/followers', requireAuth, validate({ params: idParamSchema }), controller.followers);
routes.get('/users/:id/following', requireAuth, validate({ params: idParamSchema }), controller.following);
routes.post('/users/:id/follow', requireAuth, validate({ params: idParamSchema }), controller.follow);
routes.delete('/users/:id/follow', requireAuth, validate({ params: idParamSchema }), controller.unfollow);
routes.post('/users/:id/block', requireAuth, validate({ params: idParamSchema }), controller.block);
routes.delete('/users/:id/block', requireAuth, validate({ params: idParamSchema }), controller.unblock);
routes.post('/users/:id/mute', requireAuth, validate({ params: idParamSchema }), controller.mute);
routes.delete('/users/:id/mute', requireAuth, validate({ params: idParamSchema }), controller.unmute);

routes.get('/users/:username', optionalAuth, validate({ params: usernameParamSchema }), controller.getProfile);

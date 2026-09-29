import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import * as controller from './controller';
import {
  adminUsersQuery,
  banUserSchema,
  suspendUserSchema,
  setPlanSchema,
  setRoleSchema,
  adminReportsQuery,
  resolveReportSchema,
  resolveAppealSchema,
  contentQuery,
  contentTypeParam,
  contentIdParam,
  featureContentSchema,
  featureFlagsSchema,
  broadcastSchema,
  announcementSchema,
  announcementPatchSchema,
  announcementIdParam,
  featureFlagPatchSchema,
  featureFlagKeyParam,
  managedLensSchema,
  managedLensPatchSchema,
  managedLensIdParam,
} from './schemas';

export const routes = Router();

routes.use('/admin', requireAuth, requireRole('ADMIN'));

routes.get('/admin/stats', controller.stats);
routes.get('/admin/users', validate({ query: adminUsersQuery }), controller.listUsers);
routes.patch('/admin/users/:id/ban', validate({ body: banUserSchema }), controller.banUser);
routes.patch('/admin/users/:id/unban', controller.unbanUser);
routes.patch('/admin/users/:id/suspend', validate({ body: suspendUserSchema }), controller.suspendUser);
routes.patch('/admin/users/:id/unsuspend', controller.unsuspendUser);
routes.patch('/admin/users/:id/set-plan', validate({ body: setPlanSchema }), controller.setPlan);
routes.patch('/admin/users/:id/set-role', validate({ body: setRoleSchema }), controller.setRole);

routes.get('/admin/reports', validate({ query: adminReportsQuery }), controller.listReports);
routes.patch('/admin/reports/:id', validate({ body: resolveReportSchema }), controller.resolveReport);
routes.get('/admin/moderation/actions', controller.moderationActions);
routes.get('/admin/appeals', controller.listAppeals);
routes.patch('/admin/appeals/:id', validate({ body: resolveAppealSchema }), controller.resolveAppeal);

routes.get('/admin/content/:type', validate({ params: contentTypeParam, query: contentQuery }), controller.contentList);
routes.delete('/admin/content/:type/:id', validate({ params: contentIdParam }), controller.deleteContent);
routes.post(
  '/admin/content/:type/:id/feature',
  validate({ params: contentIdParam, body: featureContentSchema }),
  controller.featureContent,
);

routes.get('/admin/ai-usage', controller.aiUsage);
routes.get('/admin/audit-logs', controller.auditLogs);
routes.get('/admin/storage', controller.storage);
routes.get('/admin/feature-flags', controller.getFeatureFlags);
routes.put('/admin/feature-flags', validate({ body: featureFlagsSchema }), controller.putFeatureFlags);
routes.patch(
  '/admin/feature-flags/:key',
  validate({ params: featureFlagKeyParam, body: featureFlagPatchSchema }),
  controller.patchFeatureFlag,
);
routes.post('/admin/notifications/broadcast', validate({ body: broadcastSchema }), controller.broadcast);

// ─── Admin CMS ─────────────────────────────────────────────────────────
routes.get('/admin/announcements', controller.listAnnouncements);
routes.post('/admin/announcements', validate({ body: announcementSchema }), controller.createAnnouncement);
routes.patch(
  '/admin/announcements/:id',
  validate({ params: announcementIdParam, body: announcementPatchSchema }),
  controller.updateAnnouncement,
);
routes.delete('/admin/announcements/:id', validate({ params: announcementIdParam }), controller.deleteAnnouncement);

routes.get('/admin/lenses', controller.listManagedLenses);
routes.post('/admin/lenses', validate({ body: managedLensSchema }), controller.createManagedLens);
routes.patch(
  '/admin/lenses/:id',
  validate({ params: managedLensIdParam, body: managedLensPatchSchema }),
  controller.updateManagedLens,
);
routes.delete('/admin/lenses/:id', validate({ params: managedLensIdParam }), controller.deleteManagedLens);

// ─── Public remote config (any authenticated user; NOT under /admin) ───
routes.get('/config', requireAuth, controller.publicConfig);

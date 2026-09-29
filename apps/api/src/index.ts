import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { env } from './config/env';
import { errorMiddleware, notFoundMiddleware } from './utils/errors';
import { apiLimiter } from './middleware/rateLimit';
import { createSocketServer } from './realtime/socket';
import { startWorker } from './queue/worker';
import { startScheduler } from './queue/scheduler';

import { routes as authRoutes } from './modules/auth/routes';
import { routes as mediaRoutes } from './modules/media/routes';
import { routes as usersRoutes } from './modules/users/routes';
import { routes as friendsRoutes } from './modules/friends/routes';
import { routes as storiesRoutes } from './modules/stories/routes';
import { routes as postsRoutes } from './modules/posts/routes';
import { routes as searchRoutes } from './modules/search/routes';
import { routes as soundsRoutes } from './modules/sounds/routes';
import { routes as lensesRoutes } from './modules/lenses/routes';
import { routes as effectsRoutes } from './modules/effects/routes';
import { routes as templatesRoutes } from './modules/templates/routes';
import { routes as aiRoutes } from './modules/ai/routes';
import { routes as conversationsRoutes } from './modules/conversations/routes';
import { routes as messagesRoutes } from './modules/messages/routes';
import { routes as callsRoutes } from './modules/calls/routes';
import { routes as notificationsRoutes } from './modules/notifications/routes';
import { routes as subscriptionsRoutes } from './modules/subscriptions/routes';
import { routes as adminRoutes } from './modules/admin/routes';
import { routes as moderationRoutes } from './modules/moderation/routes';

const app = express();
app.use(helmet());
app.use(cors({ origin: env.WEB_URL, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.set('trust proxy', 1);

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'sigma-snap-api', time: new Date().toISOString() });
});

app.use(
  '/api/v1',
  apiLimiter,
  authRoutes,
  mediaRoutes,
  usersRoutes,
  friendsRoutes,
  storiesRoutes,
  postsRoutes,
  searchRoutes,
  soundsRoutes,
  lensesRoutes,
  effectsRoutes,
  templatesRoutes,
  aiRoutes,
  conversationsRoutes,
  messagesRoutes,
  callsRoutes,
  notificationsRoutes,
  subscriptionsRoutes,
  adminRoutes,
  moderationRoutes,
);

app.use('/api/v1', notFoundMiddleware);
app.use(errorMiddleware);

const server = createServer(app);
createSocketServer(server);

async function boot(): Promise<void> {
  // Queues/worker/scheduler degrade gracefully — they never crash boot.
  await startWorker();
  startScheduler();
  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[sigma-snap api] listening on :${env.PORT}`);
  });
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[sigma-snap api] boot failed:', err);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { resolve } from 'path';
import { mkdir } from 'fs/promises';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import serversRoutes from './routes/servers.js';
import channelsRoutes from './routes/channels.js';
import messagesRoutes from './routes/messages.js';
import dmsRoutes from './routes/dms.js';
import friendsRoutes from './routes/friends.js';
import invitesRoutes from './routes/invites.js';
import uploadsRoutes, { UPLOAD_DIR } from './routes/uploads.js';
import supportRoutes from './routes/support.js';
import blogRoutes from './routes/blog.js';
import releasesRoutes, { RELEASES_DIR } from './routes/releases.js';
import statusRoutes from './routes/status.js';
import betaRoutes from './routes/beta.js';

import { errorHandler } from './middleware/error.js';
import { createSocketServer } from './socket/index.js';
import { startStatusMonitor } from './lib/statusMonitor.js';

const app = express();
const port = process.env.PORT || 4000;
const clientOrigin = process.env.CLIENT_ORIGIN || '*';

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
// Only apply rate limiting to auth routes to prevent locking out legitimate users on page load
app.use('/api/auth', limiter);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, electron file://)
    if (!origin) return callback(null, true);
    
    // Allow file:// protocol for Electron
    if (origin.startsWith('file://')) return callback(null, true);

    // Allow local development and mobile webviews (Capacitor)
    if (
      origin === 'http://localhost' ||
      origin === 'https://localhost' ||
      origin.startsWith('capacitor://')
    ) {
      return callback(null, true);
    }

    // Allow api.softspace.cc status page
    if (origin === 'https://api.softspace.cc' || origin === 'http://api.softspace.cc') {
      return callback(null, true);
    }

    const allowedOrigins = clientOrigin === '*' ? true : clientOrigin.split(',').map(o => o.trim());
    if (allowedOrigins === true || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Disable caching for API routes (except release downloads)
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/releases')) {
    return next();
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/dms', dmsRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/invites', invitesRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/releases', releasesRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/beta', betaRoutes);

// Static uploads directory
app.use('/uploads', express.static(resolve(UPLOAD_DIR)));

app.use(errorHandler);

const httpServer = createServer(app);

// Attach Socket.io to the server object so we can use it in routes if needed
const io = createSocketServer(httpServer, { clientOrigin });
app.set('io', io);

async function start() {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await mkdir(resolve(RELEASES_DIR, 'windows'), { recursive: true });

  startStatusMonitor();
  
  httpServer.listen(port, () => {
    console.log(`[server] Softspace API listening on port ${port}`);
  });
}

start().catch(err => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

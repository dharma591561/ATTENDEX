import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { db, initDatabase, cleanExpiredSessions } from './server/db/database';
import { sessionMiddleware, csrfProtection } from './server/middleware/auth';
import { authRouter } from './server/routes/authRoutes';
import { studentRouter } from './server/routes/studentRoutes';
import { facultyRouter } from './server/routes/facultyRoutes';
import { adminRouter } from './server/routes/adminRoutes';
import { initializeFounder, getEnvVar } from './scripts/init-founder';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Initialize SQLite database schema
initDatabase();

// Clean expired sessions periodically (every hour)
setInterval(() => {
  try {
    cleanExpiredSessions();
  } catch (err) {
    console.error('Error cleaning expired sessions:', err);
  }
}, 60 * 60 * 1000);

// Basic middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static uploads directory
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Session hydration and CSRF protection
app.use(sessionMiddleware);
app.use('/api', csrfProtection);

// Mount API routes
app.use('/api/auth', authRouter);
app.use('/api/students', studentRouter);
app.use('/api/faculty', facultyRouter);
app.use('/api/admin', adminRouter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

async function startServer() {
  // Ensure the single Founder account exists if environment secrets are configured
  // Never overwrites, deletes, or recreates an existing Founder account
  try {
    const existingFounder = db.prepare("SELECT id FROM users WHERE role = 'FOUNDER'").get();
    if (!existingFounder) {
      const founderEmail = getEnvVar('FOUNDER_EMAIL');
      const founderPassword = getEnvVar('FOUNDER_PASSWORD');
      if (founderEmail && founderPassword) {
        await initializeFounder(founderEmail, founderPassword);
      }
    }
  } catch (err) {
    console.error('[CLASSYNC Founder Check Error]', err);
  }

  const httpServer = http.createServer(app);

  if (!isProd) {
    // Development mode: Mount Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: Serve built static files
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[CLASSYNC Server] Running at http://localhost:${PORT} in ${isProd ? 'production' : 'development'} mode.`);
  });
}

startServer().catch((err) => {
  console.error('[CLASSYNC Server Error]', err);
  process.exit(1);
});

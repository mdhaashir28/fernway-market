// Builds the Express application: security headers, CORS, JSON parsing, routes, errors.
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { backendDir } from './env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { addressRouter } from './routes/address.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { checkoutRouter } from './routes/checkout.routes.js';
import { imageRouter } from './routes/image.routes.js';
import { orderRouter } from './routes/order.routes.js';
import { staffRouter } from './routes/staff/index.js';

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function createApp() {
  const app = express();

  // On hosting services the API sits behind a proxy/load balancer. Trusting one
  // proxy hop lets us see each visitor's real IP (needed for login rate limits).
  if (config.isProduction) app.set('trust proxy', 1);

  // Security headers. Images are allowed to be shown on other origins (the
  // dashboard and the Expo web preview run on different ports).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Which websites may call this API from a browser. (Phone apps don't use CORS.)
  app.use(
    cors({
      origin(origin, callback) {
        const allowed =
          !origin || config.corsOrigins.includes(origin) || (!config.isProduction && LOCAL_ORIGIN.test(origin));
        callback(null, allowed);
      },
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  if (config.NODE_ENV === 'development') app.use(morgan('dev'));

  // Uploaded product photos (IMAGE_STORAGE=disk), e.g. GET /uploads/products/abc.jpg
  app.use('/uploads', express.static(path.join(backendDir, 'uploads'), { maxAge: '1d', index: false }));
  // Sample product photos shipped with the code, e.g. GET /sample-images/FV-001.jpg
  app.use('/sample-images', express.static(path.join(backendDir, 'seed-images', 'products'), { maxAge: '7d', index: false }));
  // Product photos stored in the database (IMAGE_STORAGE=database)
  app.use('/api/images', imageRouter);

  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', catalogRouter); //  /api/store, /api/categories, /api/products
  app.use('/api', checkoutRouter); // /api/delivery/check, /api/pickup-slots, /api/checkout/quote
  app.use('/api/addresses', addressRouter);
  app.use('/api/orders', orderRouter);
  app.use('/api/staff', staffRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

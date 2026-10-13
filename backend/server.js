// Entry point for Vercel (serverless). Vercel's Express support looks for a
// file like this one and needs the app to be exported rather than started with
// app.listen(). It uses the code compiled by "npm run build" (in dist/), so the
// TypeScript is checked with this project's own settings (tsconfig.json).
// Running on your own computer or on Render still uses src/index.ts.
import express from 'express';
import { createApp } from './dist/app.js';
import { prepareDatabase } from './dist/serverless.js';

const app = express();

// Make sure the database tables exist before the first request is handled.
app.use(async (_req, res, next) => {
  try {
    await prepareDatabase();
    next();
  } catch (err) {
    console.error('Database is not ready:', err);
    res.status(503).json({
      error: { code: 'DATABASE_UNAVAILABLE', message: 'The store is starting up. Please try again in a moment.' },
    });
  }
});

app.use(createApp());

export default app;

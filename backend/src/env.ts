// Loads settings from the project's root ".env" file into process.env.
// Values that are already set in the real environment always win.
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/** The backend/ folder (works from both src/ and the compiled dist/ folder). */
export const backendDir = path.resolve(import.meta.dirname, '..');
/** The project root folder that contains backend/, dashboard/ and mobile/. */
export const projectRoot = path.resolve(backendDir, '..');

const envFile = path.join(projectRoot, '.env');
if (fs.existsSync(envFile)) {
  dotenv.config({ path: envFile, quiet: true });
}

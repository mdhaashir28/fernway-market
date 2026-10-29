// The payment-mode safety rules, checked by starting the settings loader with
// different environment variables (no database needed).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(backendDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function loadConfig(env: Record<string, string>) {
  const script = "import('./src/config.ts').then(({ config }) => console.log(JSON.stringify({ mode: config.paymentsEnvironment, missing: config.razorpayKeysMissing, publicUrl: config.PUBLIC_API_URL ?? null })))";
  const result = spawnSync(process.execPath, [tsxCli, '--eval', script], {
    cwd: backendDir,
    encoding: 'utf8',
    // Only these settings — the developer's own .env file is not read.
    env: {
      PATH: process.env.PATH ?? '',
      SYSTEMROOT: process.env.SYSTEMROOT ?? '',
      SKIP_DOTENV: 'true',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5433/unused',
      JWT_SECRET: 'a-long-test-secret-for-config-checks',
      ...env,
    },
  });
  const out = result.stdout.trim().split('\n').pop() ?? '';
  return { code: result.status, output: result.stdout + result.stderr, value: result.status === 0 ? JSON.parse(out) : null };
}

describe('payment mode settings', () => {
  it('uses the labelled demo page by default', () => {
    assert.equal(loadConfig({}).value.mode, 'demo');
  });

  it('falls back to the demo page when Razorpay is chosen but its keys are missing', () => {
    const { value } = loadConfig({ PAYMENTS_MODE: 'razorpay' });
    assert.deepEqual([value.mode, value.missing], ['demo', true]);
  });

  it('uses Razorpay TEST mode with test keys', () => {
    const { value } = loadConfig({ PAYMENTS_MODE: 'razorpay', RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: 'test-secret' });
    assert.equal(value.mode, 'test');
  });

  it('refuses LIVE keys unless live payments are switched on deliberately', () => {
    const refused = loadConfig({ PAYMENTS_MODE: 'razorpay', RAZORPAY_KEY_ID: 'rzp_live_abc', RAZORPAY_KEY_SECRET: 'live-secret' });
    assert.equal(refused.code, 1);
    assert.match(refused.output, /LIVE key/);
    assert.doesNotMatch(refused.output, /live-secret/, 'the secret is never printed');

    const allowed = loadConfig({
      PAYMENTS_MODE: 'razorpay',
      RAZORPAY_KEY_ID: 'rzp_live_abc',
      RAZORPAY_KEY_SECRET: 'live-secret',
      RAZORPAY_ALLOW_LIVE_PAYMENTS: 'true',
    });
    assert.equal(allowed.value.mode, 'live');
  });

  it('rejects a key that is neither a test nor a live key', () => {
    const result = loadConfig({ PAYMENTS_MODE: 'razorpay', RAZORPAY_KEY_ID: 'abc123', RAZORPAY_KEY_SECRET: 'x-secret' });
    assert.equal(result.code, 1);
    assert.match(result.output, /rzp_test_/);
  });

  it('treats placeholder keys copied from .env.example as not set', () => {
    const { value } = loadConfig({
      PAYMENTS_MODE: 'razorpay',
      RAZORPAY_KEY_ID: 'rzp_test_replace-with-your-key-id',
      RAZORPAY_KEY_SECRET: 'replace-with-your-razorpay-key-secret',
    });
    assert.deepEqual([value.mode, value.missing], ['demo', true]);
  });

  it("uses Render's own address for payment links when PUBLIC_API_URL is not set", () => {
    const { value } = loadConfig({ RENDER_EXTERNAL_URL: 'https://meeranji-api.onrender.com/' });
    assert.equal(value.publicUrl, 'https://meeranji-api.onrender.com');
  });
});

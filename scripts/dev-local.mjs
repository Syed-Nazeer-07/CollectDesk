/**
 * Local development launcher using mongodb-memory-server (no MongoDB install needed).
 * Starts an in-memory MongoDB, the Express API, and the Next.js dev server.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

console.log('⏳ Starting in-memory MongoDB...');
const mongod = await MongoMemoryServer.create();
const baseUri = mongod.getUri();
const uri = baseUri.endsWith('/') ? `${baseUri}collectdesk_demo` : `${baseUri}/collectdesk_demo`;
console.log(`✅ MongoDB ready at ${uri}`);

const env = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '4000',
  WEB_ORIGIN: 'http://localhost:3000',
  MONGODB_URI: uri,
  JWT_SECRET: 'dev-only-secret-not-for-production-at-least-32-chars-long',
  DEMO_SEED_PASSWORD: 'localdevpassword',
  PUBLIC_REGISTRATION_ENABLED: 'true',
};

const children = [];

function run(label, cmd, args, cwd, extraEnv = {}) {
  const child = spawn(cmd, args, {
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
    cwd,
    shell: false,
  });
  child.once('error', (err) => console.error(`[${label}] error:`, err.message));
  child.once('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[${label}] exited with code ${code}`);
  });
  children.push(child);
  return child;
}

// Seed demo data
console.log('🌱 Seeding demo data...');
const seedProc = spawn(process.execPath, [resolve(root, 'apps/api/src/seed.js')], {
  env,
  stdio: 'inherit',
  cwd: root,
});
await new Promise((ok, fail) => {
  seedProc.once('error', fail);
  seedProc.once('exit', (code) => {
    if (code === 0) ok();
    else {
      console.warn('⚠️  Seed exited with code', code, '— continuing anyway');
      ok();
    }
  });
});

// Start API server
console.log('🚀 Starting API on http://localhost:4000 ...');
run('API', process.execPath, ['--watch', resolve(root, 'apps/api/src/server.js')], root);

// Start Next.js dev server
console.log('🚀 Starting Web on http://localhost:3000 ...');
run('WEB', process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3000'], resolve(root, 'apps/web'), {
  NEXT_PUBLIC_API_URL: 'http://localhost:4000',
});

// Graceful shutdown
function stop() {
  console.log('\n🛑 Shutting down...');
  for (const c of children) if (c.exitCode === null) c.kill();
  mongod.stop().then(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  CollectDesk Dev Environment');
console.log('  Web:  http://localhost:3000');
console.log('  API:  http://localhost:4000');
console.log('  DB:   In-memory (no install needed)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Press Ctrl+C to stop\n');

#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { fork, spawn } = require('child_process');

const host = process.env.JQTOOLS_MOCK_HOST || '127.0.0.1';
const httpPort = process.env.JQTOOLS_MOCK_HTTP_PORT || '19245';
const wsPort = process.env.JQTOOLS_MOCK_WS_PORT || '19999';
const frontendDir = process.env.JQTOOLS_MOCK_FRONTEND_DIR || '';

const backendRoot = resolveBackendRoot();
const protectedHostFile = path.join(backendRoot, 'backend-host.exe');
const encryptedPackageFile = path.join(backendRoot, 'backend.jqpack');
const sourceServiceFile = path.join(backendRoot, 'server', 'serialServer.js');
const useProtectedHost = fs.existsSync(protectedHostFile) && fs.existsSync(encryptedPackageFile);

if (!useProtectedHost && !fs.existsSync(sourceServiceFile)) {
  console.error(`[real-service] backend entry not found: ${backendRoot}`);
  process.exit(2);
}

console.log(`[real-service] backend root: ${backendRoot}`);
console.log(`[real-service] HTTP: http://${host}:${httpPort}`);
console.log(`[real-service] WS: ws://${host}:${wsPort}`);
console.log(`[real-service] frontend: ${frontendDir || path.join(backendRoot, 'build')}`);
console.log(`[real-service] mode: ${useProtectedHost ? 'protected executable' : 'development source'}`);

const childEnv = {
  ...process.env,
  isPackaged: 'false',
  appPath: backendRoot,
  JQTOOLS_REAL_BACKEND_ROOT: backendRoot,
  JQTOOLS_FRONTEND_BUILD_DIR: frontendDir || path.join(backendRoot, 'build')
};

const child = useProtectedHost
  ? spawn(protectedHostFile, [], {
    cwd: backendRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  : fork(sourceServiceFile, {
  cwd: backendRoot,
  env: childEnv,
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  windowsHide: true
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

if (!useProtectedHost) {
  child.on('message', (message) => {
    if (message?.type === 'ready') {
      console.log(`[real-service] serial service ready on port ${message.port}`);
    }
  });
}

child.on('error', (error) => {
  console.error('[real-service] backend process failed:', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  console.error(`[real-service] serial service exited: code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => {
  try {
    if (!child.killed) {
      child.kill();
    }
  } catch {}
});

function shutdown() {
  try {
    if (!child.killed) {
      child.kill();
    }
  } finally {
    process.exit(0);
  }
}

function resolveBackendRoot() {
  const explicit = process.env.JQTOOLS_REAL_BACKEND_ROOT;
  if (explicit && hasRealBackend(explicit)) {
    return path.resolve(explicit);
  }

  const candidates = [
    path.resolve(__dirname, 'real-backend'),
    path.resolve(__dirname, '..', 'real-backend'),
    path.resolve(__dirname, '..', '..', 'real-backend'),
    path.resolve(__dirname, '..', '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..'),
    process.cwd()
  ];

  for (const candidate of candidates) {
    if (hasRealBackend(candidate)) {
      return candidate;
    }
  }

  return path.resolve(__dirname, '..', '..', '..', '..');
}

function hasRealBackend(candidate) {
  const hasProtectedBackend =
    fs.existsSync(path.join(candidate, 'backend-host.exe')) &&
    fs.existsSync(path.join(candidate, 'backend.jqpack'));
  const hasSourceBackend =
    fs.existsSync(path.join(candidate, 'server', 'serialServer.js')) &&
    fs.existsSync(path.join(candidate, 'pyWorker.js'));

  return fs.existsSync(path.join(candidate, 'config.txt')) &&
    (hasProtectedBackend || hasSourceBackend);
}

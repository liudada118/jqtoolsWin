#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const host = process.env.JQTOOLS_MOCK_HOST || '127.0.0.1';
const httpPort = process.env.JQTOOLS_MOCK_HTTP_PORT || '19245';
const wsPort = process.env.JQTOOLS_MOCK_WS_PORT || '19999';
const frontendDir = process.env.JQTOOLS_MOCK_FRONTEND_DIR || '';

const backendRoot = resolveBackendRoot();
const serviceFile = path.join(backendRoot, 'server', 'serialServer.js');

if (!fs.existsSync(serviceFile)) {
  console.error(`[real-service] serialServer.js not found: ${serviceFile}`);
  process.exit(2);
}

console.log(`[real-service] backend root: ${backendRoot}`);
console.log(`[real-service] HTTP: http://${host}:${httpPort}`);
console.log(`[real-service] WS: ws://${host}:${wsPort}`);
console.log(`[real-service] frontend: ${frontendDir || path.join(backendRoot, 'build')}`);

const child = fork(serviceFile, {
  cwd: backendRoot,
  env: {
    ...process.env,
    isPackaged: 'false',
    appPath: backendRoot,
    JQTOOLS_FRONTEND_BUILD_DIR: frontendDir || path.join(backendRoot, 'build')
  },
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  windowsHide: true
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

child.on('message', (message) => {
  if (message?.type === 'ready') {
    console.log(`[real-service] serial service ready on port ${message.port}`);
  }
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
  return fs.existsSync(path.join(candidate, 'server', 'serialServer.js')) &&
    fs.existsSync(path.join(candidate, 'pyWorker.js')) &&
    fs.existsSync(path.join(candidate, 'config.txt'));
}

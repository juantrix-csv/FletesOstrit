import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_VERCEL_FREE_ENDPOINTS = Number.parseInt(process.env.VERCEL_FREE_ENDPOINT_LIMIT ?? '12', 10);

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(thisDir, '..');
const apiDir = path.join(projectRoot, 'api');

const collectJsFiles = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
};

const isEndpointFile = (absolutePath) => {
  const base = path.basename(absolutePath);
  if (base.startsWith('_')) return false;
  return true;
};

test('api endpoint count stays under Vercel free limit', () => {
  assert.ok(Number.isInteger(MAX_VERCEL_FREE_ENDPOINTS) && MAX_VERCEL_FREE_ENDPOINTS > 0,
    'VERCEL_FREE_ENDPOINT_LIMIT debe ser un entero > 0');
  assert.ok(statSync(apiDir).isDirectory(), 'No existe carpeta api/');

  const endpointFiles = collectJsFiles(apiDir)
    .filter(isEndpointFile)
    .map((absolutePath) => path.relative(projectRoot, absolutePath).replaceAll('\\', '/'))
    .sort();

  assert.ok(
    endpointFiles.length <= MAX_VERCEL_FREE_ENDPOINTS,
    [
      `Se detectaron ${endpointFiles.length} endpoints y el maximo permitido es ${MAX_VERCEL_FREE_ENDPOINTS}.`,
      'Endpoints detectados:',
      ...endpointFiles.map((file) => `- ${file}`),
      'Si necesitas otro limite, define VERCEL_FREE_ENDPOINT_LIMIT.',
    ].join('\n'),
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('扩展区分发布前拦截与已上线后限制访问', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'previewship-extension-result-'));
  try {
    const outfile = path.join(directory, 'result.mjs');
    await build({ entryPoints: ['src/deployment-result.ts'], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const { deploymentFailure } = await import(pathToFileURL(outfile).href);
    const base = { deploymentId: 12, failureCode: 'CONTENT_RISK_HIGH', contentRisk: { decision: 'HOLD', findings: [], notificationStatus: 'SKIPPED' } };
    const unpublished = deploymentFailure({ ...base, status: 'FAILED' });
    assert.match(unpublished.message, /Publish paused/);
    assert.match(unpublished.detail, /This version was not published/);
    const restricted = deploymentFailure({ ...base, status: 'BLOCKED', urlStatus: 'BLOCKED' });
    assert.match(restricted.message, /Preview access restricted/);
    assert.match(restricted.detail, /restore access/);
    assert.doesNotMatch(restricted.detail, /remains unchanged/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

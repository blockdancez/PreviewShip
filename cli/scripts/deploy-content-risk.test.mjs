import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

test('实际 CLI 发布在全部终态结束并保留失败码与整改证据', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'previewship-cli-risk-'));
  const originalKey = process.env.PREVIEWSHIP_API_KEY;
  const originalServer = process.env.PREVIEWSHIP_SERVER_URL;
  let status = 'FAILED';
  let code = 'CONTENT_RISK_HIGH';
  let reads = 0;
  let retryingFirst = false;
  const review = {
    status: 'COMPLETED', decision: 'HOLD', riskLevel: 'HIGH', score: 95,
    policyVersion: 'fixture', contentHash: 'fixture', notificationStatus: 'PENDING',
    findings: [{ reasonCode: 'SENSITIVE_DATA', file: 'login.html', line: 8, reason: 'Sensitive data collection', suggestion: 'Remove the collection form.' }],
  };
  const server = createServer(async (request, response) => {
    for await (const ignored of request) void ignored;
    response.setHeader('Content-Type', 'application/json');
    if (request.method === 'POST') {
      response.end(JSON.stringify({ deploymentId: 101, status: 'QUEUED' }));
    } else {
      reads += 1;
      if (retryingFirst && reads === 1) {
        response.end(JSON.stringify({ deploymentId: 101, status: 'BUILDING', contentRisk: {
          ...review, status: 'RETRYING', decision: 'UNKNOWN', riskLevel: 'UNKNOWN', attempt: 1, maxAttempts: 3,
        } }));
        return;
      }
      response.end(JSON.stringify({ deploymentId: 101, projectName: 'fixture', status, failureCode: code,
        previewUrl: status === 'READY' ? 'https://fixture.example.test/' : null, errorMessage: 'Fixture result', contentRisk: review }));
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.PREVIEWSHIP_API_KEY = 'local-test-only';
    process.env.PREVIEWSHIP_SERVER_URL = `http://127.0.0.1:${server.address().port}`;
    await writeFile(path.join(directory, 'index.html'), '<html><body>Safe local fixture</body></html>');
    const outfile = path.join(directory, 'cli.cjs');
    await build({ entryPoints: ['src/index.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
    const { deploy } = await import(pathToFileURL(outfile).href);
    for (const terminal of ['FAILED', 'BLOCKED', 'EXPIRED', 'SUPERSEDED']) {
      status = terminal;
      code = terminal === 'FAILED' ? 'CONTENT_RISK_HIGH' : null;
      reads = 0;
      const result = await deploy({ path: path.join(directory, 'index.html') });
      assert.equal(reads, 1, `${terminal} 不应继续轮询`);
      assert.equal(result.success, false);
      assert.equal(result.status, terminal);
      assert.equal(result.error.code, code || `DEPLOYMENT_${terminal}`);
      assert.deepEqual(result.contentRisk, review);
      assert.deepEqual(result.error.details.contentRisk.findings, review.findings);
    }
    status = 'FAILED';
    code = 'CONTENT_CHECK_UNAVAILABLE';
    const unavailable = await deploy({ path: path.join(directory, 'index.html') });
    assert.equal(unavailable.error.code, 'CONTENT_CHECK_UNAVAILABLE');
    status = 'READY';
    review.decision = 'PASS';
    review.riskLevel = 'MEDIUM';
    const ready = await deploy({ path: path.join(directory, 'index.html') });
    assert.equal(ready.success, true);
    assert.equal(ready.contentRisk.riskLevel, 'MEDIUM');
    retryingFirst = true;
    reads = 0;
    const recovered = await deploy({ path: path.join(directory, 'index.html') });
    assert.equal(reads, 2, '后台审核重试不能被CLI当成最终失败');
    assert.equal(recovered.success, true);
    assert.equal(recovered.deploymentId, 101, '自动恢复继续使用同一个部署');
  } finally {
    if (originalKey === undefined) delete process.env.PREVIEWSHIP_API_KEY; else process.env.PREVIEWSHIP_API_KEY = originalKey;
    if (originalServer === undefined) delete process.env.PREVIEWSHIP_SERVER_URL; else process.env.PREVIEWSHIP_SERVER_URL = originalServer;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('MCP 工具完整返回审核失败码与结构化整改原因', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'previewship-mcp-risk-'));
  try {
    const outfile = path.join(directory, 'tools.cjs');
    const review = {
      status: 'COMPLETED', decision: 'HOLD', riskLevel: 'HIGH', score: 93,
      policyVersion: 'fixture', contentHash: 'fixture', notificationStatus: 'ACCEPTED',
      findings: [{ reasonCode: 'IMPERSONATION', file: 'pages/login.html', line: 11, reason: 'Brand impersonation', suggestion: 'Remove the misleading brand.' }],
    };
    await build({ entryPoints: ['src/tools.ts'], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      plugins: [{ name: 'local-cli-fixture', setup(builder) {
        builder.onResolve({ filter: /^previewship$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
          export class ApiError extends Error {}
          export const formatApiError = (error) => error.message
          export const getUsage = async () => ({})
          const contentRisk = ${JSON.stringify(review)}
          export const deploy = async () => ({ success: false, deploymentId: 103, status: 'FAILED', contentRisk,
            error: { code: 'CONTENT_RISK_HIGH', message: 'Publish paused' } })
          export const getStatus = async (id) => id === 105 ? ({ deploymentId: 105, projectName: 'fixture', status: 'READY', urlStatus: 'READY', previewUrl: 'https://example.test/preview',
            contentRisk: { ...contentRisk, status: 'PENDING', decision: 'UNKNOWN', riskLevel: 'UNKNOWN', findings: [] }, createdAt: 'fixture' })
            : id === 106 ? ({ deploymentId: 106, projectName: 'fixture', status: 'READY', urlStatus: 'READY', previewUrl: 'https://example.test/preview',
            contentRisk: { ...contentRisk, decision: 'UNKNOWN', riskLevel: 'UNKNOWN', findings: [], notificationStatus: 'SKIPPED' }, createdAt: 'fixture' })
            : id === 107 ? ({ deploymentId: 107, projectName: 'fixture', status: 'BLOCKED', urlStatus: 'BLOCKED', previewUrl: 'https://example.test/preview',
            failureCode: 'CONTENT_RISK_HIGH', contentRisk, createdAt: 'fixture' })
            : id === 104 ? ({ deploymentId: 104, projectName: 'fixture', status: 'BUILDING',
            contentRisk: { ...contentRisk, status: 'RETRYING', decision: 'UNKNOWN', riskLevel: 'UNKNOWN' }, createdAt: 'fixture' }) : ({ deploymentId: 103, projectName: 'fixture', status: 'FAILED',
            failureCode: 'CONTENT_RISK_HIGH', errorMessage: 'Publish paused', contentRisk, createdAt: 'fixture' })
        ` }));
      } }],
    });
    const { registerTools } = await import(pathToFileURL(outfile).href);
    const callbacks = new Map();
    registerTools({ registerTool: (name, description, handler) => callbacks.set(name, handler) });
    const published = await callbacks.get('deploy_preview')({ path: '/local-fixture' });
    assert.equal(published.isError, true);
    assert.equal(published.structuredContent.error.code, 'CONTENT_RISK_HIGH');
    assert.equal(published.structuredContent.deploymentId, 103);
    assert.deepEqual(published.structuredContent.contentRisk, review);
    assert.match(published.content[0].text, /pages\/login.html:11/);
    assert.match(published.content[0].text, /Remove the misleading brand/);
    assert.doesNotMatch(published.content[0].text, /delivery confirmed|Upgrade to Pro/);
    const checked = await callbacks.get('check_deployment')({ deploymentId: 103 });
    assert.equal(checked.structuredContent.failureCode, 'CONTENT_RISK_HIGH');
    assert.deepEqual(checked.structuredContent.contentRisk, review);
    assert.match(checked.content[0].text, /Code: CONTENT_RISK_HIGH/);
    const retrying = await callbacks.get('check_deployment')({ deploymentId: 104 });
    assert.match(retrying.content[0].text, /retrying automatically/);
    assert.doesNotMatch(retrying.content[0].text, /Submit again|Remove the misleading brand/);
    const pending = await callbacks.get('check_deployment')({ deploymentId: 105 });
    assert.match(pending.content[0].text, /Preview is live.*queued/);
    assert.match(pending.content[0].text, /Preview URL: https:\/\/example.test\/preview/);
    const unknownLive = await callbacks.get('check_deployment')({ deploymentId: 106 });
    assert.match(unknownLive.content[0].text, /not a violation finding.*preview remains live/i);
    const blocked = await callbacks.get('check_deployment')({ deploymentId: 107 });
    assert.match(blocked.content[0].text, /Access to this preview has been restricted/);
    assert.doesNotMatch(blocked.content[0].text, /Preview URL:/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

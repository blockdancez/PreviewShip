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
          export const deploy = async (options) => options.projectName === 'pending-fixture' ? ({ success: false, deploymentId: 108, status: 'BLOCKED',
            contentRisk: { ...contentRisk, decision: 'PASS', riskLevel: 'MEDIUM', findings: [] },
            error: { code: 'CONTENT_RISK_RECHECK_PENDING', message: 'Restricted' } })
            : ({ success: false, deploymentId: 103, status: 'FAILED', contentRisk,
            error: { code: 'CONTENT_RISK_HIGH', message: 'Publish paused' } })
          export const getStatus = async (id) => id >= 108 && id <= 114 ? ({ deploymentId: id, projectName: 'fixture', status: 'BLOCKED', urlStatus: 'BLOCKED', previewUrl: 'https://example.test/preview',
            failureCode: id === 114 ? 'CONTENT_RISK_HIGH' : 'CONTENT_RISK_RECHECK_PENDING', contentRisk: { ...contentRisk, status: id === 112 || id === 113 ? 'RETRYING' : 'COMPLETED', decision: id === 111 || id === 112 ? 'UNKNOWN' : 'PASS',
            riskLevel: 'MEDIUM', verifiedSafeRecheck: [110, 113, 114].includes(id) ? true : id === 109 ? false : undefined,
            findings: [{ reasonCode: id === 114 ? 'RISK_EVIDENCE_PENDING' : 'SENSITIVE_COLLECTION', file: 'index.html', line: 3, reason: 'Check credential collection', suggestion: 'Revise the sensitive fields' }] }, createdAt: 'fixture' })
            : id === 105 ? ({ deploymentId: 105, projectName: 'fixture', status: 'READY', urlStatus: 'READY', previewUrl: 'https://example.test/preview',
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
    for (const deploymentId of [108, 109, 111]) {
      const unresolved = await callbacks.get('check_deployment')({ deploymentId });
      assert.match(unresolved.content[0].text, /Access remains restricted/);
      assert.match(unresolved.content[0].text, /publish a correction in the same project/i);
      assert.doesNotMatch(unresolved.content[0].text, /being restored|No re-upload|has not gone live|Preview URL:/);
      assert.equal(unresolved.structuredContent.contentRisk.decision, deploymentId === 111 ? 'UNKNOWN' : 'PASS');
    }
    const restoring = await callbacks.get('check_deployment')({ deploymentId: 110 });
    assert.match(restoring.content[0].text, /safety recheck passed.*access is being restored/i);
    assert.doesNotMatch(restoring.content[0].text, /publish a correction|Preview URL:/);
    const automatic = await callbacks.get('check_deployment')({ deploymentId: 112 });
    assert.match(automatic.content[0].text, /temporarily restricted.*automatic.*No re-upload/);
    assert.doesNotMatch(automatic.content[0].text, /being restored|has not gone live|Preview URL:/);
    const paused = await callbacks.get('deploy_preview')({ path: '/local-fixture', projectName: 'pending-fixture' });
    assert.equal(paused.isError, true);
    assert.match(paused.content[0].text, /Access remains restricted/);
    assert.match(paused.content[0].text, /publish a correction in the same project/i);
    assert.doesNotMatch(paused.content[0].text, /being restored|Deployment successful/);
    const notCompleted = await callbacks.get('check_deployment')({ deploymentId: 113 });
    assert.match(notCompleted.content[0].text, /automatic safety recheck/);
    assert.doesNotMatch(notCompleted.content[0].text, /recheck passed|being restored|Preview URL:/);
    const confirmed = await callbacks.get('check_deployment')({ deploymentId: 114 });
    assert.match(confirmed.content[0].text, /Code: CONTENT_RISK_HIGH/);
    assert.doesNotMatch(confirmed.content[0].text, /recheck passed|being restored|Preview URL:/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

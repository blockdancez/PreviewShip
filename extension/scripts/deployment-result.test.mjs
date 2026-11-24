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
    const recheck = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED', contentRisk: { decision: 'UNKNOWN', status: 'RETRYING', findings: [] } });
    assert.match(recheck.message, /temporarily restricted/);
    assert.match(recheck.detail, /No re-upload is needed/);
    const restoring = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED', contentRisk: { decision: 'PASS', status: 'COMPLETED', verifiedSafeRecheck: true, findings: [] } });
    assert.match(restoring.message, /access is being restored/);
    assert.match(restoring.detail, /No re-upload is needed/);
    for (const verifiedSafeRecheck of [undefined, false]) {
      const unresolved = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED',
        contentRisk: { decision: 'PASS', status: 'COMPLETED', verifiedSafeRecheck, findings: [
          { reasonCode: 'SENSITIVE_COLLECTION', file: 'index.html', line: 3, reason: 'Check collection', suggestion: 'Revise collection' },
        ] } });
      assert.match(unresolved.message, /remains restricted.*unresolved/);
      assert.match(unresolved.detail, /publish a correction in the same project/);
      assert.match(unresolved.detail, /index.html:3: Check collection/);
      assert.match(unresolved.detail, /Suggested fix: Revise collection/);
      assert.doesNotMatch(unresolved.message + unresolved.detail, /access is being restored|No re-upload is needed/);
      assert.equal(unresolved.consoleUrl, 'https://previewship.com/deploy?deploymentId=12');
    }
    const inconsistent = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED',
      contentRisk: { decision: 'PASS', status: 'RETRYING', verifiedSafeRecheck: true, findings: [] } });
    assert.doesNotMatch(inconsistent.message, /access is being restored/);
    assert.match(inconsistent.message, /temporarily restricted/);
    const terminalUnknown = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED',
      contentRisk: { decision: 'UNKNOWN', status: 'COMPLETED', findings: [] } });
    assert.match(terminalUnknown.message, /remains restricted.*unresolved/);
    assert.match(terminalUnknown.detail, /publish a correction in the same project/);
    assert.doesNotMatch(terminalUnknown.detail, /No re-upload is needed/);
    const opaque = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED',
      contentRisk: { decision: 'PASS', status: 'COMPLETED', verifiedSafeRecheck: true, findings: [
        { reasonCode: 'OPAQUE_CONTENT_UNINSPECTED', file: '', line: 0, reason: 'Opaque content', suggestion: '' },
      ] } });
    assert.match(opaque.message, /encoded active content could not be fully inspected/);
    assert.match(opaque.detail, /Remove obfuscation/);
    assert.doesNotMatch(opaque.message + opaque.detail, /access is being restored|No re-upload is needed/);
    const failedOpaque = deploymentFailure({ ...base, failureCode: 'CONTENT_CHECK_UNAVAILABLE', status: 'FAILED',
      contentCheckRetryAvailable: true, contentRisk: { decision: 'UNKNOWN', status: 'COMPLETED', findings: [
        { reasonCode: 'OPAQUE_CONTENT_UNINSPECTED', file: 'assets/app.js', line: 12, reason: 'Opaque content' },
      ] } });
    assert.match(failedOpaque.message, /Publish paused.*encoded active content/);
    assert.match(failedOpaque.detail, /assets\/app\.js:12/);
    assert.match(failedOpaque.detail, /provide readable code.*publish again.*has not gone live/);
    assert.doesNotMatch(failedOpaque.detail, /Retry|uploading again|access remains restricted/i);
    const retryingOpaque = deploymentFailure({ ...base, failureCode: 'CONTENT_RISK_RECHECK_PENDING', status: 'BLOCKED',
      contentRisk: { decision: 'UNKNOWN', status: 'RETRYING', findings: [
        { reasonCode: 'OPAQUE_CONTENT_UNINSPECTED', reason: 'Old finding', suggestion: 'Publish a correction' },
      ] } });
    assert.match(retryingOpaque.detail, /No re-upload is needed/);
    assert.doesNotMatch(retryingOpaque.detail, /Publish a correction/i);
    const technicalFailure = { ...base, failureCode: 'CONTENT_CHECK_UNAVAILABLE', status: 'FAILED', contentCheckRetryAvailable: true,
      contentRisk: { decision: 'UNKNOWN', status: 'COMPLETED', findings: [] } };
    assert.match(deploymentFailure(technicalFailure).detail, /retry the safety check without uploading again/);
    const riskFailure = { ...technicalFailure, contentRisk: { ...technicalFailure.contentRisk, findings: [
      { reasonCode: 'RISK_EVIDENCE_PENDING', reason: 'Safety recheck unresolved' },
    ] } };
    assert.match(deploymentFailure(riskFailure).detail, /Revise the files.*publish again/);
    assert.doesNotMatch(deploymentFailure(riskFailure).detail, /retry the safety check without uploading again/);
    for (const failureCode of ['CONTENT_RISK_HIGH', 'CONTENT_RISK_VERSION_REVOKED']) {
      const withdrawn = deploymentFailure({ ...base, failureCode, status: 'BLOCKED',
        contentRisk: { decision: 'PASS', status: 'COMPLETED', verifiedSafeRecheck: true, findings: [] } });
      assert.doesNotMatch(withdrawn.message + withdrawn.detail, /access is being restored|No re-upload is needed/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

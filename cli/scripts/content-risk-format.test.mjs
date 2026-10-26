import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

test('旧审核未决结果给出自动检查整改建议，不要求人工复核', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'previewship-risk-format-'));
  try {
    const outfile = path.join(directory, 'format.mjs');
    await build({ entryPoints: ['src/content-risk.ts'], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
    const { formatContentRisk } = await import(pathToFileURL(outfile).href);
    for (const reasonCode of ['CONTENT_CHECK_REVIEW_REQUIRED', 'CONTENT_RISK_REVIEW_REQUIRED']) {
      const lines = formatContentRisk({ status: 'COMPLETED', decision: 'UNKNOWN', riskLevel: 'UNKNOWN', notificationStatus: 'SKIPPED',
        findings: [{ reasonCode, file: '', line: 0, reason: 'Needs human review', suggestion: 'Contact support for manual review' }] });
      assert.match(lines.join('\n'), /automated safety check/);
      assert.match(lines.join('\n'), /publish the revised files/);
      assert.doesNotMatch(lines.join('\n'), /human|manual|Contact support|recovery options/);
    }
    assert.match(formatContentRisk({ status: 'RETRYING', decision: 'UNKNOWN', findings: [] }).join(''), /retrying automatically/);
    assert.match(formatContentRisk({ status: 'PENDING', decision: 'UNKNOWN', findings: [] }, 'READY').join(''), /Preview is live.*queued/);
    assert.match(formatContentRisk({ status: 'CHECKING', decision: 'UNKNOWN', findings: [] }, 'READY').join(''), /Preview is live.*running/);
    assert.match(formatContentRisk({ status: 'RETRYING', decision: 'UNKNOWN', findings: [] }, 'READY').join(''), /Preview is live.*retrying/);
    const unknownLive = formatContentRisk({ status: 'COMPLETED', decision: 'UNKNOWN', riskLevel: 'UNKNOWN', notificationStatus: 'SKIPPED', findings: [] }, 'READY').join(' ');
    assert.match(unknownLive, /not a violation finding.*preview remains live/i);
    assert.doesNotMatch(unknownLive, /has not gone live/);
    const blocked = formatContentRisk({ status: 'COMPLETED', decision: 'HOLD', riskLevel: 'HIGH', notificationStatus: 'ACCEPTED', findings: [] }, 'BLOCKED').join(' ');
    assert.match(blocked, /Access to this preview has been restricted/);
    assert.doesNotMatch(blocked, /remains unchanged/);
    assert.deepEqual(formatContentRisk({ status: 'COMPLETED', decision: 'PASS', riskLevel: 'LOW', findings: [] }), []);
    const pendingRisk = { status: 'RETRYING', decision: 'UNKNOWN', findings: [{ reasonCode: 'RISK_EVIDENCE_PENDING', reason: '', suggestion: '' }] };
    assert.match(formatContentRisk(pendingRisk, 'BLOCKED', 'CONTENT_RISK_RECHECK_PENDING').join(' '), /temporarily restricted.*automatic.*No re-upload/);
    assert.match(formatContentRisk({ ...pendingRisk, status: 'COMPLETED' }, 'BLOCKED', 'CONTENT_RISK_RECHECK_PENDING').join(' '), /Access remains restricted/);
    assert.match(formatContentRisk({ ...pendingRisk, status: 'COMPLETED', decision: 'PASS', verifiedSafeRecheck: true }, 'BLOCKED', 'CONTENT_RISK_RECHECK_PENDING').join(' '), /access is being restored/);
    for (const verifiedSafeRecheck of [undefined, false]) {
      for (const riskLevel of ['LOW', 'MEDIUM']) {
        const legacyPass = { status: 'COMPLETED', decision: 'PASS', riskLevel, verifiedSafeRecheck,
          findings: [{ reasonCode: 'SENSITIVE_COLLECTION', file: 'index.html', line: 3, reason: 'Sensitive collection', suggestion: 'Revise collection' }] };
        const restricted = formatContentRisk(legacyPass, 'BLOCKED', 'CONTENT_RISK_RECHECK_PENDING').join(' ');
        assert.match(restricted, /could not resolve the risk.*Access remains restricted/);
        assert.match(restricted, /publish a correction in the same project/i);
        assert.match(restricted, /not a confirmed violation/);
        assert.doesNotMatch(restricted, /recheck passed|access is being restored|No re-upload|Preview is live/);
        const live = formatContentRisk(legacyPass, 'READY').join(' ');
        assert.doesNotMatch(live, /Access remains restricted|same project|being restored/);
      }
    }
    const verifiedPass = { ...pendingRisk, status: 'COMPLETED', decision: 'PASS', verifiedSafeRecheck: true };
    assert.match(formatContentRisk(verifiedPass, 'BLOCKED').join(' '), /access is being restored/, '旧接口缺失败码时兼容待复核 finding');
    for (const failureCode of ['CONTENT_RISK_HIGH', 'CONTENT_RISK_VERSION_REVOKED', 'OTHER_RESTRICTION']) {
      const conflict = formatContentRisk(verifiedPass, 'BLOCKED', failureCode).join(' ');
      assert.doesNotMatch(conflict, /recheck passed|access is being restored/, `${failureCode} 不能被残留 finding 覆盖`);
    }
    const revokedOpaque = formatContentRisk({ status: 'COMPLETED', decision: 'UNKNOWN',
      findings: [{ reasonCode: 'OPAQUE_CONTENT_UNINSPECTED' }] }, 'BLOCKED', 'CONTENT_RISK_VERSION_REVOKED').join(' ');
    assert.match(revokedOpaque, /historical version has been withdrawn/);
    assert.doesNotMatch(revokedOpaque, /could not be fully inspected/);
    const checkingPass = formatContentRisk({ ...pendingRisk, decision: 'PASS', verifiedSafeRecheck: true }, 'BLOCKED', 'CONTENT_RISK_RECHECK_PENDING').join(' ');
    assert.match(checkingPass, /automatic safety recheck runs.*No re-upload/);
    assert.doesNotMatch(checkingPass, /recheck passed|being restored/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

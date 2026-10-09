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
  } finally { await rm(directory, { recursive: true, force: true }); }
});

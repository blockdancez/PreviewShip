import type { ContentRiskReview, DeploymentStatus } from './types.js';

/** 不输出源码片段或候选网址，避免整改提示泄露秘密或引导访问风险内容。 */
export function formatContentRisk(review?: ContentRiskReview | null, deploymentStatus?: DeploymentStatus): string[] {
  if (!review) return [];
  const live = deploymentStatus === 'READY';
  if (review.status === 'PENDING') return [live
    ? 'Preview is live. The background safety check is queued.'
    : 'Preparing the preview; the background safety check will follow.'];
  if (review.status === 'CHECKING') return [live
    ? 'Preview is live. The background safety check is running.'
    : 'Checking publish content before this version goes live.'];
  if (review.status === 'RETRYING') return [live
    ? 'Preview is live. The background safety check is retrying automatically.'
    : 'The safety check is retrying automatically. Your upload is saved.'];
  if (review.decision === 'PASS' && review.riskLevel === 'LOW') return [];
  const reviseInput = review.findings.some((finding) =>
    ['CONTENT_CHECK_LIMIT_EXCEEDED', 'CONTENT_CHECK_ENCODING_UNSUPPORTED'].includes(finding.reasonCode));
  const unresolvedRisk = review.findings.some((finding) =>
    ['CONTENT_CHECK_REVIEW_REQUIRED', 'CONTENT_RISK_REVIEW_REQUIRED'].includes(finding.reasonCode));
  return [
    `Content check: ${review.status} / ${review.riskLevel} / ${review.decision}`,
    ...review.findings.flatMap((finding) =>
      ['CONTENT_CHECK_REVIEW_REQUIRED', 'CONTENT_RISK_REVIEW_REQUIRED'].includes(finding.reasonCode) ? [
        'The automated safety check could not confirm that this version is safe to publish.',
        '  Suggested fix: Check sensitive-data collection and submission destinations, then publish the revised files.',
      ] : [
      `${finding.file ? `${finding.file}${finding.line > 0 ? `:${finding.line}` : ''}: ` : ''}${finding.reason}`,
      finding.suggestion ? `  Suggested fix: ${finding.suggestion}` : '',
    ]).filter(Boolean),
    review.decision === 'HOLD' ? deploymentStatus === 'BLOCKED'
      ? 'Access to this preview has been restricted. Revise the files and publish a correction to restore access.'
      : 'Revise the files and publish again. This version was not published.' : null,
    review.decision === 'UNKNOWN' ? live
      ? 'The safety check did not finish; this is not a violation finding. The preview remains live. Open the deployment in the console for details.'
      : reviseInput || unresolvedRisk
        ? 'Revise the files as suggested, then publish again. This version has not gone live.'
        : 'The safety check did not finish. Open this deployment in the console for recovery options; this version has not gone live.' : null,
    review.decision === 'HOLD' && review.notificationStatus === 'ACCEPTED' ? 'The email service accepted the remediation notice; delivery is not yet confirmed.' : null,
    review.decision === 'HOLD' && (review.notificationStatus === 'PENDING' || review.notificationStatus === 'RETRYING') ? 'The remediation notice is pending or retrying. Use the findings above for now.' : null,
  ].filter((line): line is string => Boolean(line));
}

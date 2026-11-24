import type { ContentRiskReview, DeploymentDetail, DeploymentStatus } from './types.js';

const fileRevisionReasons = new Set(['CONTENT_CHECK_LIMIT_EXCEEDED', 'CONTENT_CHECK_ENCODING_UNSUPPORTED', 'OPAQUE_CONTENT_UNINSPECTED']);
const unresolvedReasons = new Set(['CONTENT_CHECK_REVIEW_REQUIRED', 'CONTENT_RISK_REVIEW_REQUIRED', 'RISK_EVIDENCE_PENDING']);

/** 确定性问题优先于保留文件标记，兼容已有记录的通用错误文案。 */
export function contentCheckFailureMessage(detail: DeploymentDetail): string | undefined {
  const review = detail.contentRisk;
  // 访问已受限时用实际复核阶段覆盖旧记录的自动复核提示。
  if (detail.status === 'BLOCKED' && detail.failureCode === 'CONTENT_RISK_RECHECK_PENDING' && review) {
    return formatContentRisk(review, detail.status, detail.failureCode)[0];
  }
  if (detail.status !== 'FAILED' || detail.failureCode !== 'CONTENT_CHECK_UNAVAILABLE') return;
  if (review?.status === 'COMPLETED' && review.decision === 'UNKNOWN'
    && review.findings.some(({ reasonCode }) => reasonCode === 'OPAQUE_CONTENT_UNINSPECTED')) {
    return 'Encoded active content could not be fully inspected. This version has not gone live.';
  }
  if (detail.contentCheckRetryAvailable === true && (!review || review.status === 'COMPLETED' && review.decision === 'UNKNOWN'
    && !review.findings.some(({ reasonCode }) => fileRevisionReasons.has(reasonCode) || unresolvedReasons.has(reasonCode)))) {
    return `The safety check did not finish. Retry without uploading again at https://previewship.com/deploy?deploymentId=${detail.deploymentId}`;
  }
}

/** 不输出源码片段或候选网址，避免整改提示泄露秘密或引导访问风险内容。 */
export function formatContentRisk(review?: ContentRiskReview | null, deploymentStatus?: DeploymentStatus, failureCode?: string | null): string[] {
  if (!review) return [];
  if (failureCode === 'CONTENT_RISK_VERSION_REVOKED') return ['This historical version has been withdrawn. Open the current version or publish a correction in the same project.'];
  const live = deploymentStatus === 'READY';
  const opaque = review.findings.find((finding) => finding.reasonCode === 'OPAQUE_CONTENT_UNINSPECTED');
  const restrictedRecheck = deploymentStatus === 'BLOCKED' && (failureCode === 'CONTENT_RISK_RECHECK_PENDING'
    || !failureCode && (opaque || review.findings.some((finding) => finding.reasonCode === 'RISK_EVIDENCE_PENDING')));
  // 在自动复核期间优先展示进度，避免旧 finding 诱导重新发布。
  if (restrictedRecheck && review.status !== 'COMPLETED') return ['Preview access is temporarily restricted while an automatic safety recheck runs. No re-upload is needed.'];
  if (opaque && (restrictedRecheck || deploymentStatus === 'FAILED' && (!failureCode || failureCode === 'CONTENT_CHECK_UNAVAILABLE'))) {
    const location = opaque.file ? `${opaque.file}${opaque.line > 0 ? `:${opaque.line}` : ''}: ` : '';
    return [
      `${location}Encoded active content could not be fully inspected. ${restrictedRecheck ? 'Access remains restricted.' : 'This version has not gone live.'}`,
      restrictedRecheck
        ? 'Remove obfuscation or provide readable code, then publish a correction in the same project.'
        : 'Remove obfuscation or provide readable code, then publish again.',
    ];
  }
  if (restrictedRecheck && review.status === 'COMPLETED' && review.decision === 'PASS') {
    // 低分疑似结果也可能记为 PASS，只有明确安全复核才能宣称进入恢复。
    if (review.verifiedSafeRecheck === true) return ['The safety recheck passed. Preview access is being restored; the link remains unavailable until restoration completes.'];
    return [
      'Automatic rechecking could not resolve the risk. Access remains restricted; this is not a confirmed violation.',
      'Check sensitive-data collection and submission destinations, then publish a correction in the same project.',
    ];
  }
  if (review.status === 'PENDING') return [live
    ? 'Preview is live. The background safety check is queued.'
    : 'Preparing the preview; the background safety check will follow.'];
  if (review.status === 'CHECKING') return [live
    ? 'Preview is live. The background safety check is running.'
    : 'Checking publish content before this version goes live.'];
  if (review.status === 'RETRYING') return [live
    ? 'Preview is live. The background safety check is retrying automatically.'
    : 'The safety check is retrying automatically. No re-upload is needed.'];
  if (review.decision === 'PASS' && review.riskLevel === 'LOW') return [];
  const reviseInput = review.findings.some(({ reasonCode }) => fileRevisionReasons.has(reasonCode));
  const unresolvedRisk = review.findings.some(({ reasonCode }) => unresolvedReasons.has(reasonCode));
  return [
    `Content check: ${review.status} / ${review.riskLevel} / ${review.decision}`,
    ...review.findings.flatMap((finding) =>
      unresolvedReasons.has(finding.reasonCode) ? [
        'The automated safety check could not confirm that this version is safe to publish.',
        '  Suggested fix: Check sensitive-data collection and submission destinations, then publish the revised files.',
      ] : [
      `${finding.file ? `${finding.file}${finding.line > 0 ? `:${finding.line}` : ''}: ` : ''}${finding.reason}`,
      finding.suggestion ? `  Suggested fix: ${finding.suggestion}` : '',
    ]).filter(Boolean),
    review.decision === 'HOLD' ? deploymentStatus === 'BLOCKED'
      ? 'Access to this preview has been restricted. Revise the files and publish a correction to restore access.'
      : 'Revise the files and publish again. This version was not published.' : null,
    review.decision === 'UNKNOWN' ? restrictedRecheck
      ? 'Automatic rechecking could not resolve the risk. Access remains restricted. Publish a correction in the same project; this is not a confirmed violation.' : live
      ? 'The safety check did not finish; this is not a violation finding. The preview remains live. Open the deployment in the console for details.'
      : reviseInput || unresolvedRisk
        ? 'Revise the files as suggested, then publish again. This version has not gone live.'
        : 'The safety check did not finish. Open this deployment in the console for recovery options; this version has not gone live.' : null,
    review.decision === 'HOLD' && review.notificationStatus === 'ACCEPTED' ? 'The email service accepted the remediation notice; delivery is not yet confirmed.' : null,
    review.decision === 'HOLD' && (review.notificationStatus === 'PENDING' || review.notificationStatus === 'RETRYING') ? 'The remediation notice is pending or retrying. Use the findings above for now.' : null,
  ].filter((line): line is string => Boolean(line));
}

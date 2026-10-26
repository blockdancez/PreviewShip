import type { DeploymentDetail } from './types';

export function isDeploymentTerminal(status: DeploymentDetail['status']): boolean {
  return ['READY', 'FAILED', 'BLOCKED', 'EXPIRED', 'SUPERSEDED'].includes(status);
}

/** 原因按文本展示，控制台链接仅指向固定产品域名。 */
export function deploymentFailure(detail: DeploymentDetail): { message: string; detail: string; consoleUrl: string } {
  const review = detail.contentRisk;
  const restricted = detail.status === 'BLOCKED' || detail.urlStatus === 'BLOCKED';
  const opaque = review?.findings.some((finding) => finding.reasonCode === 'OPAQUE_CONTENT_UNINSPECTED');
  // 低分 PASS 也可能仍有疑似风险，只有已完成且明确安全的复核才可宣称正在恢复。
  const restoring = review?.status === 'COMPLETED' && review.decision === 'PASS' && review.verifiedSafeRecheck === true;
  const rechecking = ['PENDING', 'CHECKING', 'RETRYING'].includes(review?.status ?? '');
  const code = detail.failureCode || (restricted && detail.contentRisk?.decision === 'HOLD'
    ? 'CONTENT_RISK_HIGH' : `DEPLOYMENT_${detail.status}`);
  const title = code === 'CONTENT_RISK_HIGH' ? restricted
    ? 'Preview access restricted: high-risk content needs changes.'
    : 'Publish paused: high-risk content needs changes.'
    : code === 'CONTENT_RISK_VERSION_REVOKED' ? 'This historical version has been withdrawn. Open the current version or publish a correction.'
    : code === 'CONTENT_RISK_RECHECK_PENDING' ? opaque
      ? 'Preview access is restricted: encoded active content could not be fully inspected.'
      : restoring
      ? 'Safety recheck passed: preview access is being restored.'
      : rechecking ? 'Preview access is temporarily restricted pending automatic safety verification.'
      : 'Preview access remains restricted: the safety recheck is unresolved.'
    : code === 'CONTENT_CHECK_UNAVAILABLE' ? 'Publish paused: the required safety check is incomplete.'
      : detail.errorMessage || `Deployment ended with status ${detail.status}.`;
  const reviseInput = review?.findings.some((finding) =>
    ['CONTENT_CHECK_LIMIT_EXCEEDED', 'CONTENT_CHECK_ENCODING_UNSUPPORTED'].includes(finding.reasonCode));
  const findings = review?.findings.flatMap((finding) => [
    `${finding.file ? `${finding.file}${finding.line > 0 ? `:${finding.line}` : ''}: ` : ''}${finding.reason}`,
    finding.suggestion ? `Suggested fix: ${finding.suggestion}` : '',
  ]) ?? [];
  return {
    message: `${title} (${code})`,
    detail: [
      ...findings,
      code === 'CONTENT_RISK_HIGH' ? restricted
        ? 'Revise the files and publish a correction to restore access.'
        : 'Revise the files and publish again. This version was not published.' : '',
      code === 'CONTENT_CHECK_UNAVAILABLE' ? reviseInput
        ? 'Revise the files as suggested, then submit the check again. This version has not gone live.'
        : detail.contentCheckRetryAvailable
          ? 'Your upload is saved. Open the console to retry the safety check without uploading again. This version has not gone live.'
          : 'Open the console for recovery options. This version has not gone live.' : '',
      code === 'CONTENT_RISK_RECHECK_PENDING' ? opaque
        ? 'Remove obfuscation or provide readable code, then publish a correction in the same project.'
        : restoring || rechecking
        ? 'No re-upload is needed. Open the console to follow the automatic recheck and restoration.'
        : 'The safety recheck has not confirmed this version is safe. Revise the content and publish a correction in the same project.' : '',
      review?.decision === 'HOLD' && review.notificationStatus === 'ACCEPTED' ? 'The email service accepted the remediation notice; delivery is not yet confirmed.' : '',
      review?.decision === 'HOLD' && (review.notificationStatus === 'PENDING' || review.notificationStatus === 'RETRYING') ? 'The remediation notice is pending or retrying. Use these findings for now.' : '',
    ].filter(Boolean).join('\n\n'),
    consoleUrl: `https://previewship.com/deploy?deploymentId=${detail.deploymentId}`,
  };
}

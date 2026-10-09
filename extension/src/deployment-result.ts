import type { DeploymentDetail } from './types';

export function isDeploymentTerminal(status: DeploymentDetail['status']): boolean {
  return ['READY', 'FAILED', 'BLOCKED', 'EXPIRED', 'SUPERSEDED'].includes(status);
}

/** 原因按文本展示，控制台链接仅指向固定产品域名。 */
export function deploymentFailure(detail: DeploymentDetail): { message: string; detail: string; consoleUrl: string } {
  const restricted = detail.status === 'BLOCKED' || detail.urlStatus === 'BLOCKED';
  const code = detail.failureCode || (restricted && detail.contentRisk?.decision === 'HOLD'
    ? 'CONTENT_RISK_HIGH' : `DEPLOYMENT_${detail.status}`);
  const title = code === 'CONTENT_RISK_HIGH' ? restricted
    ? 'Preview access restricted: high-risk content needs changes.'
    : 'Publish paused: high-risk content needs changes.'
    : code === 'CONTENT_CHECK_UNAVAILABLE' ? 'Publish paused: the required safety check is incomplete.'
      : detail.errorMessage || `Deployment ended with status ${detail.status}.`;
  const review = detail.contentRisk;
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
      review?.decision === 'HOLD' && review.notificationStatus === 'ACCEPTED' ? 'The email service accepted the remediation notice; delivery is not yet confirmed.' : '',
      review?.decision === 'HOLD' && (review.notificationStatus === 'PENDING' || review.notificationStatus === 'RETRYING') ? 'The remediation notice is pending or retrying. Use these findings for now.' : '',
    ].filter(Boolean).join('\n\n'),
    consoleUrl: `https://previewship.com/deploy?deploymentId=${detail.deploymentId}`,
  };
}

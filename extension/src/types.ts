/**
 * API 请求/响应类型定义
 * 与后端 PluginApiController 契约对齐
 */

// POST /v1/deployments 响应
export interface CreateDeploymentResponse {
  deploymentId: number;
  status: string;
  deploymentSource?: string;
  createdAt: string;
}

// GET /v1/deployments/{id} 响应
export interface DeploymentDetail {
  deploymentId: number;
  projectName: string;
  deploymentSource?: string;
  status: 'QUEUED' | 'BUILDING' | 'READY' | 'FAILED';
  previewUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// 用量信息
export interface QuotaInfo {
  used: number;
  limit: number;
  resetAt: string;
}

// GET /v1/usage 响应
export interface UsageResponse {
  daily: QuotaInfo;
  monthly: QuotaInfo;
}

// 后端错误响应
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * API 错误，包含 HTTP 状态码和后端错误码
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

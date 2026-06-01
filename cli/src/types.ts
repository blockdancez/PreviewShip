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

/** 部署选项 */
export interface DeployOptions {
  /** 要部署的目录路径或单个 HTML 文件路径（默认当前目录） */
  path?: string;
  /** 项目名称（默认为目录名或 HTML 文件名） */
  projectName?: string;
  /** 额外排除模式 */
  excludePatterns?: string[];
  /** 部署入口（CLI/MCP 等），用于后台统计 */
  source?: 'CLI' | 'MCP';
}

/** 部署结果 */
export interface DeployResult {
  success: boolean;
  deploymentId?: number;
  projectName?: string;
  previewUrl?: string;
  status?: string;
  fileCount?: number;
  zipSizeBytes?: number;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** CLI 配置 */
export interface CliConfig {
  apiKey?: string;
  serverUrl?: string;
}

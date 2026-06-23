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
  projectId?: number;
  projectName: string;
  deploymentSource?: string;
  status: DeploymentStatus;
  previewUrl: string | null;
  previewExpiresAt?: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DeploymentStatus = 'QUEUED' | 'BUILDING' | 'READY' | 'SUPERSEDED' | 'FAILED' | 'EXPIRED' | 'BLOCKED';
export type ProjectVisibility = 'PUBLIC' | 'PASSWORD' | 'PRIVATE';

export interface ProjectItem {
  id: number;
  name: string;
  latestDeploymentId: number | null;
  latestDeploymentStatus: DeploymentStatus | null;
  latestDeploymentSource: string | null;
  latestDeployedAt: string | null;
  deploymentCount: number;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  projectStatus: string;
  projectVisibility: ProjectVisibility;
  passwordProtected: boolean;
  abuseBlockedAt: string | null;
  abuseBlockedReason: string | null;
  urlStatus: string;
  canRedeploy: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsResponse {
  projects: ProjectItem[];
}

export interface DeploymentListItem {
  deploymentId: number;
  projectId: number;
  projectName: string;
  status: DeploymentStatus;
  deploymentSource: string;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  current: boolean;
  canRollback: boolean;
  createdAt: string;
}

export interface DeploymentListResponse {
  content: DeploymentListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  statusCounts: Record<string, number>;
}

export interface ProjectAccessResponse {
  projectId: number;
  visibility: ProjectVisibility;
  passwordProtected: boolean;
  proOnly: boolean;
}

export interface ProjectAccessUpdate {
  visibility: 'PUBLIC' | 'PASSWORD';
  password?: string;
}

export interface ProjectVersion {
  deploymentId: number;
  deploymentSource?: string;
  status: DeploymentStatus;
  current: boolean;
  canRollback: boolean;
  retained: boolean;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  artifactExpiresAt?: string | null;
  artifactDeletedAt?: string | null;
  createdAt: string;
}

export interface ProjectVersionsResponse {
  projectId: number;
  latestDeploymentId: number | null;
  limit: number;
  versions: ProjectVersion[];
}

export interface RollbackProjectVersionResponse {
  rolledBack: boolean;
  deploymentId: number;
  previewUrl: string | null;
}

export interface RedeployLatestResponse {
  deploymentId: number;
  projectId: number;
  status: DeploymentStatus;
  deploymentSource?: string;
  createdAt: string;
}

// 用量信息
export interface QuotaInfo {
  used: number;
  limit: number;
  resetAt: string;
}

// GET /v1/usage 响应
export interface UsageResponse {
  plan?: string;
  daily: QuotaInfo;
  monthly: QuotaInfo;
  monthlyUpload?: {
    usedMb: number;
    limitMb: number;
    resetAt: string;
  };
  concurrentBuilds?: {
    current: number;
    limit: number;
  };
  projects?: {
    used: number;
    limit: number;
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

/** 部署选项 */
export interface DeployOptions {
  /** 要部署的目录路径、单个 HTML 文件或 Markdown 文件路径（默认当前目录） */
  path?: string;
  /** 项目名称（默认为目录名、HTML 文件名或 Markdown 文件名） */
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

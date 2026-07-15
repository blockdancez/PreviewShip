import type {
  CreateDeploymentResponse,
  DeploymentDetail,
  DeploymentListResponse,
  ProjectAccessResponse,
  ProjectAccessUpdate,
  ProjectItem,
  ProjectVersionsResponse,
  ProjectsResponse,
  RedeployLatestResponse,
  RollbackProjectVersionResponse,
  UsageResponse,
} from './types.js';
import { ApiError } from './types.js';

/** 默认请求超时 */
const REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 60_000;

const PKG_VERSION = '1.0.11';

/**
 * PreviewShip HTTP 客户端
 * 封装后端 /v1/* 插件 API 调用
 */
export class ApiClient {
  constructor(
    private readonly serverUrl: string,
    private readonly apiKey: string,
  ) {}

  /** POST /v1/deployments — 上传 zip 创建部署 */
  async createDeployment(
    projectName: string,
    zipBuffer: Buffer,
    source = 'CLI',
    access?: { visibility?: 'PUBLIC' | 'PASSWORD'; password?: string },
  ): Promise<CreateDeploymentResponse> {
    const url = `${this.serverUrl}/v1/deployments`;

    const formData = new FormData();
    formData.set('projectName', projectName);
    formData.set('source', source);
    if (access?.visibility) formData.set('visibility', access.visibility);
    if (access?.password) formData.set('password', access.password);
    formData.set('zip', new Blob([zipBuffer]), 'workspace.zip');

    const resp = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    }, UPLOAD_TIMEOUT_MS);

    return this.handleResponse<CreateDeploymentResponse>(resp);
  }

  /** GET /v1/deployments/{id} — 查询部署状态 */
  async getDeployment(id: number): Promise<DeploymentDetail> {
    const url = `${this.serverUrl}/v1/deployments/${id}`;
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<DeploymentDetail>(resp);
  }

  /** GET /v1/deployments — 查询部署记录 */
  async listDeployments(params: {
    page?: number;
    size?: number;
    status?: string;
    query?: string;
    days?: number;
  } = {}): Promise<DeploymentListResponse> {
    const url = this.withQuery('/v1/deployments', {
      page: params.page,
      size: params.size,
      status: params.status,
      q: params.query,
      days: params.days,
    });
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<DeploymentListResponse>(resp);
  }

  /** GET /v1/projects — 查询项目列表 */
  async listProjects(): Promise<ProjectsResponse> {
    const url = `${this.serverUrl}/v1/projects`;
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<ProjectsResponse>(resp);
  }

  /** GET /v1/projects/{id} — 查询项目详情 */
  async getProject(id: number): Promise<ProjectItem> {
    const url = `${this.serverUrl}/v1/projects/${id}`;
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<ProjectItem>(resp);
  }

  /** DELETE /v1/projects/{id} — 删除项目 */
  async deleteProject(id: number): Promise<void> {
    const url = `${this.serverUrl}/v1/projects/${id}`;
    const resp = await this.fetchWithTimeout(url, {
      method: 'DELETE',
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<void>(resp);
  }

  /** POST /v1/projects/{id}/redeploy-latest — 用最新 retained artifact 重新部署 */
  async redeployProject(id: number): Promise<RedeployLatestResponse> {
    const url = `${this.serverUrl}/v1/projects/${id}/redeploy-latest`;
    const resp = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...this.authHeaders() },
    }, UPLOAD_TIMEOUT_MS);
    return this.handleResponse<RedeployLatestResponse>(resp);
  }

  /** GET /v1/projects/{id}/access — 查询访问控制 */
  async getProjectAccess(id: number): Promise<ProjectAccessResponse> {
    const url = `${this.serverUrl}/v1/projects/${id}/access`;
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<ProjectAccessResponse>(resp);
  }

  /** PATCH /v1/projects/{id}/access — 设置公开或密码访问 */
  async updateProjectAccess(id: number, body: ProjectAccessUpdate): Promise<ProjectAccessResponse> {
    const url = `${this.serverUrl}/v1/projects/${id}/access`;
    const resp = await this.fetchWithTimeout(url, {
      method: 'PATCH',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.handleResponse<ProjectAccessResponse>(resp);
  }

  /** GET /v1/projects/{id}/versions — 查询版本历史 */
  async listProjectVersions(id: number, page = 0, size = 20): Promise<ProjectVersionsResponse> {
    const url = this.withQuery(`/v1/projects/${id}/versions`, { page, size });
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<ProjectVersionsResponse>(resp);
  }

  /** POST /v1/projects/{id}/versions/{deploymentId}/rollback — 回滚版本 */
  async rollbackProjectVersion(id: number, deploymentId: number): Promise<RollbackProjectVersionResponse> {
    const url = `${this.serverUrl}/v1/projects/${id}/versions/${deploymentId}/rollback`;
    const resp = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...this.authHeaders() },
    }, UPLOAD_TIMEOUT_MS);
    return this.handleResponse<RollbackProjectVersionResponse>(resp);
  }

  /** GET /v1/usage — 查询用量 */
  async getUsage(): Promise<UsageResponse> {
    const url = `${this.serverUrl}/v1/usage`;
    const resp = await this.fetchWithTimeout(url, {
      headers: { ...this.authHeaders() },
    });
    return this.handleResponse<UsageResponse>(resp);
  }

  private authHeaders(): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'User-Agent': `previewship-cli/${PKG_VERSION}`,
    };
  }

  private withQuery(path: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(path, this.serverUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /** 带超时的 fetch */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Request timed out (${timeoutMs / 1000}s). Please check your network connection.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 统一处理响应 */
  private async handleResponse<T>(resp: Response): Promise<T> {
    if (resp.ok) {
      if (resp.status === 204) {
        return undefined as T;
      }
      const text = await resp.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    const text = await resp.text();
    try {
      const body = JSON.parse(text);
      if (body?.error && typeof body.error === 'object' && body.error.code) {
        throw new ApiError(resp.status, body.error.code, body.error.message, body.error.details);
      }
      throw new ApiError(resp.status, 'UNKNOWN', body.message || body.error || `Request failed: HTTP ${resp.status}`);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(resp.status, 'UNKNOWN', `Request failed: HTTP ${resp.status} - ${text.substring(0, 200)}`);
    }
  }
}

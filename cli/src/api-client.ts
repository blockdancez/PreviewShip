import type { CreateDeploymentResponse, DeploymentDetail, UsageResponse } from './types.js';
import { ApiError } from './types.js';

/** 默认请求超时 */
const REQUEST_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 60_000;

const PKG_VERSION = '1.0.0';

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
  async createDeployment(projectName: string, zipBuffer: Buffer, source = 'CLI'): Promise<CreateDeploymentResponse> {
    const url = `${this.serverUrl}/v1/deployments`;

    const formData = new FormData();
    formData.set('projectName', projectName);
    formData.set('source', source);
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
      return (await resp.json()) as T;
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

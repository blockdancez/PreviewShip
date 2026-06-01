import type { CreateDeploymentResponse, DeploymentDetail, UsageResponse, ApiErrorBody } from './types';
import { ApiError } from './types';

/** 默认请求超时：10 秒 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * PreviewShip HTTP 客户端
 * 封装后端 /v1/* 插件 API 调用
 */
export class ApiClient {
  constructor(
    private readonly _getServerUrl: () => string,
    private readonly getApiKey: () => Promise<string | undefined>,
  ) {}

  /** 获取服务器地址，自动去除末尾斜杠 */
  private getServerUrl(): string {
    return this._getServerUrl().replace(/\/+$/, '');
  }

  /** POST /v1/deployments —— 上传 zip 创建部署 */
  async createDeployment(projectName: string, zipBuffer: Buffer, source = 'EXTENSION'): Promise<CreateDeploymentResponse> {
    const url = `${this.getServerUrl()}/v1/deployments`;
    const apiKey = await this.requireApiKey();

    const formData = new FormData();
    formData.set('projectName', projectName);
    formData.set('source', source);
    formData.set('zip', new Blob([zipBuffer]), 'workspace.zip');

    // 上传超时设长一些（60 秒）
    const resp = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: formData,
    }, 60_000);

    return this.handleResponse<CreateDeploymentResponse>(resp);
  }

  /** GET /v1/deployments/{id} —— 查询部署状态 */
  async getDeployment(id: number): Promise<DeploymentDetail> {
    const url = `${this.getServerUrl()}/v1/deployments/${id}`;
    const apiKey = await this.requireApiKey();

    const resp = await this.fetchWithTimeout(url, {
      headers: { 'X-API-Key': apiKey },
    });

    return this.handleResponse<DeploymentDetail>(resp);
  }

  /** GET /v1/usage —— 查询用量 */
  async getUsage(): Promise<UsageResponse> {
    const url = `${this.getServerUrl()}/v1/usage`;
    const apiKey = await this.requireApiKey();

    const resp = await this.fetchWithTimeout(url, {
      headers: { 'X-API-Key': apiKey },
    });

    return this.handleResponse<UsageResponse>(resp);
  }

  /** 获取 API Key，不存在则抛异常 */
  private async requireApiKey(): Promise<string> {
    const key = await this.getApiKey();
    if (!key) {
      throw new ApiError(401, 'INVALID_API_KEY', 'API Key not set');
    }
    return key;
  }

  /** 带超时的 fetch */
  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Request timed out (${timeoutMs / 1000}s). Please check previewship.serverUrl and your network.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 统一处理响应：2xx 返回 JSON，否则抛 ApiError */
  private async handleResponse<T>(resp: Response): Promise<T> {
    if (resp.ok) {
      return (await resp.json()) as T;
    }

    // 尝试解析后端错误体
    const text = await resp.text();
    console.error(`[PreviewShip] HTTP ${resp.status} ${resp.url}: ${text}`);

    try {
      const body = JSON.parse(text);
      // 后端标准格式: { error: { code, message, details } }
      if (body?.error && typeof body.error === 'object' && body.error.code) {
        throw new ApiError(resp.status, body.error.code, body.error.message, body.error.details);
      }
      // Spring 默认格式: { error: "Bad Request", message: "...", status: 400 }
      throw new ApiError(resp.status, 'UNKNOWN', body.message || body.error || `Request failed: HTTP ${resp.status}`);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(resp.status, 'UNKNOWN', `Request failed: HTTP ${resp.status} - ${text.substring(0, 200)}`);
    }
  }
}

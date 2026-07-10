import * as path from 'node:path';
import * as fs from 'node:fs';
import { ApiClient } from './api-client.js';
import { getApiKey, getServerUrl } from './config.js';
import { packDirectory, packHtmlFile, packMarkdownFile, DEFAULT_EXCLUDE_PATTERNS } from './zipper.js';
import { ApiError } from './types.js';
import type {
  DeployOptions,
  DeployResult,
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

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;
/** 轮询超时（毫秒） */
const POLL_TIMEOUT_MS = 300_000;

/**
 * 创建 API 客户端实例
 * 优先从环境变量读取，其次配置文件
 */
function createClient(): ApiClient {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new ApiError(401, 'NO_API_KEY', 'API Key not configured. Run "previewship login" or set PREVIEWSHIP_API_KEY environment variable.');
  }
  return new ApiClient(getServerUrl(), apiKey);
}

/** 部署目录、单个 HTML 文件或单个 Markdown 文件（核心函数，供 CLI 和 MCP 调用） */
export async function deploy(options: DeployOptions = {}): Promise<DeployResult> {
  const client = createClient();

  if (options.visibility === 'PASSWORD' && !options.password) {
    return {
      success: false,
      error: { code: 'PASSWORD_REQUIRED', message: 'Password is required for PASSWORD access.' },
    };
  }
  if (options.password && (options.password.length < 6 || options.password.length > 100)) {
    return {
      success: false,
      error: { code: 'INVALID_PASSWORD', message: 'Password must be between 6 and 100 characters.' },
    };
  }

  // 确定部署输入
  const deployPath = path.resolve(options.path || '.');
  if (!fs.existsSync(deployPath)) {
    return {
      success: false,
      error: { code: 'INVALID_PATH', message: `Path not found: ${deployPath}` },
    };
  }

  const stat = fs.statSync(deployPath);
  const isHtmlFile = stat.isFile() && /\.html?$/i.test(deployPath);
  const isMarkdownFile = stat.isFile() && /\.(md|markdown)$/i.test(deployPath);
  if (!stat.isDirectory() && !isHtmlFile && !isMarkdownFile) {
    return {
      success: false,
      error: { code: 'INVALID_PATH', message: `Deploy path must be a directory, a .html file, or a .md file: ${deployPath}` },
    };
  }

  // 确定项目名
  const projectName = (options.projectName || path.basename(deployPath, path.extname(deployPath))).trim();
  if (!projectName) {
    return {
      success: false,
      error: { code: 'INVALID_PROJECT_NAME', message: 'Project name cannot be empty.' },
    };
  }
  if (projectName.length > 180) {
    return {
      success: false,
      error: { code: 'INVALID_PROJECT_NAME', message: 'Project name is too long. Use a shorter name, for example: my-html-preview.' },
    };
  }

  // 打包
  const { buffer: zipBuffer, fileCount } = isHtmlFile
    ? await packHtmlFile(deployPath)
    : isMarkdownFile
      ? await packMarkdownFile(deployPath)
      : await packDirectory(deployPath, [...DEFAULT_EXCLUDE_PATTERNS, ...(options.excludePatterns || [])]);

  if (zipBuffer.length === 0 || fileCount === 0) {
    return {
      success: false,
      error: { code: 'EMPTY_DIRECTORY', message: 'No deployable files found in the directory.' },
    };
  }

  // 上传
  const created = await client.createDeployment(projectName, zipBuffer, options.source || 'CLI', {
    visibility: options.visibility,
    password: options.password,
  });

  // 轮询
  const detail = await pollDeployment(client, created.deploymentId);

  if (detail.status === 'READY' && detail.previewUrl) {
    return {
      success: true,
      deploymentId: detail.deploymentId,
      projectName: detail.projectName,
      previewUrl: detail.previewUrl,
      status: detail.status,
      fileCount,
      zipSizeBytes: zipBuffer.length,
      visibility: detail.visibility || created.visibility,
    };
  }

  return {
    success: false,
    deploymentId: detail.deploymentId,
    status: detail.status,
    error: {
      code: 'DEPLOYMENT_FAILED',
      message: detail.errorMessage || 'Deployment failed.',
    },
  };
}

/**
 * 查询部署状态
 */
export async function getStatus(deploymentId: number): Promise<DeploymentDetail> {
  const client = createClient();
  return client.getDeployment(deploymentId);
}

/** 查询部署记录 */
export async function listDeployments(params: {
  page?: number;
  size?: number;
  status?: string;
  query?: string;
  days?: number;
} = {}): Promise<DeploymentListResponse> {
  const client = createClient();
  return client.listDeployments(params);
}

/** 查询项目列表 */
export async function listProjects(): Promise<ProjectsResponse> {
  const client = createClient();
  return client.listProjects();
}

/** 查询项目详情 */
export async function getProject(projectId: number): Promise<ProjectItem> {
  const client = createClient();
  return client.getProject(projectId);
}

/** 删除项目 */
export async function deleteProject(projectId: number): Promise<void> {
  const client = createClient();
  return client.deleteProject(projectId);
}

/** 使用项目 latest retained artifact 重新部署 */
export async function redeployProject(projectId: number): Promise<RedeployLatestResponse> {
  const client = createClient();
  return client.redeployProject(projectId);
}

/** 查询项目访问控制 */
export async function getProjectAccess(projectId: number): Promise<ProjectAccessResponse> {
  const client = createClient();
  return client.getProjectAccess(projectId);
}

/** 设置项目公开或密码访问；传入 PUBLIC 会清除已有密码 */
export async function updateProjectAccess(projectId: number, update: ProjectAccessUpdate): Promise<ProjectAccessResponse> {
  const client = createClient();
  return client.updateProjectAccess(projectId, update);
}

/** 查询项目版本历史 */
export async function listProjectVersions(projectId: number): Promise<ProjectVersionsResponse> {
  const client = createClient();
  return client.listProjectVersions(projectId);
}

/** 回滚项目版本 */
export async function rollbackProjectVersion(projectId: number, deploymentId: number): Promise<RollbackProjectVersionResponse> {
  const client = createClient();
  return client.rollbackProjectVersion(projectId, deploymentId);
}

/**
 * 查询用量
 */
export async function getUsage(): Promise<UsageResponse> {
  const client = createClient();
  return client.getUsage();
}

/**
 * 轮询部署状态直到 READY / FAILED / 超时
 */
async function pollDeployment(client: ApiClient, deploymentId: number): Promise<DeploymentDetail> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const detail = await client.getDeployment(deploymentId);
    if (detail.status === 'READY' || detail.status === 'FAILED') {
      return detail;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('Deployment timed out (over 5 minutes). Check the console for details.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  deploy,
  getStatus,
  getUsage,
  formatApiError,
  ApiError,
} from 'previewship';

const DEFAULT_SERVER_URL = 'https://api.previewship.com';
const MCP_VERSION = '1.0.6';

type ProjectSummary = {
  id: number;
  name: string;
  latestDeploymentId: number | null;
  latestDeploymentStatus: string | null;
  latestDeployedAt: string | null;
  deploymentCount: number;
  previewUrl: string | null;
  previewExpiresAt: string | null;
  projectStatus: string;
  projectVisibility: string;
  passwordProtected: boolean;
  urlStatus: string;
  canRedeploy: boolean;
  updatedAt: string;
};

type ProjectAccess = {
  projectId: number;
  visibility: 'PUBLIC' | 'PASSWORD' | 'PRIVATE';
  passwordProtected: boolean;
  proOnly: boolean;
};

type DeploymentListItem = {
  deploymentId: number;
  projectId: number;
  projectName: string;
  status: string;
  deploymentSource: string;
  previewUrl: string | null;
  current: boolean;
  canRollback: boolean;
  createdAt: string;
};

type ProjectVersion = {
  deploymentId: number;
  status: string;
  current: boolean;
  canRollback: boolean;
  retained: boolean;
  previewUrl: string | null;
  createdAt: string;
};

/**
 * 注册所有 MCP Tool
 */
export function registerTools(server: McpServer): void {
  // Tool 1: deploy_preview
  server.registerTool(
    'deploy_preview',
    {
      title: 'Deploy Preview',
      description:
        'Deploy a static website to PreviewShip preview environment and get a shareable preview URL. ' +
        'Works with HTML/CSS/JS websites, React/Vue/Angular build outputs (dist/build directories), ' +
        'single AI-generated .html files, Markdown documents, static site generator outputs, and more. The preview link is publicly accessible.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Directory path, single .html file, or Markdown file to deploy. Defaults to current working directory. Recommend deploying build output directories (e.g. ./dist or ./build), generated HTML files (e.g. ./report.html), or Markdown documents (e.g. ./README.md).'),
        projectName: z
          .string()
          .optional()
          .describe('Project name shown in PreviewShip. Defaults to directory name. PreviewShip automatically creates a deployment-safe hosting name.'),
        excludePatterns: z
          .array(z.string())
          .optional()
          .describe('Additional glob exclude patterns. node_modules, .git, .env etc. are excluded by default.'),
      }),
    },
    async ({ path, projectName, excludePatterns }) => {
      try {
        const result = await deploy({
          path: path || undefined,
          projectName: projectName || undefined,
          excludePatterns: excludePatterns || undefined,
          source: 'MCP',
        } as Parameters<typeof deploy>[0] & { source: 'MCP' });

        if (result.success) {
          const sizeMb = ((result.zipSizeBytes || 0) / 1024 / 1024).toFixed(1);
          return {
            content: [
              {
                type: 'text' as const,
                text: [
                  'Deployment successful!',
                  '',
                  `Preview URL: ${result.previewUrl}`,
                  `Deployment ID: ${result.deploymentId}`,
                  `Files: ${result.fileCount}`,
                  `Size: ${sizeMb} MB`,
                  '',
                  'The link is publicly accessible and can be shared with anyone.',
                ].join('\n'),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: formatDeployError(result.error),
            },
          ],
          isError: true,
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: formatError(err),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Tool 2: check_deployment
  server.registerTool(
    'check_deployment',
    {
      title: 'Check Deployment',
      description: 'Check the status of a PreviewShip deployment. Use the deployment ID returned by deploy_preview.',
      inputSchema: z.object({
        deploymentId: z.number().describe('Deployment ID returned by deploy_preview.'),
      }),
    },
    async ({ deploymentId }) => {
      try {
        const detail = await getStatus(deploymentId);
        const lines = [
          `Deployment #${detail.deploymentId} — ${detail.projectName}`,
          `Status: ${detail.status}`,
        ];
        if (detail.previewUrl) {
          lines.push(`Preview URL: ${detail.previewUrl}`);
        }
        if (detail.errorMessage) {
          lines.push(`Error: ${detail.errorMessage}`);
        }
        lines.push(`Created: ${detail.createdAt}`);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    },
  );

  // Tool 3: show_usage
  server.registerTool(
    'show_usage',
    {
      title: 'Show Usage',
      description: 'Show PreviewShip deployment quota usage including daily and monthly limits.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const usage = await getUsage();
        const d = usage.daily;
        const m = usage.monthly;
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                'PreviewShip Quota Usage:',
                '',
                `Daily deploys:   ${d.used}/${d.limit} (${d.limit - d.used} remaining)`,
                `Monthly deploys: ${m.used}/${m.limit} (${m.limit - m.used} remaining)`,
              ].join('\n'),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: formatError(err) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'list_projects',
    {
      title: 'List Projects',
      description: 'List PreviewShip projects owned by the API key user, including fixed preview URLs, access mode, current status, and redeploy availability.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const result = await apiRequest<{ projects: ProjectSummary[] }>('/v1/projects');
        return textResult(formatProjects(result.projects));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_project',
    {
      title: 'Get Project',
      description: 'Get details for one PreviewShip project, including its fixed preview URL, latest deployment pointer, and access mode.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
      }),
    },
    async ({ projectId }) => {
      try {
        const project = await apiRequest<ProjectSummary>(`/v1/projects/${projectId}`);
        return textResult(formatProject(project));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'delete_project',
    {
      title: 'Delete Project',
      description:
        'Delete a PreviewShip project and its fixed preview URL. This also removes hosted project artifacts and Showcase entries. Requires confirmProjectName to prevent accidental deletion.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
        confirmProjectName: z.string().min(1).describe('Must exactly match the project name before deletion is allowed.'),
      }),
    },
    async ({ projectId, confirmProjectName }) => {
      try {
        const project = await apiRequest<ProjectSummary>(`/v1/projects/${projectId}`);
        ensureConfirmed(project, confirmProjectName, 'delete');
        await apiRequest<void>(`/v1/projects/${projectId}`, { method: 'DELETE' });
        return textResult(`Deleted project ${project.name} (#${project.id}).`);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'redeploy_project_latest',
    {
      title: 'Redeploy Project Latest',
      description: 'Redeploy a project from its latest retained artifact without uploading files again. Useful for restoring an expired fixed preview link.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
      }),
    },
    async ({ projectId }) => {
      try {
        const result = await apiRequest<{ deploymentId: number; status: string; createdAt: string }>(
          `/v1/projects/${projectId}/redeploy-latest`,
          { method: 'POST' },
        );
        return textResult([
          'Redeploy started.',
          `Deployment ID: ${result.deploymentId}`,
          `Status: ${result.status}`,
          `Created: ${result.createdAt}`,
        ].join('\n'));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'get_project_access',
    {
      title: 'Get Project Access',
      description: 'Show whether a PreviewShip project is public or password protected.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
      }),
    },
    async ({ projectId }) => {
      try {
        const access = await apiRequest<ProjectAccess>(`/v1/projects/${projectId}/access`);
        return textResult(formatAccess(access));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'set_project_access',
    {
      title: 'Set Project Access',
      description:
        'Set a project to PUBLIC or PASSWORD access. PUBLIC clears an existing project password and makes the fixed preview URL publicly accessible again.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
        visibility: z.enum(['PUBLIC', 'PASSWORD']).describe('PUBLIC clears password protection; PASSWORD requires a password.'),
        password: z.string().min(6).max(100).optional().describe('Required when visibility is PASSWORD. Not used for PUBLIC.'),
      }),
    },
    async ({ projectId, visibility, password }) => {
      try {
        if (visibility === 'PASSWORD' && !password) {
          throw new Error('password is required when visibility is PASSWORD.');
        }
        const access = await apiRequest<ProjectAccess>(`/v1/projects/${projectId}/access`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(visibility === 'PUBLIC' ? { visibility: 'PUBLIC' } : { visibility: 'PASSWORD', password }),
        });
        return textResult(formatAccess(access));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_project_versions',
    {
      title: 'List Project Versions',
      description: 'List retained project deployments that may be used for rollback. Free accounts see fewer retained versions; Pro accounts see more.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
      }),
    },
    async ({ projectId }) => {
      try {
        const result = await apiRequest<{ projectId: number; latestDeploymentId: number | null; limit: number; versions: ProjectVersion[] }>(
          `/v1/projects/${projectId}/versions`,
        );
        return textResult(formatVersions(result.versions, result.limit));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'rollback_project_version',
    {
      title: 'Rollback Project Version',
      description:
        'Roll back a fixed PreviewShip project URL to a retained historical deployment. Requires confirmProjectName to prevent accidental changes.',
      inputSchema: z.object({
        projectId: z.number().int().positive().describe('PreviewShip project ID.'),
        deploymentId: z.number().int().positive().describe('Historical deployment ID to roll back to.'),
        confirmProjectName: z.string().min(1).describe('Must exactly match the project name before rollback is allowed.'),
      }),
    },
    async ({ projectId, deploymentId, confirmProjectName }) => {
      try {
        const project = await apiRequest<ProjectSummary>(`/v1/projects/${projectId}`);
        ensureConfirmed(project, confirmProjectName, 'rollback');
        const result = await apiRequest<{ rolledBack: boolean; deploymentId: number; previewUrl: string | null }>(
          `/v1/projects/${projectId}/versions/${deploymentId}/rollback`,
          { method: 'POST' },
        );
        return textResult([
          result.rolledBack ? 'Rollback completed.' : 'Deployment is already current.',
          `Deployment ID: ${result.deploymentId}`,
          result.previewUrl ? `Preview URL: ${result.previewUrl}` : null,
        ].filter(Boolean).join('\n'));
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    'list_deployments',
    {
      title: 'List Deployments',
      description: 'List PreviewShip deployment history with status, preview URL, source, current marker, and rollback availability.',
      inputSchema: z.object({
        status: z.string().optional().describe('Optional status filter, e.g. READY, FAILED, EXPIRED, SUPERSEDED, BLOCKED, or ALL.'),
        query: z.string().optional().describe('Search by project name or preview URL.'),
        days: z.number().int().positive().optional().describe('Only include deployments created in the last N days.'),
        page: z.number().int().min(0).optional().describe('Page number starting from 0.'),
        size: z.number().int().positive().max(100).optional().describe('Page size, max 100.'),
      }),
    },
    async ({ status, query, days, page, size }) => {
      try {
        const result = await apiRequest<{ content: DeploymentListItem[]; totalElements: number }>(
          withQuery('/v1/deployments', { status, q: query, days, page, size }),
        );
        return textResult(formatDeployments(result.content, result.totalElements));
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}

/** 格式化部署错误 */
function formatDeployError(error?: { code: string; message: string }): string {
  if (!error) return 'Deployment failed: Unknown error.';

  const lines = [`Deployment failed: ${error.message}`];

  if (['DAILY_QUOTA_EXCEEDED', 'MONTHLY_QUOTA_EXCEEDED', 'MONTHLY_UPLOAD_EXCEEDED', 'MAX_PROJECTS_EXCEEDED'].includes(error.code)) {
    lines.push('', 'Upgrade to Pro for more quota: https://previewship.com/billing');
  }

  if (error.code === 'NO_API_KEY') {
    lines.push('', 'Set the PREVIEWSHIP_API_KEY environment variable in your MCP server configuration.');
    lines.push('Get an API Key at: https://previewship.com');
  }

  return lines.join('\n');
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function errorResult(err: unknown) {
  return {
    content: [{ type: 'text' as const, text: formatError(err) }],
    isError: true,
  };
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiKey = process.env.PREVIEWSHIP_API_KEY;
  if (!apiKey) {
    throw new ApiError(401, 'NO_API_KEY', 'API Key not configured.');
  }

  const url = new URL(path, process.env.PREVIEWSHIP_SERVER_URL || DEFAULT_SERVER_URL);
  const resp = await fetch(url, {
    ...init,
    headers: {
      'X-API-Key': apiKey,
      'User-Agent': `previewship-mcp/${MCP_VERSION}`,
      ...(init.headers || {}),
    },
  });

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

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(path, DEFAULT_SERVER_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

function ensureConfirmed(project: ProjectSummary, confirmProjectName: string, action: string): void {
  if (confirmProjectName !== project.name) {
    throw new Error(`Confirmation mismatch. Refusing to ${action} project #${project.id}. Expected confirmProjectName: "${project.name}".`);
  }
}

function formatProjects(projects: ProjectSummary[]): string {
  if (projects.length === 0) {
    return 'No projects found.';
  }
  return projects.map(formatProject).join('\n\n');
}

function formatProject(project: ProjectSummary): string {
  return [
    `Project #${project.id} — ${project.name}`,
    `Status: ${project.urlStatus} / ${project.projectStatus}`,
    `Access: ${project.passwordProtected ? 'PASSWORD' : project.projectVisibility}`,
    `Preview URL: ${project.previewUrl || '-'}`,
    `Latest deployment: ${project.latestDeploymentId ? `#${project.latestDeploymentId}` : '-'}`,
    `Deployments: ${project.deploymentCount}`,
    `Can redeploy expired link: ${project.canRedeploy ? 'yes' : 'no'}`,
    `Updated: ${project.updatedAt}`,
  ].join('\n');
}

function formatAccess(access: ProjectAccess): string {
  return [
    `Project #${access.projectId}`,
    `Access: ${access.visibility}`,
    `Password protected: ${access.passwordProtected ? 'yes' : 'no'}`,
    access.visibility === 'PUBLIC' ? 'Existing project password is cleared when access is PUBLIC.' : null,
    access.proOnly ? 'Password access is a Pro feature.' : null,
  ].filter(Boolean).join('\n');
}

function formatVersions(versions: ProjectVersion[], limit: number): string {
  if (versions.length === 0) {
    return `No versions found. Retention limit: ${limit}`;
  }
  return [
    `Versions shown: ${versions.length}/${limit}`,
    ...versions.map(version => [
      `#${version.deploymentId} ${version.status}`,
      `  ${[
        version.current ? 'current' : null,
        version.canRollback ? 'rollbackable' : null,
        version.retained ? 'retained' : 'artifact removed',
      ].filter(Boolean).join(', ')}`,
      `  URL: ${version.previewUrl || '-'}`,
      `  Created: ${version.createdAt}`,
    ].join('\n')),
  ].join('\n');
}

function formatDeployments(deployments: DeploymentListItem[], total: number): string {
  if (deployments.length === 0) {
    return 'No deployments found.';
  }
  return [
    `Deployments: ${deployments.length}/${total}`,
    ...deployments.map(deployment => [
      `#${deployment.deploymentId} ${deployment.projectName} — ${deployment.status}`,
      `  ${[
        deployment.current ? 'current' : null,
        deployment.canRollback ? 'rollbackable' : null,
      ].filter(Boolean).join(', ') || 'history'}`,
      `  URL: ${deployment.previewUrl || '-'}`,
      `  Source: ${deployment.deploymentSource}`,
      `  Created: ${deployment.createdAt}`,
    ].join('\n')),
  ].join('\n');
}

/** 格式化通用错误 */
function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const msg = formatApiError(err);
    if (err.code === 'NO_API_KEY' || err.code === 'INVALID_API_KEY') {
      return msg + '\n\nSet the PREVIEWSHIP_API_KEY environment variable in your MCP server configuration.\nGet an API Key at: https://previewship.com';
    }
    return msg;
  }
  return err instanceof Error ? err.message : 'An unknown error occurred.';
}

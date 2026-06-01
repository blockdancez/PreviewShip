import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  deploy,
  getStatus,
  getUsage,
  formatApiError,
  ApiError,
} from 'previewship';

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
        'single AI-generated .html files, static site generator outputs, and more. The preview link is publicly accessible.',
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe('Directory path or single .html file to deploy. Defaults to current working directory. Recommend deploying build output directories (e.g. ./dist or ./build) or generated HTML files (e.g. ./report.html).'),
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

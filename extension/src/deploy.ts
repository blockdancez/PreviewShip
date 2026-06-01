import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { ApiClient } from './api-client';
import { StatusBar } from './status-bar';
import { ApiError } from './types';
import { showApiError } from './errors';
import { packHtmlFile, packWorkspace } from './zipper';

/** 常见构建产物目录，按优先级排列 */
const BUILD_OUTPUT_DIRS = ['dist', 'build', 'out', '.output'];

interface ExecuteDeployOptions {
  activeHtmlOnly?: boolean;
  targetUri?: vscode.Uri;
}

type DeployKind = 'directory' | 'html';

function isHtmlFile(filePath: string): boolean {
  return /\.html?$/i.test(filePath);
}

function getActiveHtmlDocument(): vscode.TextDocument | null {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (!activeDocument || activeDocument.isUntitled || activeDocument.uri.scheme !== 'file') {
    return null;
  }

  const activePath = activeDocument.uri.fsPath;
  if (!isHtmlFile(activePath)) {
    return null;
  }

  return activeDocument;
}

function getHtmlDocumentByPath(filePath: string): vscode.TextDocument | null {
  const normalized = path.resolve(filePath);
  return vscode.workspace.textDocuments.find((document) => (
    document.uri.scheme === 'file'
    && path.resolve(document.uri.fsPath) === normalized
    && isHtmlFile(document.uri.fsPath)
  )) ?? null;
}

function getHtmlPathFromUri(uri?: vscode.Uri): string | null {
  if (!uri || uri.scheme !== 'file') return null;
  return isHtmlFile(uri.fsPath) ? uri.fsPath : null;
}

function findRootHtmlFiles(workspacePath: string): string[] {
  try {
    return fs.readdirSync(workspacePath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isHtmlFile(entry.name))
      .map((entry) => path.join(workspacePath, entry.name));
  } catch {
    return [];
  }
}

async function ensureHtmlDocumentSaved(document: vscode.TextDocument): Promise<boolean> {
  if (!document.isDirty) return true;

  const action = await vscode.window.showWarningMessage(
    'The active HTML file has unsaved changes.',
    'Save and Deploy',
    'Deploy Saved Version',
    'Cancel',
  );
  if (action === 'Cancel' || !action) return false;
  if (action === 'Deploy Saved Version') return true;

  const saved = await document.save();
  if (!saved) {
    vscode.window.showErrorMessage('Could not save the active HTML file before deployment.');
  }
  return saved;
}

/**
 * 检测工作区中是否存在构建产物目录
 * 返回找到的目录列表
 */
function detectBuildDirs(workspacePath: string): string[] {
  return BUILD_OUTPUT_DIRS.filter((dir) => {
    const fullPath = path.join(workspacePath, dir);
    try {
      // 目录存在且包含 index.html
      return fs.statSync(fullPath).isDirectory()
        && fs.existsSync(path.join(fullPath, 'index.html'));
    } catch {
      return false;
    }
  });
}

/**
 * 检测是否为未构建的前端项目
 * 有 package.json 含 build 脚本，但没有构建产物目录
 */
function detectUnbuiltProject(workspacePath: string): { needsBuild: boolean; buildScript?: string } {
  const pkgPath = path.join(workspacePath, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const hasBuildScript = !!pkg.scripts?.build;
    if (!hasBuildScript) return { needsBuild: false };

    // 检查是否有任何构建产物目录（不要求含 index.html，只要目录存在就算构建过）
    const hasAnyOutputDir = BUILD_OUTPUT_DIRS.some((dir) => {
      try {
        return fs.statSync(path.join(workspacePath, dir)).isDirectory();
      } catch {
        return false;
      }
    });

    return { needsBuild: !hasAnyOutputDir, buildScript: pkg.scripts.build };
  } catch {
    return { needsBuild: false };
  }
}

/**
 * 检测可用的包管理器
 * 优先级：lock 文件 > 系统安装的命令
 */
function detectPackageManager(workspacePath: string): string {
  // 1. 按 lock 文件判断
  const lockFiles: [string, string][] = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];
  for (const [lockFile, manager] of lockFiles) {
    if (fs.existsSync(path.join(workspacePath, lockFile))) {
      return manager;
    }
  }

  // 2. 没有 lock 文件，检测系统上安装了哪个
  for (const cmd of ['pnpm', 'yarn', 'bun', 'npm']) {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' });
      return cmd;
    } catch {
      // 未安装，继续检测下一个
    }
  }

  return 'npm'; // 最终兜底
}

/**
 * 执行构建命令并等待完成
 */
async function runBuild(workspacePath: string): Promise<boolean> {
  const pm = detectPackageManager(workspacePath);
  const buildCmd = pm === 'npm' ? 'npm run build' : `${pm} run build`;

  return await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PreviewShip',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: `Running ${buildCmd}...` });

      try {
        // 使用 shell 执行构建命令，继承用户环境变量
        await new Promise<void>((resolve, reject) => {
          const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
          const args = process.platform === 'win32' ? ['/c', buildCmd] : ['-c', buildCmd];

          const proc = execFile(shell, args, {
            cwd: workspacePath,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            timeout: 300000, // 5 min timeout
          }, (error, stdout, stderr) => {
            if (error) {
              console.error('[PreviewShip] Build failed:', error);
              console.error('[PreviewShip] stderr:', stderr);
              reject(new Error(`Build failed: ${error.message}`));
            } else {
              console.log('[PreviewShip] Build succeeded');
              console.log('[PreviewShip] stdout:', stdout);
              resolve();
            }
          });

          // 实时输出日志到 console
          proc.stdout?.on('data', (data) => console.log('[Build]', data.toString()));
          proc.stderr?.on('data', (data) => console.error('[Build]', data.toString()));
        });

        vscode.window.showInformationMessage('Build completed');
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Build failed';
        vscode.window.showErrorMessage(msg);
        return false;
      }
    },
  );
}

/**
 * 执行部署命令的完整流程
 * 打包 → 上传 → 轮询 → 通知
 */
export async function executeDeploy(
  apiClient: ApiClient,
  statusBar: StatusBar,
  options: ExecuteDeployOptions = {},
): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspacePath = workspaceFolder?.uri.fsPath;
  const targetHtmlPath = getHtmlPathFromUri(options.targetUri);
  const activeHtmlDocument = targetHtmlPath ? getHtmlDocumentByPath(targetHtmlPath) : getActiveHtmlDocument();
  const activeHtmlPath = targetHtmlPath ?? activeHtmlDocument?.uri.fsPath ?? null;
  let deployKind: DeployKind = 'directory';
  let deployPath = workspacePath ?? '';

  if (options.activeHtmlOnly) {
    if (!activeHtmlPath) {
      const htmlFiles = workspacePath ? findRootHtmlFiles(workspacePath) : [];
      if (htmlFiles.length === 1) {
        deployKind = 'html';
        deployPath = htmlFiles[0];
      } else {
        vscode.window.showErrorMessage('Open or select a saved HTML file before running this command.');
        return;
      }
    } else {
      deployKind = 'html';
      deployPath = activeHtmlPath;
    }
  } else if (!workspacePath) {
    if (!activeHtmlPath) {
      vscode.window.showErrorMessage('Please open a workspace or a saved HTML file first.');
      return;
    }
    deployKind = 'html';
    deployPath = activeHtmlPath;
  } else if (activeHtmlPath) {
    const action = await vscode.window.showInformationMessage(
      `Deploy active HTML file "${path.basename(activeHtmlPath)}" or the workspace?`,
      'Deploy HTML File',
      'Deploy Workspace',
      'Cancel',
    );
    if (action === 'Cancel' || !action) return;
    if (action === 'Deploy HTML File') {
      deployKind = 'html';
      deployPath = activeHtmlPath;
    }
  } else {
    const htmlFiles = findRootHtmlFiles(workspacePath);
    const hasRootIndex = fs.existsSync(path.join(workspacePath, 'index.html'))
      || fs.existsSync(path.join(workspacePath, 'index.htm'));
    const buildDirs = detectBuildDirs(workspacePath);
    if (!hasRootIndex && buildDirs.length === 0 && htmlFiles.length === 1) {
      deployKind = 'html';
      deployPath = htmlFiles[0];
    }
  }

  if (deployKind === 'html' && activeHtmlDocument) {
    const saved = await ensureHtmlDocumentSaved(activeHtmlDocument);
    if (!saved) return;
  }

  if (deployKind === 'directory') {
    if (!workspacePath) {
      vscode.window.showErrorMessage('Please open a workspace first');
      return;
    }

    // 2. 检测是否为未构建的前端项目
    const { needsBuild } = detectUnbuiltProject(workspacePath);
    if (needsBuild) {
      const action = await vscode.window.showWarningMessage(
        'Frontend project not built yet (no dist/build directory found)',
        'Build Now',
        'Deploy Anyway',
        'Cancel',
      );
      if (action === 'Cancel' || !action) return;
      if (action === 'Build Now') {
        const ok = await runBuild(workspacePath);
        if (!ok) return;
      }
    }

    // 4. 检测部署目录：构建产物子目录 or 整个工作区
    const buildDirs = detectBuildDirs(workspacePath);

    if (buildDirs.length > 0) {
      // 有构建产物目录 → 优先使用（即使根目录也有 index.html）
      if (buildDirs.length === 1) {
        deployPath = path.join(workspacePath, buildDirs[0]);
        console.log(`[PreviewShip] Auto-detected build output: ${buildDirs[0]}/`);
      } else {
        // 多个候选，让用户选
        const picked = await vscode.window.showQuickPick(
          buildDirs.map((d) => ({ label: `${d}/`, description: 'Build output directory' })),
          { placeHolder: 'Multiple build directories detected. Select one to deploy.' },
        );
        if (!picked) return;
        deployPath = path.join(workspacePath, picked.label.replace('/', ''));
      }
    }
    // 如果没有构建产物目录，直接部署整个工作区
  }

  // 5. 提示输入项目名
  const defaultName = deployKind === 'html'
    ? path.basename(deployPath, path.extname(deployPath))
    : path.basename(workspacePath ?? deployPath);
  const projectName = await vscode.window.showInputBox({
    prompt: 'Enter project name',
    value: defaultName,
    placeHolder: 'e.g. my-app',
    ignoreFocusOut: true,
    validateInput: (val) => {
      if (!val.trim()) return 'Project name cannot be empty';
      if (val.trim().length > 180) return 'Project name is too long. Use a shorter name, for example: my-html-preview.';
      return null;
    },
  });
  if (!projectName) return;

  const deployDirName = deployKind === 'html'
    ? path.basename(deployPath)
    : deployPath === workspacePath ? 'root' : path.basename(deployPath) + '/';
  console.log(`[PreviewShip] Deploy path: ${deployPath}`);

  // 6. 执行部署（带进度条）
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'PreviewShip',
      cancellable: true,
    },
    async (progress, token) => {
      try {
        // 6a. 打包
        statusBar.packing();
        progress.report({ message: `Packing ${deployDirName} ...` });

        const config = vscode.workspace.getConfiguration('previewship');
        const excludePatterns = config.get<string[]>('excludePatterns', []);
        const zipBuffer = deployKind === 'html'
          ? await packHtmlFile(deployPath)
          : await packWorkspace(deployPath, excludePatterns);
        const sizeMb = (zipBuffer.length / 1024 / 1024).toFixed(1);

        if (token.isCancellationRequested) return;

        // 6b. 上传
        statusBar.uploading();
        progress.report({ message: `Uploading (${sizeMb}MB)...` });

        const created = await apiClient.createDeployment(projectName.trim(), zipBuffer);

        if (token.isCancellationRequested) return;

        // 6c. 轮询
        statusBar.building();
        progress.report({ message: 'Building...' });

        const intervalMs = config.get<number>('pollIntervalMs', 3000);
        const timeoutMs = config.get<number>('pollTimeoutMs', 300000);
        const detail = await pollDeployment(apiClient, created.deploymentId, intervalMs, timeoutMs, token, progress);

        // 7. 结果处理
        if (detail.status === 'READY' && detail.previewUrl) {
          statusBar.ready();
          await vscode.env.clipboard.writeText(detail.previewUrl);
          const action = await vscode.window.showInformationMessage(
            'Deployment successful! Preview URL copied to clipboard.',
            'Open Link',
          );
          if (action === 'Open Link') {
            vscode.env.openExternal(vscode.Uri.parse(detail.previewUrl));
          }
        } else {
          statusBar.failed();
          vscode.window.showErrorMessage(`Deployment failed: ${detail.errorMessage ?? 'Unknown error'}`);
        }
      } catch (err) {
        statusBar.failed();
        console.error('[PreviewShip] Deploy failed:', err);
        if (err instanceof ApiError) {
          showApiError(err);
        } else {
          const msg = err instanceof Error ? err.message : 'An unknown error occurred during deployment';
          vscode.window.showErrorMessage(msg);
        }
      }
    },
  );
}

/**
 * 轮询部署状态直到 READY / FAILED / 超时 / 取消
 */
async function pollDeployment(
  apiClient: ApiClient,
  deploymentId: number,
  intervalMs: number,
  timeoutMs: number,
  token: vscode.CancellationToken,
  progress: vscode.Progress<{ message: string }>,
) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    if (token.isCancellationRequested) {
      throw new Error('Deployment wait canceled');
    }

    attempt++;
    try {
      const detail = await apiClient.getDeployment(deploymentId);
      console.log(`[PreviewShip] Poll #${attempt}: deploymentId=${deploymentId}, status=${detail.status}`);

      if (detail.status === 'READY' || detail.status === 'FAILED') {
        return detail;
      }

      progress.report({
        message: detail.status === 'BUILDING' ? 'Building...' : 'Queued...',
      });
    } catch (err) {
      console.error(`[PreviewShip] Poll #${attempt} failed:`, err);
      // 轮询失败不立即退出，继续重试
      progress.report({ message: 'Checking status...' });
    }

    // 等待间隔，支持取消
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, intervalMs);
      const disposable = token.onCancellationRequested(() => {
        clearTimeout(timer);
        disposable.dispose();
        resolve();
      });
    });
  }

  throw new Error('Deployment timed out (over 5 minutes). Please check the console for details.');
}

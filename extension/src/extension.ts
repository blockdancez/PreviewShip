import * as vscode from 'vscode';
import { ApiClient } from './api-client';
import { StatusBar } from './status-bar';
import { ApiError } from './types';
import { showApiError } from './errors';
import { executeDeploy } from './deploy';

/** 通用错误处理：所有命令共用 */
function handleError(err: unknown): void {
  console.error('[PreviewShip]', err);
  if (err instanceof ApiError) {
    showApiError(err);
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    // 网络相关错误关键词判断（instanceof 在 esbuild 打包后可能不可靠）
    if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || msg.includes('network') || msg.includes('abort')) {
      vscode.window.showErrorMessage(`Network connection failed: ${msg}. Please check previewship.serverUrl and your network.`);
    } else {
      vscode.window.showErrorMessage(`Operation failed: ${msg}`);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('[PreviewShip] Extension activated');

  const statusBar = new StatusBar();
  context.subscriptions.push(statusBar);

  // API Key 存取
  const getApiKey = () => Promise.resolve(context.secrets.get('previewship.apiKey'));
  const setApiKey = (key: string) => Promise.resolve(context.secrets.store('previewship.apiKey', key));

  // 首次安装欢迎引导
  const isFirstTime = !context.globalState.get<boolean>('previewship.welcomed');
  if (isFirstTime) {
    context.globalState.update('previewship.welcomed', true);
    getApiKey().then((key) => {
      if (key) return; // 已有 Key，无需引导
      vscode.window
        .showInformationMessage(
          'Welcome to PreviewShip! Set up your API Key to start deploying.',
          'Get Free API Key',
          'I Have a Key',
        )
        .then((action) => {
          if (action === 'Get Free API Key') {
            vscode.env.openExternal(vscode.Uri.parse('https://previewship.com/register'));
          } else if (action === 'I Have a Key') {
            vscode.commands.executeCommand('previewship.setApiKey');
          }
        });
    });
  }

  // 配置读取
  const getServerUrl = () =>
    vscode.workspace.getConfiguration('previewship').get<string>('serverUrl', 'https://api.previewship.com');

  const apiClient = new ApiClient(getServerUrl, getApiKey);

  const ensureApiKey = async (): Promise<boolean> => {
    const key = await getApiKey();
    if (key) return true;

    const action = await vscode.window.showWarningMessage(
      'Please set your API Key first',
      'Set API Key',
    );
    if (action === 'Set API Key') {
      vscode.commands.executeCommand('previewship.setApiKey');
    }
    return false;
  };

  // Command 1: Set API Key
  context.subscriptions.push(
    vscode.commands.registerCommand('previewship.setApiKey', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your PreviewShip API Key',
        placeHolder: 'ps_live_...',
        password: true,
        ignoreFocusOut: true,
        validateInput: (val) => {
          if (!val.startsWith('ps_live_')) return 'API Key should start with ps_live_';
          if (val.length < 20) return 'Invalid API Key format';
          return null;
        },
      });
      if (key) {
        await setApiKey(key);
        vscode.window.showInformationMessage('API Key saved');
      }
    }),
  );

  // Command 2: Deploy current workspace
  context.subscriptions.push(
    vscode.commands.registerCommand('previewship.deploy', async (uri?: vscode.Uri) => {
      if (!await ensureApiKey()) return;
      await executeDeploy(apiClient, statusBar, { targetUri: uri });
    }),
  );

  // Command 3: Deploy active HTML file
  context.subscriptions.push(
    vscode.commands.registerCommand('previewship.deployActiveHtml', async (uri?: vscode.Uri) => {
      if (!await ensureApiKey()) return;
      await executeDeploy(apiClient, statusBar, { activeHtmlOnly: true, targetUri: uri });
    }),
  );

  // Command 4: Show usage
  context.subscriptions.push(
    vscode.commands.registerCommand('previewship.showUsage', async () => {
      if (!await ensureApiKey()) return;
      try {
        const serverUrl = getServerUrl();
        console.log(`[PreviewShip] Fetching usage: ${serverUrl}/v1/usage`);
        const usage = await apiClient.getUsage();
        vscode.window.showInformationMessage(
          `Today: ${usage.daily.used}/${usage.daily.limit} | This month: ${usage.monthly.used}/${usage.monthly.limit}`,
        );
      } catch (err) {
        handleError(err);
      }
    }),
  );

  // 初始化状态栏
  statusBar.idle();
}

export function deactivate() {}

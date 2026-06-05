import * as path from 'node:path';
import * as readline from 'node:readline';
import { deploy, getStatus, getUsage } from './deployer.js';
import { saveConfig, loadConfig, getApiKey, getConfigPath } from './config.js';
import { ApiError } from './types.js';
import { formatApiError, formatErrorJson } from './errors.js';

// 退出码
const EXIT_SUCCESS = 0;
const EXIT_BUSINESS_ERROR = 1;
const EXIT_CONFIG_ERROR = 2;
const EXIT_NETWORK_ERROR = 3;

/** 是否 JSON 输出模式 */
function isJsonMode(args: string[]): boolean {
  return args.includes('--json') || !!process.env.CI;
}

/** 是否无色输出 */
const NO_COLOR = !!process.env.NO_COLOR;

/** 简单终端彩色工具 */
const c = {
  green: (s: string) => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
};

/** 交互式读取单行输入 */
function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (hidden) {
      // 密码模式：隐藏输入
      process.stdout.write(question);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(true);

      let input = '';
      const onData = (ch: Buffer) => {
        const char = ch.toString();
        if (char === '\n' || char === '\r') {
          if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          rl.close();
          resolve(input);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit(130);
        } else if (char === '\u007f' || char === '\b') {
          // Backspace
          input = input.slice(0, -1);
        } else {
          input += char;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

// ========== 命令实现 ==========

/** login 命令 */
async function cmdLogin(args: string[]): Promise<number> {
  const json = isJsonMode(args);
  let key = getArgValue(args, '--key') || getArgValue(args, '-k');

  if (!key) {
    // 交互模式
    if (!process.stdin.isTTY) {
      if (json) {
        console.log(JSON.stringify({ success: false, error: { code: 'NO_TTY', message: 'No TTY available. Use --key flag.' } }));
      } else {
        console.error(c.red('No TTY available. Use: previewship login --key <your-api-key>'));
      }
      return EXIT_CONFIG_ERROR;
    }
    key = await prompt('Enter API Key (ps_live_...): ', true);
  }

  key = key.trim();

  // 校验格式
  if (!key.startsWith('ps_live_') || key.length < 20) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: { code: 'INVALID_KEY_FORMAT', message: 'API Key must start with "ps_live_" and be at least 20 characters.' } }));
    } else {
      console.error(c.red('Invalid API Key format. It should start with "ps_live_" and be at least 20 characters.'));
    }
    return EXIT_CONFIG_ERROR;
  }

  const config = loadConfig();
  config.apiKey = key;
  saveConfig(config);

  if (json) {
    console.log(JSON.stringify({ success: true, configPath: getConfigPath() }));
  } else {
    console.log(c.green('✓') + ` API Key saved to ${getConfigPath()}`);
  }
  return EXIT_SUCCESS;
}

/** deploy 命令 */
async function cmdDeploy(args: string[]): Promise<number> {
  const json = isJsonMode(args);

  // 解析参数
  const deployPath = getPositionalArg(args) || '.';
  const projectName = getArgValue(args, '--name') || getArgValue(args, '-n');
  const extraExcludes = getAllArgValues(args, '--exclude');

  try {
    if (!json) {
      console.log(c.dim('Packing files...'));
    }

    const result = await deploy({
      path: deployPath,
      projectName: projectName || undefined,
      excludePatterns: extraExcludes.length > 0 ? extraExcludes : undefined,
    });

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      const sizeMb = ((result.zipSizeBytes || 0) / 1024 / 1024).toFixed(1);
      console.log(c.green('✓') + ` Packed ${result.fileCount} files (${sizeMb} MB)`);
      console.log(c.green('✓') + ' Deployment successful!');
      console.log('');
      console.log(c.bold('Preview URL: ') + c.cyan(result.previewUrl!));

      // 尝试复制到剪贴板
      if (!args.includes('--no-clipboard')) {
        try {
          await copyToClipboard(result.previewUrl!);
          console.log(c.dim('(Copied to clipboard)'));
        } catch {
          // 复制失败不阻断流程
        }
      }
    } else {
      console.error(c.red('✗') + ` Deployment failed: ${result.error?.message}`);
      if (result.error?.code && ['DAILY_QUOTA_EXCEEDED', 'MONTHLY_QUOTA_EXCEEDED', 'MONTHLY_UPLOAD_EXCEEDED', 'MAX_PROJECTS_EXCEEDED'].includes(result.error.code)) {
        console.error(c.yellow('  Upgrade to Pro: https://previewship.com/billing'));
      }
    }

    return result.success ? EXIT_SUCCESS : EXIT_BUSINESS_ERROR;
  } catch (err) {
    if (json) {
      console.log(JSON.stringify(formatErrorJson(err), null, 2));
    } else if (err instanceof ApiError) {
      console.error(c.red('✗') + ' ' + formatApiError(err));
    } else {
      const msg = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error(c.red('✗') + ' ' + msg);
    }
    return isNetworkError(err) ? EXIT_NETWORK_ERROR : EXIT_BUSINESS_ERROR;
  }
}

/** status 命令 */
async function cmdStatus(args: string[]): Promise<number> {
  const json = isJsonMode(args);
  const idStr = getPositionalArg(args);

  if (!idStr || isNaN(Number(idStr))) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: { code: 'MISSING_ID', message: 'Usage: previewship status <deployment-id>' } }));
    } else {
      console.error(c.red('Usage: previewship status <deployment-id>'));
    }
    return EXIT_CONFIG_ERROR;
  }

  try {
    const detail = await getStatus(Number(idStr));
    if (json) {
      console.log(JSON.stringify({ success: true, ...detail }, null, 2));
    } else {
      console.log(`Deployment #${detail.deploymentId} — ${detail.projectName}`);
      console.log(`Status: ${formatStatus(detail.status)}`);
      if (detail.previewUrl) {
        console.log(`Preview URL: ${c.cyan(detail.previewUrl)}`);
      }
      if (detail.errorMessage) {
        console.log(`Error: ${c.red(detail.errorMessage)}`);
      }
      console.log(`Created: ${detail.createdAt}`);
    }
    return EXIT_SUCCESS;
  } catch (err) {
    if (json) {
      console.log(JSON.stringify(formatErrorJson(err), null, 2));
    } else if (err instanceof ApiError) {
      console.error(c.red('✗') + ' ' + formatApiError(err));
    } else {
      console.error(c.red('✗') + ' ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    return isNetworkError(err) ? EXIT_NETWORK_ERROR : EXIT_BUSINESS_ERROR;
  }
}

/** usage 命令 */
async function cmdUsage(args: string[]): Promise<number> {
  const json = isJsonMode(args);

  try {
    const usage = await getUsage();
    if (json) {
      console.log(JSON.stringify({ success: true, ...usage }, null, 2));
    } else {
      const d = usage.daily;
      const m = usage.monthly;
      console.log(`Daily deploys:   ${d.used}/${d.limit} (${d.limit - d.used} remaining)`);
      console.log(`Monthly deploys: ${m.used}/${m.limit} (${m.limit - m.used} remaining)`);
    }
    return EXIT_SUCCESS;
  } catch (err) {
    if (json) {
      console.log(JSON.stringify(formatErrorJson(err), null, 2));
    } else if (err instanceof ApiError) {
      console.error(c.red('✗') + ' ' + formatApiError(err));
    } else {
      console.error(c.red('✗') + ' ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
    return isNetworkError(err) ? EXIT_NETWORK_ERROR : EXIT_BUSINESS_ERROR;
  }
}

/** whoami 命令 */
function cmdWhoami(): number {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('Not logged in. Run "previewship login" to set your API Key.');
    return EXIT_SUCCESS;
  }
  const { serverUrl } = loadConfig();
  console.log(`API Key:     ${apiKey.substring(0, 12)}...`);
  console.log(`Server:      ${serverUrl || 'https://api.previewship.com (default)'}`);
  console.log(`Config file: ${getConfigPath()}`);
  return EXIT_SUCCESS;
}

// ========== 帮助文本 ==========

const HELP_TEXT = `
${c.bold('PreviewShip')} — One-click deploy previews, instant shareable links.

${c.bold('Usage:')}
  previewship <command> [options]

${c.bold('Commands:')}
  login              Set your API Key
  deploy [path]      Deploy a directory, single HTML file, or Markdown file to preview
  status <id>        Check deployment status
  usage              Show quota usage
  whoami             Show current configuration

${c.bold('Deploy options:')}
  -n, --name <name>  Project name (default: directory name)
  --exclude <glob>   Additional exclude patterns (repeatable)
  --json             Output as JSON
  --no-clipboard     Don't copy URL to clipboard

${c.bold('Global options:')}
  --json             JSON output (auto-enabled in CI)
  --help, -h         Show help
  --version, -v      Show version

${c.bold('Environment variables:')}
  PREVIEWSHIP_API_KEY     API Key (overrides config file)
  PREVIEWSHIP_SERVER_URL  Server URL (overrides config file)

${c.bold('Get started:')}
  1. Get an API Key at ${c.cyan('https://previewship.com')}
  2. previewship login
  3. previewship deploy ./dist
     or previewship deploy ./report.html
     or previewship deploy ./README.md

${c.bold('Documentation:')} ${c.cyan('https://previewship.com/docs')}
`.trim();

// ========== 工具函数 ==========

/** 从参数中获取 --flag value 形式的值 */
function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

/** 获取所有 --flag value 形式的值 */
function getAllArgValues(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[i + 1]);
      i++; // 跳过值
    }
  }
  return values;
}

/** 获取第一个非 flag 参数 */
function getPositionalArg(args: string[]): string | undefined {
  const skipNext = new Set(['--name', '-n', '--exclude', '--key', '-k', '--server']);
  for (let i = 0; i < args.length; i++) {
    if (skipNext.has(args[i])) {
      i++; // 跳过带值的 flag
      continue;
    }
    if (!args[i].startsWith('-')) {
      return args[i];
    }
  }
  return undefined;
}

/** 格式化状态显示 */
function formatStatus(status: string): string {
  switch (status) {
    case 'READY': return c.green('READY');
    case 'FAILED': return c.red('FAILED');
    case 'BUILDING': return c.yellow('BUILDING');
    case 'QUEUED': return c.dim('QUEUED');
    default: return status;
  }
}

/** 判断是否为网络错误 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && (err as Error).message?.includes('fetch')) return true;
  if (err instanceof Error && err.message.includes('timed out')) return true;
  return false;
}

/** 复制文本到剪贴板 */
async function copyToClipboard(text: string): Promise<void> {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const proc = process.platform === 'darwin'
      ? execFile('pbcopy', [], (err) => err ? reject(err) : resolve())
      : process.platform === 'win32'
        ? execFile('clip', [], (err) => err ? reject(err) : resolve())
        : execFile('xclip', ['-selection', 'clipboard'], (err) => err ? reject(err) : resolve());
    proc.stdin?.write(text);
    proc.stdin?.end();
  });
}

// ========== 主入口 ==========

async function main() {
  const rawArgs = process.argv.slice(2);
  const command = rawArgs[0];
  const args = rawArgs.slice(1);

  // 版本号
  if (!command || command === '--version' || command === '-v') {
    if (!command) {
      console.log(HELP_TEXT);
      process.exit(EXIT_SUCCESS);
    }
    console.log('1.0.0');
    process.exit(EXIT_SUCCESS);
  }

  // 帮助
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(HELP_TEXT);
    process.exit(EXIT_SUCCESS);
  }

  let exitCode: number;

  switch (command) {
    case 'login':
      exitCode = await cmdLogin(args);
      break;
    case 'deploy':
      exitCode = await cmdDeploy(args);
      break;
    case 'status':
      exitCode = await cmdStatus(args);
      break;
    case 'usage':
      exitCode = await cmdUsage(args);
      break;
    case 'whoami':
      exitCode = cmdWhoami();
      break;
    default:
      console.error(c.red(`Unknown command: ${command}`));
      console.error('Run "previewship --help" for usage.');
      exitCode = EXIT_CONFIG_ERROR;
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(EXIT_BUSINESS_ERROR);
});

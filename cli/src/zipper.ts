import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import * as fs from 'node:fs';

const BUILD_OUTPUT_CONFIG_PATH = '.vercel/output/config.json';
const STATIC_HTML_INDEX_PATH = '.vercel/output/static/index.html';
const STATIC_MARKDOWN_INDEX_PATH = '.vercel/output/static/index.md';
const STATIC_PDF_PATH = '.vercel/output/static/document.pdf';
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');

/** 默认排除模式（与 VS Code 插件保持一致） */
export const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.*',
  '*.log',
  '.vscode/**',
  '.idea/**',
  '__pycache__/**',
  '*.pyc',
  '.next/**',
  '.nuxt/**',
  'coverage/**',
  '.cache/**',
];

/**
 * 将目录打包为 zip Buffer
 * @param dirPath 目录路径
 * @param excludePatterns 排除的 glob 模式列表
 * @returns zip 文件内容 Buffer 和文件数量
 */
export function packDirectory(dirPath: string, excludePatterns: string[]): Promise<{ buffer: Buffer; fileCount: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => {
      resolve({
        buffer: Buffer.concat(chunks),
        fileCount: archive.pointer() > 0 ? entryCount : 0,
      });
    });

    let entryCount = 0;
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('entry', () => entryCount++);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(passthrough);
    archive.glob('**/*', {
      cwd: dirPath,
      ignore: excludePatterns,
      dot: false,
    });
    archive.finalize();
  });
}

/**
 * 将单个 HTML 文件打包为 Vercel Build Output API 静态站点。
 * 这样 AI 生成的单文件 HTML 可以直接部署，无需用户手动创建目录。
 */
export function packHtmlFile(filePath: string): Promise<{ buffer: Buffer; fileCount: number }> {
  return packSingleFile(filePath, STATIC_HTML_INDEX_PATH);
}

/**
 * 将单个 Markdown 文件打包为 Vercel Build Output API 静态站点。
 * 后端会将 index.md 渲染为 index.html。
 */
export function packMarkdownFile(filePath: string): Promise<{ buffer: Buffer; fileCount: number }> {
  return packSingleFile(filePath, STATIC_MARKDOWN_INDEX_PATH);
}

/** 将单个 PDF 文件打包为由后端生成全屏入口的静态站点。 */
export function packPdfFile(filePath: string): Promise<{ buffer: Buffer; fileCount: number }> {
  return packSingleFile(filePath, STATIC_PDF_PATH);
}

/** 校验浏览器可识别的 PDF 文件签名，允许签名前存在少量兼容字节。 */
export function hasPdfSignature(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    return header.subarray(0, bytesRead).indexOf(PDF_SIGNATURE) >= 0;
  } finally {
    fs.closeSync(fd);
  }
}

function packSingleFile(filePath: string, staticPath: string): Promise<{ buffer: Buffer; fileCount: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => {
      resolve({
        buffer: Buffer.concat(chunks),
        fileCount: 1,
      });
    });

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(passthrough);
    archive.append(JSON.stringify({ version: 3 }), { name: BUILD_OUTPUT_CONFIG_PATH });
    archive.append(fs.createReadStream(filePath), { name: staticPath });
    archive.finalize();
  });
}

import archiver from 'archiver';
import * as fs from 'node:fs';
import { PassThrough } from 'node:stream';

const BUILD_OUTPUT_CONFIG_PATH = '.vercel/output/config.json';
const STATIC_INDEX_PATH = '.vercel/output/static/index.html';

/**
 * 将工作区目录打包为 zip Buffer
 * @param workspacePath 工作区根目录
 * @param excludePatterns 排除的 glob 模式列表
 * @returns zip 文件内容的 Buffer
 */
export function packWorkspace(workspacePath: string, excludePatterns: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(passthrough);
    archive.glob('**/*', {
      cwd: workspacePath,
      ignore: excludePatterns,
      dot: false,
    });
    archive.finalize();
  });
}

/**
 * 将单个 HTML 文件打包为可部署站点
 * 使用 Vercel Build Output API 静态输出格式，访问时仍映射为站点根目录 index.html。
 * @param filePath HTML 文件路径
 * @returns zip 文件内容的 Buffer
 */
export function packHtmlFile(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const passthrough = new PassThrough();
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code !== 'ENOENT') reject(err);
    });

    archive.pipe(passthrough);
    archive.append(JSON.stringify({ version: 3 }), { name: BUILD_OUTPUT_CONFIG_PATH });
    archive.append(fs.createReadStream(filePath), {
      name: STATIC_INDEX_PATH,
      stats: fs.statSync(filePath),
    });
    archive.finalize();
  });
}

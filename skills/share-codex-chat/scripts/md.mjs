// 用 Codex 同款 marked.esm.js 渲染 markdown，保证与 Codex 聊天的 markdown 解析一致。
// 输入(stdin): {"items":["<markdown>", ...]}
// 输出(stdout): {"html":["<html>", ...]}
// 额外：技能/提及 chip、外链 target、基础 XSS sanitize（无第三方依赖）。
import * as M from './marked.esm.js';

const marked = M.n;
const parse = (md) => (typeof marked.parse === 'function' ? marked.parse(md) : marked(md));

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 基础 XSS 清洗：移除脚本/样式/iframe、事件属性、javascript: 协议。
function sanitize(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*"(\s*javascript:[^"]*)"/gi, '$1="#"')
    .replace(/(href|src)\s*=\s*'(\s*javascript:[^']*)'/gi, "$1='#'");
}

const SKILL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 18 6.8v6.6L12 16.7 6 13.4V6.8L12 3.5Z"></path><path d="M6.5 7 12 10.1 17.5 7"></path><path d="M12 10.1v6.1"></path></svg>';

function titleCaseKebab(s) {
  const cleaned = s.trim().replace(/^[@$]+/, '');
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(cleaned)) {
    return cleaned.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  return cleaned;
}

function skillChip(label) {
  return `<span class="skill-link">${SKILL_SVG}${escapeHtml(titleCaseKebab(label))}</span>`;
}

function mentionChip(label, target, kind) {
  const name = titleCaseKebab(label) || (target.split('/').pop() || 'Mention').split('@')[0];
  let icon;
  if (name === 'Chrome') icon = '<span class="chrome-dot" aria-hidden="true"></span>';
  else icon = `<span class="mention-icon" aria-hidden="true">${kind === 'plugin' ? '◎' : '◇'}</span>`;
  return `<span class="mention-chip mention-${kind}" title="${escapeHtml(target)}">${icon}${escapeHtml(name)}</span>`;
}

// 把 marked 生成的特殊链接转换成 Codex 风格的 chip / 外链。
function postLinks(html) {
  // 技能：/.../SKILL.md
  html = html.replace(/<a href="(\/[^"]*SKILL\.md)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, _h, label) => skillChip(label));
  // 提及：plugin:// 或 app://
  html = html.replace(/<a href="(plugin:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, h, label) => mentionChip(label, h, 'plugin'));
  html = html.replace(/<a href="(app:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, h, label) => mentionChip(label, h, 'app'));
  // 其它本地绝对路径链接 → 不可点
  html = html.replace(/<a href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, _h, label) => `<a href="#">${label}</a>`);
  // 外链 → 新标签打开
  html = html.replace(/<a href="(https?:\/\/[^"]*)">/gi, '<a href="$1" target="_blank" rel="noreferrer">');
  // 表格包一层横向滚动容器
  html = html.replace(/<table>/gi, '<div class="table-wrap"><table>').replace(/<\/table>/gi, '</table></div>');
  return html;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let items;
  try {
    items = JSON.parse(input).items || [];
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String(e) }));
    return;
  }
  const html = items.map((md) => {
    try {
      return postLinks(sanitize(parse(md == null ? '' : String(md)))).trim();
    } catch (e) {
      return '<p>' + escapeHtml(String(md)) + '</p>';
    }
  });
  process.stdout.write(JSON.stringify({ html }));
});

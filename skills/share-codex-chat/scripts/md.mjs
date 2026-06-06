// 用 Codex 同款 marked.esm.js 解析 markdown，并把输出标记成 Codex 桌面端那套带 class 的 DOM，
// 配合就地内联的 codex-styles.css 即可达到与 Codex 一致的渲染（本地自用）。
// 输入(stdin): {"items":["<markdown>", ...]}
// 输出(stdout): {"html":["<html>", ...]}
import * as M from './marked.esm.js';

const marked = M.n;
const parse = (md) => (typeof marked.parse === 'function' ? marked.parse(md) : marked(md));

// —— Codex 各 markdown 元素的 class（实测自 Codex 桌面端真实 DOM；与同目录 codex-styles.css 配套）——
const C = {
  p: 'text-size-chat leading-[calc(var(--codex-chat-font-size)+8px)] extension:leading-normal my-2',
  h1: 'heading-lg mt-5 mb-2',
  h2: 'heading-base mt-4 mb-2',
  h3: 'heading-subsection mt-3 mb-1.5',
  ul: 'list-disc pl-4 mt-0 mb-4',
  ol: 'list-decimal pl-4 mt-0 mb-4',
  li: 'mb-1.5',
  blockquote: 'my-3 border-l-2 border-token-border pl-4 italic',
  hr: 'my-4 border-t border-token-border',
  strong: 'font-semibold',
  em: 'italic',
  table: 'w-full',
  tableWrap: 'my-4 overflow-x-auto overflow-y-hidden',
  thead: 'border-b border-token-border',
  tr: 'border-b border-token-border last:border-b-0',
  th: 'max-w-48 min-w-16 p-1 text-left align-top font-semibold whitespace-normal text-token-foreground',
  td: 'max-w-48 min-w-16 p-1 align-top whitespace-normal',
  inlineCode: '_inlineMarkdown_x0d1c_75 inline-markdown text-size-chat-sm font-mono blend bg-token-text-code-block-background rounded-sm px-1.5 py-0.5 leading-none extension:bg-token-foreground/10 electron:bg-token-list-hover-background/60',
  codeWrap: 'text-size-chat my-4 overflow-hidden rounded-lg border border-token-input-background bg-token-text-code-block-background/10',
  codeHead: 'flex items-center px-3 pt-2 pb-1 font-sans text-sm text-token-description-foreground select-none',
  codeBody: 'overflow-auto px-4 pt-2 pb-4 whitespace-pre font-mono text-size-chat-sm',
  link: 'text-[color:var(--color-token-text-link-foreground)] hover:underline',
};

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

// 把 marked 的默认输出改写成带 Codex class 的 DOM。
function applyCodexClasses(html) {
  const blocks = [];
  // 1) 先抽出代码块 <pre><code ...>...</code></pre>，替换为占位，避免后续规则误伤
  html = html.replace(/<pre><code(?:\s+class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/gi, (_m, lang, body) => {
    const idx = blocks.length;
    const header = lang ? `<div class="${C.codeHead}">${escapeHtml(lang)}</div>` : '';
    blocks.push(`<div class="${C.codeWrap}">${header}<pre class="${C.codeBody}"><code>${body}</code></pre></div>`);
    return `@@CODEBLOCK_${idx}@@`;
  });
  // 2) 行内 code（此时已无代码块干扰）
  html = html.replace(/<code>([\s\S]*?)<\/code>/gi, (_m, body) => `<span class="${C.inlineCode}">${body}</span>`);
  // 3) 块级元素加 class
  html = html
    .replace(/<p>/gi, `<p class="${C.p}">`)
    .replace(/<h1>/gi, `<h1 class="${C.h1}">`)
    .replace(/<h2>/gi, `<h2 class="${C.h2}">`)
    .replace(/<h([3-6])>/gi, `<h$1 class="${C.h3}">`)
    .replace(/<ul>/gi, `<ul class="${C.ul}">`)
    .replace(/<ol>/gi, `<ol class="${C.ol}">`)
    .replace(/<li>/gi, `<li class="${C.li}">`)
    .replace(/<blockquote>\s*/gi, `<blockquote class="${C.blockquote}">`)
    .replace(/<hr\s*\/?>/gi, `<hr class="${C.hr}">`)
    .replace(/<strong>/gi, `<strong class="${C.strong}">`)
    .replace(/<em>/gi, `<em class="${C.em}">`)
    .replace(/<thead>/gi, `<thead class="${C.thead}">`)
    .replace(/<tr>/gi, `<tr class="${C.tr}">`)
    .replace(/<th>/gi, `<th class="${C.th}">`)
    .replace(/<td>/gi, `<td class="${C.td}">`)
    .replace(/<table>/gi, `<div class="${C.tableWrap}"><table class="${C.table}">`)
    .replace(/<\/table>/gi, `</table></div>`);
  // 4) 恢复代码块
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_m, i) => blocks[Number(i)] || '');
  return html;
}

// —— Codex inline-mention:brand-aware 颜色由 codex-styles.css 经 class 自动给;图标用 currentColor 继承该色 ——
// 与 Codex 一致的类链(脱离原环境时,codex-styles.css 里这条 class 仍解析出 color-mix(link 80%, fg 20%))
const MENTION_CLS = 'inline-mention-brand-aware font-medium text-[color:var(--inline-mention-color)] [--inline-mention-color:var(--inline-mention-resolved-base-color,var(--inline-mention-base-color))] [--inline-mention-base-color:color-mix(in_srgb,var(--color-token-text-link-foreground)_80%,var(--color-token-foreground)_20%)] group-hover/inline-mention:underline group-hover/inline-mention:decoration-dashed group-hover/inline-mention:underline-offset-2';
const MENTION_ICONS = {
  // 立方体(skill) / 文档(file) / 连接(app·plugin) —— 自绘干净图标,fill/stroke=currentColor
  skill: '<svg viewBox="0 0 16 16" fill="none" class="icon-xs absolute top-1/2 -translate-y-1/2"><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path><path d="M2.6 5 8 8.1 13.4 5M8 8.1v6" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path></svg>',
  file: '<svg viewBox="0 0 16 16" fill="none" class="icon-xs absolute top-1/2 -translate-y-1/2"><path d="M8.4 1.9H4.3a.8.8 0 0 0-.8.8v10.6a.8.8 0 0 0 .8.8h7.4a.8.8 0 0 0 .8-.8V5.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path><path d="M8.3 2v3.9h4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path></svg>',
  app: '<svg viewBox="0 0 16 16" fill="none" class="icon-xs absolute top-1/2 -translate-y-1/2"><path d="M6.4 9.6 9.6 6.4M6.6 4.6l1-1a2.7 2.7 0 0 1 3.8 3.8l-1 1M9.4 11.4l-1 1a2.7 2.7 0 0 1-3.8-3.8l1-1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"></path></svg>',
};
function titleCaseKebab(s) {
  const cleaned = s.trim().replace(/^[@$]+/, '');
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(cleaned)) return cleaned.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return cleaned;
}
function inlineMention(label, kind) {
  const icon = MENTION_ICONS[kind] || MENTION_ICONS.app;
  const text = kind === 'file' ? (label.trim() || 'file') : titleCaseKebab(label);
  return (
    '<span class="group/inline-mention">' +
    `<span class="${MENTION_CLS} px-0.5">` +
    `<span class="relative mr-[3px] inline-block h-[1lh] w-4 align-bottom">${icon}</span>` +
    `<span class="min-w-0 break-words">${escapeHtml(text)}</span>` +
    '</span></span>'
  );
}
// 把 marked 生成的链接改写成 Codex 的 inline-mention / 外链
function postLinks(html) {
  html = html.replace(/<a href="(\/[^"]*SKILL\.md)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, _h, label) => inlineMention(label, 'skill'));
  html = html.replace(/<a href="(plugin:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, _h, label) => inlineMention(label, 'app'));
  html = html.replace(/<a href="(app:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, _h, label) => inlineMention(label, 'app'));
  html = html.replace(/<a href="(\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, _h, label) => inlineMention(label, 'file'));
  html = html.replace(/<a href="(https?:\/\/[^"]*)">/gi, `<a class="${C.link}" href="$1" target="_blank" rel="noreferrer">`);
  return html;
}
export { inlineMention, MENTION_CLS };

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let items;
  try { items = JSON.parse(input).items || []; } catch (e) { process.stdout.write(JSON.stringify({ error: String(e) })); return; }
  const html = items.map((md) => {
    try { return postLinks(applyCodexClasses(sanitize(parse(md == null ? '' : String(md))))).trim(); }
    catch (e) { return `<p class="${C.p}">` + escapeHtml(String(md)) + '</p>'; }
  });
  process.stdout.write(JSON.stringify({ html }));
});

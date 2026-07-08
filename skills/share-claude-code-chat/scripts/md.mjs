import * as M from './marked.esm.js';

const marked = M.n;
const parse = (md) => (typeof marked.parse === 'function' ? marked.parse(md) : marked(md));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

function postProcess(html) {
  html = html.replace(/<a href="(https?:\/\/[^"]*)">/gi, '<a href="$1" target="_blank" rel="noreferrer">');
  html = html.replace(/<table>/gi, '<div class="table-wrap"><table>');
  html = html.replace(/<\/table>/gi, '</table></div>');
  return html;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let items = [];
  try {
    items = JSON.parse(input).items || [];
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: String(error), html: [] }));
    return;
  }

  const html = items.map((item) => {
    try {
      return postProcess(sanitize(parse(item == null ? '' : String(item)))).trim();
    } catch (_error) {
      return `<p>${escapeHtml(String(item || ''))}</p>`;
    }
  });
  process.stdout.write(JSON.stringify({ html }));
});

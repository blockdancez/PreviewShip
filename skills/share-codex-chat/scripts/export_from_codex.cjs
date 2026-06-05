#!/usr/bin/env node
'use strict';
/*
 * 在线导出：连接正在运行的 Codex 桌面端(需以 --remote-debugging-port 启动)，
 * 抓取当前/指定会话已经渲染好的真实 DOM + Codex 自己的全部 CSS，组装成 1:1 的分享页。
 * 这样导出的页面就是 Codex 本身的渲染结果，无需手写模仿。
 *
 * 用法:
 *   1) 先以调试端口重启 Codex:
 *        osascript -e 'quit app "Codex"'; open -a Codex --args --remote-debugging-port=9222
 *   2) node export_from_codex.cjs --match "会话标题关键词" --out /path/out.html
 *      (省略 --match 则导出当前打开的会话)
 *
 * 依赖: 仅 Node >=22 (原生 WebSocket + fetch)。
 */
const fs = require('fs');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }
const PORT = arg('port', '9222');
const MATCH = arg('match', null);
const OUT = arg('out', '/tmp/codex-export.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connectMain() {
  const targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json());
  const main = targets.find((t) => t.type === 'page' && t.url === 'app://-/index.html')
            || targets.find((t) => t.type === 'page' && t.title === 'Codex');
  if (!main) throw new Error('找不到 Codex 主窗口；确认 Codex 以 --remote-debugging-port=' + PORT + ' 启动');
  const ws = new WebSocket(main.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = {};
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const res = r.result || {};
    if (res.exceptionDetails) throw new Error('页面执行出错: ' + JSON.stringify(res.exceptionDetails.exception || res.exceptionDetails.text));
    return res.result && res.result.value;
  };
  return { evaluate, close: () => ws.close() };
}

(async () => {
  const c = await connectMain();

  if (MATCH) {
    const r = await c.evaluate(
      `(()=>{const r=[...document.querySelectorAll('[role=button]')].find(e=>(e.textContent||'').includes(${JSON.stringify(MATCH)}));if(r){r.click();return 'clicked';}return 'NF';})()`
    );
    console.error('切换会话(' + MATCH + '): ' + r);
    if (r === 'NF') console.error('  未在侧边栏找到该会话，导出当前打开的会话');
    await sleep(4000);
  }

  // 抓消息列表(真实 DOM) + 内联图片 + dump 变量
  const data = await c.evaluate(`(async()=>{
    const blocks=[...document.querySelectorAll('.text-size-chat')];
    if(!blocks.length) return JSON.stringify({err:'当前会话没有可见消息'});
    let turn=blocks[0];
    for(let i=0;i<10&&turn.parentElement;i++){const cls=(typeof turn.className==='string'?turn.className:'');if(/relative shrink-0/.test(cls))break;turn=turn.parentElement;}
    const list=turn.parentElement.cloneNode(true);
    // 移除可能混入的输入框
    list.querySelectorAll('textarea,[contenteditable=true]').forEach(e=>{let p=e;for(let i=0;i<6&&p.parentElement;i++)p=p.parentElement;if(p&&p.remove)p.remove();});
    // 图片内联为 data URL，保证分享页可独立显示
    for(const img of [...list.querySelectorAll('img')]){
      try{const src=img.src;if(!src||src.startsWith('data:'))continue;
        const b=await fetch(src).then(r=>r.blob());if(b.size>3e6)continue;
        const d=await new Promise(s=>{const f=new FileReader();f.onload=()=>s(f.result);f.readAsDataURL(b);});
        img.setAttribute('src',d);}catch(e){}
    }
    const rs=getComputedStyle(document.documentElement);
    let vars=''; for(const p of rs){if(typeof p==='string'&&p.startsWith('--'))vars+=p+':'+rs.getPropertyValue(p)+';';}
    return JSON.stringify({html:list.outerHTML, vars, htmlClass:document.documentElement.className, msgs:blocks.length, title:document.title});
  })()`);
  const d = JSON.parse(data);
  if (d.err) { c.close(); throw new Error(d.err); }

  // 抓全部样式表 cssText
  const css = await c.evaluate(`(()=>{let out='';for(const s of document.styleSheets){try{for(const r of s.cssRules)out+=r.cssText+'\\n';}catch(e){}}return out;})()`);
  c.close();

  const html =
    '<!doctype html><html class="' + d.htmlClass + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + (d.title || 'Codex Chat') + '</title>' +
    '<style>:root{' + d.vars + '}\n' + css + '\n' +
    'body{margin:0;background:#fff}.share-wrap{max-width:768px;margin:0 auto;padding:28px 16px 60px}</style></head>' +
    '<body><div class="share-wrap">' + d.html + '</div></body></html>';
  fs.writeFileSync(OUT, html);
  console.error('已生成: ' + OUT + ' (' + html.length + ' 字节, ' + d.msgs + ' 块, css ' + css.length + ' 字节)');
  console.log(OUT);
})().catch((e) => { console.error('错误: ' + e.message); process.exit(1); });

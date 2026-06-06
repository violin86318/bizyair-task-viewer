/**
 * BizyAir Task Viewer — Cloudflare Worker
 * 
 * 路由：
 *   GET  /           → 返回前端页面
 *   GET  /api/tasks  → 从 KV 读取任务数据
 *   POST /api/tasks  → 写入/更新任务数据（需要 token 鉴权）
 */

const TOKEN = typeof BIZYAIR_TOKEN !== 'undefined' ? BIZYAIR_TOKEN : '';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // GET / → 前端页面
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(HTML_PAGE, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders },
      });
    }

    // GET /proxy → 图片代理（解决 HTTPS 页面加载 HTTP 图片的混合内容问题）
    if (url.pathname === '/proxy' && request.method === 'GET') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response('Missing url param', { status: 400, headers: corsHeaders });
      }
      try {
        const imgResp = await fetch(targetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          cf: { cacheTtl: 86400 * 30, cacheEverything: true },
        });
        const contentType = imgResp.headers.get('Content-Type') || 'image/png';
        const body = await imgResp.arrayBuffer();
        return new Response(body, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=2592000',
            ...corsHeaders,
          },
        });
      } catch (e) {
        return new Response('Proxy error: ' + e.message, { status: 502, headers: corsHeaders });
      }
    }

    // GET /api/tasks → 读取数据
    if (url.pathname === '/api/tasks' && request.method === 'GET') {
      const data = await env.TASK_KV.get('tasks', 'json') || [];
      return Response.json({ ok: true, data, count: data.length }, { headers: corsHeaders });
    }

    // POST /api/tasks → 写入数据
    if (url.pathname === '/api/tasks' && request.method === 'POST') {
      // Token 鉴权
      const authHeader = request.headers.get('Authorization') || '';
      const queryToken = url.searchParams.get('token') || '';
      const providedToken = authHeader.replace('Bearer ', '') || queryToken;
      
      if (TOKEN && providedToken !== TOKEN) {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const records = body.records || body;
        if (!Array.isArray(records)) {
          return Response.json({ ok: false, error: 'Expected array' }, { status: 400, headers: corsHeaders });
        }
        await env.TASK_KV.put('tasks', JSON.stringify(records), {
          metadata: { updated: new Date().toISOString(), count: records.length },
        });
        return Response.json({ ok: true, count: records.length }, { headers: corsHeaders });
      } catch (e) {
        return Response.json({ ok: false, error: e.message }, { status: 400, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
};

// ===== 前端页面 =====
const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BizyAir 任务日志</title>
<style>
  :root {
    --bg: #09090b; --card: #18181b; --border: #27272a;
    --text: #fafafa; --muted: #71717a; --accent: #3b82f6;
    --success: #22c55e; --failed: #ef4444; --pending: #f59e0b;
    --surface: #1e1e22;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  /* Header */
  .header { padding: 28px 24px 12px; max-width: 1100px; margin: 0 auto; }
  .header-top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .header h1 span { color: var(--muted); font-weight: 400; font-size: 13px; margin-left: 8px; }

  /* Sync bar */
  .sync-bar { display: flex; align-items: center; gap: 10px; }
  .sync-time { font-size: 12px; color: var(--muted); }
  .sync-btn {
    background: var(--accent); color: #fff; border: none; border-radius: 8px;
    padding: 7px 16px; font-size: 13px; font-weight: 500; cursor: pointer;
    transition: all .15s;
  }
  .sync-btn:hover { background: #2563eb; }
  .sync-btn:active { transform: scale(.97); }
  .sync-btn.loading { opacity: .6; pointer-events: none; }

  /* Stats */
  .stats { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
  .stat { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 10px 16px; min-width: 80px; }
  .stat .num { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .stat .label { color: var(--muted); font-size: 12px; margin-top: 2px; }

  /* Filters */
  .filters { padding: 12px 24px 8px; max-width: 1100px; margin: 0 auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .fbtn { background: var(--card); border: 1px solid var(--border); color: var(--muted); border-radius: 8px; padding: 5px 12px; font-size: 12px; cursor: pointer; transition: all .12s; }
  .fbtn:hover { border-color: #404040; color: var(--text); }
  .fbtn.on { background: var(--accent); border-color: var(--accent); color: #fff; }

  /* Search */
  .search-bar { padding: 4px 24px 12px; max-width: 1100px; margin: 0 auto; }
  .search-bar input {
    width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 14px; color: var(--text); font-size: 13px; outline: none;
  }
  .search-bar input::placeholder { color: var(--muted); }
  .search-bar input:focus { border-color: var(--accent); }

  /* Timeline */
  .timeline { padding: 4px 24px 48px; max-width: 1100px; margin: 0 auto; }

  .task {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px 18px; margin-bottom: 8px; transition: border-color .12s;
    display: flex; gap: 16px; align-items: flex-start;
  }
  .task:hover { border-color: #3f3f46; }

  .task-main { flex: 1; min-width: 0; }
  .task-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
  .task-id { font-family: "SF Mono", "Fira Code", ui-monospace, monospace; font-size: 12px; color: var(--accent); cursor: pointer; }
  .task-id:hover { text-decoration: underline; }

  .badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; text-transform: uppercase; letter-spacing: .3px; }
  .badge-Success { background: rgba(34,197,94,.12); color: var(--success); }
  .badge-Failed { background: rgba(239,68,68,.12); color: var(--failed); }
  .badge-AsyncSubmitted { background: rgba(245,158,11,.12); color: var(--pending); }
  .badge-NoOutputs { background: rgba(239,68,68,.08); color: #f87171; }

  .task-prompt { font-size: 13px; line-height: 1.45; margin-bottom: 5px; word-break: break-word; }
  .task-meta { font-size: 11px; color: var(--muted); display: flex; gap: 10px; flex-wrap: wrap; }
  .task-error { font-size: 11px; color: var(--failed); background: rgba(239,68,68,.06); border-radius: 5px; padding: 4px 8px; margin-top: 5px; }

  .task-time { font-size: 11px; color: var(--muted); white-space: nowrap; }

  .task-imgs { flex-shrink: 0; display: flex; gap: 6px; flex-wrap: wrap; }
  .task-imgs img {
    width: 72px; height: 72px; border-radius: 8px; object-fit: cover;
    border: 1px solid var(--border); cursor: pointer; transition: transform .12s;
  }
  .task-imgs img:hover { transform: scale(1.06); }
  .no-img { width: 72px; height: 72px; border-radius: 8px; border: 1px dashed var(--border); display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 10px; }

  .empty { text-align: center; padding: 60px 20px; color: var(--muted); }
  .empty p { margin-top: 8px; font-size: 13px; }

  /* Lightbox */
  .lb { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.88); z-index: 999; align-items: center; justify-content: center; cursor: pointer; }
  .lb.open { display: flex; }
  .lb img { max-width: 92vw; max-height: 92vh; border-radius: 8px; }

  /* Toast */
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #22c55e; color: #fff; padding: 8px 20px; border-radius: 8px;
    font-size: 13px; font-weight: 500; opacity: 0; transition: opacity .3s;
    z-index: 1000; pointer-events: none;
  }
  .toast.show { opacity: 1; }
  .toast.err { background: #ef4444; }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <h1>📊 BizyAir 任务日志<span>Cloudflare Edition</span></h1>
    <div class="sync-bar">
      <span class="sync-time" id="syncTime">未同步</span>
      <button class="sync-btn" id="syncBtn" onclick="syncData()">🔄 从云端刷新</button>
    </div>
  </div>
  <div class="stats" id="stats"></div>
</div>

<div class="filters" id="filters">
  <button class="fbtn on" data-f="all">全部</button>
  <button class="fbtn" data-f="Success">✅ 成功</button>
  <button class="fbtn" data-f="Failed">❌ 失败</button>
  <button class="fbtn" data-f="AsyncSubmitted">⏳ 异步中</button>
</div>

<div class="search-bar">
  <input type="text" id="search" placeholder="搜索 request_id / prompt / 模型..." oninput="render()">
</div>

<div class="timeline" id="timeline"></div>

<div class="lb" id="lb" onclick="this.classList.remove('open')">
  <img id="lbImg" src="">
</div>
<div class="toast" id="toast"></div>

<script>
let DATA = [];
let FILTER = 'all';

function $(s) { return document.getElementById(s); }
function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  setTimeout(() => t.className = 'toast', 2000);
}

function openLb(url) {
  $('lbImg').src = url;
  $('lb').classList.add('open');
}

function copyId(id) {
  navigator.clipboard.writeText(id).then(() => toast('已复制: ' + id));
}

function stats() {
  const n = DATA.length;
  const s = DATA.filter(r => r.status === 'Success').length;
  const f = DATA.filter(r => r.status === 'Failed').length;
  const o = DATA.reduce((a, r) => a + (r.outputs?.length || 0), 0);
  $('stats').innerHTML =
    '<div class="stat"><div class="num">' + n + '</div><div class="label">总任务</div></div>' +
    '<div class="stat"><div class="num" style="color:var(--success)">' + s + '</div><div class="label">成功</div></div>' +
    '<div class="stat"><div class="num" style="color:var(--failed)">' + f + '</div><div class="label">失败</div></div>' +
    '<div class="stat"><div class="num">' + o + '</div><div class="label">产出文件</div></div>';
}

function render() {
  const q = $('search').value.toLowerCase();
  let list = FILTER === 'all' ? DATA : DATA.filter(r => r.status === FILTER);
  if (q) list = list.filter(r =>
    (r.request_id || '').toLowerCase().includes(q) ||
    (r.task_id || '').toLowerCase().includes(q) ||
    (r.prompt || '').toLowerCase().includes(q) ||
    (r.model || '').toLowerCase().includes(q) ||
    (r.app_id || '').toLowerCase().includes(q) ||
    (r.error || '').toLowerCase().includes(q)
  );

  const el = $('timeline');
  if (!list.length) {
    el.innerHTML = '<div class="empty"><div style="font-size:40px">📭</div><p>暂无匹配记录</p></div>';
    return;
  }

  el.innerHTML = list.map(r => {
    const id = r.request_id || r.task_id || '-';
    const model = r.model || r.app_id || '-';
    const src = r.source === 'modelzoo' ? '🔧 ModelZoo' : '🌐 WebApp';
    const ts = (r.timestamp || '').replace('T', ' ').replace(/\\+\\d+$/, '');

    // 图片 URL 处理：KV 中已存 HTTPS 代理 URL（push_tasks.py 转换过），仅作 http:// 兜底
    const proxyUrl = (u) => {
      if (!u) return u;
      if (u.startsWith('https://')) return u;        // 已经是 HTTPS（KV 里的代理 URL）
      if (u.startsWith('http://'))                  // 裸 HTTP 才转代理
        return '/proxy?url=' + encodeURIComponent(u);
      if (u.startsWith('/proxy')) return u;         // 已经是相对路径代理
      return u;
    };

    let imgs = '';
    if (r.outputs?.length) {
      imgs = '<div class="task-imgs">' + r.outputs.map(o =>
        '<img src="' + esc(proxyUrl(o.url)) + '" onclick="openLb(\\'' + esc(o.url) + '\\')" onerror="this.outerHTML=\\'<div class=&quot;no-img&quot;>加载失败</div>\\'">'
      ).join('') + '</div>';
    } else {
      imgs = '<div class="task-imgs"><div class="no-img">—</div></div>';
    }

    const err = r.error ? '<div class="task-error">⚠ ' + esc(r.error) + '</div>' : '';

    return '<div class="task">' +
      '<div class="task-main">' +
        '<div class="task-head">' +
          '<span class="task-id" onclick="copyId(\\'' + esc(id) + '\\')">' + esc(id) + '</span>' +
          '<span class="badge badge-' + r.status + '">' + esc(r.status) + '</span>' +
          '<span class="task-time">' + esc(ts) + '</span>' +
        '</div>' +
        '<div class="task-prompt">' + esc(r.prompt || '(无提示词)') + '</div>' +
        '<div class="task-meta"><span>' + src + '</span><span>' + esc(model) + '</span>' +
          (r.endpoint ? '<span>' + esc(r.endpoint) + '</span>' : '') + '</div>' +
        err +
      '</div>' +
      imgs +
    '</div>';
  }).join('');
}

async function syncData() {
  const btn = $('syncBtn');
  btn.classList.add('loading');
  btn.textContent = '⏳ 同步中...';
  try {
    const resp = await fetch('/api/tasks');
    const json = await resp.json();
    if (json.ok) {
      DATA = json.data || [];
      DATA.sort((a, b) => (b.unix_ts || 0) - (a.unix_ts || 0));
      stats();
      render();
      $('syncTime').textContent = '更新于 ' + new Date().toLocaleTimeString('zh-CN');
      toast('✅ 已同步 ' + DATA.length + ' 条记录');
    } else {
      toast('同步失败: ' + json.error, true);
    }
  } catch (e) {
    toast('网络错误: ' + e.message, true);
  }
  btn.classList.remove('loading');
  btn.textContent = '🔄 从云端刷新';
}

// Filter buttons
$('filters').addEventListener('click', e => {
  if (!e.target.classList.contains('fbtn')) return;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('on'));
  e.target.classList.add('on');
  FILTER = e.target.dataset.f;
  render();
});

// Init
syncData();
</script>
</body>
</html>`;

# bizyair-task-viewer

Cloudflare Worker 上的 BizyAir 任务日志查看器。

- 📊 可视化展示 220+ 条 BizyAir 任务记录（成功/失败/异步中）
- 🔍 按 request_id / prompt / 模型 / 状态过滤搜索
- 🖼️ 自动代理 HTTP 图床 URL（解决 HTTPS 页面混合内容问题）
- ⚡ Cloudflare 边缘缓存 30 天，第二次访问秒开

## 路由

| 路径 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 前端单页应用 |
| `/api/tasks` | GET | 从 KV 读取所有任务（无需鉴权） |
| `/api/tasks` | POST | 推送任务到 KV（可选 Bearer token） |
| `/proxy?url=<encoded>` | GET | HTTP 图床代理（30 天 CF 缓存） |

## 部署

```bash
# 1. 安装 wrangler
npm install -g wrangler

# 2. 登录 Cloudflare
wrangler login

# 3. 创建 KV 命名空间
wrangler kv namespace create TASK_KV
# 把返回的 id 填到 wrangler.toml

# 4. 部署
wrangler deploy
```

## 用法

部署后从你的 Python 推送脚本调用：

```python
import requests
requests.post(
    "https://your-worker.workers.dev/api/tasks",
    json={"records": [...]},
    headers={"Authorization": "Bearer YOUR_TOKEN"}  # 可选
)
```

## URL 代理说明

如果你的图床是 `http://...`，浏览器在 HTTPS 页面里会拦截（混合内容）。
本 Worker 的 `push_tasks.py` 会自动把所有 `http://` 输出 URL 转换成：
```
https://your-worker.workers.dev/proxy?url=<encoded>
```

- 第一次访问：Worker fetch 上游图床（可能慢 10-20 秒）
- 后续访问：命中 CF 边缘缓存，< 1 秒

## 配置

可选：在 `wrangler.toml` 或 CF Dashboard 添加 `BIZYAIR_TOKEN` 密文，启用 POST 写入鉴权。

```toml
[vars]
BIZYAIR_TOKEN = "your-secret-token"
```

## License

MIT

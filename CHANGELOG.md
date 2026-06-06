# Changelog

## 0.1.0 (2026-06-06)

首次发布。

- `GET /` 前端单页应用（任务列表 + 缩略图 + lightbox）
- `GET /api/tasks` 从 KV 读取任务
- `POST /api/tasks` 推送任务到 KV（可选 Bearer token）
- `GET /proxy?url=<encoded>` HTTP 图床代理，CF 边缘缓存 30 天
- HTTP 输出 URL 在 push 时自动转换为 HTTPS 代理 URL

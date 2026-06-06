#!/usr/bin/env bash
# deploy.sh — 一键部署 BizyAir Task Viewer 到 Cloudflare Workers
# 在终端中运行（不在 remio sandbox 内）
#
# 前置条件：
#   1. wrangler 已安装且已登录（wrangler login）
#   2. 有 Cloudflare 免费账号
#
# 用法：
#   cd agent/.temp/bizyair-viewer-cf
#   bash deploy.sh

set -e

echo "🔧 Step 1: 创建 KV 命名空间..."
KV_RESULT=$(npx wrangler kv:namespace create TASK_KV 2>&1 || true)
echo "$KV_RESULT"

# 从输出中提取 id
KV_ID=$(echo "$KV_RESULT" | grep -oE 'id = "[^"]+"' | head -1 | sed 's/id = "//;s/"//')
if [ -z "$KV_ID" ]; then
  echo "❌ 创建 KV 失败，请检查 wrangler 登录状态"
  exit 1
fi
echo "✅ KV ID: $KV_ID"

echo ""
echo "🔧 Step 2: 更新 wrangler.toml..."
# 更新 toml 中的 KV id
cat > wrangler.toml << EOF
name = "bizyair-task-viewer"
main = "src/worker.js"
compatibility_date = "2024-12-01"

[[kv_namespaces]]
binding = "TASK_KV"
id = "$KV_ID"
EOF
echo "✅ wrangler.toml 已更新"

echo ""
echo "🔧 Step 3: 生成安全 Token..."
TOKEN=$(openssl rand -hex 16)
echo "✅ Token: $TOKEN"

echo ""
echo "🚀 Step 4: 部署 Worker..."
DEPLOY_OUTPUT=$(npx wrangler deploy 2>&1 || true)
echo "$DEPLOY_OUTPUT"

# 提取 URL
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-z0-9-]+\.workers\.dev' | head -1)
if [ -z "$WORKER_URL" ]; then
  echo "❌ 部署失败"
  exit 1
fi

echo ""
echo "=========================================="
echo "✅ 部署成功！"
echo ""
echo "🌐 查看地址: $WORKER_URL"
echo "🔑 推送 Token: $TOKEN"
echo ""
echo "📝 请在 remio 中告诉我以下信息："
echo "   Worker URL: $WORKER_URL"
echo "   Token: $TOKEN"
echo ""
echo "   之后你说「推送日志」，我会自动推送数据到这个地址"
echo "=========================================="

# 保存配置到本地文件
cat > .deploy-info.json << EOF
{
  "worker_url": "$WORKER_URL",
  "token": "$TOKEN",
  "kv_id": "$KV_ID",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
echo "📄 配置已保存到 .deploy-info.json"

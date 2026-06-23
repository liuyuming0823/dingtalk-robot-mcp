#!/bin/bash

echo "================================================"
echo "   DingTalk MCP Server - 安装向导"
echo "================================================"
echo

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "[错误] Node.js 版本过低 (当前: v$NODE_VERSION)，需要 18 或更高版本"
    exit 1
fi

echo "[1/4] 正在安装 dingtalk-mcp-server..."
npm install -g dingtalk-mcp-server
if [ $? -ne 0 ]; then
    echo "[错误] 安装失败，请检查网络连接"
    exit 1
fi

echo
echo "[2/4] 安装完成！正在启动配置向导..."
echo

dingtalk-mcp-server-config
if [ $? -ne 0 ]; then
    echo
    echo "[警告] 配置向导未成功完成"
    echo "你可以稍后手动运行: dingtalk-mcp-server-config"
fi

echo
echo "[3/4] 正在验证安装..."
if command -v dingtalk-mcp-server &> /dev/null; then
    echo "[成功] dingtalk-mcp-server 已成功安装"
else
    echo "[警告] 未在 PATH 中找到 dingtalk-mcp-server"
fi

echo
echo "[4/4] 安装完成！"
echo
echo "下一步:"
echo "1. 重启 WorkBuddy 以加载新配置"
echo "2. 在 WorkBuddy 中测试发送钉钉消息"
echo
echo "文档: https://github.com/your-org/dingtalk-mcp-server"
echo

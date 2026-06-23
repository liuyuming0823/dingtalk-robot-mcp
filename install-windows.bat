@echo off
chcp 65001 >nul
echo ================================================
echo    DingTalk MCP Server - Windows 安装向导
echo ================================================
echo.

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] 正在安装 dingtalk-mcp-server...
call npm install -g dingtalk-mcp-server
if %errorlevel% neq 0 (
    echo [错误] 安装失败，请检查网络连接
    pause
    exit /b 1
)

echo.
echo [2/4] 安装完成！正在启动配置向导...
echo.

call dingtalk-mcp-server-config
if %errorlevel% neq 0 (
    echo.
    echo [警告] 配置向导未成功完成
    echo 你可以稍后手动运行: dingtalk-mcp-server-config
)

echo.
echo [3/4] 正在验证安装...
where dingtalk-mcp-server >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] dingtalk-mcp-server 已成功安装
) else (
    echo [警告] 未在 PATH 中找到 dingtalk-mcp-server
)

echo.
echo [4/4] 安装完成！
echo.
echo 下一步:
echo 1. 重启 WorkBuddy 以加载新配置
echo 2. 在 WorkBuddy 中测试发送钉钉消息
echo.
echo 文档: https://github.com/your-org/dingtalk-mcp-server
echo.
pause

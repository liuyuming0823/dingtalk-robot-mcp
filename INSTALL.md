# 钉钉机器人 MCP 安装指南

## 前置条件

- Node.js >= 18.0.0
- 钉钉企业内部应用（机器人类型）

## 第一步：获取钉钉凭证

1. 登录 [钉钉开放平台](https://open.dingtalk.com/)
2. 进入「应用开发」→「企业内部应用」→ 创建或选择现有应用
3. 在「凭证与基础信息」页面复制：
   - **AppKey**
   - **AppSecret**

## 第二步：开通权限

### 基础权限（必须）
创建机器人应用后，**「企业机器人消息推送」** 权限通常已默认开通。在「权限管理」页面确认即可。

### 按姓名发送权限（可选）
如需通过中文姓名发送消息，额外开通：

1. **通讯录部门信息读权限**
   - 权限管理 → 搜索「通讯录」→ 找到该权限 → 点击开通

2. **通讯录成员信息读权限**
   - 权限管理 → 搜索「通讯录」→ 找到该权限 → 点击开通

> 仅使用 userId 发送消息无需上述通讯录权限。

## 第三步：安装

### npm 全局安装

```bash
npm install -g dingtalk-mcp-server
```

### 从源码安装

```bash
git clone https://github.com/liuyuming0823/dingtalk-robot-mcp.git dingtalk-mcp-server
cd dingtalk-mcp-server
npm install
npm run build
```

## 第四步：配置

### 方法一：配置向导（推荐）

```bash
dingtalk-mcp-server-config
```

按提示输入 AppKey 和 AppSecret，向导会自动写入 WorkBuddy 配置。

### 方法二：手动配置

编辑 `~/.workbuddy/mcp.json`，添加：

```json
{
  "mcpServers": {
    "dingtalk": {
      "command": "node",
      "args": ["/path/to/dingtalk-mcp-server/dist/index.js"],
      "env": {
        "DINGTALK_APP_KEY": "你的AppKey",
        "DINGTALK_APP_SECRET": "你的AppSecret"
      }
    }
  }
}
```

> Windows 路径示例：`"C:\\Users\\YourName\\dingtalk-mcp-server\\dist\\index.js"`

## 第五步：启用

在 WorkBuddy 连接器管理页面，找到钉钉连接器，**断开后重新启用**，新配置即可生效。

## 验证

在 WorkBuddy 中测试：

```
通过钉钉给我发消息，内容是：测试消息
```

或：

```
通过钉钉给刘玉明发消息，内容是：你好
```

如果收到消息，说明配置成功。

## 卸载

```bash
npm uninstall -g dingtalk-mcp-server
```

并删除 `~/.workbuddy/mcp.json` 中 `dingtalk` 相关配置。

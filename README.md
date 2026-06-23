# 钉钉机器人 MCP

钉钉机器人 MCP 服务器。通过 MCP 协议实现 AI 助手发送钉钉单聊和群聊消息，支持通过 **userId**、**姓名** 或 **批量 userId** 发送，最多单次 20 人。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## 功能

| 功能 | 说明 |
|---|---|
| 单聊消息 | 发送文本消息给指定用户 |
| 群聊消息 | 发送文本消息到指定群 |
| 按 userId 发送 | 直接指定钉钉用户 ID（兼容旧用法） |
| 按姓名发送 | 输入中文姓名，自动查找 userId 并发送 |
| 批量发送 | 一次发送给最多 20 个用户 |
| 重名检测 | 多人同名时拒绝发送，列出所有重复的 userId |

---

## 前置要求

| 项目 | 要求 |
|---|---|
| Node.js | >= 18.0.0 |
| 钉钉应用 | 企业内部应用（机器人） |

---

## 第一步：创建钉钉应用

1. 登录 [钉钉开放平台](https://open.dingtalk.com/)，进入「应用开发」→「企业内部应用」
2. 创建应用，类型选 **「机器人」**
3. 在「凭证与基础信息」页面获取：
   - **AppKey**（应用的唯一标识）
   - **AppSecret**（应用的密钥）

---

## 第二步：开通钉钉权限

### 基础权限（必须）

确保应用已开通 **「企业机器人消息推送」** 权限。这是发送消息的基础权限，通常在创建机器人应用时默认开通。

验证方法：在应用详情页 → 「权限管理」 → 确认存在「企业机器人消息推送」。

### 按姓名发送权限（可选）

如果希望通过中文姓名发送消息（非必须，仅 `userId` 发送不需要），还需开通：

| 权限名称 | 说明 | 操作路径 |
|---|---|---|
| 通讯录部门信息读权限 | 获取企业部门列表 | 权限管理 → 搜索「通讯录」→ 点击开通 |
| 通讯录成员信息读权限 | 获取部门成员信息 | 权限管理 → 搜索「通讯录」→ 点击开通 |

> **注意**：「权限管理」入口在钉钉开放平台应用详情页的左侧菜单中，不同版本后台界面可能略有不同。如果找不到，试试「开发管理」→「权限管理」。

---

## 第三步：安装 & 配置

### npm 全局安装（推荐）

```bash
npm install -g dingtalk-mcp-server
```

安装后运行配置向导：

```bash
dingtalk-mcp-server-config
```

向导会引导你输入 AppKey / AppSecret 并自动写入 WorkBuddy 配置。

### 手动配置

编辑 `~/.workbuddy/mcp.json`：

```json
{
  "mcpServers": {
    "dingtalk": {
      "command": "node",
      "args": [
        "C:\\path\\to\\dingtalk-mcp-server\\dist\\index.js"
      ],
      "env": {
        "DINGTALK_APP_KEY": "你的AppKey",
        "DINGTALK_APP_SECRET": "你的AppSecret"
      }
    }
  }
}
```

| 环境变量 | 必填 | 说明 |
|---|---|---|
| `DINGTALK_APP_KEY` | ✅ | 钉钉应用 AppKey |
| `DINGTALK_APP_SECRET` | ✅ | 钉钉应用 AppSecret |

配置完成后，断开并重新启用钉钉连接器即可生效。

---

## 使用指南

### MCP 工具清单

| 工具名 | 功能 |
|---|---|
| `send_dingtalk_single_message` | 发送单聊消息（支持 userId/userName/批量） |
| `send_dingtalk_group_message` | 发送群聊消息 |

### 单聊消息参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content` | string | ✅ | 消息文本内容 |
| `userId` | string | 三选一 | 单个用户 ID |
| `userIds` | string[] | 三选一 | 多个用户 ID（最多 20 个） |
| `userName` | string | 三选一 | 用户中文姓名（精确匹配） |

### 群聊消息参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `chatId` | string | ✅ | 群聊 openConversationId |
| `content` | string | ✅ | 消息文本内容 |

### 使用示例

**示例 1：按 userId 发送**
```
给张三发消息，userId: "204457105626433998"，内容：明天的会议改到下午3点
```

**示例 2：按姓名发送**
```
通过钉钉给朱育敏发消息，内容是：请查收本周的测试报告
```

**示例 3：批量发送**
```
通过钉钉给以下用户发消息：
userIds: ["204457105626433998", "481029384729103847"]
内容：全员通知：明天下午3点系统升级维护
```

**示例 4：群聊消息**
```
发送钉钉群消息，chatId: "cidXXXXXXXXX"，内容：本周会议纪要已更新
```

---

## 行为说明

### 姓名查找机制

- 首次按姓名发送时，MCP 服务器会遍历企业所有部门来构建姓名→userId 索引（耗时约 5~10 秒，取决于企业规模）
- 索引缓存 5 分钟，缓存期内后续查找 < 1ms
- 需要 **通讯录部门信息读权限** + **通讯录成员信息读权限**

### 重名处理

```
用户 "张伟" 在企业中有 3 个重名记录
→ 发送失败，错误信息列出 3 个 userId
→ 用户需改用 userId 指定具体接收人
```

### 批量限制

单次最多发送给 20 个用户，超出会报错。如需发送给更多人，请分批调用。

---

## 获取 userId / chatId

### 获取自己的 userId
最常见的场景是给自己发消息。在钉钉客户端中：
1. 点击头像 → 个人信息
2. 长按或点击「复制」你的 userId（视版本而定）
3. 或者直接**用姓名发送给自己**

### 获取他人的 userId
1. 使用本 MCP 的 **按姓名发送** 功能自动查找
2. 或者登录钉钉管理后台 → 通讯录 → 用户详情页 URL 中包含 userId

### 获取 chatId（群聊 openConversationId）
1. 在钉钉群设置 → 群机器人 → 查看机器人详情
2. 或通过钉钉开放平台 API 获取

---

## 故障排查

### 问题 1：MCP 工具未显示
1. 检查 `~/.workbuddy/mcp.json` 路径是否正确
2. 确认 `node` 命令可用（`node --version`）
3. 断开钉钉连接器 → 重新启用

### 问题 2：按姓名发送报「未找到」
- 确认已开通「通讯录部门信息读权限」和「通讯录成员信息读权限」
- 断开再重新启用钉钉连接器使权限生效
- 确认姓名与钉钉通讯录中的完全一致

### 问题 3：消息发送失败
- 检查 AppKey / AppSecret 是否正确
- 确认「企业机器人消息推送」权限已开通
- 确认 userId 有效且该用户在企业可见范围内

### 问题 4：发送成功但对方收不到
- 确认该用户在应用的「可见范围」内
- 应用需要在「部署与发布」中设置可见范围为「全部员工」或包含目标用户

---

## 技术栈

- TypeScript
- @modelcontextprotocol/sdk
- axios
- 钉钉开放平台 API（新版 v1.0）

## API 说明

| 操作 | API |
|---|---|
| 获取 Token | `POST /v1.0/oauth2/accessToken` |
| 单聊消息 | `POST /v1.0/robot/oToMessages/batchSend` |
| 群聊消息 | `POST /v1.0/robot/groupMessages/send` |
| 部门列表 | `GET /oapi.dingtalk.com/department/list` |
| 部门成员 | `GET /oapi.dingtalk.com/user/simplelist` |

## 许可证

MIT

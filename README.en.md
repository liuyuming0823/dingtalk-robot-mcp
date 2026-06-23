# DingTalk Robot MCP

An MCP (Model Context Protocol) server for sending DingTalk messages via AI assistants. Supports **8 message types** (text, markdown, image, link, actionCard, file, audio, video) through **userId**, **user name** (auto-lookup), or **batch userIds** (up to 20 recipients at a time).

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## Features

| Feature | Description |
|---|---|
| Multi message types | Text, Markdown, Image, Link, ActionCard, File, Audio, Video |
| One-on-one messages | Send any message type to individual users |
| Group messages | Send any message type to group chats |
| Media upload | Upload local files to get mediaId for image/file/audio/video |
| Send by userId | Directly specify a DingTalk user ID (backward compatible) |
| Send by name | Enter a Chinese name and auto-resolve to userId |
| Batch send | Send to up to 20 users in a single call |
| Duplicate name detection | Rejects send when multiple users share the same name, listing all matching userIds |

---

## Prerequisites

| Item | Requirement |
|---|---|
| Node.js | >= 18.0.0 |
| DingTalk App | Enterprise internal app (Robot type) |

---

## Step 1: Create a DingTalk App

1. Log in to [DingTalk Open Platform](https://open.dingtalk.com/), go to "App Development" → "Enterprise Internal Apps"
2. Create an app, select type **"Robot"**
3. On the "Credentials & Basic Info" page, copy:
   - **AppKey** (unique app identifier)
   - **AppSecret** (app secret key)

---

## Step 2: Enable Permissions

### Required Permission

Make sure the app has **"Enterprise Robot Message Push"** enabled. This is the fundamental permission for sending messages and is usually granted by default when creating a robot app.

To verify: go to App Details → "Permissions" → confirm "Enterprise Robot Message Push" is listed.

### Name-based Lookup Permissions (Optional)

If you want to send messages by user name (not required if only using userId), also enable:

| Permission | Purpose | How to enable |
|---|---|---|
| Address Book Department Read | Fetch department list | Permissions → search "Address Book" → click enable |
| Address Book Member Read | Fetch department members | Permissions → search "Address Book" → click enable |

> **Note**: The "Permissions" entry is in the left sidebar of your DingTalk Open Platform app details page. The UI may vary slightly across backend versions. If you can't find it, try "Development Management" → "Permissions".

---

## Step 3: Install & Configure

### Global npm Install (Recommended)

```bash
npm install -g dingtalk-mcp-server
```

Then run the configuration wizard:

```bash
dingtalk-mcp-server-config
```

The wizard will prompt for your AppKey / AppSecret and auto-write the WorkBuddy configuration.

### Manual Configuration

Edit `~/.workbuddy/mcp.json`:

```json
{
  "mcpServers": {
    "dingtalk": {
      "command": "node",
      "args": [
        "/path/to/dingtalk-mcp-server/dist/index.js"
      ],
      "env": {
        "DINGTALK_APP_KEY": "your-appkey",
        "DINGTALK_APP_SECRET": "your-appsecret"
      }
    }
  }
}
```

| Environment Variable | Required | Description |
|---|---|---|
| `DINGTALK_APP_KEY` | ✅ | DingTalk app AppKey |
| `DINGTALK_APP_SECRET` | ✅ | DingTalk app AppSecret |

After configuration, disconnect and re-enable the DingTalk connector for changes to take effect.

---

## Usage Guide

### MCP Tools

| Tool Name | Function |
|---|---|
| `send_dingtalk_single_message` | Send one-on-one messages (supports 8 message types) |
| `send_dingtalk_group_message` | Send group chat messages (supports 8 message types) |
| `upload_dingtalk_media` | Upload media files to get a mediaId |

### Single Message Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `msgtype` | string | No (default text) | Message type: text / markdown / image / link / actionCard_single / actionCard_multi / file / audio / video |
| `userId` | string | One of three | Single user ID |
| `userIds` | string[] | One of three | Multiple user IDs (max 20) |
| `userName` | string | One of three | User's Chinese name (exact match) |

**Additional parameters per message type:**

| msgtype | Required | Optional |
|---|---|---|
| text | `content` | — |
| markdown | `title`, `text` | — |
| image | `photoURL` (URL or mediaId) | — |
| link | `title`, `text`, `messageUrl` | `picUrl` |
| actionCard_single | `title`, `text`, `singleTitle`, `singleURL` | `btnOrientation` (0=vertical, 1=horizontal) |
| actionCard_multi | `title`, `text`, `btns[]` (1-6 buttons) | `btnOrientation` |
| file | `mediaId`, `fileName`, `fileType` | — |
| audio | `mediaId`, `duration` (milliseconds) | — |
| video | `videoMediaId`, `picMediaId`, `duration` (seconds) | `videoType`, `width`, `height` |

### Group Message Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chatId` | string | ✅ | Group chat openConversationId |
| `msgtype` | string | No (default text) | Message type (same as above) |

Other parameters follow the same per-type schema as single messages.

### Upload Media Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filePath` | string | ✅ | Absolute local file path |
| `mediaType` | string | ✅ | image / voice / video / file |

| mediaType | Supported Formats | Size Limit |
|---|---|---|
| image | jpg, png, gif, bmp | 20MB |
| voice | amr, mp3, wav | 2MB |
| video | mp4 | 20MB |
| file | doc, docx, xls, xlsx, ppt, pptx, zip, pdf, rar | 20MB |

### Examples

**Example 1: Send text (backward compatible)**
```
Send a DingTalk message to userId "204457105626433998": Tomorrow's meeting is rescheduled to 3 PM.
```

**Example 2: Send by name**
```
Send a DingTalk message to 朱育敏: Please check this week's test report.
```

**Example 3: Send Markdown**
```
Send a markdown DingTalk message to userId "011950195121139389", title: Weekly Reminder, text: **Please submit your weekly report by Friday**\n- Task summary\n- Next week plan
```

**Example 4: Upload and send image**
```
Upload D:\screenshot.png to DingTalk (mediaType: image), then send it to 朱育敏 using msgtype image with the returned mediaId as photoURL.
```

**Example 5: Send ActionCard**
```
Send an actionCard to userId "011950195121139389", msgtype: actionCard_single, title: New Release, text: ## v2.0 is live\n\nMulti message type support added, singleTitle: View Details, singleURL: https://github.com
```

**Example 6: Batch send**
```
Send a DingTalk message to userIds ["204457105626433998", "481029384729103847"]:
msgtype: text, content: All-hands announcement: System maintenance tomorrow at 3 PM.
```

---

## Behavior Notes

### Name Lookup Mechanism

- On the first name-based send, the MCP server traverses all enterprise departments to build a name → userId index (takes ~5–10 seconds, depending on organization size)
- The index is cached for 5 minutes; subsequent lookups within the cache window complete in <1ms
- Requires **Address Book Department Read** + **Address Book Member Read** permissions

### Duplicate Name Handling

```
User "张伟" has 3 records in the organization
→ Send fails, error message lists all 3 userIds
→ User must specify the exact recipient via userId
```

### Batch Limit

Maximum 20 recipients per call. Exceeding this limit will result in an error. For larger batches, split into multiple calls.

---

## Getting userId / chatId

### Getting your own userId
The most common scenario is messaging yourself. In the DingTalk client:
1. Tap your avatar → Personal Info
2. Long-press or tap to copy your userId (varies by version)
3. Or simply **send a message to yourself by name**

### Getting other users' userIds
1. Use this MCP's **send-by-name** feature for automatic lookup
2. Alternatively, check the DingTalk Admin Console → Address Book → user detail page URL contains the userId

### Getting chatId (group openConversationId)
1. Go to DingTalk group settings → Group Bot → view bot details
2. Or retrieve via the DingTalk Open Platform API

---

## Troubleshooting

### Issue 1: MCP tools not showing up
1. Check that the path in `~/.workbuddy/mcp.json` is correct
2. Verify `node` is available (`node --version`)
3. Disconnect and re-enable the DingTalk connector

### Issue 2: Name-based send returns "Not Found"
- Confirm "Address Book Department Read" and "Address Book Member Read" permissions are enabled
- Disconnect and re-enable the DingTalk connector for permissions to take effect
- Verify the name matches exactly as it appears in the DingTalk address book

### Issue 3: Message send fails
- Verify AppKey / AppSecret are correct
- Confirm "Enterprise Robot Message Push" permission is enabled
- Make sure the userId is valid and the user is within the app's visible scope

### Issue 4: Send succeeds but recipient doesn't receive it
- Confirm the user is within the app's "Visible Scope"
- The app needs to have "Visible Scope" set to "All Employees" or include the target user under "Deploy & Publish"

---

## Tech Stack

- TypeScript
- @modelcontextprotocol/sdk
- axios
- DingTalk Open Platform API (new v1.0)

## API Reference

| Operation | API |
|---|---|
| Get Token | `POST /v1.0/oauth2/accessToken` |
| One-on-one message | `POST /v1.0/robot/oToMessages/batchSend` |
| Group message | `POST /v1.0/robot/groupMessages/send` |
| Upload media | `POST /oapi.dingtalk.com/media/upload` |
| Department list | `GET /oapi.dingtalk.com/department/list` |
| Department members | `GET /oapi.dingtalk.com/user/simplelist` |

## License

MIT

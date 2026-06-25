#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DingTalkClient } from './dingtalk.js';

const VALID_MSGTYPES = [
  'text', 'markdown', 'image', 'link',
  'actionCard_single', 'actionCard_multi',
  'file', 'audio', 'video',
];

// --- Schema helpers ---

function recipientsSchema(): Record<string, any> {
  return {
    userId: { type: 'string', description: 'Single DingTalk user ID to send message to' },
    userIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of DingTalk user IDs (max 20) for batch sending',
    },
    userName: {
      type: 'string',
      description:
        'Exact user name to search and send to. If multiple users share the same name, sending will fail with a list of duplicate user IDs.',
    },
  };
}

function msgtypeSchema(withTextContent: boolean): Record<string, any> {
  const base: Record<string, any> = {
    msgtype: {
      type: 'string',
      enum: VALID_MSGTYPES,
      description: `Message type. Supported: ${VALID_MSGTYPES.join(', ')}.`,
    },
  };
  if (withTextContent) {
    base.content = { type: 'string', description: '(for msgtype=text) Plain text message content' };
  }
  return base;
}

const markdownFields: Record<string, any> = {
  title: { type: 'string', description: '(for msgtype=markdown) Message title shown in notification preview' },
  text: { type: 'string', description: '(for msgtype=markdown) Markdown-formatted message body' },
};

const imageFields: Record<string, any> = {
  photoURL: { type: 'string', description: '(for msgtype=image) Image URL or mediaId (use upload_media to get mediaId)' },
};

const linkFields: Record<string, any> = {
  title: { type: 'string', description: '(for msgtype=link) Link title' },
  text: { type: 'string', description: '(for msgtype=link) Link description text' },
  messageUrl: { type: 'string', description: '(for msgtype=link) URL to open when clicking the link' },
  picUrl: { type: 'string', description: '(for msgtype=link) Optional preview image URL' },
};

const actionCardFields: Record<string, any> = {
  title: { type: 'string', description: '(for msgtype=actionCard_*) Card title' },
  text: { type: 'string', description: '(for msgtype=actionCard_*) Card body in Markdown format' },
  singleTitle: { type: 'string', description: '(for msgtype=actionCard_single) Button title' },
  singleURL: { type: 'string', description: '(for msgtype=actionCard_single) Button URL' },
  btns: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Button title' },
        actionURL: { type: 'string', description: 'Button URL' },
      },
      required: ['title', 'actionURL'],
    },
    description: '(for msgtype=actionCard_multi) Array of button objects, 1-6 buttons',
  },
  btnOrientation: {
    type: 'string',
    enum: ['0', '1'],
    description: '(for msgtype=actionCard_*) Button layout: 0=vertical, 1=horizontal',
  },
};

const fileFields: Record<string, any> = {
  mediaId: { type: 'string', description: '(for msgtype=file) mediaId from upload_media' },
  fileName: { type: 'string', description: '(for msgtype=file) File display name, e.g. "report.pdf"' },
  fileType: { type: 'string', description: '(for msgtype=file) File extension: xlsx, pdf, zip, rar, doc, docx' },
};

const audioFields: Record<string, any> = {
  mediaId: { type: 'string', description: '(for msgtype=audio) mediaId from upload_media' },
  duration: { type: 'number', description: '(for msgtype=audio) Duration in milliseconds' },
};

const videoFields: Record<string, any> = {
  videoMediaId: { type: 'string', description: '(for msgtype=video) Video mediaId from upload_media' },
  picMediaId: { type: 'string', description: '(for msgtype=video) Cover image mediaId from upload_media' },
  duration: { type: 'number', description: '(for msgtype=video) Duration in seconds' },
  videoType: { type: 'string', description: '(for msgtype=video) Video format, default "mp4"' },
  width: { type: 'number', description: '(for msgtype=video) Display width in px, default 600' },
  height: { type: 'number', description: '(for msgtype=video) Display height in px, default 400' },
};

function buildSingleMessageSchema(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      ...recipientsSchema(),
      ...msgtypeSchema(true),
      ...markdownFields,
      ...imageFields,
      ...linkFields,
      ...actionCardFields,
      ...fileFields,
      ...audioFields,
      ...videoFields,
    },
    required: [],
  };
}

function buildGroupMessageSchema(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      chatId: { type: 'string', description: 'DingTalk group chat ID (openConversationId)' },
      ...msgtypeSchema(true),
      ...markdownFields,
      ...imageFields,
      ...linkFields,
      ...actionCardFields,
      ...fileFields,
      ...audioFields,
      ...videoFields,
    },
    required: ['chatId'],
  };
}

// --- Validation ---

function looksLikeName(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}

async function resolveRecipients(args: Record<string, any>, client: DingTalkClient): Promise<string[] | null> {
  if (args.userId) {
    // If userId looks like a Chinese name, treat it as userName and search
    if (looksLikeName(args.userId)) {
      const found = await client.searchUserByName(args.userId);
      if (found.length === 0) {
        throw new Error(`User "${args.userId}" not found in the organization. Please check the name and try again.`);
      }
      if (found.length > 1) {
        throw new Error(
          `Multiple users found with name "${args.userId}" (${found.length} duplicates). Found userIds: ${found.join(', ')}. Please use a numeric userId to specify the exact recipient.`
        );
      }
      return [found[0]];
    }
    return [args.userId];
  }
  if (args.userIds?.length) {
    if (args.userIds.length > 20)
      throw new Error(`Maximum 20 users allowed per batch, got ${args.userIds.length}.`);
    return args.userIds;
  }
  if (args.userName) {
    const found = await client.searchUserByName(args.userName);
    if (found.length === 0) {
      throw new Error(`User "${args.userName}" not found in the organization.`);
    }
    if (found.length > 1) {
      throw new Error(
        `Multiple users found with name "${args.userName}" (${found.length} duplicates). Found userIds: ${found.join(', ')}.`
      );
    }
    return [found[0]];
  }
  return null;
}

function validateMsgParams(msgtype: string, args: Record<string, any>): void {
  const errors: string[] = [];
  switch (msgtype) {
    case 'text':
      if (!args.content) errors.push('content is required for msgtype=text');
      break;
    case 'markdown':
      if (!args.title) errors.push('title is required for msgtype=markdown');
      if (!args.text) errors.push('text is required for msgtype=markdown');
      break;
    case 'image':
      if (!args.photoURL) errors.push('photoURL is required for msgtype=image');
      break;
    case 'link':
      if (!args.title) errors.push('title is required for msgtype=link');
      if (!args.text) errors.push('text is required for msgtype=link');
      if (!args.messageUrl) errors.push('messageUrl is required for msgtype=link');
      break;
    case 'actionCard_single':
      if (!args.title) errors.push('title is required');
      if (!args.text) errors.push('text is required');
      if (!args.singleTitle) errors.push('singleTitle is required');
      if (!args.singleURL) errors.push('singleURL is required');
      break;
    case 'actionCard_multi':
      if (!args.title) errors.push('title is required');
      if (!args.text) errors.push('text is required');
      if (!args.btns || !Array.isArray(args.btns) || args.btns.length === 0)
        errors.push('btns (non-empty array) is required');
      if (args.btns && args.btns.length > 6)
        errors.push('actionCard_multi supports up to 6 buttons, got ' + args.btns.length);
      break;
    case 'file':
      if (!args.mediaId) errors.push('mediaId is required');
      if (!args.fileName) errors.push('fileName is required');
      if (!args.fileType) errors.push('fileType is required');
      break;
    case 'audio':
      if (!args.mediaId) errors.push('mediaId is required');
      if (args.duration == null) errors.push('duration (ms) is required');
      break;
    case 'video':
      if (!args.videoMediaId) errors.push('videoMediaId is required');
      if (!args.picMediaId) errors.push('picMediaId is required');
      if (args.duration == null) errors.push('duration (seconds) is required');
      break;
    default:
      errors.push(`Unknown msgtype: "${msgtype}". Must be one of: ${VALID_MSGTYPES.join(', ')}`);
  }
  if (errors.length > 0) throw new Error('Validation errors:\n  - ' + errors.join('\n  - '));
}

// --- Config loading ---

function loadConfigFile(): { appKey: string; appSecret: string } | null {
  try {
    const configPath = path.join(os.homedir(), '.dingtalk-mcp-config.json');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const data = JSON.parse(content);
      if (data.appKey && data.appSecret) {
        return data;
      }
    }
  } catch { /* ignore malformed config */ }
  return null;
}

// --- Server ---

class DingTalkMCPServer {
  private server: Server;
  private dingtalkClient: DingTalkClient | null = null;

  constructor() {
    this.server = new Server(
      { name: '钉钉机器人', version: '1.2.1' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'send_single_message',
          description:
            'Send a message to one or more DingTalk users (up to 20). ' +
            'Supports text, markdown, image, link, actionCard (single/multi button), file, audio, video. ' +
            'Recipients can be specified by userId, userIds[], or userName (exact match). ' +
            'Use upload_media first for image/file/audio/video to get a mediaId.',
          inputSchema: buildSingleMessageSchema() as Tool['inputSchema'],
        },
        {
          name: 'send_group_message',
          description:
            'Send a message to a DingTalk group chat. ' +
            'Supports text, markdown, image, link, actionCard (single/multi button), file, audio, video. ' +
            'Use upload_media first for image/file/audio/video to get a mediaId.',
          inputSchema: buildGroupMessageSchema() as Tool['inputSchema'],
        },
        {
          name: 'upload_media',
          description:
            'Upload a local media file to DingTalk and get a mediaId. ' +
            'Required before sending image, file, audio, or video messages. ' +
            'Supported file types: image (jpg/png/gif/bmp, max 20MB), ' +
            'voice (amr/mp3/wav, max 2MB), video (mp4, max 20MB), ' +
            'file (doc/docx/xls/xlsx/ppt/pptx/zip/pdf/rar, max 20MB).',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Absolute path to the local file to upload' },
              mediaType: {
                type: 'string',
                enum: ['image', 'voice', 'video', 'file'],
                description: 'Media type: image, voice, video, or file',
              },
            },
            required: ['filePath', 'mediaType'],
          },
        },
      ];
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.dingtalkClient) {
        throw new Error(
          'DingTalk client not initialized. Please configure DINGTALK_APP_KEY and DINGTALK_APP_SECRET environment variables.'
        );
      }

      const { name, arguments: args } = request.params;
      const a = (args || {}) as Record<string, any>;

      try {
        if (name === 'upload_media') {
          const { filePath, mediaType } = a;
          const result = await this.dingtalkClient.uploadMedia(filePath, mediaType);
          return {
            content: [{
              type: 'text',
              text: `File uploaded successfully.\nmediaId: ${result.mediaId}\ntype: ${result.type}\ncreatedAt: ${new Date(result.createdAt).toISOString()}\n\nUse this mediaId in send_single_message or send_group_message.`,
            }],
          };
        }

        if (name === 'send_single_message') {
          const msgtype = a.msgtype || 'text';
          validateMsgParams(msgtype, a);

          const targetUserIds = await resolveRecipients(a, this.dingtalkClient);
          if (!targetUserIds || targetUserIds.length === 0) {
            throw new Error('Must provide one of: userId, userIds (max 20), or userName.');
          }

          const result = await this.dingtalkClient.sendSingleMessage(targetUserIds, msgtype, a);
          return {
            content: [{
              type: 'text',
              text: `Message (type: ${msgtype}) sent successfully to ${targetUserIds.length} user(s): ${targetUserIds.join(', ')}.\nResponse: ${JSON.stringify(result)}`,
            }],
          };
        }

        if (name === 'send_group_message') {
          const { chatId } = a;
          const msgtype = a.msgtype || 'text';
          validateMsgParams(msgtype, a);

          const result = await this.dingtalkClient.sendGroupMessage(chatId, msgtype, a);
          return {
            content: [{
              type: 'text',
              text: `Message (type: ${msgtype}) sent successfully to group ${chatId}.\nResponse: ${JSON.stringify(result)}`,
            }],
          };
        }

        throw new Error(`Unknown tool: ${name}`);
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    let appKey = process.env.DINGTALK_APP_KEY;
    let appSecret = process.env.DINGTALK_APP_SECRET;

    // 回退：尝试从配置文件 ~/.dingtalk-mcp-config.json 读取
    if (!appKey || !appSecret) {
      const config = loadConfigFile();
      if (config) {
        appKey = config.appKey;
        appSecret = config.appSecret;
        console.error('[钉钉机器人] 已从 ~/.dingtalk-mcp-config.json 加载配置');
      }
    }

    if (!appKey || !appSecret) {
      console.error([
        '',
        '╔══════════════════════════════════════════════╗',
        '║     钉钉机器人 MCP — 缺少 AppKey/AppSecret   ║',
        '╠══════════════════════════════════════════════╣',
        '║                                              ║',
        '║  请选择以下任一方式完成配置：                 ║',
        '║                                              ║',
        '║  方式一：运行配置向导（推荐）                 ║',
        '║    cd 项目目录                                ║',
        '║    node dist/config-setup.js                  ║',
        '║                                              ║',
        '║  方式二：手动编辑 WorkBuddy 配置               ║',
        '║    打开 ~/.workbuddy/mcp.json                 ║',
        '║    找到 "钉钉机器人" 节点，添加 env：          ║',
        '║    "env": {                                   ║',
        '║      "DINGTALK_APP_KEY": "你的AppKey",        ║',
        '║      "DINGTALK_APP_SECRET": "你的AppSecret"   ║',
        '║    }                                         ║',
        '║                                              ║',
        '║  方式三：设置系统环境变量                     ║',
        '║    export DINGTALK_APP_KEY=你的AppKey         ║',
        '║    export DINGTALK_APP_SECRET=你的AppSecret   ║',
        '║                                              ║',
        '║  获取 AppKey/AppSecret：                      ║',
        '║    钉钉开放平台 → 应用开发 → 企业内部应用     ║',
        '║    → 凭证与基础信息                            ║',
        '║                                              ║',
        '║  配置完成后，重启 WorkBuddy 即可使用。         ║',
        '╚══════════════════════════════════════════════╝',
        '',
      ].join('\n'));
      process.exit(1);
    }

    this.dingtalkClient = new DingTalkClient({ appKey, appSecret });
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('钉钉机器人 MCP v1.2.2 running on stdio');
  }
}

const server = new DingTalkMCPServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

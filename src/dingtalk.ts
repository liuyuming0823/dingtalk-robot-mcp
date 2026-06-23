#!/usr/bin/env node
import axios from 'axios';
import fs from 'fs';

interface DingTalkConfig {
  appKey: string;
  appSecret: string;
}

interface BatchSendResponse {
  flowControlledStaffIdList: string[];
  invalidStaffIdList: string[];
  filteredStaffIdList: string[];
  processQueryKey: string;
}

interface UploadMediaResponse {
  mediaId: string;
  type: string;
  createdAt: number;
}

interface MsgParams {
  content?: string;
  title?: string;
  text?: string;
  photoURL?: string;
  messageUrl?: string;
  picUrl?: string;
  singleTitle?: string;
  singleURL?: string;
  btns?: { title: string; actionURL: string }[];
  btnOrientation?: string;
  mediaId?: string;
  fileName?: string;
  fileType?: string;
  duration?: number;
  videoMediaId?: string;
  videoType?: string;
  picMediaId?: string;
  width?: number;
  height?: number;
}

/**
 * msgKey constants for all supported DingTalk robot message types.
 */
export const MSG_KEYS: Record<string, string> = {
  text: 'sampleText',
  markdown: 'sampleMarkdown',
  image: 'sampleImageMsg',
  link: 'sampleLink',
  actionCard_single: 'sampleActionCard',
  actionCard_multi: 'sampleActionCard6',
  file: 'sampleFile',
  audio: 'sampleAudio',
  video: 'sampleVideo',
};

export function resolveMsgKey(msgtype: string, buttonCount?: number): string {
  if (msgtype === 'actionCard_multi') {
    const count = buttonCount || 2;
    if (count === 1) return MSG_KEYS.actionCard_single;
    if (count >= 2 && count <= 5) return `sampleActionCard${count}`;
    return 'sampleActionCard6';
  }
  return MSG_KEYS[msgtype] || msgtype;
}

export function buildMsgParam(msgtype: string, params: MsgParams): string {
  switch (msgtype) {
    case 'text':
      return JSON.stringify({ content: params.content });
    case 'markdown':
      return JSON.stringify({ title: params.title, text: params.text });
    case 'image':
      return JSON.stringify({ photoURL: params.photoURL });
    case 'link':
      return JSON.stringify({
        title: params.title,
        text: params.text,
        messageUrl: params.messageUrl,
        picUrl: params.picUrl || '',
      });
    case 'actionCard_single':
      return JSON.stringify({
        title: params.title,
        text: params.text,
        singleTitle: params.singleTitle,
        singleURL: params.singleURL,
        btnOrientation: params.btnOrientation || '0',
      });
    case 'actionCard_multi':
      return JSON.stringify({
        title: params.title,
        text: params.text,
        btns: params.btns,
        btnOrientation: params.btnOrientation || '0',
      });
    case 'file':
      return JSON.stringify({
        mediaId: params.mediaId,
        fileName: params.fileName,
        fileType: params.fileType,
      });
    case 'audio':
      return JSON.stringify({
        mediaId: params.mediaId,
        duration: String(params.duration),
      });
    case 'video':
      return JSON.stringify({
        videoMediaId: params.videoMediaId,
        videoType: params.videoType || 'mp4',
        picMediaId: params.picMediaId,
        duration: String(params.duration),
        height: params.height || 400,
        width: params.width || 600,
      });
    default:
      throw new Error(`Unknown message type: ${msgtype}`);
  }
}

export class DingTalkClient {
  private config: DingTalkConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private userCache: Map<string, Set<string>> | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000;

  constructor(config: DingTalkConfig) {
    this.config = config;
  }

  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken;
    }
    try {
      const response = await axios.post(
        'https://api.dingtalk.com/v1.0/oauth2/accessToken',
        { appKey: this.config.appKey, appSecret: this.config.appSecret }
      );
      this.accessToken = response.data.accessToken;
      this.tokenExpiry = now + (response.data.expireIn - 300) * 1000;
      return this.accessToken;
    } catch {
      const oldResponse = await axios.get('https://oapi.dingtalk.com/gettoken', {
        params: { appkey: this.config.appKey, appsecret: this.config.appSecret },
      });
      if (oldResponse.data.errcode !== 0) {
        throw new Error(`Failed to get access token: ${oldResponse.data.errmsg}`);
      }
      this.accessToken = oldResponse.data.access_token;
      this.tokenExpiry = now + (oldResponse.data.expires_in - 300) * 1000;
      return this.accessToken;
    }
  }

  async buildUserCache(): Promise<Map<string, Set<string>>> {
    const now = Date.now();
    if (this.userCache && now < this.cacheTime + this.CACHE_TTL) {
      return this.userCache;
    }

    const token = await this.getAccessToken();
    const deptRes = await axios.get('https://oapi.dingtalk.com/department/list', {
      params: { access_token: token },
    });
    if (deptRes.data.errcode !== 0) {
      throw new Error(`Failed to get department list: ${JSON.stringify(deptRes.data)}`);
    }

    const allDepts: { id: number; name: string }[] = deptRes.data.department;
    const nameMap = new Map<string, Set<string>>();

    const CONCURRENCY = 10;
    for (let i = 0; i < allDepts.length; i += CONCURRENCY) {
      const batch = allDepts.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(dept =>
          axios.get('https://oapi.dingtalk.com/user/simplelist', {
            params: { access_token: token, department_id: dept.id },
          })
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.data.errcode === 0 && r.value.data.userlist) {
          for (const u of r.value.data.userlist) {
            if (!nameMap.has(u.name)) {
              nameMap.set(u.name, new Set());
            }
            nameMap.get(u.name)!.add(u.userid);
          }
        }
      }
    }

    this.userCache = nameMap;
    this.cacheTime = now;
    return this.userCache;
  }

  async searchUserByName(userName: string): Promise<string[]> {
    const cache = await this.buildUserCache();
    const userIds = cache.get(userName);
    if (!userIds || userIds.size === 0) return [];
    return Array.from(userIds);
  }

  async sendSingleMessage(
    userIds: string[],
    msgtype: string,
    msgParams: MsgParams
  ): Promise<BatchSendResponse> {
    const accessToken = await this.getAccessToken();
    const msgKey = resolveMsgKey(msgtype, msgParams.btns?.length);
    const msgParam = buildMsgParam(msgtype, msgParams);
    try {
      const response = await axios.post<BatchSendResponse>(
        'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
        {
          robotCode: this.config.appKey,
          userIds,
          msgKey,
          msgParam,
        },
        { headers: { 'x-acs-dingtalk-access-token': accessToken } }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(`Error sending single message: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Error sending single message: ${error.message}`);
    }
  }

  async sendGroupMessage(
    chatId: string,
    msgtype: string,
    msgParams: MsgParams
  ): Promise<Record<string, any>> {
    const accessToken = await this.getAccessToken();
    const msgKey = resolveMsgKey(msgtype, msgParams.btns?.length);
    const msgParam = buildMsgParam(msgtype, msgParams);
    try {
      const response = await axios.post(
        'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
        {
          robotCode: this.config.appKey,
          openConversationId: chatId,
          msgKey,
          msgParam,
        },
        { headers: { 'x-acs-dingtalk-access-token': accessToken } }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        throw new Error(`Error sending group message: ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Error sending group message: ${error.message}`);
    }
  }

  async uploadMedia(filePath: string, mediaType: string): Promise<UploadMediaResponse> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const validTypes = ['image', 'voice', 'video', 'file'];
    if (!validTypes.includes(mediaType)) {
      throw new Error(
        `Invalid media type: "${mediaType}". Must be one of: ${validTypes.join(', ')}`
      );
    }

    const ext = filePath.split('.').pop()!.toLowerCase();
    const extMap: Record<string, string[]> = {
      image: ['jpg', 'jpeg', 'gif', 'png', 'bmp'],
      voice: ['amr', 'mp3', 'wav'],
      video: ['mp4'],
      file: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'pdf', 'rar'],
    };
    if (!extMap[mediaType].includes(ext)) {
      throw new Error(
        `File extension ".${ext}" not allowed for type "${mediaType}". ` +
        `Allowed: ${extMap[mediaType].join(', ')}`
      );
    }

    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    const sizeLimits: Record<string, number> = { image: 20, voice: 2, video: 20, file: 20 };
    if (sizeMB > sizeLimits[mediaType]) {
      throw new Error(
        `File size ${sizeMB.toFixed(1)}MB exceeds limit of ${sizeLimits[mediaType]}MB for type "${mediaType}"`
      );
    }

    const accessToken = await this.getAccessToken();

    const formData = new FormData();
    const fileBuffer = await fs.promises.readFile(filePath);
    const fileName = filePath.split(/[/\\]/).pop()!;
    const blob = new Blob([fileBuffer]);
    formData.append('media', blob, fileName);
    formData.append('type', mediaType);

    try {
      const response = await fetch(
        `https://oapi.dingtalk.com/media/upload?access_token=${accessToken}`,
        { method: 'POST', body: formData }
      );
      const data: any = await response.json();

      if (data.errcode !== 0) {
        throw new Error(`Upload failed: ${data.errmsg} (errcode: ${data.errcode})`);
      }

      return {
        mediaId: data.media_id,
        type: data.type,
        createdAt: data.created_at,
      };
    } catch (error: any) {
      if (error.message?.startsWith('Upload')) throw error;
      throw new Error(`Upload media error: ${error.message}`);
    }
  }
}

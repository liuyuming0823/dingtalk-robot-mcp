#!/usr/bin/env node
import axios from 'axios';

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

export class DingTalkClient {
  private config: DingTalkConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private userCache: Map<string, Set<string>> | null = null;
  private cacheTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
      // Fallback to old oapi
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

  /**
   * Build/refresh the user cache by iterating all departments.
   * Requires: qyapi_get_department_list + qyapi_get_member
   * Returns a Map of userName → Set<userId>
   */
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

    // Fetch users from all departments in parallel with concurrency limit
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

  /**
   * Search users by exact name via department enumeration.
   * Returns array of userId strings.
   */
  async searchUserByName(userName: string): Promise<string[]> {
    const cache = await this.buildUserCache();
    const userIds = cache.get(userName);
    if (!userIds || userIds.size === 0) {
      return [];
    }
    return Array.from(userIds);
  }

  /**
   * Batch send single chat messages via robot.
   * API: POST /v1.0/robot/oToMessages/batchSend (max 20 users)
   */
  async sendSingleMessage(userIds: string[], content: string): Promise<BatchSendResponse> {
    const accessToken = await this.getAccessToken();
    try {
      const response = await axios.post<BatchSendResponse>(
        'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
        {
          robotCode: this.config.appKey,
          userIds: userIds,
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content }),
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

  /**
   * Send group chat message via robot.
   * API: POST /v1.0/robot/groupMessages/send
   */
  async sendGroupMessage(chatId: string, content: string): Promise<Record<string, any>> {
    const accessToken = await this.getAccessToken();
    try {
      const response = await axios.post(
        'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
        {
          robotCode: this.config.appKey,
          openConversationId: chatId,
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content }),
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
}

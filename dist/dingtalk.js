#!/usr/bin/env node
import axios from 'axios';

export class DingTalkClient {
    config;
    accessToken = null;
    tokenExpiry = 0;
    // Cache: { userId -> name } and { name -> [userId] }
    userCache = null;
    cacheTime = 0;
    CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    constructor(config) {
        this.config = config;
    }

    async getAccessToken() {
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
        } catch (error) {
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
     * Returns a Map of userName -> [userId, ...]
     */
    async buildUserCache() {
        const now = Date.now();
        if (this.userCache && now < this.cacheTime + this.CACHE_TTL) {
            return this.userCache;
        }

        const token = await this.getAccessToken();
        // Use old oapi: requires qyapi_get_department_list + qyapi_get_member
        const deptRes = await axios.get('https://oapi.dingtalk.com/department/list', {
            params: { access_token: token },
        });
        if (deptRes.data.errcode !== 0) {
            throw new Error(`Failed to get department list: ${JSON.stringify(deptRes.data)}`);
        }

        const allDepts = deptRes.data.department;
        const nameMap = new Map(); // name -> Set<userId>

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
                        nameMap.get(u.name).add(u.userid);
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
    async searchUserByName(userName) {
        const cache = await this.buildUserCache();
        const userIds = cache.get(userName);
        if (!userIds || userIds.size === 0) {
            return [];
        }
        return Array.from(userIds);
    }

    /**
     * Batch send single chat messages to users (max 20).
     */
    async sendSingleMessage(userIds, content) {
        const accessToken = await this.getAccessToken();
        try {
            const response = await axios.post(
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
        } catch (error) {
            if (error.response?.data) {
                throw new Error(`Error sending single message: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error sending single message: ${error.message}`);
        }
    }

    async sendGroupMessage(chatId, content) {
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
        } catch (error) {
            if (error.response?.data) {
                throw new Error(`Error sending group message: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error sending group message: ${error.message}`);
        }
    }
}

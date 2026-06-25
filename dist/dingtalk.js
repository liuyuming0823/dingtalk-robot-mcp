#!/usr/bin/env node
import axios from 'axios';
import fs from 'fs';
/**
 * msgKey constants for all supported DingTalk robot message types.
 */
export const MSG_KEYS = {
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
export function resolveMsgKey(msgtype, buttonCount) {
    if (msgtype === 'actionCard_multi') {
        const count = buttonCount || 2;
        if (count === 1)
            return MSG_KEYS.actionCard_single;
        if (count >= 2 && count <= 5)
            return `sampleActionCard${count}`;
        return 'sampleActionCard6';
    }
    return MSG_KEYS[msgtype] || msgtype;
}
export function buildMsgParam(msgtype, params) {
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
    config;
    // 新 API（api.dingtalk.com）token → 用于机器人消息发送
    newApiToken = null;
    newApiTokenExpiry = 0;
    // 旧 API（oapi.dingtalk.com）token → 用于通讯录查询、媒体上传
    oldApiToken = null;
    oldApiTokenExpiry = 0;
    userCache = null;
    cacheTime = 0;
    CACHE_TTL = 5 * 60 * 1000;
    constructor(config) {
        this.config = config;
    }
    /** 获取新 API token（api.dingtalk.com/v1.0/oauth2/accessToken） */
    async getNewApiToken() {
        const now = Date.now();
        if (this.newApiToken && now < this.newApiTokenExpiry) {
            return this.newApiToken;
        }
        const response = await axios.post('https://api.dingtalk.com/v1.0/oauth2/accessToken', { appKey: this.config.appKey, appSecret: this.config.appSecret });
        this.newApiToken = response.data.accessToken;
        this.newApiTokenExpiry = now + (response.data.expireIn - 300) * 1000;
        return this.newApiToken;
    }
    /** 获取旧 API token（oapi.dingtalk.com/gettoken） */
    async getOldApiToken() {
        const now = Date.now();
        if (this.oldApiToken && now < this.oldApiTokenExpiry) {
            return this.oldApiToken;
        }
        const response = await axios.get('https://oapi.dingtalk.com/gettoken', {
            params: { appkey: this.config.appKey, appsecret: this.config.appSecret },
        });
        if (response.data.errcode !== 0) {
            throw new Error(`Failed to get old API token: ${response.data.errmsg}`);
        }
        this.oldApiToken = response.data.access_token;
        this.oldApiTokenExpiry = now + (response.data.expires_in - 300) * 1000;
        return this.oldApiToken;
    }
    /**
     * 使用旧 API（oapi.dingtalk.com）构建用户缓存。
     * 这是官方文档明确支持的接口，新 API 暂无对应的通讯录查询接口。
     */
    async buildUserCacheFromOldApi() {
        const token = await this.getOldApiToken();
        // 获取所有部门
        const deptRes = await axios.get('https://oapi.dingtalk.com/department/list', {
            params: { access_token: token },
        });
        if (deptRes.data.errcode !== 0) {
            throw new Error(`Failed to get department list: ${JSON.stringify(deptRes.data)}`);
        }
        const allDepts = deptRes.data.department;
        const nameMap = new Map();
        // 并发获取每个部门的用户列表（每批10个部门）
        for (let i = 0; i < allDepts.length; i += 10) {
            const batch = allDepts.slice(i, i + 10);
            const results = await Promise.allSettled(batch.map(dept => axios.get('https://oapi.dingtalk.com/user/simplelist', {
                params: { access_token: token, department_id: dept.id },
            })));
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value.data.errcode === 0 && r.value.data.userlist) {
                    for (const u of r.value.data.userlist) {
                        if (!nameMap.has(u.name))
                            nameMap.set(u.name, new Set());
                        nameMap.get(u.name).add(u.userid);
                    }
                }
            }
        }
        return nameMap;
    }
    async buildUserCache() {
        const now = Date.now();
        if (this.userCache && now < this.cacheTime + this.CACHE_TTL) {
            return this.userCache;
        }
        this.userCache = await this.buildUserCacheFromOldApi();
        this.cacheTime = now;
        return this.userCache;
    }
    async searchUserByName(userName) {
        const cache = await this.buildUserCache();
        const userIds = cache.get(userName);
        if (!userIds || userIds.size === 0)
            return [];
        return Array.from(userIds);
    }
    async sendSingleMessage(userIds, msgtype, msgParams) {
        const accessToken = await this.getNewApiToken();
        const msgKey = resolveMsgKey(msgtype, msgParams.btns?.length);
        const msgParam = buildMsgParam(msgtype, msgParams);
        try {
            const response = await axios.post('https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend', {
                robotCode: this.config.appKey,
                userIds,
                msgKey,
                msgParam,
            }, { headers: { 'x-acs-dingtalk-access-token': accessToken } });
            return response.data;
        }
        catch (error) {
            if (error.response?.data) {
                throw new Error(`Error sending single message: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error sending single message: ${error.message}`);
        }
    }
    async sendGroupMessage(chatId, msgtype, msgParams) {
        const accessToken = await this.getNewApiToken();
        const msgKey = resolveMsgKey(msgtype, msgParams.btns?.length);
        const msgParam = buildMsgParam(msgtype, msgParams);
        try {
            const response = await axios.post('https://api.dingtalk.com/v1.0/robot/groupMessages/send', {
                robotCode: this.config.appKey,
                openConversationId: chatId,
                msgKey,
                msgParam,
            }, { headers: { 'x-acs-dingtalk-access-token': accessToken } });
            return response.data;
        }
        catch (error) {
            if (error.response?.data) {
                throw new Error(`Error sending group message: ${JSON.stringify(error.response.data)}`);
            }
            throw new Error(`Error sending group message: ${error.message}`);
        }
    }
    async uploadMedia(filePath, mediaType) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }
        const validTypes = ['image', 'voice', 'video', 'file'];
        if (!validTypes.includes(mediaType)) {
            throw new Error(`Invalid media type: "${mediaType}". Must be one of: ${validTypes.join(', ')}`);
        }
        const ext = filePath.split('.').pop().toLowerCase();
        const extMap = {
            image: ['jpg', 'jpeg', 'gif', 'png', 'bmp'],
            voice: ['amr', 'mp3', 'wav'],
            video: ['mp4'],
            file: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'pdf', 'rar'],
        };
        if (!extMap[mediaType].includes(ext)) {
            throw new Error(`File extension ".${ext}" not allowed for type "${mediaType}". ` +
                `Allowed: ${extMap[mediaType].join(', ')}`);
        }
        const stats = fs.statSync(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        const sizeLimits = { image: 20, voice: 2, video: 20, file: 20 };
        if (sizeMB > sizeLimits[mediaType]) {
            throw new Error(`File size ${sizeMB.toFixed(1)}MB exceeds limit of ${sizeLimits[mediaType]}MB for type "${mediaType}"`);
        }
        // 媒体上传使用旧 API（oapi.dingtalk.com/media/upload）
        // 这是钉钉官方文档指定的接口，新 API 暂无对应接口
        const accessToken = await this.getOldApiToken();
        const formData = new FormData();
        const fileBuffer = await fs.promises.readFile(filePath);
        const fileName = filePath.split(/[/\\]/).pop();
        const blob = new Blob([fileBuffer]);
        formData.append('media', blob, fileName);
        formData.append('type', mediaType);
        try {
            const response = await fetch(`https://oapi.dingtalk.com/media/upload?access_token=${accessToken}`, { method: 'POST', body: formData });
            const data = await response.json();
            if (data.errcode !== 0) {
                throw new Error(`Upload failed: ${data.errmsg} (errcode: ${data.errcode})`);
            }
            return {
                mediaId: data.media_id,
                type: data.type,
                createdAt: data.created_at,
            };
        }
        catch (error) {
            if (error.message?.startsWith('Upload'))
                throw error;
            throw new Error(`Upload media error: ${error.message}`);
        }
    }
}

#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DingTalkClient } from './dingtalk.js';

class DingTalkMCPServer {
    server;
    dingtalkClient = null;

    constructor() {
        this.server = new Server(
            {
                name: 'dingtalk-mcp-server',
                version: '1.1.0',
            },
            {
                capabilities: { tools: {} },
            }
        );
        this.setupHandlers();
        this.setupErrorHandling();
    }

    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [
                {
                    name: 'send_dingtalk_single_message',
                    description:
                        'Send a single chat message to one or more DingTalk users (up to 20). ' +
                        'You can specify recipients by userId (single), userIds (array, max 20), or userName (exact name match). ' +
                        'When using userName, if multiple users share the same name, the send will fail with a duplicate error.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            userId: {
                                type: 'string',
                                description: 'Single DingTalk user ID to send message to',
                            },
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
                            content: {
                                type: 'string',
                                description: 'Message content to send',
                            },
                        },
                        required: ['content'],
                    },
                },
                {
                    name: 'send_dingtalk_group_message',
                    description: 'Send a group chat message to a DingTalk group',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            chatId: {
                                type: 'string',
                                description: 'DingTalk group chat ID (openConversationId)',
                            },
                            content: {
                                type: 'string',
                                description: 'Message content to send',
                            },
                        },
                        required: ['chatId', 'content'],
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
            try {
                if (name === 'send_dingtalk_single_message') {
                    const { userId, userIds, userName, content } = args;

                    // Determine target user IDs
                    let targetUserIds = [];

                    if (userId) {
                        targetUserIds = [userId];
                    } else if (userIds && userIds.length > 0) {
                        if (userIds.length > 20) {
                            throw new Error(
                                `Maximum 20 users allowed per batch, got ${userIds.length}. Please split into multiple batches.`
                            );
                        }
                        targetUserIds = userIds;
                    } else if (userName) {
                        const foundUserIds = await this.dingtalkClient.searchUserByName(userName);
                        if (foundUserIds.length === 0) {
                            throw new Error(
                                `User "${userName}" not found in the organization. Please check the name and try again.`
                            );
                        }
                        if (foundUserIds.length > 1) {
                            throw new Error(
                                `Multiple users found with name "${userName}" (${foundUserIds.length} duplicates). Found userIds: ${foundUserIds.join(', ')}. Please use userId to specify the exact recipient.`
                            );
                        }
                        targetUserIds = [foundUserIds[0]];
                    } else {
                        throw new Error(
                            'Must provide one of: userId (single user), userIds (array, max 20), or userName (exact name match).'
                        );
                    }

                    if (!content) {
                        throw new Error('Message content is required.');
                    }

                    const result = await this.dingtalkClient.sendSingleMessage(targetUserIds, content);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Message sent successfully to ${targetUserIds.length} user(s): ${targetUserIds.join(', ')}. Response: ${JSON.stringify(result)}`,
                            },
                        ],
                    };
                }
                if (name === 'send_dingtalk_group_message') {
                    const { chatId, content } = args;
                    const result = await this.dingtalkClient.sendGroupMessage(chatId, content);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Message sent successfully to group ${chatId}. Response: ${JSON.stringify(result)}`,
                            },
                        ],
                    };
                }
                throw new Error(`Unknown tool: ${name}`);
            } catch (error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    setupErrorHandling() {
        this.server.onerror = (error) => {
            console.error('[MCP Error]', error);
        };
        process.on('SIGINT', async () => {
            await this.server.close();
            process.exit(0);
        });
    }

    async run() {
        const appKey = process.env.DINGTALK_APP_KEY;
        const appSecret = process.env.DINGTALK_APP_SECRET;
        if (!appKey || !appSecret) {
            console.error('Error: DINGTALK_APP_KEY and DINGTALK_APP_SECRET environment variables are required');
            process.exit(1);
        }
        this.dingtalkClient = new DingTalkClient({ appKey, appSecret });
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('DingTalk MCP server running on stdio');
    }
}

const server = new DingTalkMCPServer();
server.run().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

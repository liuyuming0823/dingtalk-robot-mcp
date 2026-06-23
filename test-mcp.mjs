#!/usr/bin/env node
// 简单测试脚本 - 验证钉钉MCP服务器基本功能

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMCP() {
  console.log('🧪 开始测试 DingTalk MCP Server...\n');

  // 检查环境变量
  const appKey = process.env.DINGTALK_APP_KEY;
  const appSecret = process.env.DINGTALK_APP_SECRET;

  if (!appKey || !appSecret) {
    console.error('❌ 错误：请先设置环境变量');
    console.error('   DINGTALK_APP_KEY 和 DINGTALK_APP_SECRET 必须设置\n');
    console.error('设置方法（Windows CMD）：');
    console.error('  set DINGTALK_APP_KEY=你的AppKey');
    console.error('  set DINGTALK_APP_SECRET=你的AppSecret');
    console.error('  set DINGTALK_AGENT_ID=你的AgentId\n');
    process.exit(1);
  }

  console.log('✅ 环境变量检查通过');
  console.log(`   AppKey: ${appKey.substring(0, 10)}...`);
  console.log(`   AppSecret: ${appSecret.substring(0, 10)}...`);
  if (process.env.DINGTALK_AGENT_ID) {
    console.log(`   AgentId: ${process.env.DINGTALK_AGENT_ID}`);
  }
  console.log('');

  // 启动 MCP 服务器
  console.log('🚀 正在启动 MCP 服务器...\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, '..', 'dist', 'index.js')],
    env: {
      DINGTALK_APP_KEY: appKey,
      DINGTALK_APP_SECRET: appSecret,
      DINGTALK_AGENT_ID: process.env.DINGTALK_AGENT_ID || '',
    },
  });

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    await client.connect(transport);
    console.log('✅ MCP 服务器连接成功\n');

    // 测试 1：列出可用工具
    console.log('📋 测试 1：列出可用工具');
    const toolsResult = await client.listTools();
    console.log(`   找到 ${toolsResult.tools.length} 个工具：`);
    toolsResult.tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // 测试 2：显示工具详细信息
    console.log('📖 测试 2：工具详细信息');
    toolsResult.tools.forEach((tool) => {
      console.log(`\n   工具名称: ${tool.name}`);
      console.log(`   描述: ${tool.description}`);
      console.log(`   参数:`);
      if (tool.inputSchema && tool.inputSchema.properties) {
        Object.entries(tool.inputSchema.properties).forEach(([key, value]: [string, any]) => {
          const required = tool.inputSchema.required?.includes(key) ? '(必需)' : '(可选)';
          console.log(`      - ${key} ${required}: ${value.description || value.type}`);
        });
      }
    });
    console.log('');

    // 测试 3：尝试调用工具（需要真实的用户ID）
    console.log('⚠️  测试 3：工具调用测试（需要真实的钉钉用户ID）');
    console.log('   这个功能需要真实的钉钉账号，暂时跳过');
    console.log('   你可以在 WorkBuddy 中配置后进行实际测试\n');

    console.log('✅ 所有测试通过！MCP 服务器工作正常');
    console.log('\n📋 下一步：');
    console.log('   1. 配置到 WorkBuddy (~/.workbuddy/mcp.json)');
    console.log('   2. 重启 WorkBuddy');
    console.log('   3. 在 WorkBuddy 中测试发送消息');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

testMCP().catch((error) => {
  console.error('❌ 未预期的错误:', error);
  process.exit(1);
});

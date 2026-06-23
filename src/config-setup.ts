#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InquirerAnswers {
  appKey: string;
  appSecret: string;
  configureWorkBuddy: boolean;
}

async function main() {
  console.log('🚀 钉钉机器人 MCP 配置向导\n');

  const answers: InquirerAnswers = await inquirer.prompt([
    {
      type: 'input',
      name: 'appKey',
      message: '请输入钉钉应用的 AppKey:',
      validate: (input: string) => input.length > 0 || 'AppKey 不能为空',
    },
    {
      type: 'password',
      name: 'appSecret',
      message: '请输入钉钉应用的 AppSecret:',
      validate: (input: string) => input.length > 0 || 'AppSecret 不能为空',
    },
    {
      type: 'confirm',
      name: 'configureWorkBuddy',
      message: '是否要自动配置到 WorkBuddy?',
      default: true,
    },
  ]);

  // Create MCP config
  const mcpConfig: any = {
    mcpServers: {
      dingtalk: {
        command: 'node',
        args: [path.join(__dirname, '..', 'dist', 'index.js')],
        env: {
          DINGTALK_APP_KEY: answers.appKey,
          DINGTALK_APP_SECRET: answers.appSecret,
        },
      },
    },
  };

  // Save config to file
  const configPath = path.join(process.cwd(), 'dingtalk-mcp-config.json');
  fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
  
  console.log(`\n✅ 配置文件已保存到: ${configPath}`);
  console.log('\n配置内容:');
  console.log(JSON.stringify(mcpConfig, null, 2));

  // Configure WorkBuddy if requested
  if (answers.configureWorkBuddy) {
    const homeDir = process.platform === 'win32' 
      ? process.env.USERPROFILE 
      : process.env.HOME;
    
    if (!homeDir) {
      console.error('\n❌ 无法获取用户主目录');
      return;
    }

    const workbuddyConfigPath = path.join(homeDir, '.workbuddy', 'mcp.json');
    
    try {
      let workbuddyConfig: any = { mcpServers: {} };
      
      if (fs.existsSync(workbuddyConfigPath)) {
        const configContent = fs.readFileSync(workbuddyConfigPath, 'utf-8');
        workbuddyConfig = JSON.parse(configContent);
        if (!workbuddyConfig.mcpServers) {
          workbuddyConfig.mcpServers = {};
        }
      }

      // Merge config
      workbuddyConfig.mcpServers.dingtalk = mcpConfig.mcpServers.dingtalk;

      // Create backup
      if (fs.existsSync(workbuddyConfigPath)) {
        fs.copyFileSync(workbuddyConfigPath, `${workbuddyConfigPath}.backup`);
        console.log(`\n📦 已备份现有配置到: ${workbuddyConfigPath}.backup`);
      }

      // Write new config
      fs.writeFileSync(workbuddyConfigPath, JSON.stringify(workbuddyConfig, null, 2));
      console.log(`\n✅ 已成功配置到 WorkBuddy: ${workbuddyConfigPath}`);
      console.log('\n⚠️  请重启 WorkBuddy 以加载新配置！');
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ 配置 WorkBuddy 失败: ${errorMessage}`);
      console.log('\n请手动将以下配置添加到 ~/.workbuddy/mcp.json:');
      console.log(JSON.stringify(mcpConfig, null, 2));
    }
  } else {
    console.log('\n📋 请手动将以下配置添加到 ~/.workbuddy/mcp.json:');
    console.log(JSON.stringify(mcpConfig, null, 2));
  }

  console.log('\n📌 下一步：开通钉钉应用权限');
  console.log('  ' + '─'.repeat(50));
  console.log('  如需使用「按姓名发送」功能，请在钉钉开放平台为应用开通以下权限：');
  console.log('');
  console.log('  1. 企业通讯录部门信息读权限 (qyapi_get_department_list)');
  console.log('     → 权限管理 → 搜索 "通讯录" → "通讯录部门信息读权限"');
  console.log('');
  console.log('  2. 企业通讯录成员信息读权限 (qyapi_get_member)');
  console.log('     → 权限管理 → 搜索 "通讯录" → "通讯录成员信息读权限"');
  console.log('');
  console.log('  仅使用 userId 发送则无需上述权限，只需确保应用有');
  console.log('  "企业机器人消息推送" 权限即可。');
  console.log('  ' + '─'.repeat(50));

  console.log('\n🎉 配置完成！');
  console.log('\n📚 更多信息请查看 README.md');
}

main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('配置失败:', errorMessage);
  process.exit(1);
});

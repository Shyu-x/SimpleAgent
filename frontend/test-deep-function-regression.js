const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const OUTPUT_DIR = path.join(__dirname, 'test-screenshots');
const timestamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function skipGuideIfVisible(page) {
  const skipButton = page.getByRole('button', { name: '跳过引导' });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
    await page.waitForTimeout(500);
  }
}

async function readChatState(page) {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem('ai-chat-storage');
    return raw ? JSON.parse(raw) : null;
  });
}

async function readToolState(page) {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem('tool-marketplace-state');
    return raw ? JSON.parse(raw) : null;
  });
}

async function openModelSelector(page) {
  const modelButton = page
    .locator('button')
    .filter({ hasText: /MiniMax M2\.5 高速|GPT-4o|GPT-4o Mini|DeepSeek Chat|Claude Sonnet 4/ })
    .first();
  await modelButton.click();
}

async function selectModel(page, optionName) {
  await openModelSelector(page);
  await page.getByRole('button', { name: optionName }).click();
  await page.waitForTimeout(500);
}

async function sendMessage(page, text) {
  const input = page.getByPlaceholder('发送消息...');
  await input.click();
  await input.fill(text);
  await input.press('Control+Enter');
}

async function openMemoryPanel(page) {
  await page.getByRole('button', { name: '记忆' }).click();
  await page.getByRole('button', { name: /^会话笔记$/ }).waitFor({ state: 'visible' });
  await page.getByTestId('session-memory-count').waitFor({ state: 'visible' });
}

async function closeMemoryPanel(page) {
  const closeButton = page.getByRole('button', { name: '关闭记忆面板' });
  if (await closeButton.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await closeButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

async function switchMemoryTab(page, name) {
  await page.getByRole('button', { name: new RegExp(`^${name}$`) }).click();
  await page.waitForTimeout(250);
}

async function openToolMarket(page) {
  await page.getByRole('button', { name: '工具' }).click();
  await page.getByText('工具市场').waitFor({ state: 'visible' });
}

async function closeToolMarket(page) {
  const closeButton = page.getByRole('button', { name: '关闭工具市场面板' });
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await page.waitForTimeout(300);
  }
}

async function run() {
  ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  const results = [];

  async function check(name, fn) {
    try {
      await fn();
      results.push({ name, status: 'pass' });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, status: 'fail', error: error instanceof Error ? error.message : String(error) });
      console.error(`FAIL ${name}:`, error);
    }
  }

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await skipGuideIfVisible(page);

    await check('模型切换同步 baseURL', async () => {
      await selectModel(page, 'GPT-4o OpenAI');
      const state = await readChatState(page);
      if (!state?.state?.apiConfig) {
        throw new Error('未读取到 apiConfig');
      }
      if (state.state.apiConfig.model !== 'gpt-4o') {
        throw new Error(`model 未更新，当前=${state.state.apiConfig.model}`);
      }
      if (state.state.apiConfig.baseURL !== 'https://api.openai.com/v1') {
        throw new Error(`baseURL 未同步，当前=${state.state.apiConfig.baseURL}`);
      }
    });

    await check('OpenAI 模型真实请求走对应 provider', async () => {
      await sendMessage(page, '只回复: UI_OPENAI');
      await page.getByText('API Key for openai is not configured on the server').waitFor({ timeout: 15000 });
    });

    await check('MiniMax 模型真实请求可返回结果', async () => {
      await selectModel(page, 'MiniMax M2.5 高速 MiniMax');
      await sendMessage(page, '只回复: UI_MINIMAX_OK');
      await page.getByText('UI_MINIMAX_OK').waitFor({ timeout: 30000 });
      const state = await readChatState(page);
      const messages = state?.state?.conversations?.[0]?.messages || [];
      if (!messages.some((message) => message.content && message.content.includes('UI_MINIMAX_OK'))) {
        throw new Error('会话状态中未找到 MiniMax 返回内容');
      }
    });

    await check('设置在刷新后保留当前会话配置', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await skipGuideIfVisible(page);
      const state = await readChatState(page);
      if (state?.state?.apiConfig?.model !== 'MiniMax-M2.5-highspeed') {
        throw new Error(`刷新后模型未保留，当前=${state?.state?.apiConfig?.model}`);
      }
      await page.getByRole('button', { name: 'MiniMax M2.5 高速' }).waitFor({ timeout: 5000 });
    });

    await check('记忆面板会话笔记与全局记忆写入会话存储', async () => {
      await openMemoryPanel(page);

      try {
        const sessionInput = page.getByPlaceholder('添加会话笔记...');
        await sessionInput.fill('回归笔记-session-note');
        await sessionInput.press('Control+Enter');
        await page.getByText('会话笔记已添加').waitFor({ timeout: 5000 });
        await page.getByTestId('session-memory-list').getByText('回归笔记-session-note').waitFor({ timeout: 5000 });

        await switchMemoryTab(page, '全局记忆');
        await page.getByPlaceholder('添加全局记忆（跨会话共享）...').fill('回归记忆-global-memory');
        await page.getByRole('button', { name: '添加到全局记忆' }).click();
        await page.getByText('全局记忆已添加').waitFor({ timeout: 5000 });
        await page.getByTestId('global-memory-list').getByText('回归记忆-global-memory').waitFor({ timeout: 5000 });

        const state = await readChatState(page);
        const activeId = state?.state?.activeConversationId;
        const activeConversation = state?.state?.conversations?.find((conversation) => conversation.id === activeId);
        const notes = activeConversation?.notes || [];
        const globals = state?.state?.globalMemories || [];

        if (!notes.some((note) => note.content === '回归笔记-session-note')) {
          throw new Error('session note 未写入 conversations.notes');
        }
        if (!globals.some((memory) => memory.content === '回归记忆-global-memory')) {
          throw new Error('global memory 未写入 globalMemories');
        }
      } finally {
        await closeMemoryPanel(page);
      }

      await page.reload({ waitUntil: 'networkidle' });
      await skipGuideIfVisible(page);
      await openMemoryPanel(page);
      await page.getByTestId('session-memory-list').getByText('回归笔记-session-note').waitFor({ timeout: 5000 });
      await switchMemoryTab(page, '全局记忆');
      await page.getByTestId('global-memory-list').getByText('回归记忆-global-memory').waitFor({ timeout: 5000 });
      const reloadedState = await readChatState(page);
      const reloadedActiveId = reloadedState?.state?.activeConversationId;
      const reloadedConversation = reloadedState?.state?.conversations?.find((conversation) => conversation.id === reloadedActiveId);
      const reloadedNotes = reloadedConversation?.notes || [];
      const reloadedGlobals = reloadedState?.state?.globalMemories || [];
      if (!reloadedNotes.some((note) => note.content === '回归笔记-session-note')) {
        throw new Error('刷新后 session note 未恢复');
      }
      if (!reloadedGlobals.some((memory) => memory.content === '回归记忆-global-memory')) {
        throw new Error('刷新后 global memory 未恢复');
      }
      await closeMemoryPanel(page);
    });

    await check('工具市场安装状态在当前会话内持久化', async () => {
      await closeMemoryPanel(page);
      await openToolMarket(page);
      try {
        await page.getByPlaceholder('搜索工具...').fill('Database Connector');
        const installButton = page.getByRole('button', { name: '安装' }).first();
        await installButton.click();
        await page.getByRole('button', { name: '启用' }).first().waitFor({ timeout: 8000 });

        const toolState = await readToolState(page);
        const dbTool = toolState?.find((tool) => tool.id === 'database-connector');
        if (!dbTool || dbTool.status !== 'installed') {
          throw new Error(`工具状态未持久化到 sessionStorage，当前=${dbTool?.status}`);
        }
      } finally {
        await closeToolMarket(page);
      }

      await page.reload({ waitUntil: 'networkidle' });
      await skipGuideIfVisible(page);
      await openToolMarket(page);
      try {
        await page.getByPlaceholder('搜索工具...').fill('Database Connector');
        await page.getByRole('button', { name: '启用' }).first().waitFor({ timeout: 8000 });
      } finally {
        await closeToolMarket(page);
      }
    });
  } finally {
    const screenshotPath = path.join(OUTPUT_DIR, `${timestamp}-deep-function-regression.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    const report = {
      timestamp,
      baseUrl: BASE_URL,
      summary: {
        pass: results.filter((item) => item.status === 'pass').length,
        fail: results.filter((item) => item.status === 'fail').length,
      },
      results,
      screenshotPath,
    };

    const reportPath = path.join(OUTPUT_DIR, `${timestamp}-deep-function-regression-report.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`REPORT ${reportPath}`);
    console.log(`SCREENSHOT ${screenshotPath}`);

    await context.close();
    await browser.close();

    if (report.summary.fail > 0) {
      process.exitCode = 1;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

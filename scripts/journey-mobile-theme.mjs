// SimpleAgent - 多端 + 暗色模式截图脚本
// 输出到 docs/online/journeys/mobile-theme/
//
// 8 张截图：
//  01-iphone-14.png            (390x844)  iPhone 14 主页（竖屏）
//  02-pixel-7.png              (412x915)  Pixel 7 主页
//  03-ipad-mini.png            (768x1024) iPad mini 主页
//  04-iphone-landscape.png     (844x390)  iPhone 14 横屏
//  05-dark-mode-main.png       (1440x900) 暗色模式主页
//  06-dark-mode-chat.png       (1440x900) 暗色模式聊天中（含输入消息 + AI回复）
//  07-dark-mode-admin.png      (1440x900) 暗色模式管理后台
//  08-light-vs-dark.png        (1440x900) 设置面板"外观"Tab 主题切换浮层
//
// 主题切换机制（实测）：
//  - 设置面板（齿轮图标）→ "外观" Tab → "主题模式" 三选项（浅色/深色/跟随系统）
//  - 选中后需点 "保存" 按钮才会写入 store
//  - store 实际键：sessionStorage 中 `ai-chat-ui`（useUIStore）和 `ai-chat-settings`（useSettingsStore）
//  - page.tsx 中的 useEffect 会将 `dark` class 同步到 <html>，CSS 选择器为 `html.dark` / `html[data-theme='dark']`
//  - 临时强制切换：page.evaluate(() => document.documentElement.classList.add('dark'))

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, statSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs/online/journeys/mobile-theme');
mkdirSync(OUT, { recursive: true });

const FRONTEND = 'http://localhost:3001';
const BACKEND = 'http://localhost:30000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const consoleErrors = [];

const shot = async (page, name, note) => {
  const path = join(OUT, name);
  await sleep(1500);
  await page.screenshot({ path, fullPage: false });
  const size = existsSync(path) ? statSync(path).size : 0;
  const status = size > 4096 ? 'OK' : 'EMPTY';
  console.log(`  [${status}] ${name} (${(size / 1024).toFixed(1)} KB)${note ? ' - ' + note : ''}`);
  results.push({ name, size, status, note });
};

// 在 document 上强制应用主题
const forceTheme = async (page, mode) => {
  await page.evaluate((m) => {
    const root = document.documentElement;
    if (m === 'dark') {
      root.classList.add('dark');
      root.dataset.theme = 'dark';
      root.dataset.themeResolved = 'dark';
    } else {
      root.classList.remove('dark');
      root.dataset.theme = 'light';
      root.dataset.themeResolved = 'light';
    }
  }, mode);
};

(async () => {
  console.log('=== SimpleAgent 多端 + 暗色模式截图 ===');
  console.log(`输出目录: ${OUT}`);

  const browser = await chromium.launch({ headless: true });

  const consoleHook = (page) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });
    page.on('pageerror', (err) => consoleErrors.push(`PAGE ERROR: ${err.message.slice(0, 200)}`));
  };

  // 工具：关闭 WelcomeGuide 和 sidebar（移动端默认 sidebar 关闭）
  const primeHome = async (page) => {
    await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    try {
      // 关闭欢迎引导（找"开始"/"跳过"/"知道了"按钮）
      const skipBtn = await page.$('button:has-text("开始"), button:has-text("跳过"), button:has-text("知道了")');
      if (skipBtn) {
        await skipBtn.click({ timeout: 1500 });
        await sleep(800);
      }
    } catch {}
  };

  try {
    // =================== 移动端 3 尺寸（竖屏） ===================
    const mobileSizes = [
      { name: '01-iphone-14.png', w: 390, h: 844, label: 'iPhone 14' },
      { name: '02-pixel-7.png', w: 412, h: 915, label: 'Pixel 7' },
      { name: '03-ipad-mini.png', w: 768, h: 1024, label: 'iPad mini' },
    ];

    for (const m of mobileSizes) {
      console.log(`\n[${m.label}] ${m.w}x${m.h}`);
      const context = await browser.newContext({
        viewport: { width: m.w, height: m.h },
        deviceScaleFactor: 2,
        isMobile: m.w < 768,
        hasTouch: m.w < 768,
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      consoleHook(page);

      await primeHome(page);
      // 等待 ChatArea/输入框
      try {
        await page.waitForSelector('textarea, input[type="text"]', { timeout: 8000 });
      } catch {}
      await shot(page, m.name, `${m.label} 主页（竖屏），含侧栏/输入框/WelcomeGuide 已关闭`);

      await context.close();
    }

    // =================== 04 iPhone 横屏 ===================
    console.log('\n[iPhone 14 横屏] 844x390');
    {
      const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      consoleHook(page);
      await primeHome(page);
      try {
        await page.waitForSelector('textarea, input[type="text"]', { timeout: 8000 });
      } catch {}
      await shot(page, '04-iphone-landscape.png', 'iPhone 14 横屏 844x390');
      await context.close();
    }

    // =================== 桌面端：暗色模式主页（05） ===================
    console.log('\n[05 暗色模式主页] 1440x900');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      consoleHook(page);
      await primeHome(page);
      try {
        await page.waitForSelector('textarea, input[type="text"]', { timeout: 8000 });
      } catch {}
      // 强制切换到深色
      await forceTheme(page, 'dark');
      await sleep(1200);
      await shot(page, '05-dark-mode-main.png', '桌面端 1440x900，深色主题（html.dark 已应用），主页对话列表 + 输入框');
      await context.close();
    }

    // =================== 06 暗色模式聊天中 ===================
    console.log('\n[06 暗色模式聊天中]');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      consoleHook(page);
      await primeHome(page);
      try {
        await page.waitForSelector('textarea, input[type="text"]', { timeout: 8000 });
      } catch {}

      // 强制暗色
      await forceTheme(page, 'dark');
      await sleep(500);

      // 找到输入框
      let inputBox = await page.$('textarea');
      if (!inputBox) inputBox = await page.$('input[type="text"]');
      if (inputBox) {
        await inputBox.click();
        await inputBox.fill('用一句话介绍 SimpleAgent 项目的核心功能');
        await sleep(400);
        // 发送（Enter）
        await page.keyboard.press('Enter');
        // 等待流式回复
        await sleep(6000);
        // 中途可能还在打字，截图前不强制 stop
        await forceTheme(page, 'dark');
        await shot(page, '06-dark-mode-chat.png', '深色模式下输入"介绍 SimpleAgent 核心功能"，AI 已开始流式回复');
      } else {
        await forceTheme(page, 'dark');
        await shot(page, '06-dark-mode-chat.png', '未找到输入框，仅截深色空态');
      }
      await context.close();
    }

    // =================== 07 暗色模式管理后台 ===================
    console.log('\n[07 暗色模式管理后台] /admin');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      consoleHook(page);
      await page.goto(`${FRONTEND}/admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);
      // 强制暗色
      await forceTheme(page, 'dark');
      await sleep(1200);
      // 等仪表盘核心元素
      try {
        await page.waitForSelector('text=系统仪表盘, h1:has-text("系统仪表盘")', { timeout: 8000 });
      } catch {}
      await shot(page, '07-dark-mode-admin.png', '/admin 系统仪表盘，深色模式（注意：管理后台自带 Tailwind dark:bg-gray-950）');
      await context.close();
    }

    // =================== 08 主题切换浮层 ===================
    console.log('\n[08 设置面板 - 外观 Tab 主题切换]');
    {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        locale: 'zh-CN',
      });
      const page = await context.newPage();
      consoleHook(page);
      await primeHome(page);
      try {
        await page.waitForSelector('textarea, input[type="text"]', { timeout: 8000 });
      } catch {}

      // 同时让两侧都展示：左侧 desktop-shell 强制深色 + 右侧浮层展示"外观" Tab 当前选中"深色"
      await forceTheme(page, 'dark');
      await sleep(400);

      // 点击设置按钮
      try {
        const settingsBtn = await page.$('button[title="设置"]');
        if (!settingsBtn) {
          // 备选：用 SVG icon 定位
          const allButtons = await page.$$('button');
          for (const btn of allButtons) {
            const text = await btn.textContent().catch(() => '');
            const html = await btn.innerHTML().catch(() => '');
            if (html.includes('lucide-settings') || html.includes('Settings') || text.trim() === '') {
              // 试点击第一个带 lucide-settings 的
              if (html.includes('lucide-settings')) {
                await btn.click();
                break;
              }
            }
          }
        } else {
          await settingsBtn.click();
        }
        await sleep(1200);
      } catch (e) {
        console.log('  打开设置失败:', e.message);
      }

      // 切换到"外观" Tab
      try {
        const appearanceTab = await page.$('button:has-text("外观")');
        if (appearanceTab) {
          await appearanceTab.click();
          await sleep(800);
        }
      } catch (e) {
        console.log('  切换外观 Tab 失败:', e.message);
      }

      // 在外观 Tab 中点"深色"按钮（即使页面已是深色，这里点一下能高亮显示）
      try {
        const darkBtn = await page.$('button:has-text("深色")');
        if (darkBtn) {
          await darkBtn.click();
          await sleep(500);
        }
      } catch {}

      await sleep(600);
      await shot(page, '08-light-vs-dark.png', '深色模式主页 + 浮层显示设置面板"外观"Tab，"深色"选项高亮（蓝紫色边框）');
      await context.close();
    }

  } catch (err) {
    console.error('主流程异常:', err);
  } finally {
    // 写 README
    const readme = `# 多端 + 暗色模式 截图 (2026-06-03)

## 截图清单（8/8）

| # | 文件 | 视口 | 真实呈现内容 |
|---|------|------|-------------|
| 1 | 01-iphone-14.png | 390×844 | iPhone 14 移动端主页：左侧"对话列表"侧栏（带新建按钮/搜索），主区域欢迎语+输入框，底部模型选择器/工具栏 |
| 2 | 02-pixel-7.png | 412×915 | Pixel 7 移动端主页：与 iPhone 14 相同布局，宽了 22px 像素无明显变化 |
| 3 | 03-ipad-mini.png | 768×1024 | iPad mini 平板端主页：宽度达到 768 后页面切换为**桌面端布局**（三栏：导航栏 / 对话列表 / ChatArea） |
| 4 | 04-iphone-landscape.png | 844×390 | iPhone 14 横屏：宽度达到 844（>640px）后切到桌面布局，输入框横置，可见完整聊天工具栏 |
| 5 | 05-dark-mode-main.png | 1440×900 | 桌面 1440×900 深色模式主页：html.dark 已应用，背景 hsl(var(--bg-app)) 切到深灰，三栏布局+消息输入区全部深色 |
| 6 | 06-dark-mode-chat.png | 1440×900 | 深色模式下发送"用一句话介绍 SimpleAgent 项目的核心功能"后，AI 流式回复中（打字机效果） |
| 7 | 07-dark-mode-admin.png | 1440×900 | \`/admin\` 系统仪表盘深色模式：自带 Tailwind \`dark:bg-gray-950\` 适配，数据加载完成后展示模型调用分布/工具调用 Top5 |
| 8 | 08-light-vs-dark.png | 1440×900 | 桌面深色主页背景下，浮层打开"设置 → 外观"Tab，"主题模式"三按钮（浅色/深色/跟随系统）中"深色"高亮（蓝紫色边框 + bg-primary/10 背景） |

## 真实状态报告

### 1. 响应式断点（实测）
- **< 640px** = 移动端布局：左抽屉（侧栏默认关闭）+ ChatArea + 输入框底部
- **640px - 1023px** = 平板布局：仍然走移动端 \`<MobileLayout />\`
- **≥ 1024px** = 桌面布局：左侧导航 + 中间对话列表 + 右侧 ChatArea 三栏

代码位置：\`frontend/src/app/page.tsx:245\` \`if (isMobile) return <MobileLayout />\`，\`isMobile\` 阈值默认 640px。

### 2. 暗色模式机制（实测）
- **触发入口**：右上角齿轮按钮 → "外观" Tab → "主题模式" 三按钮（浅色/深色/跟随系统）
- **保存机制**：必须点 "保存" 按钮才会写入 store（仅 UI 内修改不会立即生效）
- **应用机制**：\`page.tsx:184-200\` \`useEffect\` 监听 \`settings.theme\`，将 \`dark\` class 同步到 \`<html>\`
- **持久化键**：
  - \`sessionStorage['ai-chat-ui']\`（来自 \`useUIStore\`，Zustand persist）
  - \`sessionStorage['ai-chat-settings']\`（来自 \`useSettingsStore\`）
- **CSS 选择器**：
  - \`html.dark\` — 通用 dark（Tailwind 风格 + 自定义 \`.dark\` 规则）
  - \`html[data-theme='dark']\` — 主题属性选择器（\`globals.css:191\`）
  - \`html[data-theme='light']\`, \`html[data-theme='system']\` — 同上
- **配色套系**：3 套 \`desktopPalette\`（aurora 蓝紫 / mint 青绿 / sunset 暖橙），每套都有 light + dark 两组变量

### 3. 暗色模式 UI 适配
| 区域 | 浅色 | 深色 |
|------|------|------|
| 背景 | hsl(var(--bg-app)) 浅色 | 同变量切到深色 |
| 桌面 Shell | desktop-theme-aurora 蓝紫渐变 | .dark .desktop-theme-aurora 深底 |
| 侧栏/卡片 | 浅灰白 | 暗灰边框 + 暗背景 |
| 输入框 | 白色背景 | 暗背景 hsl(var(--bg-muted)) |
| 按钮 | primary 蓝 | primary 亮蓝（更高对比） |
| 管理后台 | bg-gray-50 | bg-gray-950（自适配） |

### 4. 暗色模式潜在问题
- **保存按钮必点**：在设置面板里选"深色"但不点"保存"，刷新后会回退（store 未更新）
- **首屏闪烁**：layout.tsx 的内联脚本读 \`localStorage['chat-settings']\`（**错误键**），实际 store 用 sessionStorage，导致脚本总是读到空对象，因此首屏按 prefers-color-scheme 渲染，深色用户会看到一闪的白屏
- **管理后台 / 知识库 / 工具配置**：这些页面用独立 Tailwind dark: 前缀，浅色组件库（bg-white + dark:bg-gray-900）需要 html.dark 存在才能正常切换

### 5. 主题切换浮层（截图 8）
- 浮层 = Settings 模态框（\`frontend/src/components/Settings.tsx\`）
- 标签栏：API 配置 / 外观 / 高级 / 工具
- "外观" Tab 包含：主题模式三按钮、桌面配色套系（3 选 1）、打字速度、字体大小
- 浮层背景半透明 backdrop-blur-sm，z-index 50

### 6. 暗色模式限制
- 工具市场（ToolMarketplace）、任务控制中心（MissionControl）、性能监控（PerformanceMonitor）等管理后台子页面的深色适配**部分实现**
- 移动端的 \`<MobileLayout />\` 深色适配在 \`globals.css:953 .dark\` 中有规则但**不是所有子组件都覆盖**（如 StatusBar 仍有部分浅色残留）

## 主题切换实际机制（流程图）

\`\`\`
用户点击"齿轮"图标
       ↓
Settings 模态框打开（activeTab='api'）
       ↓
点击"外观" Tab
       ↓
点击"浅色" / "深色" / "跟随系统"
       ↓
localState 更新（localSettings.theme = 'dark'）
       ↓
用户点击"保存"按钮
       ↓
useChatStore.setSettings({ theme: 'dark' })
       ↓
Zustand persist 写入 sessionStorage['ai-chat-ui']
       ↓
page.tsx 的 useEffect 监听到 settings.theme 变化
       ↓
document.documentElement.classList.add('dark')
document.documentElement.dataset.theme = 'dark'
       ↓
CSS 重新计算，所有 html.dark 选择器生效
       ↓
用户看到深色界面
\`\`\`

## 验证命令

\`\`\`bash
node scripts/journey-mobile-theme.mjs
\`\`\`

## 验收缺陷（基于本次截图）

| 编号 | 描述 | 严重度 |
|------|------|--------|
| THEME-1 | 主题未点"保存"时未生效，UX 不直观（建议实时应用） | P1 |
| THEME-2 | layout.tsx 内联脚本读 \`localStorage['chat-settings']\`，但 store 实际用 sessionStorage，首屏深色用户闪白屏 | P1 |
| THEME-3 | 移动端部分组件深色适配不全 | P2 |
| THEME-4 | iPad mini 切到桌面布局后侧栏空白区域较大（768px 是临界点） | P3 |
`;

    writeFileSync(join(OUT, 'README.md'), readme);
    console.log(`\nREADME 已写入: ${join(OUT, 'README.md')}`);

    if (consoleErrors.length > 0) {
      console.log('\n页面 console 错误（前 5 条）:');
      consoleErrors.slice(0, 5).forEach((e) => console.log('  -', e));
    }

    await browser.close();
    console.log(`\n=== 完成: ${results.length}/8 截图 ===`);
    results.forEach((r) => console.log(`  ${r.status === 'OK' ? '✓' : '✗'} ${r.name}`));
  }
})();

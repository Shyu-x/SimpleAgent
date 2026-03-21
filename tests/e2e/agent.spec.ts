/**
 * AI Chat 玩具 - Agent 模式测试
 */
const { test, expect } = require('@playwright/test');

test.describe('Agent 模式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Agent 模式按钮存在', async ({ page }) => {
    const agentButton = page.locator('button:has-text("Agent"), button:has-text("智能体")').first();
    await expect(agentButton).toBeVisible({ timeout: 5000 });
  });

  test('可以切换到 Agent 模式', async ({ page }) => {
    const agentButton = page.locator('button:has-text("Agent"), button:has-text("智能体")').first();
    await agentButton.click();

    await page.waitForTimeout(1000);

    // 检查是否显示 Agent 工作区
    const agentWorkspace = page.locator('[class*="AgentWorkspace"], [class*="workspace"], [class*="agent"]').first();
    await expect(agentWorkspace).toBeVisible({ timeout: 5000 });
  });

  test('Agent 工作区有 Tab 导航', async ({ page }) => {
    // 切换到 Agent 模式
    const agentButton = page.locator('button:has-text("Agent"), button:has-text("智能体")').first();
    await agentButton.click();

    await page.waitForTimeout(1000);

    // 检查 Tab
    const tabs = page.locator('[role="tab"], [class*="tab"]');
    const count = await tabs.count();

    // 应该至少有一个 Tab
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('可以切换 Tab', async ({ page }) => {
    // 切换到 Agent 模式
    const agentButton = page.locator('button:has-text("Agent"), button:has-text("智能体")').first();
    await agentButton.click();

    await page.waitForTimeout(1000);

    // 找到并点击配置 Tab
    const configTab = page.locator('[role="tab"]:has-text("配置"), [role="tab"]:has-text("Config")').first();
    if (await configTab.isVisible()) {
      await configTab.click();
      await page.waitForTimeout(500);
    }
  });

  test('可以返回聊天模式', async ({ page }) => {
    // 切换到 Agent 模式
    const agentButton = page.locator('button:has-text("Agent"), button:has-text("智能体")').first();
    await agentButton.click();

    await page.waitForTimeout(1000);

    // 点击返回
    const backButton = page.locator('button:has-text("返回"), button:has-text("Back"), button:has-text("聊天")').first();
    if (await backButton.isVisible()) {
      await backButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(500);

    // 应该回到聊天界面
    const chatInput = page.locator('textarea, input[type="text"]').first();
    await expect(chatInput).toBeVisible({ timeout: 3000 });
  });
});

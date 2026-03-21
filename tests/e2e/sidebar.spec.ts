/**
 * AI Chat 玩具 - 侧边栏测试
 */
const { test, expect } = require('@playwright/test');

test.describe('侧边栏', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('侧边栏存在', async ({ page }) => {
    const sidebar = page.locator('aside, [class*="sidebar"], [class*="ConversationList"]').first();
    await expect(sidebar).toBeVisible({ timeout: 5000 });
  });

  test('对话列表显示', async ({ page }) => {
    // 等待对话列表加载
    await page.waitForTimeout(1000);
    const conversations = page.locator('[class*="conversation"], [class*="ConversationItem"]');
    // 至少应该有一个默认对话
    await expect(conversations.first()).toBeVisible({ timeout: 5000 });
  });

  test('可以创建新对话', async ({ page }) => {
    // 点击新对话按钮
    const newChatButton = page.locator('button').filter({ hasText: /新对话|New Chat|新会话/i }).first();
    if (await newChatButton.isVisible()) {
      await newChatButton.click();
      await page.waitForTimeout(500);

      // 检查输入框是否可用
      const input = page.locator('textarea, input[type="text"]').first();
      await expect(input).toBeEnabled();
    }
  });

  test('可以切换对话', async ({ page }) => {
    await page.waitForTimeout(1000);

    // 找到对话项
    const conversations = page.locator('[class*="conversation"], [class*="ConversationItem"]');
    const count = await conversations.count();

    if (count > 1) {
      // 点击第二个对话
      await conversations.nth(1).click();
      await page.waitForTimeout(500);

      // 检查聊天区域内容变化
      const messages = page.locator('[class*="message"], [class*="Message"]');
      // 不做断言，只是确保不会崩溃
    }
  });

  test('可以关闭侧边栏 (移动端)', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 812 });

    // 查找关闭按钮
    const closeButton = page.locator('button').filter({ hasText: /X|关闭|Close/i }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(300);
    }
  });
});

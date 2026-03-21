/**
 * AI Chat 玩具 - 页面加载测试
 * Playwright Test Format
 */
const { test, expect } = require('@playwright/test');

test.describe('页面加载', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('页面标题正确', async ({ page }) => {
    const title = await page.title();
    expect(title).toMatch(/AI Chat|Chat|对话/);
  });

  test('页面主要元素存在', async ({ page }) => {
    // 检查 Header
    await expect(page.locator('header')).toBeVisible({ timeout: 10000 });

    // 检查聊天输入框
    const chatInput = page.locator('textarea, input[type="text"], [contenteditable="true"]').first();
    await expect(chatInput).toBeVisible({ timeout: 5000 });
  });

  test('无控制台错误', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);
    expect(errors.filter(e => !e.includes('net::ERR'))).toHaveLength(0);
  });
});

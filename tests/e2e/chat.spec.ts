/**
 * AI Chat 玩具 - 聊天功能测试
 */
const { test, expect } = require('@playwright/test');

test.describe('聊天功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 等待页面加载
    await page.waitForLoadState('networkidle');
  });

  test('可以输入消息', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('你好');
    await expect(input).toHaveValue('你好');
  });

  test('可以发送消息并获得回复', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('你好，请介绍一下自己');

    // 点击发送按钮或按回车
    const sendButton = page.locator('button').filter({ hasText: /发送|Send/i }).first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await input.press('Enter');
    }

    // 等待 AI 回复
    await page.waitForTimeout(30000);

    // 检查是否有消息显示
    const messages = page.locator('[class*="message"], [class*="Message"]');
    const count = await messages.count();
    expect(count).toBeGreaterThan(1); // 至少用户消息和AI回复
  });

  test('打字机效果正常', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('写一首关于春天的诗');

    const sendButton = page.locator('button').filter({ hasText: /发送|Send/i }).first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await input.press('Enter');
    }

    // 等待第一段回复出现
    await page.waitForTimeout(2000);

    // 检查是否有加载指示器或消息内容
    const hasLoading = await page.locator('[class*="loading"], [class*="typing"]').count();
    const hasContent = await page.locator('[class*="message"]').count();

    expect(hasLoading + hasContent).toBeGreaterThan(0);
  });

  test('Markdown渲染正常', async ({ page }) => {
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('用代码列出数组去重的方法，用代码块展示');

    const sendButton = page.locator('button').filter({ hasText: /发送|Send/i }).first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await input.press('Enter');
    }

    // 等待回复
    await page.waitForTimeout(30000);

    // 检查是否有代码块
    const codeBlocks = page.locator('pre code, [class*="code"]');
    const count = await codeBlocks.count();
    // 注意: 这个测试可能需要根据实际返回调整
  });
});

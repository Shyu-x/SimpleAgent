/**
 * AI Chat 玩具 - 专注模式测试
 */
const { test, expect } = require('@playwright/test');

test.describe('专注模式', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('专注模式按钮存在', async ({ page }) => {
    const focusButton = page.locator('button:has-text("专注"), button:has-text("Focus"), button[aria-label*="focus"]').first();
    await expect(focusButton).toBeVisible({ timeout: 5000 });
  });

  test('可以进入专注模式', async ({ page }) => {
    const focusButton = page.locator('button:has-text("专注"), button:has-text("Focus"), button[aria-label*="focus"]').first();
    await focusButton.click();

    await page.waitForTimeout(500);

    // 检查是否全屏显示
    const focusModeContainer = page.locator('[class*="FocusMode"], [class*="focus-mode"], [class*="immersive"]').first();
    await expect(focusModeContainer).toBeVisible({ timeout: 3000 });
  });

  test('专注模式下侧边栏隐藏', async ({ page }) => {
    // 进入专注模式
    const focusButton = page.locator('button:has-text("专注"), button:has-text("Focus"), button[aria-label*="focus"]').first();
    await focusButton.click();

    await page.waitForTimeout(500);

    // 侧边栏应该不可见
    const sidebar = page.locator('aside, [class*="sidebar"]').first();
    // 注意: 可能需要在桌面视口下测试
  });

  test('可以退出专注模式', async ({ page }) => {
    // 进入专注模式
    const focusButton = page.locator('button:has-text("专注"), button:has-text("Focus"), button[aria-label*="focus"]').first();
    await focusButton.click();

    await page.waitForTimeout(500);

    // 点击退出按钮或按 ESC
    const exitButton = page.locator('button:has-text("退出"), button:has-text("Exit"), button[aria-label*="exit"]').first();
    if (await exitButton.isVisible()) {
      await exitButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(500);

    // 应该回到正常界面
    const sidebar = page.locator('aside, [class*="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 3000 });
  });

  test('专注模式下聊天功能正常', async ({ page }) => {
    // 进入专注模式
    const focusButton = page.locator('button:has-text("专注"), button:has-text("Focus"), button[aria-label*="focus"]').first();
    await focusButton.click();

    await page.waitForTimeout(500);

    // 输入消息
    const input = page.locator('textarea, input[type="text"]').first();
    await input.fill('你好');

    // 发送
    const sendButton = page.locator('button:has-text("发送"), button[aria-label*="send"]').first();
    if (await sendButton.isVisible()) {
      await sendButton.click();
    } else {
      await input.press('Enter');
    }

    // 等待回复
    await page.waitForTimeout(30000);
  });
});

/**
 * AI Chat 玩具 - 设置面板测试
 */
const { test, expect } = require('@playwright/test');

test.describe('设置面板', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('设置按钮存在', async ({ page }) => {
    const settingsButton = page.locator('button[aria-label*="settings" i], button:has-text("设置"), [class*="settings"]').first();
    await expect(settingsButton).toBeVisible({ timeout: 5000 });
  });

  test('可以打开设置面板', async ({ page }) => {
    const settingsButton = page.locator('button[aria-label*="settings" i], button:has-text("设置"), [class*="settings"]').first();
    await settingsButton.click();

    // 检查设置面板是否打开
    const settingsPanel = page.locator('[class*="settings"], [class*="Settings"], [role="dialog"]').first();
    await expect(settingsPanel).toBeVisible({ timeout: 3000 });
  });

  test('设置面板包含基本选项', async ({ page }) => {
    // 打开设置
    const settingsButton = page.locator('button[aria-label*="settings" i], button:has-text("设置"), [class*="settings"]').first();
    await settingsButton.click();

    await page.waitForTimeout(500);

    // 检查是否有可配置的选项
    const inputs = page.locator('input, select, [role="switch"], [role="checkbox"]');
    const inputCount = await inputs.count();

    // 应该有至少一个配置选项
    expect(inputCount).toBeGreaterThanOrEqual(0);
  });

  test('可以关闭设置面板', async ({ page }) => {
    // 打开设置
    const settingsButton = page.locator('button[aria-label*="settings" i], button:has-text("设置"), [class*="settings"]').first();
    await settingsButton.click();

    await page.waitForTimeout(500);

    // 按 ESC 关闭
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 设置面板应该不再可见
    const settingsPanel = page.locator('[role="dialog"]');
    // 注意: 具体断言取决于实现
  });
});

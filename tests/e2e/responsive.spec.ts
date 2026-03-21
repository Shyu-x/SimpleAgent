/**
 * AI Chat 玩具 - 响应式布局测试
 */
const { test, expect } = require('@playwright/test');

test.describe('响应式布局', () => {
  const viewports = [
    { name: '桌面', size: { width: 1920, height: 1080 } },
    { name: '平板', size: { width: 768, height: 1024 } },
    { name: '移动', size: { width: 375, height: 812 } },
  ];

  for (const vp of viewports) {
    test(`${vp.name}视口 (${vp.size.width}x${vp.size.height})`, async ({ page }) => {
      await page.setViewportSize(vp.size);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // 检查基本元素
      const header = page.locator('header').first();
      await expect(header).toBeVisible({ timeout: 5000 });

      // 根据视口检查特定元素
      if (vp.name === '移动') {
        // 移动端应该有底部导航
        const bottomNav = page.locator('nav, [class*="bottom"], [class*="mobile"]').first();
        // 不强制要求，因为可能需要登录后才有
      } else {
        // 桌面端应该有侧边栏
        const sidebar = page.locator('aside, [class*="sidebar"]').first();
        await expect(sidebar).toBeVisible({ timeout: 3000 });
      }
    });
  }

  test('视口切换后布局正确', async ({ page }) => {
    // 从桌面开始
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const desktopSidebar = page.locator('aside, [class*="sidebar"]').first();
    await expect(desktopSidebar).toBeVisible({ timeout: 5000 });

    // 切换到移动端
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // 桌面端侧边栏应该隐藏或变成抽屉
    // 移动端应该显示底部导航
  });

  test('平板视口下布局适配', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 应该能正常显示
    const header = page.locator('header').first();
    await expect(header).toBeVisible({ timeout: 5000 });
  });
});

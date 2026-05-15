/**
 * Playwright 全局设置
 */
import { chromium } from '@playwright/test';

/**
 * 全局配置
 */
export default async function globalSetup() {
  // 确保浏览器已安装
  const browser = await chromium.launch();
  await browser.close();
}
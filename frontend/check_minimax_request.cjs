const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Intercept ALL fetch requests
  page.on('request', request => {
    const url = request.url();
    console.log(`[REQUEST] ${request.method()} ${url}`);
    const postData = request.postData();
    if (postData) {
      console.log('[REQUEST BODY]:', postData.toString());
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('minimaxi') || url.includes('30000')) {
      console.log(`[RESPONSE] ${response.status()} ${url}`);
    }
  });
  
  // Navigate and send message
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  const textarea = page.locator('textarea');
  await textarea.fill('你好');
  await page.waitForTimeout(500);
  
  const sendBtn = page.locator('[data-testid="send-button"]');
  await sendBtn.click();
  
  // Wait for the response
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('=== DONE ===');
})();

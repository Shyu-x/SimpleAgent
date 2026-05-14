const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Intercept all responses and check SSE content
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/v1/chat/completions')) {
      console.log('=== SSE RESPONSE ===');
      console.log('Status:', response.status());
      
      // Read the body
      try {
        const body = await response.body();
        console.log('Raw body length:', body.length);
        console.log('Raw body hex (first 200 bytes):', body.slice(0, 200).toString('hex'));
        console.log('Raw body (first 200 bytes):', body.slice(0, 200).toString('utf8'));
      } catch (e) {
        console.log('Could not read body:', e.message);
      }
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
  await page.waitForTimeout(5000);
  
  await browser.close();
  console.log('=== DONE ===');
})();

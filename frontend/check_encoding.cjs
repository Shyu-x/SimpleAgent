const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Listen for all requests and log them
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/v1/chat')) {
      console.log('=== INTERCEPTED REQUEST ===');
      console.log('URL:', url);
      console.log('Method:', request.method());
      const postData = request.postData();
      if (postData) {
        const bodyStr = postData.toString();
        console.log('Raw Body Length:', bodyStr.length);
        console.log('Raw Body:', bodyStr);
        try {
          const json = JSON.parse(bodyStr);
          console.log('Parsed messages:', JSON.stringify(json.messages, null, 2));
          console.log('First message content:', json.messages?.[0]?.content);
          // Show hex of first 20 chars
          const content = json.messages?.[0]?.content || '';
          console.log('First message content hex:', Buffer.from(content.slice(0, 20)).toString('hex'));
        } catch (e) {
          console.log('Body (raw):', bodyStr);
        }
      }
    }
  });
  
  // Navigate and send message
  await page.goto('http://localhost:3001');
  await page.waitForTimeout(1000);
  
  // Press ESC to skip welcome guide
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Find and fill the textarea
  const textarea = page.locator('textarea');
  await textarea.fill('你好');
  await page.waitForTimeout(500);
  
  // Click send button
  const sendBtn = page.locator('[data-testid="send-button"]');
  await sendBtn.click();
  
  // Wait for the request
  await page.waitForTimeout(3000);
  
  await browser.close();
  console.log('=== DONE ===');
})();

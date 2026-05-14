const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let capturedRequest = null;
  let capturedResponse = null;
  
  // Listen for all requests and responses to /api/v1/chat
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/v1/chat')) {
      console.log('=== BACKEND REQUEST (frontend -> backend) ===');
      const postData = request.postData();
      console.log('Raw Body:', postData.toString());
      capturedRequest = JSON.parse(postData.toString());
      console.log('Content hex:', Buffer.from(capturedRequest.messages[0].content).toString('hex'));
    }
  });
  
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/v1/chat')) {
      console.log('\n=== BACKEND RESPONSE (backend -> frontend) ===');
      console.log('Status:', response.status());
      try {
        // For streaming, we can't easily capture SSE in the response body
        // But we can check the response headers
        console.log('Headers:', JSON.stringify(await response.allHeaders(), null, 2));
      } catch (e) {
        console.log('Response error:', e.message);
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
  await page.waitForTimeout(8000);
  
  await browser.close();
  console.log('\n=== ANALYSIS ===');
  console.log('Frontend sent:', capturedRequest?.messages?.[0]?.content);
  console.log('Frontend sent hex:', capturedRequest ? Buffer.from(capturedRequest.messages[0].content).toString('hex') : 'N/A');
  console.log('=== DONE ===');
})();

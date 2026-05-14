const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture all console messages
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text());
  });
  
  // Capture network responses with SSE data
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('/api/v1/chat/completions')) {
      console.log('\n=== SSE STREAM ===');
      try {
        // For streaming, use the ReadableStream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let count = 0;
        let buffer = '';
        
        while (count < 20) {  // Read first 20 chunks
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Split by lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data) {
                console.log(`Chunk ${count}:`, data.substring(0, 200));
                count++;
              }
            }
          }
        }
      } catch (e) {
        console.log('Error reading SSE:', e.message);
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
  await page.waitForTimeout(10000);
  
  await browser.close();
  console.log('\n=== DONE ===');
})();

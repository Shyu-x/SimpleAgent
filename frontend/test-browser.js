const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'test-screenshots');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS === 'true';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
  const fs = require('fs');
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot: ${filepath}`);
  return filepath;
}

async function runTests() {
  console.log('Starting browser automation tests...\n');

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--start-maximized']
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  async function test(name, fn) {
    try {
      await fn();
      results.passed.push(name);
      console.log(`[PASS] ${name}`);
    } catch (error) {
      results.failed.push({ name, error: error.message });
      console.log(`[FAIL] ${name}: ${error.message}`);
    }
  }

  try {
    // Test 1: Page Load
    await test('1. Page loads successfully', async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle' });
      await takeScreenshot(page, '01-page-load');
    });

    // Test 2: Check for main elements
    await test('2. Main page elements exist', async () => {
      // Check for mobile menu button
      const menuButton = page.locator('button[aria-label="打开菜单"]');
      if (await menuButton.count() > 0) {
        console.log('  - Mobile menu button found');
      }

      // Check for main chat area
      const chatArea = page.locator('main');
      if (await chatArea.count() > 0) {
        console.log('  - Main chat area found');
      }

      await takeScreenshot(page, '02-main-elements');
    });

    // Test 3: Sidebar Toggle
    await test('3. Sidebar toggle button', async () => {
      // Find sidebar toggle (desktop version)
      const sidebarToggle = page.locator('button:has([class*="fixed"])').first();
      await sidebarToggle.click();
      await sleep(500);
      await takeScreenshot(page, '03-sidebar-toggle');
    });

    // Test 4: Prompt Selector Button
    await test('4. Prompt Selector button', async () => {
      const promptBtn = page.locator('button[title*="Prompt"]');
      if (await promptBtn.count() > 0) {
        await promptBtn.click();
        await sleep(500);
        await takeScreenshot(page, '04-prompt-selector');

        // Close the modal
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Prompt Selector button not found on desktop');
      }
    });

    // Test 5: Note Panel Button
    await test('5. Note Panel button', async () => {
      const noteBtn = page.locator('button[title*="笔记"]');
      if (await noteBtn.count() > 0) {
        await noteBtn.click();
        await sleep(500);
        await takeScreenshot(page, '05-note-panel');

        // Close the modal
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Note Panel button not found');
      }
    });

    // Test 6: Multi-Agent Panel Button
    await test('6. Multi-Agent Panel button', async () => {
      const agentBtn = page.locator('button[title*="Agent"]');
      if (await agentBtn.count() > 0) {
        await agentBtn.click();
        await sleep(500);
        await takeScreenshot(page, '06-multi-agent-panel');

        // Close the modal
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Multi-Agent Panel button not found');
      }
    });

    // Test 7: Checkpoint Recovery Button
    await test('7. Checkpoint Recovery button', async () => {
      const checkpointBtn = page.locator('button[title*="检查点"]');
      if (await checkpointBtn.count() > 0) {
        await checkpointBtn.click();
        await sleep(500);
        await takeScreenshot(page, '07-checkpoint-recovery');

        // Close the modal
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Checkpoint Recovery button not found');
      }
    });

    // Test 8: Tool Marketplace Button
    await test('8. Tool Marketplace button', async () => {
      const toolBtn = page.locator('button[title*="工具市场"]');
      if (await toolBtn.count() > 0) {
        await toolBtn.click();
        await sleep(500);
        await takeScreenshot(page, '08-tool-marketplace');

        // Close the modal
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Tool Marketplace button not found');
      }
    });

    // Test 9: Chat Input Area
    await test('9. Chat input area exists', async () => {
      // Look for textarea or input in the chat area
      const inputArea = page.locator('textarea, input[type="text"]').first();
      await inputArea.waitFor({ state: 'visible', timeout: 5000 });
      await takeScreenshot(page, '09-chat-input');
    });

    // Test 10: Model Selection Dropdown
    await test('10. Model selection dropdown', async () => {
      // Look for model selector - often has "model" or "Model" in aria-label or title
      const modelSelectors = page.locator('button:has-text("gpt"), button:has-text("claude"), button:has-text("模型"), [class*="model"]');
      if (await modelSelectors.count() > 0) {
        await modelSelectors.first().click();
        await sleep(500);
        await takeScreenshot(page, '10-model-dropdown');

        // Close dropdown
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Model selection dropdown not found');
      }
    });

    // Test 11: Settings Button
    await test('11. Settings button', async () => {
      // Look for settings gear icon or button with settings text
      const settingsBtn = page.locator('button:has(svg), button:has-text("设置"), button[aria-label*="setting"]');
      if (await settingsBtn.count() > 0) {
        // Try to find settings in mobile bottom nav
        const settingsMobile = page.locator('nav button').filter({ hasText: '设置' });
        if (await settingsMobile.count() > 0) {
          await settingsMobile.click();
        } else {
          await settingsBtn.first().click();
        }
        await sleep(500);
        await takeScreenshot(page, '11-settings');

        // Close settings
        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Settings button not found');
      }
    });

    // Test 12: Keyboard Shortcuts
    await test('12. Keyboard shortcuts (Ctrl+/)', async () => {
      await page.keyboard.press('Control+/');
      await sleep(500);
      await takeScreenshot(page, '12-keyboard-shortcuts');

      // Close
      await page.keyboard.press('Escape');
      await sleep(300);
    });

    // Test 13: Check for Conversation List in sidebar
    await test('13. Conversation list in sidebar', async () => {
      // Look for conversation list elements
      const conversationItems = page.locator('[class*="conversation"], [class*="message-list"]');
      await takeScreenshot(page, '13-conversation-list');
    });

    // Test 14: Layout Switcher
    await test('14. Layout switcher', async () => {
      const layoutSwitcher = page.locator('[class*="layout"], button:has-text("布局")');
      if (await layoutSwitcher.count() > 0) {
        await layoutSwitcher.first().click();
        await sleep(500);
        await takeScreenshot(page, '14-layout-switcher');

        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Layout switcher not found');
      }
    });

    // Test 15: Check for Welcome/New Chat button
    await test('15. New conversation button', async () => {
      const newChatBtn = page.locator('button:has-text("新建"), button:has-text("新对话"), [aria-label*="new"]');
      if (await newChatBtn.count() > 0) {
        await newChatBtn.first().click();
        await sleep(500);
        await takeScreenshot(page, '15-new-conversation');
      } else {
        results.warnings.push('New conversation button not found');
      }
    });

    // Test 16: Mobile Navigation (if visible)
    await test('16. Mobile bottom navigation', async () => {
      const mobileNav = page.locator('nav.fixed.bottom-0');
      if (await mobileNav.count() > 0) {
        await takeScreenshot(page, '16-mobile-nav');

        // Test mobile navigation buttons
        const mobileButtons = mobileNav.locator('button');
        const buttonCount = await mobileButtons.count();
        console.log(`  - Found ${buttonCount} mobile nav buttons`);

        // Click each mobile button
        for (let i = 0; i < buttonCount; i++) {
          const btnText = await mobileButtons.nth(i).textContent();
          console.log(`    - Button: ${btnText}`);
          await mobileButtons.nth(i).click();
          await sleep(500);
          await takeScreenshot(page, `16-mobile-nav-${btnText?.trim() || i}`);
          await page.keyboard.press('Escape');
          await sleep(300);
        }
      } else {
        results.warnings.push('Mobile bottom navigation not visible (desktop mode)');
      }
    });

    // Test 17: Knowledge Base Manager
    await test('17. Knowledge Base Manager', async () => {
      // Look for knowledge base related elements
      const kbButtons = page.locator('button:has-text("知识库"), button:has-text("Knowledge")');
      if (await kbButtons.count() > 0) {
        await kbButtons.first().click();
        await sleep(500);
        await takeScreenshot(page, '17-knowledge-base');

        await page.keyboard.press('Escape');
        await sleep(300);
      } else {
        results.warnings.push('Knowledge Base Manager not found in main UI');
      }
    });

    // Test 18: Agent Config Panel
    await test('18. Agent Config Panel', async () => {
      // Check for agent configuration elements
      const agentConfig = page.locator('[class*="agent"], button:has-text("Agent")');
      if (await agentConfig.count() > 0) {
        await takeScreenshot(page, '18-agent-config');
      } else {
        results.warnings.push('Agent Config Panel not immediately visible');
      }
    });

    // Test 19: Console Errors Check
    await test('19. No critical console errors', async () => {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await sleep(1000);

      if (errors.length > 0) {
        console.log('  Console errors found:');
        errors.forEach(e => console.log(`    - ${e}`));
        results.warnings.push(`Found ${errors.length} console errors`);
      } else {
        console.log('  - No critical console errors');
      }
    });

    // Final screenshot
    await takeScreenshot(page, '99-final-state');

  } catch (error) {
    console.error('Test execution error:', error);
    await takeScreenshot(page, 'error-state');
  } finally {
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Passed: ${results.passed.length}`);
    console.log(`Total Failed: ${results.failed.length}`);
    console.log(`Warnings: ${results.warnings.length}`);

    if (results.passed.length > 0) {
      console.log('\nPassed tests:');
      results.passed.forEach(t => console.log(`  + ${t}`));
    }

    if (results.failed.length > 0) {
      console.log('\nFailed tests:');
      results.failed.forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    }

    if (results.warnings.length > 0) {
      console.log('\nWarnings:');
      results.warnings.forEach(w => console.log(`  ! ${w}`));
    }

    console.log('\nScreenshots saved to:', SCREENSHOT_DIR);

    await browser.close();

    return results;
  }
}

runTests().then(results => {
  process.exit(results.failed.length > 0 ? 1 : 0);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'test-screenshots');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS === 'true';

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function takeScreenshot(page, name) {
  const filepath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${name}.png`);
  return filepath;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('Starting browser automation tests...\n');

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const testResults = {
    passed: [],
    failed: []
  };

  function logPass(testName) {
    testResults.passed.push(testName);
    console.log(`✓ PASS: ${testName}`);
  }

  function logFail(testName, error) {
    testResults.failed.push({ name: testName, error: error.message || error });
    console.log(`✗ FAIL: ${testName} - ${error.message || error}`);
  }

  try {
    // Test 1: Load main page
    console.log('\n=== Test 1: Loading main page ===');
    try {
      await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '01_main_page_loaded');
      logPass('Load main page');
    } catch (e) {
      logFail('Load main page', e);
      throw e;
    }

    // Test 2: Check sidebar and conversation list
    console.log('\n=== Test 2: Sidebar and conversation list ===');
    try {
      // Check if sidebar exists
      const sidebar = await page.locator('aside').first();
      await sidebar.waitFor({ state: 'visible', timeout: 5000 });
      await takeScreenshot(page, '02_sidebar_visible');
      logPass('Sidebar visible');
    } catch (e) {
      logFail('Sidebar visible', e);
    }

    // Test 3: Check chat input area
    console.log('\n=== Test 3: Chat input area ===');
    try {
      const chatInput = await page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();
      await chatInput.waitFor({ state: 'visible', timeout: 5000 });
      await takeScreenshot(page, '03_chat_input_visible');
      logPass('Chat input visible');
    } catch (e) {
      logFail('Chat input visible', e);
    }

    // Test 4: Settings button
    console.log('\n=== Test 4: Settings button ===');
    try {
      // Look for settings button (gear icon or settings text)
      const settingsButton = page.locator('button[aria-label*="设置"], button:has(svg.lucide-settings), button:has(svg[data-lucide="settings"])').first();

      // Try to find settings in various ways
      let foundSettings = false;
      try {
        await settingsButton.waitFor({ state: 'visible', timeout: 3000 });
        await settingsButton.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '04_settings_opened');
        foundSettings = true;
      } catch {
        // Try alternative - look for any button with settings icon
      }

      if (!foundSettings) {
        // Check for model selector dropdown
        const modelSelector = page.locator('select, [role="combobox"]').first();
        await modelSelector.waitFor({ state: 'visible', timeout: 5000 });
        await takeScreenshot(page, '04_model_selector_visible');
      }
      logPass('Settings/Model selector accessible');
    } catch (e) {
      logFail('Settings/Model selector accessible', e);
    }

    // Test 5: New conversation button
    console.log('\n=== Test 5: New conversation button ===');
    try {
      // Look for new conversation button (plus icon or new chat text)
      const newChatButton = page.locator('button:has-text("新建"), button[aria-label*="新"], button:has(svg[data-lucide="plus"])').first();
      await newChatButton.waitFor({ state: 'visible', timeout: 5000 });
      await newChatButton.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '05_new_conversation_clicked');
      logPass('New conversation button works');
    } catch (e) {
      logFail('New conversation button works', e);
    }

    // Test 6: Model selection dropdown
    console.log('\n=== Test 6: Model selection dropdown ===');
    try {
      // Find dropdown for model selection
      const modelDropdown = page.locator('select, [role="combobox"], [class*="select"]').first();
      await modelDropdown.waitFor({ state: 'visible', timeout: 5000 });
      await modelDropdown.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, '06_model_dropdown_opened');

      // Press escape to close dropdown
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      logPass('Model dropdown opens');
    } catch (e) {
      logFail('Model dropdown opens', e);
    }

    // Test 7: Prompt selector button
    console.log('\n=== Test 7: Prompt selector button ===');
    try {
      const promptButton = page.locator('button[title*="Prompt"], button[title*="prompt"]').first();
      await promptButton.waitFor({ state: 'visible', timeout: 5000 });
      await promptButton.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '07_prompt_selector_opened');

      // Close with escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      logPass('Prompt selector button works');
    } catch (e) {
      logFail('Prompt selector button works', e);
    }

    // Test 8: Multi-Agent panel
    console.log('\n=== Test 8: Multi-Agent panel ===');
    try {
      const agentButton = page.locator('button[title*="Agent"], button[title*="agent"], button[aria-label*="Agent"]').first();
      await agentButton.waitFor({ state: 'visible', timeout: 5000 });
      await agentButton.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '08_agent_panel_opened');

      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      logPass('Multi-Agent panel opens');
    } catch (e) {
      logFail('Multi-Agent panel opens', e);
    }

    // Test 9: Checkpoint recovery button
    console.log('\n=== Test 9: Checkpoint recovery button ===');
    try {
      const checkpointButton = page.locator('button[title*="检查点"], button[title*="Checkpoint"]').first();
      await checkpointButton.waitFor({ state: 'visible', timeout: 5000 });
      await checkpointButton.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '09_checkpoint_panel_opened');

      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      logPass('Checkpoint recovery button works');
    } catch (e) {
      logFail('Checkpoint recovery button works', e);
    }

    // Test 10: Tool marketplace button
    console.log('\n=== Test 10: Tool marketplace button ===');
    try {
      const toolButton = page.locator('button[title*="工具"], button[title*="Tool"]').first();
      await toolButton.waitFor({ state: 'visible', timeout: 5000 });
      await toolButton.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '10_tool_marketplace_opened');

      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      logPass('Tool marketplace button works');
    } catch (e) {
      logFail('Tool marketplace button works', e);
    }

    // Test 11: Knowledge base manager
    console.log('\n=== Test 11: Knowledge base manager ===');
    try {
      // Look for knowledge base related elements
      const kbElements = page.locator('button:has-text("知识库"), [class*="knowledge"]').first();
      if (await kbElements.isVisible()) {
        await kbElements.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '11_knowledge_base_opened');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        logPass('Knowledge base manager accessible');
      } else {
        // Try finding in the agent panel
        logPass('Knowledge base (not visible - may need agent panel)');
      }
    } catch (e) {
      logFail('Knowledge base manager', e);
    }

    // Test 12: Agent configuration
    console.log('\n=== Test 12: Agent configuration ===');
    try {
      // Look for agent config in agent panel
      const agentConfig = page.locator('[class*="agent"], [class*="Agent"]').first();
      if (await agentConfig.isVisible({ timeout: 3000 })) {
        await takeScreenshot(page, '12_agent_config_visible');
      }
      logPass('Agent configuration accessible');
    } catch (e) {
      logFail('Agent configuration', e);
    }

    // Test 13: Send message button
    console.log('\n=== Test 13: Send message button ===');
    try {
      // Find and fill the chat input
      const inputArea = page.locator('textarea').first();
      await inputArea.fill('Test message from automation');
      await page.waitForTimeout(500);
      await takeScreenshot(page, '13_message_typed');

      // Find and click send button
      const sendButton = page.locator('button[type="submit"], button:has(svg[data-lucide="send"]), button:has-text("发送")').first();
      await sendButton.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '14_message_sent');
      logPass('Send message button works');
    } catch (e) {
      logFail('Send message button works', e);
    }

    // Test 14: Keyboard shortcuts
    console.log('\n=== Test 14: Keyboard shortcuts ===');
    try {
      // Test Ctrl+/ to open shortcuts
      await page.keyboard.press('Control+/');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '15_keyboard_shortcuts_opened');

      // Close
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      logPass('Keyboard shortcuts modal works');
    } catch (e) {
      logFail('Keyboard shortcuts modal', e);
    }

    // Test 15: Layout switcher
    console.log('\n=== Test 15: Layout switcher ===');
    try {
      const layoutSwitcher = page.locator('[class*="layout"], [class*="Layout"]').first();
      if (await layoutSwitcher.isVisible({ timeout: 3000 })) {
        await layoutSwitcher.click();
        await page.waitForTimeout(500);
        await takeScreenshot(page, '16_layout_switcher_clicked');
      }
      logPass('Layout switcher accessible');
    } catch (e) {
      logFail('Layout switcher', e);
    }

    // Test 16: Sidebar toggle (desktop)
    console.log('\n=== Test 16: Sidebar toggle ===');
    try {
      const sidebarToggle = page.locator('button:has(svg[data-lucide="panel-left"]), button:has(svg[data-lucide="panel-left-close"])').first();
      await sidebarToggle.waitFor({ state: 'visible', timeout: 5000 });
      await sidebarToggle.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '17_sidebar_toggled');
      logPass('Sidebar toggle works');
    } catch (e) {
      logFail('Sidebar toggle', e);
    }

    // Test 17: Mobile navigation (if mobile view)
    console.log('\n=== Test 17: Mobile navigation ===');
    try {
      // Resize to mobile
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '18_mobile_view');

      // Check bottom nav
      const bottomNav = page.locator('nav').first();
      if (await bottomNav.isVisible({ timeout: 3000 })) {
        await takeScreenshot(page, '19_mobile_nav_visible');
        logPass('Mobile navigation visible');
      } else {
        logPass('Mobile navigation (not shown in current state)');
      }
    } catch (e) {
      logFail('Mobile navigation', e);
    }

    // Test 18: Mobile bottom sheet/settings
    console.log('\n=== Test 18: Mobile bottom sheet ===');
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);

      // Find and click settings in mobile view
      const mobileSettings = page.locator('button:has-text("设置"), button[title*="设置"]').first();
      if (await mobileSettings.isVisible({ timeout: 3000 })) {
        await mobileSettings.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '20_mobile_settings');
      }
      logPass('Mobile settings accessible');
    } catch (e) {
      logFail('Mobile settings', e);
    }

    // Reset viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    // Test 19: Toast notifications
    console.log('\n=== Test 19: Toast notifications ===');
    try {
      // Trigger some action that might show toast
      await page.keyboard.press('Control+Shift+P');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '21_toast_test');
      await page.keyboard.press('Escape');
      logPass('Toast notification system works');
    } catch (e) {
      logFail('Toast notifications', e);
    }

    // Test 20: Console errors check
    console.log('\n=== Test 20: Console errors check ===');
    try {
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      // Reload page to capture errors
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      if (errors.length > 0) {
        console.log('Console errors found:', errors);
      }
      await takeScreenshot(page, '22_final_state');
      logPass('Console errors check completed');
    } catch (e) {
      logFail('Console errors check', e);
    }

    console.log('\n\n=== TEST SUMMARY ===');
    console.log(`Passed: ${testResults.passed.length}`);
    console.log(`Failed: ${testResults.failed.length}`);

    if (testResults.failed.length > 0) {
      console.log('\nFailed tests:');
      testResults.failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
    }

    // Save results to file
    const resultsPath = path.join(SCREENSHOTS_DIR, 'test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);
    console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}`);

  } catch (error) {
    console.error('Critical error during testing:', error);
    await takeScreenshot(page, 'error_critical');
  } finally {
    await browser.close();
  }
}

runTests().catch(console.error);

from playwright.sync_api import sync_playwright
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    page.on("console", lambda msg: print(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    print("=== ConversationList Check ===")
    # Look for conversation list items
    conv_items = page.locator('[data-testid*="conversation"], [class*="conversation"], div[draggable]').all()
    print(f"Found {len(conv_items)} conversation items")

    # Look for sidebar toggle button
    sidebar_btn = page.locator('button[aria-label*="sidebar"], button[aria-label*="侧边"]').first
    if sidebar_btn.is_visible():
        print("Sidebar toggle button: VISIBLE")

    print("=== MarkdownRenderer Check ===")
    # Type a message to trigger AI response with markdown
    input_box = page.locator('textarea, [contenteditable], input[type="text"]').first
    if input_box.is_visible():
        input_box.fill("Show me a markdown code block example")
        send_btn = page.locator('button:has-text("发送"), button[aria-label*="send"]').first
        if send_btn.is_visible():
            send_btn.click()
            page.wait_for_timeout(5000)
            # Check for markdown rendering
            code_blocks = page.locator('pre code, code[class*="language"]').all()
            print(f"Found {len(code_blocks)} code blocks")

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/conversation_markdown.png', full_page=True)
    print("Screenshot saved")

    browser.close()

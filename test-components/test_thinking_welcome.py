from playwright.sync_api import sync_playwright
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    print("=== ThinkingChain Check ===")
    # ThinkingChain should appear during AI response
    input_box = page.locator('textarea').first
    if input_box.is_visible():
        input_box.fill("Think step by step about 2+2")
        send_btn = page.locator('button:has-text("发送")').first
        if send_btn.is_visible():
            send_btn.click()
            page.wait_for_timeout(8000)
            # Look for thinking/chain elements
            thinking = page.locator('[class*="thinking"], [class*="chain"], [class*="step"]').all()
            print(f"Found {len(thinking)} thinking chain elements")

    print("=== WelcomeGuide Check ===")
    # WelcomeGuide should show for first-time users
    welcome = page.locator('[class*="welcome"], [class*="guide"], [role="dialog"]').all()
    print(f"Found {len(welcome)} welcome/guide elements")

    # Check for logo
    logo = page.locator('[class*="logo"], img[alt*="logo"], svg').first
    if logo.is_visible():
        print("Logo: VISIBLE")

    print("=== Console Errors ===")
    for e in errors:
        print(e)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/thinking_welcome.png', full_page=True)
    print("Screenshot saved")

    browser.close()

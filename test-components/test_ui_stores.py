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
    page.wait_for_timeout(2000)

    # Close welcome/guide modal if present
    try:
        close_btn = page.locator('button:has-text("跳过"), button:has-text("跳过引导"), button:has-text("Close"), button[aria-label*="close"]').first
        if close_btn.is_visible(timeout=3000):
            close_btn.click()
            page.wait_for_timeout(500)
            print("Welcome guide closed")
    except Exception:
        pass
    # Also try ESC to dismiss any modal
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    print("=== Theme Toggle Test ===")
    # Test theme switching
    theme_btn = page.locator('button[aria-label*="theme"], button[aria-label*="主题"], button:has-text("🌙"), button:has-text("☀️")').first
    if theme_btn.is_visible():
        theme_btn.click()
        page.wait_for_timeout(500)
        print("Theme toggled")

    print("=== Settings Panel Test ===")
    settings_btn = page.locator('button:has-text("设置"), button[aria-label*="setting"]').first
    if settings_btn.is_visible():
        settings_btn.click(force=True, timeout=5000)
        page.wait_for_timeout(1000)
        print("Settings panel opened")
        # Close with ESC
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        print("ESC pressed to close")

    print("=== Memory Panel Test ===")
    memory_btn = page.locator('button:has-text("记忆"), button[aria-label*="memory"]').first
    if memory_btn.is_visible():
        memory_btn.click()
        page.wait_for_timeout(1000)
        print("Memory panel opened")

    print("=== Console Errors ===")
    for e in errors[:10]:
        print(e)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/ui_test.png', full_page=True)
    print("Screenshot saved")

    browser.close()

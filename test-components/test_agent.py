from playwright.sync_api import sync_playwright
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

def handle_console(msg):
    if msg.type == "error":
        errors.append(f"[{msg.type}] {msg.text}")
    elif msg.type == "warning":
        warnings.append(f"[{msg.type}] {msg.text}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    warnings = []
    page.on("console", handle_console)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    # Close any overlay/welcome dialog first
    print("=== Checking for Overlays ===")
    overlay_close = page.locator('button[aria-label="Close"], button:has-text("跳过"), button:has-text("跳过引导"), button[title="Close"], [aria-modal="true"] button').first
    if overlay_close.is_visible(timeout=2000):
        try:
            overlay_close.click(timeout=3000)
            print("Closed overlay")
        except:
            pass

    page.wait_for_timeout(1000)

    print("=== Agent Mode Button Check ===")
    agent_btn = page.locator('button:has-text("Agent"), button:has-text("任务"), button[title*="Agent"], button[aria-label*="Agent"]').first
    if agent_btn.is_visible():
        print("Agent button: VISIBLE")
        try:
            agent_btn.click(force=True, timeout=5000)
            page.wait_for_timeout(2000)
            print("Agent button clicked")
            # Check if MissionControl panel appears
            mission = page.locator('[data-mission-control]').all()
            print(f"Found {len(mission)} mission control elements")
        except Exception as e:
            print(f"Click failed: {e}")
    else:
        print("Agent button: NOT FOUND")

    print("=== Console Errors ===")
    for e in errors[:10]:
        print(e)

    print("=== Console Warnings ===")
    for w in warnings[:20]:
        if any(kw in w.lower() for kw in ["not found", "reexport", "missioncontrol", "cannot find", "failed to", "error", "chunk"]):
            print(w)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/agent_test.png', full_page=True)
    print("Screenshot saved")

    browser.close()

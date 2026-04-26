from playwright.sync_api import sync_playwright
import os
import urllib.request
import json

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Intercept API calls
    api_calls = []
    page.on("response", lambda resp: api_calls.append(f"{resp.status} {resp.url}") if "/api/" in resp.url or "/chat" in resp.url else None)

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    print("=== API Endpoints Check ===")
    # Test backend API
    try:
        # Health check
        req = urllib.request.urlopen('http://localhost:30000/api/health', timeout=5)
        print(f"Backend health: {req.status}")
    except Exception as e:
        print(f"Backend health check: {e}")

    print("=== Message Send API Test ===")
    input_box = page.locator('textarea').first
    if input_box.is_visible():
        input_box.fill("API test message")
        send_btn = page.locator('button:has-text("发送")').first
        if send_btn.is_visible():
            send_btn.click()
            page.wait_for_timeout(8000)  # Wait for SSE response
            print("Message sent, waiting for response...")

    print("=== Captured API Calls ===")
    for call in api_calls[:20]:
        print(call)

    print("=== Console Errors ===")
    for e in errors[:10]:
        print(e)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/api_test.png', full_page=True)
    print("Screenshot saved")

    browser.close()

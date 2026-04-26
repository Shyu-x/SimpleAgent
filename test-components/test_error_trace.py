from playwright.sync_api import sync_playwright
import urllib.request
import json
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('domcontentloaded', timeout=15000)
    page.wait_for_timeout(3000)

    print("=== Error Boundary Test ===")
    # Force an error by navigating to non-existent route
    page.goto('http://localhost:8080/nonexistent-route-xyz123', timeout=15000)
    page.wait_for_timeout(2000)
    # Check for error fallback UI
    error_fallback = page.locator('[class*="error"], [class*="fallback"], [role="alert"]').all()
    print(f"Found {len(error_fallback)} error elements")
    # Go back
    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('domcontentloaded', timeout=15000)
    page.wait_for_timeout(2000)

    print("=== Prompt Template API ===")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/prompts', timeout=5)
        data = json.loads(req.read())
        print(f"Prompts API: status={req.status}, count={len(data.get('data', {}).get('templates', [])) if isinstance(data, dict) else 'N/A'}")
    except Exception as e:
        print(f"Prompts API: {e}")

    print("=== Trace API ===")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/trace', timeout=5)
        data = json.loads(req.read())
        print(f"Trace API: status={req.status}, type={type(data).__name__}")
    except Exception as e:
        print(f"Trace API: {e}")

    print("=== Console Errors ===")
    for e in errors[:10]:
        print(e)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/error_trace_test.png', full_page=True)
    print("Screenshot saved")

    browser.close()

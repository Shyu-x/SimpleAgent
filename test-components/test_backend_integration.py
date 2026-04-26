from playwright.sync_api import sync_playwright
import urllib.request
import json
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

# Test backend routes directly first
print("=== Backend Routes Test ===")

routes_to_test = [
    ('/api/health', 'GET'),
    ('/api/admin/stats', 'GET'),
    ('/api/admin/knowledge/docs', 'GET'),
    ('/api/admin/tools', 'GET'),
    ('/api/admin/models', 'GET'),
    ('/api/admin/prompts', 'GET'),
    ('/api/ollama/status', 'GET'),
]

for route, method in routes_to_test:
    try:
        req = urllib.request.urlopen(f'http://localhost:30000{route}', timeout=5)
        data = req.read().decode()[:100]
        print(f"{method} {route}: {req.status} - {data[:80]}")
    except urllib.error.HTTPError as e:
        print(f"{method} {route}: HTTP {e.code}")
    except Exception as e:
        print(f"{method} {route}: {e}")

# Now test via browser
print("\n=== Browser Integration Test ===")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(3000)

    print("=== Full Chat Flow Test ===")
    input_box = page.locator('textarea').first
    if input_box.is_visible():
        # Send a message
        input_box.fill("Hello AI, what is 1+1?")
        send_btn = page.locator('button:has-text("发送")').first
        if send_btn.is_visible():
            send_btn.click()
            page.wait_for_timeout(10000)
            print("Message sent, waited for AI response")

    print("=== Console Errors ===")
    for e in errors[:10]:
        print(e)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/backend_integration.png', full_page=True)
    print("Screenshot saved")

    browser.close()

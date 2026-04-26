from playwright.sync_api import sync_playwright
import os
import urllib.request
import json

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(2000)

    print("=== Page Load ===")
    print(f"Title: {page.title()}")

    # Close any modal overlay first
    try:
        modal = page.locator('.fixed.inset-0.z-\\[100\\]').first
        if modal.is_visible():
            close_btn = modal.locator('button, [aria-label="close"], .close, [class*="close"]').first
            if close_btn.is_visible():
                close_btn.click()
                page.wait_for_timeout(500)
                print("Modal closed")
            else:
                # Try pressing Escape
                page.keyboard.press('Escape')
                page.wait_for_timeout(500)
                print("Pressed Escape to close modal")
    except Exception as e:
        print(f"Modal handling: {e}")

    print("\n=== Admin Dashboard Access ===")
    try:
        admin_link = page.locator('a[href*="admin"]').first
        if admin_link.is_visible():
            admin_link.click()
            page.wait_for_timeout(3000)
            print(f"Navigated to: {page.url()}")
        else:
            print("Admin link not visible, trying direct navigation")
            page.goto('http://localhost:8080/admin', timeout=15000)
            page.wait_for_timeout(3000)
            print(f"Direct nav to: {page.url()}")
    except Exception as e:
        print(f"Admin navigation: {e}")
        page.goto('http://localhost:8080/admin', timeout=15000)
        page.wait_for_timeout(3000)

    print("\n=== API Tests ===")

    print("\n--- Stats API (/api/admin/stats) ---")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/stats', timeout=5)
        data = json.loads(req.read())
        print(f"Status: {req.status}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Stats API Error: {e}")

    print("\n--- Knowledge API (/api/admin/knowledge/docs) ---")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/knowledge/docs', timeout=5)
        data = json.loads(req.read())
        print(f"Status: {req.status}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Knowledge API Error: {e}")

    print("\n--- Tools API (/api/admin/tools) ---")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/tools', timeout=5)
        data = json.loads(req.read())
        print(f"Status: {req.status}")
        print(f"Tools count: {len(data.get('data', {}).get('tools', []))}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Tools API Error: {e}")

    print("\n--- Tool Categories API (/api/admin/tools/categories) ---")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/tools/categories', timeout=5)
        data = json.loads(req.read())
        print(f"Status: {req.status}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Categories API Error: {e}")

    print("\n--- Models API (/api/admin/models) ---")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/models', timeout=5)
        data = json.loads(req.read())
        print(f"Status: {req.status}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Models API Error: {e}")

    print("\n--- Models Stats API (/api/admin/models/stats) ---")
    try:
        req = urllib.request.urlopen('http://localhost:30000/api/admin/models/stats', timeout=5)
        data = json.loads(req.read())
        print(f"Status: {req.status}")
        print(f"Response: {json.dumps(data, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Models Stats API Error: {e}")

    print("\n--- Model PATCH API ---")
    try:
        data = json.dumps({"enabled": False}).encode()
        req = urllib.request.Request(
            'http://localhost:30000/api/admin/models/MiniMax-M2.7',
            data=data,
            headers={'Content-Type': 'application/json'},
            method='PATCH'
        )
        resp = urllib.request.urlopen(req, timeout=5)
        result = json.loads(resp.read())
        print(f"PATCH Status: {resp.status}")
        print(f"Response: {json.dumps(result, ensure_ascii=False)[:200]}")
    except Exception as e:
        print(f"PATCH /models/: {e}")

    print("\n--- Model Circuit Breaker Reset ---")
    try:
        data = json.dumps({"action": "reset"}).encode()
        req = urllib.request.Request(
            'http://localhost:30000/api/admin/models/MiniMax-M2.7/circuit-breaker',
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        resp = urllib.request.urlopen(req, timeout=5)
        result = json.loads(resp.read())
        print(f"POST circuit-breaker Status: {resp.status}")
        print(f"Response: {json.dumps(result, ensure_ascii=False)[:200]}")
    except Exception as e:
        print(f"POST /circuit-breaker: {e}")

    print("\n--- Tool Test API (non-SSE) ---")
    try:
        data = json.dumps({"params": {}, "timeout": 5000}).encode()
        req = urllib.request.Request(
            'http://localhost:30000/api/admin/tools/search_web/test',
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        resp = urllib.request.urlopen(req, timeout=10)
        result = json.loads(resp.read())
        print(f"Tool test Status: {resp.status}")
        print(f"Response: {json.dumps(result, ensure_ascii=False)[:300]}")
    except Exception as e:
        print(f"Tool test: {e}")

    print("\n=== Console Errors ===")
    error_count = 0
    for e in errors:
        if error_count < 10:
            print(e)
        error_count += 1
    print(f"Total errors: {error_count}")

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/admin_test.png', full_page=True)
    print("\nScreenshot saved to test-components/admin_test.png")

    browser.close()

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

    print("=== Layout Structure Check ===")
    # Check header
    header = page.locator('header, [class*="header"], [class*="nav"]').first
    print(f"Header visible: {header.is_visible()}")

    # Check main content area
    main = page.locator('main, [class*="main"], [class*="content"]').first
    print(f"Main content visible: {main.is_visible()}")

    # Check sidebar
    sidebar = page.locator('[class*="sidebar"], [class*="aside"]').first
    print(f"Sidebar visible: {sidebar.is_visible()}")

    print("=== MultiWindow Layout Buttons ===")
    # Look for layout switch buttons
    layout_btns = page.locator('button:has-text("单窗口"), button:has-text("并排"), button:has-text("堆叠"), button:has-text("网格")').all()
    print(f"Found {len(layout_btns)} layout buttons")

    # Try clicking layout buttons
    for btn in layout_btns:
        try:
            btn.click()
            page.wait_for_timeout(500)
            print(f"Clicked: {btn.inner_text()}")
        except:
            pass

    print("=== Responsive Check ===")
    # Desktop
    page.set_viewport_size({"width": 1920, "height": 1080})
    page.wait_for_timeout(500)
    desktop_main = page.locator('main').first
    print(f"Desktop main visible: {desktop_main.is_visible()}")

    # Tablet
    page.set_viewport_size({"width": 768, "height": 1024})
    page.wait_for_timeout(500)
    # Reload for responsive
    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=20000)
    page.wait_for_timeout(2000)
    print("Tablet view loaded")

    # Mobile
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(500)
    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=20000)
    page.wait_for_timeout(2000)
    print("Mobile view loaded")

    print("=== Errors ===")
    for e in errors[:10]:
        print(e)

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/multiwindow_layout.png', full_page=True)
    print("Screenshot saved")

    browser.close()

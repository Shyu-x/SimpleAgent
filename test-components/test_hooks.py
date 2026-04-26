from playwright.sync_api import sync_playwright
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})

    errors = []

    def on_console(msg):
        if msg.type == "error":
            errors.append(f"[ERROR] {msg.text}")

    page.on("console", on_console)
    page.on("pageerror", lambda e: errors.append(f"[PAGE ERROR] {e}"))

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('domcontentloaded', timeout=30000)
    page.wait_for_timeout(2000)
    page.keyboard.press('Escape')
    page.wait_for_timeout(1000)

    textarea = page.locator('textarea').first
    print(f"Textarea ready: {textarea.is_visible()}")

    # ==================== TEST 1: fill() with English ====================
    print("\n=== Test 1: fill() English ===")
    textarea.fill("")
    page.wait_for_timeout(300)
    textarea.fill("search weather today")
    page.wait_for_timeout(1200)  # Wait for debounce + render

    found = page.evaluate("""
        () => {
            const allEls = document.querySelectorAll('*');
            const results = [];
            for (const el of allEls) {
                const cls = typeof el.className === 'string' ? el.className : '';
                if ((cls.includes('intent') || cls.includes('banner') || cls.includes('suggestion'))
                    && el.offsetParent !== null && el.textContent.trim()) {
                    results.push({ cls: cls.substring(0, 80), txt: el.textContent.substring(0, 60) });
                }
            }
            return results;
        }
    """)
    print(f"  Banner elements: {len(found)}")
    for f in found:
        print(f"    {f}")

    textarea.fill("")
    page.wait_for_timeout(300)

    # ==================== TEST 2: type() with Chinese ====================
    print("\n=== Test 2: type() Chinese ===")
    textarea.click()
    # type() with delay to simulate real typing
    textarea.type("搜索今天的天气", delay=50)
    page.wait_for_timeout(1500)

    val = textarea.input_value()
    print(f"  Textarea value length: {len(val)} (expected 7)")

    found2 = page.evaluate("""
        () => {
            const allEls = document.querySelectorAll('*');
            const results = [];
            for (const el of allEls) {
                const cls = typeof el.className === 'string' ? el.className : '';
                if ((cls.includes('intent') || cls.includes('banner') || cls.includes('suggestion'))
                    && el.offsetParent !== null && el.textContent.trim()) {
                    results.push({ cls: cls.substring(0, 80), txt: el.textContent.substring(0, 60) });
                }
            }
            return results;
        }
    """)
    print(f"  Banner elements: {len(found2)}")
    for f in found2:
        print(f"    {f}")

    # ==================== TEST 3: Check if intent banner is in the DOM but hidden ====================
    print("\n=== Test 3: All intent-related DOM elements ===")
    all_intents = page.evaluate("""
        () => {
            const allEls = document.querySelectorAll('*');
            const results = [];
            for (const el of allEls) {
                const cls = typeof el.className === 'string' ? el.className : '';
                if (cls.includes('intent') || cls.includes('banner') || cls.includes('suggestion')) {
                    results.push({
                        cls: cls.substring(0, 100),
                        visible: el.offsetParent !== null,
                        txt: (el.textContent || '').substring(0, 40),
                        display: window.getComputedStyle(el).display,
                        visibility: window.getComputedStyle(el).visibility
                    });
                }
            }
            return results;
        }
    """)
    print(f"  Total intent-related elements: {len(all_intents)}")
    for el in all_intents[:10]:
        print(f"    visible={el['visible']}, display={el['display']}, cls={el['cls']}")

    # ==================== TEST 4: Direct state injection test ====================
    print("\n=== Test 4: Direct state via React DevTools or setState ===")

    # Clear textarea first
    textarea.fill("")
    page.wait_for_timeout(500)

    # Try using page.keyboard to type
    textarea.click()
    page.keyboard.type("搜索今天的天气", delay=50)
    page.wait_for_timeout(2000)

    val_final = textarea.input_value()
    print(f"  After keyboard.type: value length = {len(val_final)}")

    found_final = page.evaluate("""
        () => {
            const allEls = document.querySelectorAll('*');
            const results = [];
            for (const el of allEls) {
                const cls = typeof el.className === 'string' ? el.className : '';
                if ((cls.includes('intent') || cls.includes('banner') || cls.includes('suggestion'))
                    && el.offsetParent !== null && el.textContent.trim()) {
                    results.push({ cls: cls.substring(0, 80), txt: el.textContent.substring(0, 60) });
                }
            }
            return results;
        }
    """)
    print(f"  Banner elements after keyboard.type: {len(found_final)}")
    for f in found_final:
        print(f"    {f}")

    print("\n=== Summary ===")
    print(f"  fill() with English: tested")
    print(f"  type() with Chinese: {len(val)} chars in textarea")
    print(f"  keyboard.type() with Chinese: {len(val_final)} chars in textarea")
    print(f"  Banners after fill (EN): {len(found)}")
    print(f"  Banners after type (CN): {len(found2)}")
    print(f"  Banners after keyboard.type (CN): {len(found_final)}")

    print("\n=== Console Errors ===")
    if errors:
        for e in errors[:10]:
            print(e)
    else:
        print("No console errors")

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/hooks_test_final.png', full_page=True)
    print("\nScreenshot saved")

    browser.close()

from playwright.sync_api import sync_playwright
import os

os.makedirs('C:/Users/Xu/Desktop/chat玩具/test-components', exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('domcontentloaded', timeout=30000)
    page.wait_for_timeout(4000)

    # === 关闭欢迎弹窗 ===
    print("=== 关闭欢迎弹窗 ===")
    page.keyboard.press('Escape')
    page.wait_for_timeout(1000)
    try:
        skip_btn = page.get_by_role('button', name='跳过').first
        skip_btn.click(timeout=2000)
        page.wait_for_timeout(500)
        print("  [OK] 跳过欢迎指南")
    except Exception:
        try:
            got_it = page.get_by_role('button', name='Got it').first
            got_it.click(timeout=2000)
            page.wait_for_timeout(500)
            print("  [OK] 关闭 Got it")
        except Exception as e:
            print(f"  无欢迎弹窗遮罩: {type(e).__name__}")

    # === 测试1: 新建对话 ===
    print("=== 测试1: 新建对话 ===")
    try:
        new_btn = page.get_by_role('button', name='新建').first
        new_btn.click(timeout=3000, force=True)
        page.wait_for_timeout(1000)
        print("  [OK] 新建对话按钮已点击")
    except Exception as e:
        print(f"  [WARN] 新建按钮未找到: {type(e).__name__}")

    # === 测试2: 发送消息 ===
    print("=== 测试2: 发送消息 ===")
    textarea = page.locator('textarea').first
    if textarea.is_visible():
        textarea.click(timeout=2000)
        textarea.fill("测试消息 store 验证")
        page.wait_for_timeout(500)
        # 按 Enter 发送
        page.keyboard.press('Enter')
        page.wait_for_timeout(6000)
        print("  [OK] 消息已发送 (Enter)")
        msg_count = page.locator('[class*="message"], [class*="chat"]').count()
        print(f"  消息元素数量: {msg_count}")
    else:
        print("  [FAIL] textarea 不可见")

    # === 测试3: 侧边栏切换 ===
    print("=== 测试3: 侧边栏切换 ===")
    try:
        sidebar_btn = page.locator('button').filter(has_text='☰').first
        sidebar_btn.click(timeout=3000, force=True)
        page.wait_for_timeout(500)
        print("  [OK] 侧边栏已切换")
    except Exception as e:
        print(f"  [WARN] 侧边栏按钮: {type(e).__name__}")

    # === 测试4: sessionStorage 中的 Store 数据 ===
    print("=== 测试4: sessionStorage 数据检查 ===")
    store_keys = page.evaluate("() => Object.keys(sessionStorage)")
    print(f"  sessionStorage keys: {store_keys}")
    for key in store_keys:
        val = page.evaluate(f"() => {{ const v = sessionStorage.getItem('{key}'); return v ? (v.length > 300 ? v.slice(0,300) + '...' : v) : null; }}")
        print(f"  [{key}]: {val}")

    # === 测试5: 验证 store 关键字段 ===
    print("=== 测试5: Store 状态验证 ===")
    # 检查 zustand 数据结构
    state_check = page.evaluate("""() => {
        try {
            const raw = sessionStorage.getItem('ai-chat-storage');
            if (!raw) return { error: 'no ai-chat-storage' };
            const parsed = JSON.parse(raw);
            const state = parsed.state || parsed;
            return {
                hasConversations: Array.isArray(state.conversations),
                conversationsCount: state.conversations ? state.conversations.length : 0,
                hasActiveConvId: state.activeConversationId !== undefined,
                activeConvId: state.activeConversationId,
                hasHydrated: state.hasHydrated,
            };
        } catch(e) { return { error: e.message }; }
    }""")
    print(f"  chatStore: {state_check}")

    conv_state = page.evaluate("""() => {
        try {
            const raw = sessionStorage.getItem('ai-chat-conversations');
            if (!raw) return { error: 'no ai-chat-conversations' };
            const parsed = JSON.parse(raw);
            const state = parsed.state || parsed;
            return {
                hasConversations: Array.isArray(state.conversations),
                conversationsCount: state.conversations ? state.conversations.length : 0,
                hasActiveConvId: state.activeConversationId !== undefined,
                activeConvId: state.activeConversationId,
            };
        } catch(e) { return { error: e.message }; }
    }""")
    print(f"  conversationStore: {conv_state}")

    # === 控制台错误 ===
    print("=== 控制台错误 ===")
    if errors:
        for e in errors[:10]:
            print(f"  {e}")
    else:
        print("  无错误")

    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-components/store_test.png', full_page=True)
    print("截图已保存: C:/Users/Xu/Desktop/chat玩具/test-components/store_test.png")
    browser.close()

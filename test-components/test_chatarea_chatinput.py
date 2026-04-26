from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # Enable console logging
    page.on("console", lambda msg: print(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)

    page.goto('http://localhost:8080', timeout=30000)
    page.wait_for_load_state('networkidle', timeout=30000)
    page.wait_for_timeout(3000)  # Extra wait for React hydration

    # Check ChatArea renders
    print("=== ChatArea Check ===")
    chat_area = page.locator('.relative.flex.h-full.flex-col.bg-transparent')
    if chat_area.count() > 0:
        print("ChatArea: 渲染成功 (.relative.flex.h-full.flex-col.bg-transparent)")
    else:
        print("ChatArea: 未找到主容器")

    # Check for welcome guide
    welcome_title = page.locator('h2:has-text("从一个问题开始")')
    if welcome_title.count() > 0:
        print("ChatArea: 欢迎指南已渲染")
    else:
        print("ChatArea: 欢迎指南未找到")

    # Check quick start buttons
    quick_buttons = page.locator('button:has-text("代码协作")')
    if quick_buttons.count() > 0:
        print("ChatArea: 快捷开始按钮已渲染")
    else:
        print("ChatArea: 快捷开始按钮未找到")

    # Check ChatInput renders
    print("\n=== ChatInput Check ===")
    textarea = page.locator('textarea[placeholder*="发送消息"]')
    if textarea.count() > 0:
        print("ChatInput: 文本输入框已渲染")
    else:
        print("ChatInput: 文本输入框未找到")

    send_button = page.locator('[data-testid="send-button"]')
    if send_button.count() > 0:
        print("ChatInput: 发送按钮已渲染")
    else:
        print("ChatInput: 发送按钮未找到")

    # Check model selector button
    model_btn = page.locator('button:has-text("MiniMax")')
    if model_btn.count() > 0:
        print("ChatInput: 模型选择器已渲染")
    else:
        print("ChatInput: 模型选择器未找到")

    # Check tool toggle buttons
    web_search_btn = page.locator('button:has-text("联网搜索")')
    if web_search_btn.count() > 0:
        print("ChatInput: 联网搜索按钮已渲染")
    else:
        print("ChatInput: 联网搜索按钮未找到")

    deep_thinking_btn = page.locator('button:has-text("深度思考")')
    if deep_thinking_btn.count() > 0:
        print("ChatInput: 深度思考按钮已渲染")
    else:
        print("ChatInput: 深度思考按钮未找到")

    image_gen_btn = page.locator('button:has-text("图片生成")')
    if image_gen_btn.count() > 0:
        print("ChatInput: 图片生成按钮已渲染")
    else:
        print("ChatInput: 图片生成按钮未找到")

    # Check voice/image buttons
    mic_btn = page.locator('button[aria-label="语音输入"]')
    if mic_btn.count() > 0:
        print("ChatInput: 语音输入按钮已渲染")
    else:
        print("ChatInput: 语音输入按钮未找到")

    upload_btn = page.locator('button[aria-label="上传图片"]')
    if upload_btn.count() > 0:
        print("ChatInput: 图片上传按钮已渲染")
    else:
        print("ChatInput: 图片上传按钮未找到")

    # Take screenshot
    page.screenshot(path='C:/Users/Xu/Desktop/chat玩具/test-results/chatarea_chatinput.png', full_page=True)
    print("\n截图已保存到 test-results/chatarea_chatinput.png")

    browser.close()

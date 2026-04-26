"""
AI Chat - Dialogue Scenario Test
Using Playwright to test API endpoints directly
"""
import json
import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:30000"
MODEL = "MiniMax-M2.7"

def send_chat(messages, page):
    """Send chat request and get response"""
    start_time = time.time()

    # Direct API call via fetch
    response = page.evaluate(f"""
        async () => {{
            const msgs = {json.dumps(messages)};
            const response = await fetch('/api/chat', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{ messages: msgs, model: '{MODEL}', stream: false }})
            }});
            return await response.json();
        }}
    """)

    latency = int((time.time() - start_time) * 1000)

    # Extract response content
    content = ""
    if isinstance(response, dict):
        if 'content' in response:
            content = response['content']
        elif 'response' in response:
            content = response['response']
        elif 'error' in response:
            content = f"[错误] {response['error']}"

    return {
        'response': content,
        'latency': latency,
        'raw': response
    }

def test_scenario(name, turns, page):
    """Run a single dialogue scenario"""
    print(f"\n{'='*60}")
    print(f"[Scenario] {name}")
    print(f"{'='*60}")

    context = []
    results = []

    for i, turn in enumerate(turns, 1):
        print(f"\n--- Turn {i} ---")
        print(f"[User] {turn['message']}")

        # Build messages
        messages = context + [{'role': 'user', 'content': turn['message']}]

        # Send request
        result = send_chat(messages, page)

        print(f"\n[Agent] Response ({result['latency']}ms):")
        print("-" * 40)

        # Display response
        response_text = result['response']
        display_text = response_text[:300] + "..." if len(response_text) > 300 else response_text
        print(display_text if display_text else "[空响应]")

        # Token estimation
        chinese_chars = sum(1 for c in response_text if '\u4e00' <= c <= '\u9fff')
        other_chars = len(response_text) - chinese_chars
        estimated_tokens = chinese_chars // 2 + other_chars // 4
        print(f"\n[Token] Estimated: {estimated_tokens}")

        # Update context
        context.append({'role': 'user', 'content': turn['message']})
        context.append({'role': 'assistant', 'content': response_text})

        results.append({
            'turn': i,
            'user': turn['message'],
            'response': response_text,
            'latency': result['latency'],
            'tokens': estimated_tokens
        })

    return results

def main():
    print("="*60)
    print("AI Chat - Dialogue Scenario Test")
    print("="*60)
    print(f"\nTarget: {BASE_URL}")
    print(f"Model: {MODEL}")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    scenarios = [
        {
            'name': 'Tech Q&A - Progressive',
            'turns': [
                {'message': '什么是JavaScript的闭包？请用简单的话解释。'},
                {'message': '那它和普通函数有什么区别？'},
                {'message': '能给我一个实际的开发场景例子吗？'}
            ]
        },
        {
            'name': 'Code Debugging',
            'turns': [
                {'message': '这段代码报错：TypeError: Cannot read property "map" of undefined'},
                {'message': '这是出错的部分：const data = fetchData(); data.map(x => x.id)'},
                {'message': '怎么修改才能避免这个错误？'}
            ]
        },
        {
            'name': 'Knowledge Q&A with Context',
            'turns': [
                {'message': '请介绍一下北京的历史。'},
                {'message': '那现在的经济发展如何？'},
                {'message': '有哪些著名的旅游景点？'}
            ]
        },
        {
            'name': 'Creative Generation',
            'turns': [
                {'message': '帮我想3个科技公司的名称，要简洁有创意。'},
                {'message': '第一个公司用什么颜色的logo比较好？'},
                {'message': '描述一下这个logo的样子。'}
            ]
        }
    ]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Access backend to ensure connection
        page.goto(f"{BASE_URL}/api/health")
        page.wait_for_timeout(500)

        all_results = []
        total_tokens = 0
        total_latency = 0

        for scenario in scenarios:
            results = test_scenario(scenario['name'], scenario['turns'], page)
            all_results.append({
                'name': scenario['name'],
                'turns': results
            })

            # Statistics
            for r in results:
                total_tokens += r['tokens']
                total_latency += r['latency']

        browser.close()

    # Output summary report
    print("\n\n" + "="*60)
    print("Test Summary Report")
    print("="*60)

    print(f"\nTotal scenarios: {len(all_results)}")
    print(f"Total turns: {sum(len(s['turns']) for s in all_results)}")
    print(f"Total tokens: {total_tokens}")
    print(f"Total latency: {total_latency}ms")

    print("\n[Scenario Details]:")
    print("-"*60)
    for i, s in enumerate(all_results, 1):
        total_scene_tokens = sum(t['tokens'] for t in s['turns'])
        total_scene_latency = sum(t['latency'] for t in s['turns'])
        avg_latency = total_scene_latency // len(s['turns'])
        print(f"\n{i}. {s['name']}")
        print(f"   Turns: {len(s['turns'])} | Tokens: {total_scene_tokens} | Avg latency: {avg_latency}ms")
        for t in s['turns']:
            response_preview = t['response'][:50] + "..." if len(t['response']) > 50 else t['response']
            print(f"   - Turn {t['turn']}: {t['latency']}ms | {response_preview}")

    # Save report
    report = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'base_url': BASE_URL,
        'model': MODEL,
        'scenarios': all_results,
        'summary': {
            'total_scenarios': len(all_results),
            'total_turns': sum(len(s['turns']) for s in all_results),
            'total_tokens': total_tokens,
            'total_latency_ms': total_latency
        }
    }

    with open('../../docs/test-results/dialogue-playwright-report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n[Report] Saved to: docs/test-results/dialogue-playwright-report.json")

if __name__ == "__main__":
    main()

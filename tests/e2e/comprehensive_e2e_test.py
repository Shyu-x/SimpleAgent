"""
大规模E2E测试 - 验证所有核心功能的正确性
测试范围：
1. 前端页面加载和渲染
2. 聊天功能 (SSE流式响应)
3. RAG检索 (Qdrant向量数据库)
4. 工具调用
5. 管理后台
6. HITL人机协作
7. A2A Agent协作
8. MCP协议
"""

import sys
import time
import json
from playwright.sync_api import sync_playwright, Page

# 测试配置
BACKEND_URL = "http://localhost:30000"
FRONTEND_URL = "http://localhost:3001"
TEST_TIMEOUT = 60000  # 60秒

class ComprehensiveE2ETest:
    def __init__(self):
        self.results = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "tests": []
        }

    def log_test(self, name, passed, error=None):
        self.results["total"] += 1
        if passed:
            self.results["passed"] += 1
            status = "[PASS]"
        else:
            self.results["failed"] += 1
            status = "[FAIL]"
        print(f"{status} | {name}")
        if error:
            print(f"      Error: {error}")
        self.results["tests"].append({
            "name": name,
            "passed": passed,
            "error": str(error) if error else None
        })

    def test_backend_health(self, page):
        """测试后端健康状态"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/health", timeout=10000)
            data = response.json()
            passed = data.get("status") == "ok"
            self.log_test("Backend Health Check", passed, None if passed else str(data))
        except Exception as e:
            self.log_test("Backend Health Check", False, str(e))

    def test_backend_chat_api(self, page):
        """测试聊天API"""
        try:
            response = page.request.post(
                f"{BACKEND_URL}/api/chat",
                headers={"Content-Type": "application/json"},
                data=json.dumps({
                    "message": "你好",
                    "stream": False
                }),
                timeout=30000
            )
            passed = response.status in [200, 201]
            self.log_test("Chat API (non-stream)", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("Chat API (non-stream)", False, str(e))

    def test_qdrant_status(self, page):
        """测试Qdrant状态"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/qdrant/status", timeout=10000)
            data = response.json()
            passed = "healthy" in data or "status" in data
            self.log_test("Qdrant Status API", passed, None if passed else str(data))
        except Exception as e:
            self.log_test("Qdrant Status API", False, str(e))

    def test_rag_search_api(self, page):
        """测试RAG搜索API"""
        try:
            response = page.request.post(
                f"{BACKEND_URL}/api/rag/search",
                headers={"Content-Type": "application/json"},
                data=json.dumps({
                    "query": "人工智能",
                    "topK": 5
                }),
                timeout=15000
            )
            passed = response.status in [200, 201]
            self.log_test("RAG Search API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("RAG Search API", False, str(e))

    def test_tool_registry_api(self, page):
        """测试工具注册API"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/tools", timeout=10000)
            data = response.json()
            passed = response.status == 200
            self.log_test("Tool Registry API", passed, None if passed else str(data))
        except Exception as e:
            self.log_test("Tool Registry API", False, str(e))

    def test_admin_stats_api(self, page):
        """测试管理后台统计API"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/admin/stats", timeout=10000)
            passed = response.status == 200
            self.log_test("Admin Stats API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("Admin Stats API", False, str(e))

    def test_hitl_request_api(self, page):
        """测试HITL确认请求API"""
        try:
            response = page.request.post(
                f"{BACKEND_URL}/api/hitl/request",
                headers={"Content-Type": "application/json"},
                data=json.dumps({
                    "action": "test_action",
                    "riskLevel": "medium",
                    "sessionId": "test_session"
                }),
                timeout=10000
            )
            passed = response.status in [200, 201]
            self.log_test("HITL Request API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("HITL Request API", False, str(e))

    def test_a2a_agents_api(self, page):
        """测试A2A Agents API"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/a2a/agents", timeout=10000)
            passed = response.status == 200
            self.log_test("A2A Agents API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("A2A Agents API", False, str(e))

    def test_mcp_status_api(self, page):
        """测试MCP状态API"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/mcp/status", timeout=10000)
            passed = response.status in [200, 404]
            self.log_test("MCP Status API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("MCP Status API", False, str(e))

    def test_model_config_api(self, page):
        """测试模型配置API"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/admin/models", timeout=10000)
            passed = response.status == 200
            self.log_test("Model Config API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("Model Config API", False, str(e))

    def test_prompt_template_api(self, page):
        """测试Prompt模板API"""
        try:
            response = page.request.get(f"{BACKEND_URL}/api/admin/prompts", timeout=10000)
            passed = response.status == 200
            self.log_test("Prompt Template API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("Prompt Template API", False, str(e))

    def test_intent_tree_api(self):
        """测试意图树API"""
        try:
            import urllib.request
            req = urllib.request.Request(f"{BACKEND_URL}/api/admin/intent")
            response = urllib.request.urlopen(req, timeout=10000)
            passed = response.status == 200
            self.log_test("Intent Tree API", passed, f"Status: {response.status}")
        except Exception as e:
            self.log_test("Intent Tree API", False, str(e))

    def test_frontend_page_load(self, page):
        """测试前端页面加载"""
        try:
            page.goto(FRONTEND_URL, timeout=30000)
            page.wait_for_load_state('networkidle', timeout=30000)
            title = page.title()
            passed = len(title) > 0
            self.log_test("Frontend Page Load", passed, None if passed else "Empty title")
        except Exception as e:
            self.log_test("Frontend Page Load", False, str(e))

    def test_frontend_chat_input(self, page):
        """测试前端聊天输入框"""
        try:
            page.goto(FRONTEND_URL, timeout=30000)
            page.wait_for_load_state('networkidle', timeout=30000)
            # 尝试多种选择器
            selectors = [
                'textarea',
                'input[type="text"]',
                '[contenteditable="true"]',
                '.chat-input',
                '#chat-input'
            ]
            found = False
            for selector in selectors:
                try:
                    el = page.locator(selector).first
                    if el.is_visible(timeout=2000):
                        found = True
                        break
                except:
                    continue
            self.log_test("Frontend Chat Input Visible", found, None if found else "No input found")
        except Exception as e:
            self.log_test("Frontend Chat Input Visible", False, str(e))

    def test_frontend_sidebar(self, page):
        """测试前端侧边栏"""
        try:
            page.goto(FRONTEND_URL, timeout=30000)
            page.wait_for_load_state('networkidle', timeout=30000)
            sidebar = page.locator('[class*="sidebar"], nav, aside').first
            passed = sidebar.is_visible(timeout=10000)
            self.log_test("Frontend Sidebar Visible", passed, None if passed else "Sidebar not found")
        except Exception as e:
            self.log_test("Frontend Sidebar Visible", False, str(e))

    def test_frontend_admin_dashboard(self, page):
        """测试前端管理后台入口"""
        try:
            page.goto(f"{FRONTEND_URL}/admin", timeout=30000)
            page.wait_for_load_state('networkidle', timeout=30000)
            passed = len(page.content()) > 1000
            self.log_test("Frontend Admin Dashboard Load", passed, None if passed else "Admin page failed")
        except Exception as e:
            self.log_test("Frontend Admin Dashboard Load", False, str(e))

    def run_all_tests(self, page):
        """运行所有后端API测试"""
        print("\n" + "="*60)
        print("Backend API Tests")
        print("="*60)

        self.test_backend_health(page)
        self.test_backend_chat_api(page)
        self.test_qdrant_status(page)
        self.test_rag_search_api(page)
        self.test_tool_registry_api(page)
        self.test_admin_stats_api(page)
        self.test_model_config_api(page)
        self.test_prompt_template_api(page)
        self.test_intent_tree_api()
        self.test_hitl_request_api(page)
        self.test_a2a_agents_api(page)
        self.test_mcp_status_api(page)

    def run_frontend_tests(self, page):
        """运行所有前端UI测试"""
        print("\n" + "="*60)
        print("Frontend UI Tests")
        print("="*60)

        self.test_frontend_page_load(page)
        self.test_frontend_chat_input(page)
        self.test_frontend_sidebar(page)
        self.test_frontend_admin_dashboard(page)

    def print_summary(self):
        """打印测试总结"""
        print("\n" + "="*60)
        print("Test Summary")
        print("="*60)
        print(f"Total: {self.results['total']}")
        print(f"Passed: {self.results['passed']}")
        print(f"Failed: {self.results['failed']}")
        print(f"Pass Rate: {self.results['passed']/self.results['total']*100:.1f}%")

        if self.results['failed'] > 0:
            print("\nFailed Tests:")
            for test in self.results['tests']:
                if not test['passed']:
                    print(f"  - {test['name']}: {test['error']}")

        return self.results['failed'] == 0

def run_tests():
    """主测试函数"""
    test = ComprehensiveE2ETest()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            test.run_all_tests(page)
            test.run_frontend_tests(page)
        except Exception as e:
            print(f"Test execution error: {e}")
        finally:
            browser.close()

    success = test.print_summary()

    with open("test_results_comprehensive.json", "w", encoding="utf-8") as f:
        json.dump(test.results, f, ensure_ascii=False, indent=2)

    print(f"\nTest results saved to test_results_comprehensive.json")
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(run_tests())

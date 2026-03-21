/**
 * 全场景浏览器控制测试
 * 测试所有浏览器自动化功能
 */

const BASE_CANDIDATES = [
  process.env.BACKEND_URL,
  process.env.BACKEND_INTERNAL_URL,
  'http://localhost:30000',
  'http://localhost:8081'
].filter(Boolean);

async function resolveBaseUrl() {
  for (const candidate of BASE_CANDIDATES) {
    try {
      const response = await fetch(`${candidate}/api/health`);
      if (response.ok) {
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(`No reachable backend found. Tried: ${BASE_CANDIDATES.join(', ')}`);
}

async function testBrowser() {
  const BASE_URL = await resolveBaseUrl();
  console.log('=== 全场景浏览器控制测试 ===\n');

  let sessionId = null;

  // 1. 初始化浏览器
  console.log('1. 初始化浏览器...');
  const initRes = await fetch(`${BASE_URL}/api/browser/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const initData = await initRes.json();
  console.log('   结果:', initData.success ? '✅ 成功' : '❌ 失败');
  console.log('   浏览器类型:', initData.browserType);

  // 2. 创建会话
  console.log('\n2. 创建浏览器会话...');
  const sessionRes = await fetch(`${BASE_URL}/api/browser/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ headless: true })
  });
  const sessionData = await sessionRes.json();
  console.log('   结果:', sessionData.success ? '✅ 成功' : '❌ 失败');
  sessionId = sessionData.sessionId;
  console.log('   会话ID:', sessionId);

  // 3. 导航测试
  console.log('\n3. 导航到网站测试...');
  const sites = [
    { name: '百度', url: 'https://www.baidu.com' },
    { name: 'GitHub', url: 'https://github.com' },
    { name: 'Google', url: 'https://www.google.com' }
  ];

  for (const site of sites) {
    const navRes = await fetch(`${BASE_URL}/api/browser/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, url: site.url })
    });
    const navData = await navRes.json();
    console.log(`   ${site.name}:`, navData.success ? '✅' : '❌', navData.title || '');
  }

  // 4. 获取页面元素
  console.log('\n4. 元素查询测试...');
  const elementRes = await fetch(`${BASE_URL}/api/browser/element`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      selector: 'input[type="text"]',
      action: 'count'
    })
  });
  const elementData = await elementRes.json();
  console.log('   输入框数量:', elementData.count || 0);

  // 5. 截图测试
  console.log('\n5. 截图测试...');
  const screenshotRes = await fetch(`${BASE_URL}/api/browser/screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  const screenshotData = await screenshotRes.json();
  console.log('   结果:', screenshotData.success ? '✅ 成功' : '❌ 失败');
  console.log('   截图大小:', screenshotData.screenshot ? `${Math.round(screenshotData.screenshot.length / 1024)}KB` : '无');

  // 6. 页面内容提取
  console.log('\n6. 页面内容提取...');
  const contentRes = await fetch(`${BASE_URL}/api/browser/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  const contentData = await contentRes.json();
  console.log('   结果:', contentData.success ? '✅ 成功' : '❌ 失败');
  console.log('   页面标题:', contentData.title || '');

  // 7. 滚动测试
  console.log('\n7. 滚动测试...');
  const scrollRes = await fetch(`${BASE_URL}/api/browser/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, direction: 'down', pixels: 500 })
  });
  const scrollData = await scrollRes.json();
  console.log('   结果:', scrollData.success ? '✅ 成功' : '❌ 失败');

  // 8. 等待测试
  console.log('\n8. 等待测试...');
  const waitRes = await fetch(`${BASE_URL}/api/browser/wait`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, milliseconds: 1000 })
  });
  const waitData = await waitRes.json();
  console.log('   结果:', waitData.success ? '✅ 成功' : '❌ 失败');

  // 9. JavaScript执行测试
  console.log('\n9. JavaScript执行测试...');
  const evalRes = await fetch(`${BASE_URL}/api/browser/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      script: 'document.title + " - " + window.innerWidth + "x" + window.innerHeight'
    })
  });
  const evalData = await evalRes.json();
  console.log('   结果:', evalData.success ? '✅ 成功' : '❌ 失败');
  console.log('   执行结果:', evalData.result || '');

  // 10. 数据提取测试
  console.log('\n10. 数据提取测试...');
  await fetch(`${BASE_URL}/api/browser/navigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, url: 'https://example.com' })
  });
  const extractRes = await fetch(`${BASE_URL}/api/browser/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      selector: 'a',
      attribute: 'href',
      limit: 5
    })
  });
  const extractData = await extractRes.json();
  console.log('   结果:', extractData.success ? '✅ 成功' : '❌ 失败');
  console.log('   提取链接数:', extractData.data?.length || 0);

  // 11. 关闭会话
  console.log('\n11. 关闭会话...');
  const closeRes = await fetch(`${BASE_URL}/api/browser/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  const closeData = await closeRes.json();
  console.log('   结果:', closeData.success ? '✅ 成功' : '❌ 失败');

  // 12. 状态检查
  console.log('\n12. 最终状态检查...');
  const statusRes = await fetch(`${BASE_URL}/api/browser/status`);
  const statusData = await statusRes.json();
  console.log('   初始化:', statusData.initialized ? '✅' : '❌');
  console.log('   会话数:', statusData.sessionCount);

  console.log('\n=== 测试完成 ===');
}

testBrowser().catch(console.error);

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_CANDIDATES = [
  process.env.BACKEND_URL,
  process.env.BACKEND_INTERNAL_URL,
  process.env.NEXT_PUBLIC_BACKEND_URL,
  'http://localhost:30000',
  'http://localhost:8081',
].filter(Boolean);

const results = {
  passed: [],
  failed: []
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkJson(name, url, options = {}) {
  try {
    const response = await fetchWithTimeout(url, options);
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${typeof data === 'string' ? data.slice(0, 120) : JSON.stringify(data).slice(0, 120)}`);
    }

    results.passed.push(name);
    console.log(`PASS ${name} -> ${response.status}`);
    return data;
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`FAIL ${name} -> ${error.message}`);
    return null;
  }
}

async function checkFrontendRoot() {
  try {
    const response = await fetchWithTimeout(FRONTEND_URL);
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!html.includes('<html')) {
      throw new Error('Invalid HTML document');
    }
    results.passed.push('frontend root');
    console.log(`PASS frontend root -> ${response.status}`);
  } catch (error) {
    results.failed.push({ name: 'frontend root', error: error.message });
    console.log(`FAIL frontend root -> ${error.message}`);
  }
}

async function resolveBackendUrl() {
  for (const candidate of BACKEND_CANDIDATES) {
    try {
      const response = await fetch(`${candidate}/api/health`);
      if (response.ok) {
        return candidate;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error(`No reachable backend found. Tried: ${BACKEND_CANDIDATES.join(', ')}`);
}

async function checkEventStream(name, url, body) {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 15000);

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!contentType.includes('text/event-stream')) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    results.passed.push(name);
    console.log(`PASS ${name} -> ${response.status}`);
  } catch (error) {
    results.failed.push({ name, error: error.message });
    console.log(`FAIL ${name} -> ${error.message}`);
  }
}

async function run() {
  const BACKEND_URL = await resolveBackendUrl();

  console.log('=== 快速检测开始 ===');
  console.log(`FRONTEND_URL=${FRONTEND_URL}`);
  console.log(`BACKEND_URL=${BACKEND_URL}`);

  await checkFrontendRoot();
  await checkJson('backend health', `${BACKEND_URL}/api/health`);
  await checkJson('backend config', `${BACKEND_URL}/api/config`);
  await checkJson('backend sessions', `${BACKEND_URL}/api/sessions`);
  await checkJson('backend mcp status', `${BACKEND_URL}/api/mcp/status`);
  await checkJson('backend browser status', `${BACKEND_URL}/api/browser/status`);

  await checkEventStream('chat route event stream', `${BACKEND_URL}/api/chat`, {
    messages: [{ role: 'user', content: 'ping' }],
  });

  await checkJson('sse proxy route basic post', `${BACKEND_URL}/api/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'ping' }],
      stream: false
    })
  });

  console.log('\n=== 快速检测结果 ===');
  console.log(`通过: ${results.passed.length}`);
  console.log(`失败: ${results.failed.length}`);

  if (results.failed.length > 0) {
    for (const item of results.failed) {
      console.log(`- ${item.name}: ${item.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('全部关键链路检查通过。');
}

run().catch((error) => {
  console.error('快速检测执行异常:', error);
  process.exit(1);
});

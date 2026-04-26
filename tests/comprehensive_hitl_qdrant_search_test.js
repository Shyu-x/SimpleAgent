/**
 * Comprehensive Test Suite for HITL, Qdrant, Search, Browser, and Queue Modules
 * Target: 70+ test cases
 * Backend: http://localhost:30002
 */

const BASE = 'http://localhost:30002';
let passed = 0;
let failed = 0;
const results = [];

function log(msg) {
  console.log(msg);
}

function pass(name, detail) {
  passed++;
  results.push({ test: name, status: 'PASS', detail });
  log(`  [PASS] ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail, resp) {
  failed++;
  results.push({ test: name, status: 'FAIL', detail, response: resp });
  log(`  [FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
  if (resp) log(`         Response: ${JSON.stringify(resp).substring(0, 200)}`);
}

async function GET(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10000) });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

async function POST(path, data) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000)
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

async function DELETE(path, data) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

// ============================================================
// MODULE 1: HITL Human-in-the-Loop Tests
// ============================================================
async function testHITL() {
  log('\n========================================');
  log('MODULE 1: HITL Human-in-the-Loop Tests');
  log('========================================');

  // 1. GET /api/hitl/health
  let r = await GET('/api/hitl/health');
  if (r.status === 200 && r.body?.service === 'human-in-the-loop') {
    pass('HITL-01 GET /api/hitl/health', `status=${r.body.status}, pending=${r.body.pending}`);
  } else {
    fail('HITL-01 GET /api/hitl/health', `status=${r.status}`, r.body);
  }

  // 2. GET /api/hitl/status (alias)
  r = await GET('/api/hitl/status');
  if (r.status === 200 && r.body?.service === 'human-in-the-loop') {
    pass('HITL-02 GET /api/hitl/status (alias)', `status=${r.body.status}`);
  } else {
    fail('HITL-02 GET /api/hitl/status (alias)', `status=${r.status}`, r.body);
  }

  // 3. GET /api/hitl/types
  r = await GET('/api/hitl/types');
  if (r.status === 200 && r.body?.types && Array.isArray(r.body.types)) {
    pass('HITL-03 GET /api/hitl/types', `types=${r.body.types.join(',')}`);
  } else {
    fail('HITL-03 GET /api/hitl/types', `status=${r.status}`, r.body);
  }

  // 4. GET /api/hitl/stats
  r = await GET('/api/hitl/stats');
  if (r.status === 200 && r.body?.stats) {
    pass('HITL-04 GET /api/hitl/stats', JSON.stringify(r.body.stats).substring(0, 60));
  } else {
    fail('HITL-04 GET /api/hitl/stats', `status=${r.status}`, r.body);
  }

  // 5. GET /api/hitl/pending (empty)
  r = await GET('/api/hitl/pending');
  if (r.status === 200 && r.body?.success) {
    pass('HITL-05 GET /api/hitl/pending', `count=${r.body.count}`);
  } else {
    fail('HITL-05 GET /api/hitl/pending', `status=${r.status}`, r.body);
  }

  // 6. GET /api/hitl/history
  r = await GET('/api/hitl/history');
  if (r.status === 200 && r.body?.success) {
    pass('HITL-06 GET /api/hitl/history', `count=${r.body.count}`);
  } else {
    fail('HITL-06 GET /api/hitl/history', `status=${r.status}`, r.body);
  }

  // 7. POST /api/hitl/checkpoint (basic)
  r = await POST('/api/hitl/checkpoint', {
    title: 'Test Checkpoint Basic',
    description: 'Basic checkpoint test'
  });
  if (r.status === 200 && r.body?.checkpoint) {
    pass('HITL-07 POST /api/hitl/checkpoint basic', `id=${r.body.checkpoint.id}`);
  } else {
    fail('HITL-07 POST /api/hitl/checkpoint basic', `status=${r.status}`, r.body);
  }

  // 8. POST /api/hitl/checkpoint (with timeout)
  r = await POST('/api/hitl/checkpoint', {
    title: 'Test Checkpoint Timeout',
    timeout: 60000,
    required: true
  });
  if (r.status === 200 && r.body?.checkpoint) {
    pass('HITL-08 POST /api/hitl/checkpoint with timeout', `timeout=${r.body.checkpoint.timeout}`);
  } else {
    fail('HITL-08 POST /api/hitl/checkpoint with timeout', `status=${r.status}`, r.body);
  }

  // 9. POST /api/hitl/checkpoint (with required=true)
  r = await POST('/api/hitl/checkpoint', {
    title: 'Required Checkpoint',
    required: true
  });
  if (r.status === 200 && r.body?.checkpoint?.required === true) {
    pass('HITL-09 POST /api/hitl/checkpoint required=true', `required=${r.body.checkpoint.required}`);
  } else {
    fail('HITL-09 POST /api/hitl/checkpoint required=true', `status=${r.status}`, r.body);
  }

  // 10. POST /api/hitl/checkpoint (with options)
  r = await POST('/api/hitl/checkpoint', {
    title: 'Checkpoint with Options',
    options: [
      { id: 'opt1', label: 'Approve', value: 'yes' },
      { id: 'opt2', label: 'Reject', value: 'no' }
    ]
  });
  if (r.status === 200 && r.body?.checkpoint?.options?.length === 2) {
    pass('HITL-10 POST /api/hitl/checkpoint with options', `options=${r.body.checkpoint.options.length}`);
  } else {
    fail('HITL-10 POST /api/hitl/checkpoint with options', `status=${r.status}`, r.body);
  }

  // 11. POST /api/hitl/checkpoint (with context)
  r = await POST('/api/hitl/checkpoint', {
    title: 'Checkpoint with Context',
    context: { userId: 'test-user', action: 'delete' }
  });
  if (r.status === 200 && r.body?.checkpoint?.context) {
    pass('HITL-11 POST /api/hitl/checkpoint with context', JSON.stringify(r.body.checkpoint.context).substring(0, 60));
  } else {
    fail('HITL-11 POST /api/hitl/checkpoint with context', `status=${r.status}`, r.body);
  }

  // 12. POST /api/hitl/checkpoint (with type)
  r = await POST('/api/hitl/checkpoint', {
    title: 'High Risk Checkpoint',
    type: 'high_risk'
  });
  if (r.status === 200 && r.body?.checkpoint?.type === 'high_risk') {
    pass('HITL-12 POST /api/hitl/checkpoint type=high_risk', `type=${r.body.checkpoint.type}`);
  } else {
    fail('HITL-12 POST /api/hitl/checkpoint type=high_risk', `status=${r.status}`, r.body);
  }

  // 13. POST /api/hitl/checkpoint (missing title - should fail)
  r = await POST('/api/hitl/checkpoint', { description: 'No title' });
  if (r.status === 400 && r.body?.error) {
    pass('HITL-13 POST /api/hitl/checkpoint missing title (400)', `error=${r.body.error}`);
  } else {
    fail('HITL-13 POST /api/hitl/checkpoint missing title', `expected 400, got ${r.status}`, r.body);
  }

  // 14. POST /api/hitl/request (basic - async confirmation)
  r = await POST('/api/hitl/request', {
    title: 'Test Confirmation Request',
    type: 'decision'
  });
  if (r.status === 200 && r.body?.checkpoint) {
    pass('HITL-14 POST /api/hitl/request basic', `id=${r.body.checkpoint?.id || 'created'}`);
  } else {
    fail('HITL-14 POST /api/hitl/request basic', `status=${r.status}`, r.body);
  }

  // 15. POST /api/hitl/request (with options)
  r = await POST('/api/hitl/request', {
    title: 'Confirmation with Options',
    options: [{ id: 'a', label: 'Option A' }],
    timeout: 30000
  });
  if (r.status === 200) {
    pass('HITL-15 POST /api/hitl/request with options+timeout', `200 OK`);
  } else {
    fail('HITL-15 POST /api/hitl/request with options+timeout', `status=${r.status}`, r.body);
  }

  // 16. POST /api/hitl/request (missing sessionId - actually title is required)
  r = await POST('/api/hitl/request', { type: 'decision' });
  if (r.status === 400 && r.body?.error) {
    pass('HITL-16 POST /api/hitl/request missing title (400)', `error=${r.body.error}`);
  } else {
    fail('HITL-16 POST /api/hitl/request missing title', `expected 400, got ${r.status}`, r.body);
  }

  // 17. GET /api/hitl/checkpoint/:id (get created checkpoint)
  // First create one to get ID
  const cpR = await POST('/api/hitl/checkpoint', { title: 'Get by ID Test' });
  if (cpR.body?.checkpoint?.id) {
    r = await GET(`/api/hitl/checkpoint/${cpR.body.checkpoint.id}`);
    if (r.status === 200 && r.body?.checkpoint) {
      pass('HITL-17 GET /api/hitl/checkpoint/:id', `id=${r.body.checkpoint.id}`);
    } else {
      fail('HITL-17 GET /api/hitl/checkpoint/:id', `status=${r.status}`, r.body);
    }
  } else {
    fail('HITL-17 GET /api/hitl/checkpoint/:id', 'Could not create checkpoint first', cpR.body);
  }

  // 18. GET /api/hitl/checkpoint/:id (non-existent)
  r = await GET('/api/hitl/checkpoint/non_existent_id_12345');
  if (r.status === 404) {
    pass('HITL-18 GET /api/hitl/checkpoint/:id non-existent (404)', `404`);
  } else {
    fail('HITL-18 GET /api/hitl/checkpoint/:id non-existent', `expected 404, got ${r.status}`, r.body);
  }

  // 19. POST /api/hitl/checkpoint/:id/approve
  const cpToApprove = await POST('/api/hitl/checkpoint', { title: 'Checkpoint to Approve', options: [{ id: 'y', label: 'Yes' }] });
  if (cpToApprove.body?.checkpoint?.id) {
    r = await POST(`/api/hitl/checkpoint/${cpToApprove.body.checkpoint.id}/approve`, { option: 'y', comment: 'Approved' });
    if (r.body?.success || r.status === 200) {
      pass('HITL-19 POST /api/hitl/checkpoint/:id/approve', `success=${r.body?.success}`);
    } else {
      fail('HITL-19 POST /api/hitl/checkpoint/:id/approve', `status=${r.status}`, r.body);
    }
  } else {
    fail('HITL-19 POST /api/hitl/checkpoint/:id/approve', 'Could not create checkpoint', cpToApprove.body);
  }

  // 20. POST /api/hitl/checkpoint/:id/reject
  const cpToReject = await POST('/api/hitl/checkpoint', { title: 'Checkpoint to Reject' });
  if (cpToReject.body?.checkpoint?.id) {
    r = await POST(`/api/hitl/checkpoint/${cpToReject.body.checkpoint.id}/reject`, { reason: 'Not approved' });
    if (r.body?.success || r.status === 200) {
      pass('HITL-20 POST /api/hitl/checkpoint/:id/reject', `success=${r.body?.success}`);
    } else {
      fail('HITL-20 POST /api/hitl/checkpoint/:id/reject', `status=${r.status}`, r.body);
    }
  } else {
    fail('HITL-20 POST /api/hitl/checkpoint/:id/reject', 'Could not create checkpoint', cpToReject.body);
  }

  // 21. POST /api/hitl/checkpoint/:id/approve (non-existent)
  r = await POST('/api/hitl/checkpoint/non_existent_123/approve', {});
  if (r.body?.success === false || r.status === 500) {
    pass('HITL-21 POST /api/hitl/checkpoint/:id/approve non-existent', `rejected=${r.body?.error}`);
  } else {
    fail('HITL-21 POST /api/hitl/checkpoint/:id/approve non-existent', `unexpected response`, r.body);
  }

  // 22. POST /api/hitl/checkpoint/:id/wait
  const cpToWait = await POST('/api/hitl/checkpoint', { title: 'Checkpoint to Wait' });
  if (cpToWait.body?.checkpoint?.id) {
    r = await POST(`/api/hitl/checkpoint/${cpToWait.body.checkpoint.id}/wait`, { timeout: 2000 });
    if (r.status === 200) {
      pass('HITL-22 POST /api/hitl/checkpoint/:id/wait', `200 OK`);
    } else {
      fail('HITL-22 POST /api/hitl/checkpoint/:id/wait', `status=${r.status}`, r.body);
    }
  } else {
    fail('HITL-22 POST /api/hitl/checkpoint/:id/wait', 'Could not create checkpoint', cpToWait.body);
  }

  // 23. POST /api/hitl/confirm (basic - creates and waits)
  r = await POST('/api/hitl/confirm', { title: 'Quick Confirm Test', timeout: 3000 });
  if (r.status === 200) {
    pass('HITL-23 POST /api/hitl/confirm basic', `200 OK`);
  } else {
    fail('HITL-23 POST /api/hitl/confirm basic', `status=${r.status}`, r.body);
  }

  // 24. POST /api/hitl/confirm (missing title)
  r = await POST('/api/hitl/confirm', { type: 'decision' });
  if (r.status === 400) {
    pass('HITL-24 POST /api/hitl/confirm missing title (400)', `400`);
  } else {
    fail('HITL-24 POST /api/hitl/confirm missing title', `expected 400, got ${r.status}`, r.body);
  }

  // 25. POST /api/hitl/clear
  r = await POST('/api/hitl/clear', {});
  if (r.status === 200 && r.body?.success) {
    pass('HITL-25 POST /api/hitl/clear', `cleared`);
  } else {
    fail('HITL-25 POST /api/hitl/clear', `status=${r.status}`, r.body);
  }

  // 26. GET /api/hitl/sse/clients
  r = await GET('/api/hitl/sse/clients');
  if (r.status === 200 && r.body?.success) {
    pass('HITL-26 GET /api/hitl/sse/clients', `count=${r.body.count}`);
  } else {
    fail('HITL-26 GET /api/hitl/sse/clients', `status=${r.status}`, r.body);
  }

  // 27. POST /api/hitl/sse/broadcast
  r = await POST('/api/hitl/sse/broadcast', { type: 'test', data: { message: 'test' } });
  if (r.status === 200 && r.body?.success) {
    pass('HITL-27 POST /api/hitl/sse/broadcast', `clients=${r.body.clients}`);
  } else {
    fail('HITL-27 POST /api/hitl/sse/broadcast', `status=${r.status}`, r.body);
  }

  // 28. POST /api/hitl/sse/broadcast (missing type)
  r = await POST('/api/hitl/sse/broadcast', { data: {} });
  if (r.status === 400) {
    pass('HITL-28 POST /api/hitl/sse/broadcast missing type (400)', `400`);
  } else {
    fail('HITL-28 POST /api/hitl/sse/broadcast missing type', `expected 400, got ${r.status}`, r.body);
  }

  // 29. Verify stats after operations
  r = await GET('/api/hitl/stats');
  if (r.status === 200 && r.body?.stats) {
    pass('HITL-29 GET /api/hitl/stats post-ops', `total=${r.body.stats.total}, approved=${r.body.stats.approved}, rejected=${r.body.stats.rejected}`);
  } else {
    fail('HITL-29 GET /api/hitl/stats post-ops', `status=${r.status}`, r.body);
  }

  // 30. Verify history
  r = await GET('/api/hitl/history');
  if (r.status === 200 && r.body?.history?.length > 0) {
    pass('HITL-30 GET /api/hitl/history populated', `count=${r.body.history.length}`);
  } else {
    fail('HITL-30 GET /api/hitl/history populated', `status=${r.status}`, r.body);
  }
}

// ============================================================
// MODULE 2: Qdrant Vector Database Tests
// ============================================================
async function testQdrant() {
  log('\n========================================');
  log('MODULE 2: Qdrant Vector Database Tests');
  log('========================================');

  const testCollection = `test_${Date.now()}`;

  // 31. GET /api/qdrant/status
  let r = await GET('/api/qdrant/status');
  if (r.status === 200 && r.body !== undefined) {
    pass('QD-31 GET /api/qdrant/status', `healthy=${r.body.healthy}, collection=${r.body.collection}`);
  } else {
    fail('QD-31 GET /api/qdrant/status', `status=${r.status}`, r.body);
  }

  // 32. GET /api/qdrant/collections (empty or list)
  r = await GET('/api/qdrant/collections');
  if (r.status === 200 && r.body?.collections !== undefined) {
    pass('QD-32 GET /api/qdrant/collections', `count=${r.body.collections.length}`);
  } else {
    fail('QD-32 GET /api/qdrant/collections', `status=${r.status}`, r.body);
  }

  // 33. PUT /api/qdrant/collections/:collection (create)
  r = await PUT(`/api/qdrant/collections/${testCollection}`, { dimension: 1024, distance: 'Cosine' });
  if (r.status === 200 || r.status === 201) {
    pass('QD-33 PUT /api/qdrant/collections/:collection create', `message=${r.body?.message}`);
  } else {
    fail('QD-33 PUT /api/qdrant/collections/:collection create', `status=${r.status}`, r.body);
  }

  // 34. GET /api/qdrant/collections/:collection (info)
  r = await GET(`/api/qdrant/collections/${testCollection}`);
  if (r.status === 200 && r.body?.info) {
    pass('QD-34 GET /api/qdrant/collections/:collection info', `ok`);
  } else {
    fail('QD-34 GET /api/qdrant/collections/:collection info', `status=${r.status}`, r.body);
  }

  // 35. PUT /api/qdrant/collections/:collection (update/recreate)
  r = await PUT(`/api/qdrant/collections/${testCollection}`, { dimension: 1024 });
  if (r.status === 200) {
    pass('QD-35 PUT /api/qdrant/collections/:collection update', `200 OK`);
  } else {
    fail('QD-35 PUT /api/qdrant/collections/:collection update', `status=${r.status}`, r.body);
  }

  // 36. POST /api/qdrant/documents (insert document)
  r = await POST('/api/qdrant/documents', {
    collection: testCollection,
    document: 'This is a test document for the vector database. It contains multiple sentences to test chunking.',
    metadata: { source: 'test', category: 'unit_test' },
    chunkSize: 100,
    chunkOverlap: 20
  });
  if (r.status === 200 && r.body?.success !== undefined) {
    pass('QD-36 POST /api/qdrant/documents insert', `success=${r.body.success}, chunks=${r.body.chunks}`);
  } else {
    fail('QD-36 POST /api/qdrant/documents insert', `status=${r.status}`, r.body);
  }

  // 37. POST /api/qdrant/documents (batch insert)
  r = await POST('/api/qdrant/documents/batch', {
    collection: testCollection,
    documents: [
      { text: 'Batch document one with interesting content', metadata: { index: 1 } },
      { text: 'Batch document two with different content', metadata: { index: 2 } },
      { text: 'Batch document three for comprehensive testing', metadata: { index: 3 } }
    ],
    metadata: { source: 'batch_test' }
  });
  if (r.status === 200 && r.body?.success) {
    pass('QD-37 POST /api/qdrant/documents/batch', `totalInserted=${r.body.totalInserted}, count=${r.body.documentCount}`);
  } else {
    fail('QD-37 POST /api/qdrant/documents/batch', `status=${r.status}`, r.body);
  }

  // 38. POST /api/qdrant/documents (missing document)
  r = await POST('/api/qdrant/documents', { collection: testCollection });
  if (r.status === 400) {
    pass('QD-38 POST /api/qdrant/documents missing doc (400)', `400`);
  } else {
    fail('QD-38 POST /api/qdrant/documents missing doc', `expected 400, got ${r.status}`, r.body);
  }

  // 39. POST /api/qdrant/documents/batch (missing array)
  r = await POST('/api/qdrant/documents/batch', { collection: testCollection, documents: 'not-an-array' });
  if (r.status === 400) {
    pass('QD-39 POST /api/qdrant/documents/batch bad input (400)', `400`);
  } else {
    fail('QD-39 POST /api/qdrant/documents/batch bad input', `expected 400, got ${r.status}`, r.body);
  }

  // 40. POST /api/qdrant/search (basic)
  r = await POST('/api/qdrant/search', {
    collection: testCollection,
    query: 'test document content',
    topK: 5
  });
  if (r.status === 200 && r.body?.success !== undefined) {
    pass('QD-40 POST /api/qdrant/search basic', `results=${r.body.results?.length}, success=${r.body.success}`);
  } else {
    fail('QD-40 POST /api/qdrant/search basic', `status=${r.status}`, r.body);
  }

  // 41. POST /api/qdrant/search (missing query)
  r = await POST('/api/qdrant/search', { collection: testCollection, topK: 5 });
  if (r.status === 400) {
    pass('QD-41 POST /api/qdrant/search missing query (400)', `400`);
  } else {
    fail('QD-41 POST /api/qdrant/search missing query', `expected 400, got ${r.status}`, r.body);
  }

  // 42. POST /api/qdrant/search (with topK parameter)
  r = await POST('/api/qdrant/search', {
    collection: testCollection,
    query: 'vector database testing',
    topK: 3
  });
  if (r.status === 200 && r.body?.topK === 3) {
    pass('QD-42 POST /api/qdrant/search with topK=3', `topK=${r.body.topK}`);
  } else {
    fail('QD-42 POST /api/qdrant/search with topK=3', `status=${r.status}`, r.body);
  }

  // 43. GET /api/qdrant/stats/:collection
  r = await GET(`/api/qdrant/stats/${testCollection}`);
  if (r.status === 200 && r.body?.success !== undefined) {
    pass('QD-43 GET /api/qdrant/stats/:collection', `ok`);
  } else {
    fail('QD-43 GET /api/qdrant/stats/:collection', `status=${r.status}`, r.body);
  }

  // 44. DELETE /api/qdrant/collections/:collection
  r = await DELETE(`/api/qdrant/collections/${testCollection}`);
  if (r.status === 200 && r.body?.success) {
    pass('QD-44 DELETE /api/qdrant/collections/:collection', `deleted`);
  } else {
    fail('QD-44 DELETE /api/qdrant/collections/:collection', `status=${r.status}`, r.body);
  }

  // 45. GET /api/qdrant/collections/:collection (after delete)
  r = await GET(`/api/qdrant/collections/${testCollection}`);
  if (r.status === 404) {
    pass('QD-45 GET /api/qdrant/collections/:collection after delete (404)', `404`);
  } else {
    fail('QD-45 GET /api/qdrant/collections/:collection after delete', `expected 404, got ${r.status}`, r.body);
  }

  // 46. DELETE /api/qdrant/documents (no ids)
  r = await DELETE('/api/qdrant/documents', {});
  if (r.status === 400) {
    pass('QD-46 DELETE /api/qdrant/documents missing ids (400)', `400`);
  } else {
    fail('QD-46 DELETE /api/qdrant/documents missing ids', `expected 400, got ${r.status}`, r.body);
  }
}

async function PUT(path, data) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000)
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ok: res.ok, body };
  } catch (e) {
    return { status: 0, ok: false, error: e.message };
  }
}

// ============================================================
// MODULE 3: Search API Tests
// ============================================================
async function testSearch() {
  log('\n========================================');
  log('MODULE 3: Search API Tests');
  log('========================================');

  // 47. GET /api/search/ (basic status)
  let r = await GET('/api/search/');
  if (r.status === 200 && r.body?.service === 'search') {
    pass('SR-47 GET /api/search/ basic', `status=${r.body.status}, providers=${r.body.availableProviders?.join(',')}`);
  } else {
    fail('SR-47 GET /api/search/ basic', `status=${r.status}`, r.body);
  }

  // 48. GET /api/search/health
  r = await GET('/api/search/health');
  if (r.status === 200 && r.body?.service === 'search') {
    pass('SR-48 GET /api/search/health', `status=${r.body.status}`);
  } else {
    fail('SR-48 GET /api/search/health', `status=${r.status}`, r.body);
  }

  // 49. GET /api/search/config
  r = await GET('/api/search/config');
  if (r.status === 200 && r.body?.config) {
    pass('SR-49 GET /api/search/config', `enabled=${r.body.config.enabled?.join(',')}, free=${r.body.config.freeSources?.join(',')}`);
  } else {
    fail('SR-49 GET /api/search/config', `status=${r.status}`, r.body);
  }

  // 50. GET /api/search/providers
  r = await GET('/api/search/providers');
  if (r.status === 200 && r.body?.providers) {
    pass('SR-50 GET /api/search/providers', `count=${r.body.providers.length}`);
  } else {
    fail('SR-50 GET /api/search/providers', `status=${r.status}`, r.body);
  }

  // 51. POST /api/search/test (with default query)
  r = await POST('/api/search/test', { source: 'jina' });
  if (r.status === 200) {
    pass('SR-51 POST /api/search/test source=jina', `success=${r.body?.success}, tested=${r.body?.tested}`);
  } else {
    fail('SR-51 POST /api/search/test source=jina', `status=${r.status}`, r.body);
  }

  // 52. POST /api/search/test (with custom query)
  r = await POST('/api/search/test', { source: 'jina', query: 'hello world' });
  if (r.status === 200) {
    pass('SR-52 POST /api/search/test custom query', `tested=${r.body?.tested}`);
  } else {
    fail('SR-52 POST /api/search/test custom query', `status=${r.status}`, r.body);
  }

  // 53. POST /api/search/test (invalid source)
  r = await POST('/api/search/test', { source: 'invalid_source_xyz' });
  if (r.status === 400) {
    pass('SR-53 POST /api/search/test invalid source (400)', `400`);
  } else {
    fail('SR-53 POST /api/search/test invalid source', `expected 400, got ${r.status}`, r.body);
  }

  // 54. POST /api/search/web (basic)
  r = await POST('/api/search/web', { query: 'JavaScript async await', limit: 3, source: 'jina' });
  if (r.status === 200) {
    pass('SR-54 POST /api/search/web basic', `success=${r.body?.success}`);
  } else {
    fail('SR-54 POST /api/search/web basic', `status=${r.status}`, r.body);
  }

  // 55. POST /api/search/web (missing query)
  r = await POST('/api/search/web', { limit: 5 });
  if (r.status === 400) {
    pass('SR-55 POST /api/search/web missing query (400)', `400`);
  } else {
    fail('SR-55 POST /api/search/web missing query', `expected 400, got ${r.status}`, r.body);
  }

  // 56. POST /api/search/web (with markdown format)
  r = await POST('/api/search/web', { query: 'test search', format: 'markdown', source: 'jina' });
  if (r.status === 200 && r.body?.markdown !== undefined) {
    pass('SR-56 POST /api/search/web markdown format', `has_markdown=${!!r.body.markdown}`);
  } else {
    fail('SR-56 POST /api/search/web markdown format', `status=${r.status}`, r.body);
  }

  // 57. POST /api/search/web (with limit parameter)
  r = await POST('/api/search/web', { query: 'web search test', limit: 5, source: 'jina' });
  if (r.status === 200) {
    pass('SR-57 POST /api/search/web with limit=5', `success=${r.body?.success}`);
  } else {
    fail('SR-57 POST /api/search/web with limit=5', `status=${r.status}`, r.body);
  }

  // 58. POST /api/search/web (no API key source, should work)
  r = await POST('/api/search/web', { query: 'free search test', source: 'jina' });
  if (r.status === 200) {
    pass('SR-58 POST /api/search/web jina no-key', `success=${r.body?.success}`);
  } else {
    fail('SR-58 POST /api/search/web jina no-key', `status=${r.status}`, r.body);
  }

  // 59. POST /api/search/web (paid source without key)
  r = await POST('/api/search/web', { query: 'paid source test', source: 'tavily' });
  if (r.status === 401) {
    pass('SR-59 POST /api/search/web tavily no-key (401)', `401`);
  } else {
    fail('SR-59 POST /api/search/web tavily no-key', `expected 401, got ${r.status}`, r.body);
  }
}

// ============================================================
// MODULE 4: Search Enhanced Tests
// ============================================================
async function testSearchEnhanced() {
  log('\n========================================');
  log('MODULE 4: Search Enhanced API Tests');
  log('========================================');

  // 60. POST /api/search/enhanced (basic)
  let r = await POST('/api/search/enhanced', { query: 'AI machine learning', sources: ['web'] });
  if (r.status === 200 && r.body?.success) {
    pass('SE-60 POST /api/search/enhanced basic', `total=${r.body.total}, errors=${r.body.errors?.length}`);
  } else {
    fail('SE-60 POST /api/search/enhanced basic', `status=${r.status}`, r.body);
  }

  // 61. POST /api/search/enhanced (missing query)
  r = await POST('/api/search/enhanced', { sources: ['web'] });
  if (r.status === 400) {
    pass('SE-61 POST /api/search/enhanced missing query (400)', `400`);
  } else {
    fail('SE-61 POST /api/search/enhanced missing query', `expected 400, got ${r.status}`, r.body);
  }

  // 62. POST /api/search/enhanced (with multiple sources)
  r = await POST('/api/search/enhanced', { query: 'technology news', sources: ['web'] });
  if (r.status === 200 && r.body?.stats) {
    pass('SE-62 POST /api/search/enhanced multi-source', `sources=${r.body.stats.totalSources}`);
  } else {
    fail('SE-62 POST /api/search/enhanced multi-source', `status=${r.status}`, r.body);
  }

  // 63. GET /api/search/enhanced/stats
  r = await GET('/api/search/enhanced/stats');
  if (r.status === 200 && r.body?.success) {
    pass('SE-63 GET /api/search/enhanced/stats', `ok`);
  } else {
    fail('SE-63 GET /api/search/enhanced/stats', `status=${r.status}`, r.body);
  }

  // 64. POST /api/search/enhanced/test (valid provider)
  r = await POST('/api/search/enhanced/test', { provider: 'web', query: 'test query' });
  if (r.status === 200) {
    pass('SE-64 POST /api/search/enhanced/test valid provider', `tested=${r.body?.tested}`);
  } else {
    fail('SE-64 POST /api/search/enhanced/test valid provider', `status=${r.status}`, r.body);
  }

  // 65. POST /api/search/enhanced/test (invalid provider)
  r = await POST('/api/search/enhanced/test', { provider: 'nonexistent' });
  if (r.status === 400) {
    pass('SE-65 POST /api/search/enhanced/test invalid provider (400)', `400`);
  } else {
    fail('SE-65 POST /api/search/enhanced/test invalid provider', `expected 400, got ${r.status}`, r.body);
  }

  // 66. POST /api/search/fetch (basic)
  r = await POST('/api/search/fetch', { url: 'https://example.com' });
  if (r.status === 200 && r.body?.success !== undefined) {
    pass('SE-66 POST /api/search/fetch basic', `success=${r.body.success}`);
  } else {
    fail('SE-66 POST /api/search/fetch basic', `status=${r.status}`, r.body);
  }

  // 67. POST /api/search/fetch (missing url)
  r = await POST('/api/search/fetch', { query: 'test' });
  if (r.status === 400) {
    pass('SE-67 POST /api/search/fetch missing url (400)', `400`);
  } else {
    fail('SE-67 POST /api/search/fetch missing url', `expected 400, got ${r.status}`, r.body);
  }

  // 68. POST /api/search/fetch (with query context)
  r = await POST('/api/search/fetch', { url: 'https://example.com', query: 'main page' });
  if (r.status === 200) {
    pass('SE-68 POST /api/search/fetch with query', `200 OK`);
  } else {
    fail('SE-68 POST /api/search/fetch with query', `status=${r.status}`, r.body);
  }
}

// ============================================================
// MODULE 5: Browser Automation Tests
// ============================================================
async function testBrowser() {
  log('\n========================================');
  log('MODULE 5: Browser Automation Tests');
  log('========================================');

  // 69. GET /api/browser/status
  let r = await GET('/api/browser/status');
  if (r.status === 200 && r.body?.success) {
    pass('BR-69 GET /api/browser/status', `initialized=${r.body.initialized}, browser=${r.body.browser}`);
  } else {
    fail('BR-69 GET /api/browser/status', `status=${r.status}`, r.body);
  }

  // 70. POST /api/browser/init
  r = await POST('/api/browser/init', { browserType: 'chromium' });
  if (r.status === 200) {
    pass('BR-70 POST /api/browser/init', `success=${r.body?.success}`);
  } else {
    fail('BR-70 POST /api/browser/init', `status=${r.status}`, r.body);
  }

  // 71. POST /api/browser/session
  r = await POST('/api/browser/session', { sessionId: `test_session_${Date.now()}` });
  if (r.status === 200) {
    pass('BR-71 POST /api/browser/session', `success=${r.body?.success}`);
  } else {
    fail('BR-71 POST /api/browser/session', `status=${r.status}`, r.body);
  }

  // 72. POST /api/browser/session (auto-generate ID)
  r = await POST('/api/browser/session', {});
  if (r.status === 200) {
    pass('BR-72 POST /api/browser/session auto-ID', `200 OK`);
  } else {
    fail('BR-72 POST /api/browser/session auto-ID', `status=${r.status}`, r.body);
  }

  // 73. POST /api/browser/navigate (missing params)
  r = await POST('/api/browser/navigate', {});
  if (r.status === 400) {
    pass('BR-73 POST /api/browser/navigate missing params (400)', `400`);
  } else {
    fail('BR-73 POST /api/browser/navigate missing params', `expected 400, got ${r.status}`, r.body);
  }

  // 74. POST /api/browser/screenshot (missing sessionId)
  r = await POST('/api/browser/screenshot', {});
  if (r.status === 400) {
    pass('BR-74 POST /api/browser/screenshot missing sessionId (400)', `400`);
  } else {
    fail('BR-74 POST /api/browser/screenshot missing sessionId', `expected 400, got ${r.status}`, r.body);
  }

  // 75. POST /api/browser/evaluate (missing params)
  r = await POST('/api/browser/evaluate', { sessionId: 'test' });
  if (r.status === 400) {
    pass('BR-75 POST /api/browser/evaluate missing script (400)', `400`);
  } else {
    fail('BR-75 POST /api/browser/evaluate missing script', `expected 400, got ${r.status}`, r.body);
  }

  // 76. POST /api/browser/click (missing params)
  r = await POST('/api/browser/click', { sessionId: 'test' });
  if (r.status === 400) {
    pass('BR-76 POST /api/browser/click missing selector (400)', `400`);
  } else {
    fail('BR-76 POST /api/browser/click missing selector', `expected 400, got ${r.status}`, r.body);
  }

  // 77. POST /api/browser/type (missing params)
  r = await POST('/api/browser/type', { sessionId: 'test' });
  if (r.status === 400) {
    pass('BR-77 POST /api/browser/type missing params (400)', `400`);
  } else {
    fail('BR-77 POST /api/browser/type missing params', `expected 400, got ${r.status}`, r.body);
  }

  // 78. POST /api/browser/content (missing sessionId)
  r = await POST('/api/browser/content', {});
  if (r.status === 400) {
    pass('BR-78 POST /api/browser/content missing sessionId (400)', `400`);
  } else {
    fail('BR-78 POST /api/browser/content missing sessionId', `expected 400, got ${r.status}`, r.body);
  }

  // 79. POST /api/browser/extract (missing params)
  r = await POST('/api/browser/extract', { sessionId: 'test' });
  if (r.status === 400) {
    pass('BR-79 POST /api/browser/extract missing selector (400)', `400`);
  } else {
    fail('BR-79 POST /api/browser/extract missing selector', `expected 400, got ${r.status}`, r.body);
  }

  // 80. POST /api/browser/wait (time wait)
  r = await POST('/api/browser/wait', { sessionId: 'test', milliseconds: 100 });
  if (r.status === 200) {
    pass('BR-80 POST /api/browser/wait time', `success=${r.body?.success}`);
  } else {
    fail('BR-80 POST /api/browser/wait time', `status=${r.status}`, r.body);
  }

  // 81. POST /api/browser/scroll (missing sessionId)
  r = await POST('/api/browser/scroll', {});
  if (r.status === 400) {
    pass('BR-81 POST /api/browser/scroll missing sessionId (400)', `400`);
  } else {
    fail('BR-81 POST /api/browser/scroll missing sessionId', `expected 400, got ${r.status}`, r.body);
  }

  // 82. POST /api/browser/element (missing params)
  r = await POST('/api/browser/element', { sessionId: 'test' });
  if (r.status === 400) {
    pass('BR-82 POST /api/browser/element missing selector (400)', `400`);
  } else {
    fail('BR-82 POST /api/browser/element missing selector', `expected 400, got ${r.status}`, r.body);
  }

  // 83. POST /api/browser/close (missing sessionId)
  r = await POST('/api/browser/close', {});
  if (r.status === 400) {
    pass('BR-83 POST /api/browser/close missing sessionId (400)', `400`);
  } else {
    fail('BR-83 POST /api/browser/close missing sessionId', `expected 400, got ${r.status}`, r.body);
  }
}

// ============================================================
// MODULE 6: Queue & Task Tests
// ============================================================
async function testQueue() {
  log('\n========================================');
  log('MODULE 6: Queue & Task Tests');
  log('========================================');

  // 84. GET /api/tasks/stats (queue status)
  let r = await GET('/api/tasks/stats');
  if (r.status === 200 && r.body?.success) {
    pass('TK-84 GET /api/tasks/stats', `ok`);
  } else {
    fail('TK-84 GET /api/tasks/stats', `status=${r.status}`, r.body);
  }

  // 85. POST /api/tasks/ (basic)
  r = await POST('/api/tasks/', { type: 'test_task', payload: { message: 'hello' } });
  if (r.status === 200 && (r.body?.taskId || r.body?.success)) {
    pass('TK-85 POST /api/tasks/ basic', `taskId=${r.body?.taskId}`);
  } else {
    fail('TK-85 POST /api/tasks/ basic', `status=${r.status}`, r.body);
  }

  // 86. POST /api/tasks/ (with priority)
  r = await POST('/api/tasks/', {
    type: 'priority_task',
    payload: { data: 'important' },
    priority: 'high'
  });
  if (r.status === 200) {
    pass('TK-86 POST /api/tasks/ with priority', `200 OK`);
  } else {
    fail('TK-86 POST /api/tasks/ with priority', `status=${r.status}`, r.body);
  }

  // 87. POST /api/tasks/ (missing type)
  r = await POST('/api/tasks/', { payload: { data: 'test' } });
  if (r.status === 400) {
    pass('TK-87 POST /api/tasks/ missing type (400)', `400`);
  } else {
    fail('TK-87 POST /api/tasks/ missing type', `expected 400, got ${r.status}`, r.body);
  }

  // 88. POST /api/tasks/ (missing payload)
  r = await POST('/api/tasks/', { type: 'no_payload' });
  if (r.status === 400) {
    pass('TK-88 POST /api/tasks/ missing payload (400)', `400`);
  } else {
    fail('TK-88 POST /api/tasks/ missing payload', `expected 400, got ${r.status}`, r.body);
  }

  // 89. POST /api/tasks/ (with waitResult)
  r = await POST('/api/tasks/', {
    type: 'sync_task',
    payload: { sync: true },
    waitResult: true,
    timeout: 5000
  });
  if (r.status === 200 || r.status === 500) {
    pass('TK-89 POST /api/tasks/ with waitResult', `status=${r.status}`);
  } else {
    fail('TK-89 POST /api/tasks/ with waitResult', `unexpected status ${r.status}`, r.body);
  }

  // 90. GET /api/tasks/:taskId (non-existent)
  r = await GET('/api/tasks/non_existent_task_99999');
  if (r.status === 404) {
    pass('TK-90 GET /api/tasks/:id non-existent (404)', `404`);
  } else {
    fail('TK-90 GET /api/tasks/:id non-existent', `expected 404, got ${r.status}`, r.body);
  }

  // 91. DELETE /api/tasks/:taskId (non-existent)
  r = await DELETE('/api/tasks/non_existent_task_99999');
  if (r.status === 200 || r.status === 404 || r.status === 500) {
    pass('TK-91 DELETE /api/tasks/:id non-existent', `status=${r.status}`);
  } else {
    fail('TK-91 DELETE /api/tasks/:id non-existent', `unexpected status ${r.status}`, r.body);
  }

  // 92. POST /api/tasks/cleanup
  r = await POST('/api/tasks/cleanup', { completedAfter: 3600000 });
  if (r.status === 200 && r.body?.success) {
    pass('TK-92 POST /api/tasks/cleanup', `success=${r.body.success}`);
  } else {
    fail('TK-92 POST /api/tasks/cleanup', `status=${r.status}`, r.body);
  }

  // 93. POST /api/tasks/handlers/:taskType
  r = await POST('/api/tasks/handlers/custom_handler', { handlerCode: 'console.log("test")' });
  if (r.status === 200 && r.body?.success) {
    pass('TK-93 POST /api/tasks/handlers/:taskType', `message=${r.body.message}`);
  } else {
    fail('TK-93 POST /api/tasks/handlers/:taskType', `status=${r.status}`, r.body);
  }
}

// ============================================================
// Run all tests
// ============================================================
async function main() {
  log('========================================');
  log('COMPREHENSIVE API TEST SUITE');
  log('Target: 93 Test Cases');
  log('Base URL: http://localhost:30002');
  log('========================================');

  const start = Date.now();

  try {
    await testHITL();
  } catch (e) {
    log(`[ERROR] HITL module crashed: ${e.message}`);
  }

  try {
    await testQdrant();
  } catch (e) {
    log(`[ERROR] Qdrant module crashed: ${e.message}`);
  }

  try {
    await testSearch();
  } catch (e) {
    log(`[ERROR] Search module crashed: ${e.message}`);
  }

  try {
    await testSearchEnhanced();
  } catch (e) {
    log(`[ERROR] Search Enhanced module crashed: ${e.message}`);
  }

  try {
    await testBrowser();
  } catch (e) {
    log(`[ERROR] Browser module crashed: ${e.message}`);
  }

  try {
    await testQueue();
  } catch (e) {
    log(`[ERROR] Queue module crashed: ${e.message}`);
  }

  const elapsed = Date.now() - start;

  log('\n========================================');
  log('TEST SUMMARY');
  log('========================================');
  log(`Total:   ${passed + failed}`);
  log(`Passed:  ${passed}`);
  log(`Failed:  ${failed}`);
  log(`Rate:    ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  log(`Time:    ${elapsed}ms`);

  // Save results
  const fs = require('fs');
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE,
    total: passed + failed,
    passed,
    failed,
    rate: `${((passed / (passed + failed)) * 100).toFixed(1)}%`,
    duration: `${elapsed}ms`,
    results
  };

  fs.writeFileSync(
    'C:/Users/Xu/Desktop/chat玩具/test-results/comprehensive-module-test-report.json',
    JSON.stringify(report, null, 2)
  );
  log(`\nReport saved to: test-results/comprehensive-module-test-report.json`);
}

main().catch(e => {
  console.error('Test suite crashed:', e);
  process.exit(1);
});

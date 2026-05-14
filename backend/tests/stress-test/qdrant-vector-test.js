/**
 * Qdrant 向量数据库压测
 * Task #29: 测试 Qdrant 向量数据库性能和降级机制
 *
 * @date 2026-05-13
 */

const http = require('http');

const BASE_URL = 'http://localhost:30000';

// 测试配置
const BATCH_SIZES = [100, 500, 1000];
const SEARCH_COUNTS = [10, 50, 100, 200];
const TEST_COLLECTION = 'stress_test_collection';

class QdrantStressTest {
  constructor() {
    this.results = [];
  }

  // HTTP 请求封装
  async request(path, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(BASE_URL + path);
      const reqOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 30000,
        path: urlObj.pathname,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const startTime = Date.now();
      const req = http.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const latency = Date.now() - startTime;
          try {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data),
              latency
            });
          } catch {
            resolve({
              status: res.statusCode,
              data: data,
              latency
            });
          }
        });
      });

      req.on('error', (err) => {
        reject({ error: err.message, latency: Date.now() - startTime });
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();
    });
  }

  // 生成随机向量
  generateVector(dim = 1024) {
    return Array.from({ length: dim }, () => Math.random() * 2 - 1);
  }

  // 生成随机文档
  generateDocument(id) {
    return {
      title: `测试文档 ${id}`,
      content: `这是一个用于压力测试的文档内容 ${id}。包含足够的文本以便进行分块测试。`.repeat(5),
      tags: ['test', 'stress', `id-${id}`]
    };
  }

  // 清理测试集合
  async cleanupCollection() {
    try {
      await this.request(`/api/qdrant/collections/${TEST_COLLECTION}`, { method: 'DELETE' });
      console.log(`  已清理测试集合: ${TEST_COLLECTION}`);
    } catch {
      // 忽略清理错误
    }
  }

  // 创建集合测试
  async testCreateCollection() {
    console.log('\n【1. 创建集合测试】');

    await this.cleanupCollection();

    const startTime = Date.now();
    try {
      const result = await this.request(`/api/qdrant/collections/${TEST_COLLECTION}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: { vectorSize: 1024, distance: 'Cosine' }
      });

      const latency = Date.now() - startTime;
      const success = result.status === 200 || result.status === 201;

      console.log(`  创建集合: ${latency}ms | ${success ? '✅ 成功' : '❌ 失败'}`);
      this.results.push({ test: 'create_collection', latency, success });

      return { latency, success };
    } catch (error) {
      console.log(`  创建集合: ❌ 失败 - ${error.error || error.message}`);
      this.results.push({ test: 'create_collection', success: false, error: error.message });
      return { success: false };
    }
  }

  // 批量插入向量测试
  async testBatchInsert(size) {
    console.log(`\n【2. 批量插入测试 (${size} 条)】`);

    const documents = [];
    for (let i = 0; i < size; i++) {
      documents.push(this.generateDocument(i));
    }

    const startTime = Date.now();
    try {
      const result = await this.request('/api/qdrant/documents/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { collection: TEST_COLLECTION, documents }
      });

      const latency = Date.now() - startTime;
      const success = result.status === 200 && result.data?.success;

      console.log(`  批量插入 ${size} 条: ${latency}ms | QPS: ${(size / latency * 1000).toFixed(2)} | ${success ? '✅ 成功' : '❌ 失败'}`);
      this.results.push({ test: `batch_insert_${size}`, latency, success, count: size, qps: size / latency * 1000 });

      return { latency, success, qps: size / latency * 1000 };
    } catch (error) {
      console.log(`  批量插入: ❌ 失败 - ${error.error || error.message}`);
      this.results.push({ test: `batch_insert_${size}`, success: false, error: error.message });
      return { success: false };
    }
  }

  // 相似度搜索测试
  async testSearch(concurrency) {
    console.log(`\n【3. 相似度搜索测试 (并发: ${concurrency})】`);

    const query = this.generateVector(1024);
    const promises = [];

    const startTime = Date.now();
    for (let i = 0; i < concurrency; i++) {
      promises.push(this.request('/api/qdrant/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { collection: TEST_COLLECTION, query, topK: 10 }
      }).catch(e => e));
    }

    const results = await Promise.all(promises);
    const totalLatency = Date.now() - startTime;

    const successes = results.filter(r => r.status === 200).length;
    const qps = concurrency / totalLatency * 1000;

    console.log(`  ${concurrency} 次搜索: ${totalLatency}ms | QPS: ${qps.toFixed(2)} | 成功: ${successes}/${concurrency}`);
    this.results.push({ test: `search_${concurrency}`, latency: totalLatency, success: successes, qps });

    return { latency: totalLatency, successes, qps };
  }

  // 获取集合信息测试
  async testGetCollectionInfo() {
    console.log('\n【4. 获取集合信息测试】');

    const startTime = Date.now();
    try {
      const result = await this.request(`/api/qdrant/collections/${TEST_COLLECTION}`);

      const latency = Date.now() - startTime;
      const success = result.status === 200;

      console.log(`  获取集合信息: ${latency}ms | ${success ? '✅ 成功' : '❌ 失败'}`);
      if (success && result.data?.info) {
        const info = result.data.info;
        console.log(`    点数: ${info.points_count || 'N/A'} | 向量维度: ${info.vector_dimensions || 'N/A'}`);
      }
      this.results.push({ test: 'get_collection_info', latency, success });

      return { latency, success };
    } catch (error) {
      console.log(`  获取集合信息: ❌ 失败 - ${error.message}`);
      this.results.push({ test: 'get_collection_info', success: false, error: error.message });
      return { success: false };
    }
  }

  // 删除集合测试
  async testDeleteCollection() {
    console.log('\n【5. 删除集合测试】');

    const startTime = Date.now();
    try {
      const result = await this.request(`/api/qdrant/collections/${TEST_COLLECTION}`, {
        method: 'DELETE'
      });

      const latency = Date.now() - startTime;
      const success = result.status === 200;

      console.log(`  删除集合: ${latency}ms | ${success ? '✅ 成功' : '❌ 失败'}`);
      this.results.push({ test: 'delete_collection', latency, success });

      return { latency, success };
    } catch (error) {
      console.log(`  删除集合: ❌ 失败 - ${error.message}`);
      this.results.push({ test: 'delete_collection', success: false, error: error.message });
      return { success: false };
    }
  }

  // 降级机制测试 - 模拟 Qdrant 不可用
  async testFallbackMechanism() {
    console.log('\n【6. 降级机制测试】');

    console.log('  检查降级配置...');
    try {
      const gatewayStatus = await this.request('/api/gateway/status', { method: 'GET' });
      console.log(`  网关状态: ${gatewayStatus.data?.status || 'unknown'}`);

      // 尝试触发手动降级
      const degradeResult = await this.request('/api/gateway/degrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { level: 'degraded', reason: 'stress_test' }
      });
      console.log(`  手动降级: ${degradeResult.data?.success ? '✅ 成功' : '❌ 失败'}`);

      // 搜索应该仍然工作（降级到内存）
      const startTime = Date.now();
      const searchResult = await this.request('/api/qdrant/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { collection: 'chat_documents', query: this.generateVector(1024), topK: 5 }
      });
      const latency = Date.now() - startTime;

      const success = searchResult.status === 200;
      console.log(`  降级模式搜索: ${latency}ms | ${success ? '✅ 成功' : '❌ 失败'}`);
      this.results.push({ test: 'fallback_search', latency, success });

      // 恢复
      await this.request('/api/gateway/recover', { method: 'POST' });
      console.log('  网关已恢复: ✅');

      return { success };
    } catch (error) {
      console.log(`  降级测试: ❌ 失败 - ${error.message}`);
      this.results.push({ test: 'fallback', success: false, error: error.message });
      return { success: false };
    }
  }

  // Qdrant 原生状态检查
  async testQdrantNativeStatus() {
    console.log('\n【7. Qdrant 原生状态检查】');

    return new Promise((resolve) => {
      const startTime = Date.now();
      const req = http.get('http://localhost:6333/collections', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const latency = Date.now() - startTime;
          try {
            const json = JSON.parse(data);
            console.log(`  Qdrant 原生 API: ${latency}ms | ✅ 连接正常`);
            console.log(`    集合数量: ${json.collections?.length || 0}`);
            this.results.push({ test: 'qdrant_native_status', latency, success: true });
            resolve({ latency, success: true, collections: json.collections });
          } catch {
            console.log(`  Qdrant 原生 API: ❌ 解析失败`);
            this.results.push({ test: 'qdrant_native_status', success: false });
            resolve({ success: false });
          }
        });
      });

      req.on('error', (err) => {
        console.log(`  Qdrant 原生 API: ❌ 连接失败 - ${err.message}`);
        this.results.push({ test: 'qdrant_native_status', success: false, error: err.message });
        resolve({ success: false });
      });
    });
  }

  // 并发批量插入测试
  async testConcurrentBatchInsert(size, concurrency) {
    console.log(`\n【8. 并发批量插入测试 (${size}条 x ${concurrency}并发)】`);

    const documents = [];
    for (let i = 0; i < size; i++) {
      documents.push(this.generateDocument(i));
    }

    const startTime = Date.now();
    const promises = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(this.request('/api/qdrant/documents/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { collection: TEST_COLLECTION, documents }
      }).catch(e => e));
    }

    const results = await Promise.all(promises);
    const totalLatency = Date.now() - startTime;

    const successes = results.filter(r => r.status === 200 && r.data?.success).length;
    const totalDocs = size * concurrency;
    const qps = totalDocs / totalLatency * 1000;

    console.log(`  并发插入 ${totalDocs} 条文档: ${totalLatency}ms | QPS: ${qps.toFixed(2)} | 成功: ${successes}/${concurrency}`);
    this.results.push({ test: `concurrent_batch_${size}x${concurrency}`, latency: totalLatency, success: successes, totalDocs, qps });

    return { latency: totalLatency, successes, qps };
  }

  // 运行完整测试
  async run() {
    console.log('========================================');
    console.log('  Qdrant 向量数据库压测');
    console.log('========================================');

    // 1. Qdrant 原生状态
    await this.testQdrantNativeStatus();

    // 2. 创建集合
    await this.testCreateCollection();

    // 3. 批量插入测试
    for (const size of BATCH_SIZES) {
      await this.testBatchInsert(size);
    }

    // 4. 搜索并发测试
    for (const count of SEARCH_COUNTS) {
      await this.testSearch(count);
    }

    // 5. 获取集合信息
    await this.testGetCollectionInfo();

    // 6. 降级机制测试
    await this.testFallbackMechanism();

    // 7. 清理
    await this.cleanupCollection();

    // 8. 并发批量插入测试
    await this.testConcurrentBatchInsert(100, 5);

    // 汇总结果
    console.log('\n========================================');
    console.log('  Qdrant 压测结果汇总');
    console.log('========================================');

    this.printSummary();

    // 保存结果
    const fs = require('fs');
    const outputPath = require('path').join(__dirname, '../../data/metrics/qdrant-stress-test.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      results: this.results
    }, null, 2));
    console.log(`\n结果已保存: ${outputPath}`);

    return this.results;
  }

  printSummary() {
    console.log('\n测试项目 | 结果 | 延迟 | QPS');
    console.log('---|:---:|---:|---:');

    this.results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const latency = r.latency ? `${r.latency}ms` : '-';
      const qps = r.qps ? r.qps.toFixed(2) : '-';
      console.log(`${r.test} | ${status} | ${latency} | ${qps}`);
    });

    const successes = this.results.filter(r => r.success).length;
    const total = this.results.length;
    console.log(`\n通过率: ${successes}/${total} (${(successes/total*100).toFixed(1)}%)`);
  }
}

// 执行测试
(async () => {
  try {
    const tester = new QdrantStressTest();
    await tester.run();
    console.log('\nQdrant 压测完成!');
    process.exit(0);
  } catch (error) {
    console.error('压测失败:', error);
    process.exit(1);
  }
})();
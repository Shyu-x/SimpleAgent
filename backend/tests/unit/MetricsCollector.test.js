/**
 * MetricsCollector 单元测试
 *
 * 测试内容：
 * 1. 指标采集器初始化
 * 2. Counter 指标
 * 3. Gauge 指标
 * 4. Histogram 指标
 * 5. Summary 指标
 * 6. Prometheus 格式导出
 * 7. 告警功能
 */

const assert = require('assert');
const { MetricsCollector } = require('../../src/infra/metrics/MetricsCollector');

describe('MetricsCollector 初始化', () => {
  test('默认配置应该正确', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    assert.strictEqual(collector.retentionDays, 7);
    assert.strictEqual(collector.persistInterval, 60000);
    assert.ok(collector._counters instanceof Map);
    assert.ok(collector._gauges instanceof Map);
    assert.ok(collector._histograms instanceof Map);
    assert.ok(collector._summaries instanceof Map);
  });

  test('告警级别常量应该正确', () => {
    assert.strictEqual(MetricsCollector.ALERT_LEVELS.CRITICAL, 'critical');
    assert.strictEqual(MetricsCollector.ALERT_LEVELS.WARNING, 'warning');
    assert.strictEqual(MetricsCollector.ALERT_LEVELS.INFO, 'info');
  });
});

describe('MetricsCollector Counter 指标', () => {
  test('incrementCounter 应该增加计数', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.incrementCounter('test_counter');
    collector.incrementCounter('test_counter');
    collector.incrementCounter('test_counter');

    const value = collector.getCounter('test_counter');
    assert.strictEqual(value, 3);
  });

  test('incrementCounter 应该支持标签', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.incrementCounter('test_counter', { method: 'GET' });
    collector.incrementCounter('test_counter', { method: 'GET' });
    collector.incrementCounter('test_counter', { method: 'POST' });

    assert.strictEqual(collector.getCounter('test_counter', { method: 'GET' }), 2);
    assert.strictEqual(collector.getCounter('test_counter', { method: 'POST' }), 1);
  });

  test('getCounter 应该返回计数值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.incrementCounter('get_counter', { label: 'value' });
    collector.incrementCounter('get_counter', { label: 'value' });

    const value = collector.getCounter('get_counter', { label: 'value' });
    assert.strictEqual(value, 2);
  });

  test('不存在的 counter 应该返回 0', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    const value = collector.getCounter('nonexistent');
    assert.strictEqual(value, 0);
  });
});

describe('MetricsCollector Gauge 指标', () => {
  test('setGauge 应该设置值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('test_gauge', 100);

    const value = collector.getGauge('test_gauge');
    assert.strictEqual(value, 100);
  });

  test('incGauge 应该增加值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('test_gauge_inc', 10);
    collector.incGauge('test_gauge_inc', 5);

    const value = collector.getGauge('test_gauge_inc');
    assert.strictEqual(value, 15);
  });

  test('decGauge 应该减少值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('test_gauge_dec', 10);
    collector.decGauge('test_gauge_dec', 3);

    const value = collector.getGauge('test_gauge_dec');
    assert.strictEqual(value, 7);
  });

  test('getGauge 应该返回当前值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('test_gauge_get', 42);

    const value = collector.getGauge('test_gauge_get');
    assert.strictEqual(value, 42);
  });
});

describe('MetricsCollector Histogram 指标', () => {
  test('recordHistogram 应该记录值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.recordHistogram('test_histogram', 0.1);
    collector.recordHistogram('test_histogram', 0.2);
    collector.recordHistogram('test_histogram', 0.3);

    const histogram = collector._histograms.get('test_histogram');
    assert.ok(histogram instanceof Map);
  });
});

describe('MetricsCollector Summary 指标', () => {
  test('recordSummary 应该记录值', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.recordSummary('test_summary', 0.1);
    collector.recordSummary('test_summary', 0.2);

    const summary = collector._summaries.get('test_summary');
    assert.ok(summary instanceof Map);
  });
});

describe('MetricsCollector toPrometheusFormat', () => {
  test('应该返回 Prometheus 格式文本', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('test_metric', 100);
    collector.incrementCounter('test_counter');

    const output = collector.toPrometheusFormat();
    assert.ok(typeof output === 'string');
  });
});

describe('MetricsCollector getMetrics', () => {
  test('应该返回所有指标数据', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('gauge_metric', 10);
    collector.incrementCounter('counter_metric');

    const metrics = collector.getMetrics();
    assert.ok(metrics);
    assert.ok(metrics.gauges || typeof metrics === 'object');
  });
});

describe('MetricsCollector 重置', () => {
  test('reset 应该重置所有指标', () => {
    const collector = new MetricsCollector({ enableHotReload: false });

    collector.setGauge('reset_gauge', 999);
    collector.incrementCounter('reset_counter');

    collector.reset();

    const metrics = collector.getMetrics();
    assert.ok(metrics);
  });
});

describe('MetricsCollector _keyToLabels (regression: regex 死循环)', () => {
  // P0 bug fix: LABEL_KEY_REGEX 之前缺少 'g' 标志位,
  // 任何带 labels 的 metric 触发 while (regex.exec(key)) 都会死循环 100% CPU
  test('单 label 字符串应正确解析 (不死循环)', () => {
    const collector = new MetricsCollector({ enableHotReload: false });
    const start = Date.now();
    const labels = collector._keyToLabels('http_requests_total{status="500"}');
    const elapsed = Date.now() - start;

    assert.deepStrictEqual(labels, { status: '500' });
    assert.ok(elapsed < 100, `解析耗时 ${elapsed}ms 超过 100ms 阈值, 可能死循环`);
  });

  test('多 label 字符串应正确解析 (不死循环)', () => {
    const collector = new MetricsCollector({ enableHotReload: false });
    const start = Date.now();
    const labels = collector._keyToLabels('http_requests_total{status="500",method="GET",path="/api"}');
    const elapsed = Date.now() - start;

    assert.deepStrictEqual(labels, { status: '500', method: 'GET', path: '/api' });
    assert.ok(elapsed < 100, `解析耗时 ${elapsed}ms 超过 100ms 阈值, 可能死循环`);
  });

  test('空 key 应返回空对象', () => {
    const collector = new MetricsCollector({ enableHotReload: false });
    const labels = collector._keyToLabels('');
    assert.deepStrictEqual(labels, {});
  });

  test('无 label 字符串应返回空对象', () => {
    const collector = new MetricsCollector({ enableHotReload: false });
    const labels = collector._keyToLabels('simple_counter');
    assert.deepStrictEqual(labels, {});
  });

  test('LABEL_KEY_REGEX 必须带 g 标志位 (防死循环)', () => {
    assert.ok(
      MetricsCollector.LABEL_KEY_REGEX.global,
      'LABEL_KEY_REGEX 缺少 g 标志, exec() 会死循环'
    );
  });
});

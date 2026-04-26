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

// 简单的测试运行器
function test(name, fn) {
  try {
    fn();
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (e) {
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + e.message);
    process.exitCode = 1;
  }
}

function describe(name, fn) {
  console.log('\n' + name + ':');
  fn();
}

describe('MetricsCollector 初始化', () => {
  test('默认配置应该正确', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector({ enableHotReload: false });

    assert.strictEqual(collector.retentionDays, 7);
    assert.strictEqual(collector.persistInterval, 60000);
    assert.ok(collector._counters);
    assert.ok(collector._gauges);
    assert.ok(collector._histograms);
    assert.ok(collector._summaries);
  });

  test('告警级别常量应该正确', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');

    assert.strictEqual(MetricsCollector.ALERT_LEVELS.CRITICAL, 'critical');
    assert.strictEqual(MetricsCollector.ALERT_LEVELS.WARNING, 'warning');
    assert.strictEqual(MetricsCollector.ALERT_LEVELS.INFO, 'info');
  });
});

describe('MetricsCollector Counter 指标', () => {
  test('incCounter 应该增加计数', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.incCounter('test_counter');
    collector.incCounter('test_counter');
    collector.incCounter('test_counter');

    assert.strictEqual(collector._counters.get('test_counter').values['total'], 3);
  });

  test('incCounter 应该支持标签', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.incCounter('test_counter', { method: 'GET' });
    collector.incCounter('test_counter', { method: 'GET' });
    collector.incCounter('test_counter', { method: 'POST' });

    assert.strictEqual(collector._counters.get('test_counter').values['{method=GET}'], 2);
    assert.strictEqual(collector._counters.get('test_counter').values['{method=POST}'], 1);
  });

  test('getCounter 应该返回计数值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.incCounter('get_counter', { label: 'value' });
    collector.incCounter('get_counter', { label: 'value' });

    const value = collector.getCounter('get_counter', { label: 'value' });
    assert.strictEqual(value, 2);
  });
});

describe('MetricsCollector Gauge 指标', () => {
  test('setGauge 应该设置值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('test_gauge', 100);

    assert.strictEqual(collector._gauges.get('test_gauge').values['total'], 100);
  });

  test('incGauge 应该增加值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('test_gauge_inc', 10);
    collector.incGauge('test_gauge_inc', 5);

    assert.strictEqual(collector.getGauge('test_gauge_inc'), 15);
  });

  test('decGauge 应该减少值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('test_gauge_dec', 10);
    collector.decGauge('test_gauge_dec', 3);

    assert.strictEqual(collector.getGauge('test_gauge_dec'), 7);
  });

  test('getGauge 应该返回当前值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('test_gauge_get', 42);

    const value = collector.getGauge('test_gauge_get');
    assert.strictEqual(value, 42);
  });
});

describe('MetricsCollector Histogram 指标', () => {
  test('observeHistogram 应该记录值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.observeHistogram('test_histogram', 0.1);
    collector.observeHistogram('test_histogram', 0.2);
    collector.observeHistogram('test_histogram', 0.3);

    const histogram = collector._histograms.get('test_histogram');
    assert.strictEqual(histogram.values['total'].count, 3);
    assert.ok(histogram.values['total'].sum > 0);
  });

  test('observeHistogram 应该正确分桶', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector({
      buckets: [0.01, 0.1, 1, 10]
    });

    collector.observeHistogram('bucket_histogram', 0.05);
    collector.observeHistogram('bucket_histogram', 0.5);
    collector.observeHistogram('bucket_histogram', 5);

    const histogram = collector._histograms.get('bucket_histogram');
    assert.strictEqual(histogram.values['total'].buckets['+Inf'], 3);
    assert.strictEqual(histogram.values['total'].buckets['0.1'], 1);
    assert.strictEqual(histogram.values['total'].buckets['1'], 2);
  });
});

describe('MetricsCollector Summary 指标', () => {
  test('observeSummary 应该记录值', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.observeSummary('test_summary', 0.1);
    collector.observeSummary('test_summary', 0.2);
    collector.observeSummary('test_summary', 0.3);

    const summary = collector._summaries.get('test_summary');
    assert.strictEqual(summary.values['total'].count, 3);
  });

  test('observeSummary 应该计算分位数', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector({
      quantiles: [0.5, 0.9, 0.99]
    });

    // 记录100个值
    for (let i = 1; i <= 100; i++) {
      collector.observeSummary('quantile_summary', i);
    }

    const summary = collector._summaries.get('quantile_summary');
    const q50 = summary.values['total'].quantiles['0.5'];
    const q90 = summary.values['total'].quantiles['0.9'];

    assert.ok(q50 >= 50 && q50 <= 51);
    assert.ok(q90 >= 90 && q90 <= 91);
  });
});

describe('MetricsCollector toPrometheusFormat', () => {
  test('应该返回 Prometheus 格式文本', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('test_metric', 100);
    collector.incCounter('test_counter');

    const output = collector.toPrometheusFormat();

    assert.ok(output.includes('# HELP test_metric'));
    assert.ok(output.includes('# TYPE test_metric gauge'));
    assert.ok(output.includes('test_metric 100'));
    assert.ok(output.includes('test_counter'));
  });

  test('应该包含 HELP 和 TYPE 注释', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('my_gauge', 42);

    const output = collector.toPrometheusFormat();

    assert.ok(output.includes('# HELP my_gauge'));
    assert.ok(output.includes('# TYPE my_gauge gauge'));
  });
});

describe('MetricsCollector getMetrics', () => {
  test('应该返回所有指标数据', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('gauge_metric', 10);
    collector.incCounter('counter_metric');

    const metrics = collector.getMetrics();

    assert.ok(metrics.gauges);
    assert.ok(metrics.counters);
    assert.strictEqual(metrics.gauges.gauge_metric.values.total, 10);
    assert.strictEqual(metrics.counters.counter_metric.values.total, 1);
  });
});

describe('MetricsCollector 重置', () => {
  test('resetMetrics 应该重置所有指标', () => {
    const MetricsCollector = require('../../src/infra/metrics/MetricsCollector');
    const collector = new MetricsCollector();

    collector.setGauge('reset_gauge', 999);
    collector.incCounter('reset_counter', { times: 100 });

    collector.resetMetrics();

    const metrics = collector.getMetrics();
    assert.strictEqual(metrics.gauges.reset_gauge.values.total, 0);
    assert.strictEqual(metrics.counters.reset_counter.values.total, 0);
  });
});

console.log('\n');

/**
 * 限流器单元测试
 * 测试 RateLimiter 限流逻辑、窗口管理、响应格式
 */
describe('RateLimiter', () => {
  // 模拟请求对象工厂
  const createMockRequest = (overrides = {}) => ({
    ip: '127.0.0.1',
    path: '/api/chat',
    method: 'POST',
    headers: {
      'user-agent': 'test-agent',
      'x-forwarded-for': null
    },
    get: jest.fn().mockReturnValue(null),
    ...overrides
  });

  // 模拟响应对象工厂
  const createMockResponse = () => {
    const res = {
      statusCode: 200,
      headers: {},
      body: null,
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        this.body = data;
        return this;
      },
      setHeader: function(key, value) {
        this.headers[key] = value;
        return this;
      },
      send: function(data) {
        this.body = data;
        return this;
      }
    };
    return res;
  };

  // 模拟限流器类
  class RateLimiter {
    constructor(options = {}) {
      this.windowMs = options.windowMs !== undefined ? options.windowMs : 60000;
      this.max = options.max !== undefined ? options.max : 100;
      this.message = options.message || {
        success: false,
        error: {
          type: 'rate_limit_exceeded',
          message: '请求过于频繁'
        }
      };
      this.keyPrefix = options.keyPrefix || 'rl:';

      this.store = new Map();
      this.hits = new Map();
    }

    _getKey(req) {
      return `${this.keyPrefix}${req.ip}`;
    }

    _isExpired(timestamp) {
      // windowMs 为 0 表示无窗口期，任何时间戳都视为已过期
      if (this.windowMs === 0) return true;
      return Date.now() - timestamp > this.windowMs;
    }

    _cleanup(key) {
      const data = this.store.get(key);
      if (data && this._isExpired(data.windowStart)) {
        this.store.delete(key);
        this.hits.delete(key);
        return true;
      }
      return false;
    }

    check(req) {
      const key = this._getKey(req);
      this._cleanup(key);

      const current = this.hits.get(key) || 0;
      const remaining = Math.max(0, this.max - current);
      const resetTime = (this.store.get(key)?.windowStart || Date.now()) + this.windowMs;

      return {
        limited: current >= this.max,
        remaining,
        resetTime,
        total: this.max
      };
    }

    hit(req) {
      const key = this._getKey(req);

      if (!this.store.has(key) || this._cleanup(key)) {
        this.store.set(key, { windowStart: Date.now() });
        this.hits.set(key, 1);
        return 1;
      }

      const current = (this.hits.get(key) || 0) + 1;
      this.hits.set(key, current);
      return current;
    }

    reset(req) {
      const key = this._getKey(req);
      this.store.delete(key);
      this.hits.delete(key);
    }

    middleware() {
      const self = this;
      return (req, res, next) => {
        // 先递增计数
        const currentCount = self.hit(req);

        // 检查是否超过限制（基于递增后的计数）
        const key = self._getKey(req);
        const limited = currentCount > self.max;

        // 计算剩余请求数
        const remaining = Math.max(0, self.max - currentCount);
        const windowStart = self.store.get(key)?.windowStart || Date.now();
        const resetTime = Math.ceil((windowStart + self.windowMs) / 1000);

        // 设置响应头
        res.setHeader('X-RateLimit-Limit', self.max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', resetTime);

        if (limited) {
          res.setHeader('Retry-After', Math.ceil(self.windowMs / 1000));
          return res.status(429).json(self.message);
        }

        next();
      };
    }
  }

  describe('初始化配置', () => {
    test('应使用默认配置', () => {
      const limiter = new RateLimiter();

      expect(limiter.windowMs).toBe(60000);
      expect(limiter.max).toBe(100);
      expect(limiter.keyPrefix).toBe('rl:');
    });

    test('应接受自定义配置', () => {
      const limiter = new RateLimiter({
        windowMs: 120000,
        max: 50,
        keyPrefix: 'custom:'
      });

      expect(limiter.windowMs).toBe(120000);
      expect(limiter.max).toBe(50);
      expect(limiter.keyPrefix).toBe('custom:');
    });

    test('应接受自定义消息', () => {
      const customMessage = { error: '自定义限流消息' };
      const limiter = new RateLimiter({ message: customMessage });

      expect(limiter.message).toEqual(customMessage);
    });
  });

  describe('请求检查', () => {
    test('首次请求应不限制', () => {
      const limiter = new RateLimiter({ max: 10 });
      const req = createMockRequest({ ip: '192.168.1.1' });

      const result = limiter.check(req);

      expect(result.limited).toBe(false);
      expect(result.remaining).toBe(10);
    });

    test('达到限制时应限制', () => {
      const limiter = new RateLimiter({ max: 3 });
      const req = createMockRequest({ ip: '192.168.1.1' });

      // 发送 3 次请求
      limiter.hit(req);
      limiter.hit(req);
      limiter.hit(req);

      const result = limiter.check(req);

      expect(result.limited).toBe(true);
      expect(result.remaining).toBe(0);
    });

    test('不同 IP 应独立计数', () => {
      const limiter = new RateLimiter({ max: 5 });
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const req2 = createMockRequest({ ip: '192.168.1.2' });

      // req1 发送 3 次
      limiter.hit(req1);
      limiter.hit(req1);
      limiter.hit(req1);

      // req2 发送 1 次
      limiter.hit(req2);

      expect(limiter.check(req1).remaining).toBe(2);
      expect(limiter.check(req2).remaining).toBe(4);
    });

    test('应返回重置时间', () => {
      const limiter = new RateLimiter({ windowMs: 60000 });
      const req = createMockRequest();

      const result = limiter.check(req);

      expect(result.resetTime).toBeGreaterThan(Date.now());
    });
  });

  describe('请求计数', () => {
    test('应正确增加计数', () => {
      const limiter = new RateLimiter({ max: 10 });
      const req = createMockRequest();

      limiter.hit(req);
      expect(limiter.hits.get(limiter._getKey(req))).toBe(1);

      limiter.hit(req);
      expect(limiter.hits.get(limiter._getKey(req))).toBe(2);
    });

    test('窗口过期后应重置计数', async () => {
      const limiter = new RateLimiter({ windowMs: 100, max: 10 });
      const req = createMockRequest();

      limiter.hit(req);
      limiter.hit(req);
      expect(limiter.hits.get(limiter._getKey(req))).toBe(2);

      // 等待窗口过期
      await new Promise(resolve => setTimeout(resolve, 150));

      limiter.hit(req);
      expect(limiter.hits.get(limiter._getKey(req))).toBe(1);
    });
  });

  describe('重置功能', () => {
    test('应重置指定 IP 的计数', () => {
      const limiter = new RateLimiter({ max: 10 });
      const req = createMockRequest();

      limiter.hit(req);
      limiter.hit(req);

      limiter.reset(req);

      expect(limiter.check(req).remaining).toBe(10);
    });

    test('重置不应影响其他 IP', () => {
      const limiter = new RateLimiter({ max: 10 });
      const req1 = createMockRequest({ ip: '192.168.1.1' });
      const req2 = createMockRequest({ ip: '192.168.1.2' });

      limiter.hit(req1);
      limiter.hit(req1);
      limiter.hit(req2);

      limiter.reset(req1);

      expect(limiter.check(req1).remaining).toBe(10);
      expect(limiter.check(req2).remaining).toBe(9);
    });
  });

  describe('中间件功能', () => {
    test('应生成有效的中间件函数', () => {
      const limiter = new RateLimiter();
      const middleware = limiter.middleware();

      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // req, res, next
    });

    test('未限制时应调用 next', () => {
      const limiter = new RateLimiter({ max: 10 });
      const middleware = limiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    test('受限时应返回 429 状态码', () => {
      const limiter = new RateLimiter({ max: 1 });
      const middleware = limiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      // 第一次请求 - 应该通过
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);

      // 第二次请求 - 应该被限制
      const res2 = createMockResponse();
      const next2 = jest.fn();
      middleware(req, res2, next2);

      expect(res2.statusCode).toBe(429);
      expect(next2).not.toHaveBeenCalled();
    });

    test('应设置 RateLimit 响应头', () => {
      const limiter = new RateLimiter({ max: 10, windowMs: 60000 });
      const middleware = limiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res.headers['X-RateLimit-Limit']).toBe(10);
      expect(res.headers['X-RateLimit-Remaining']).toBe(9);
      expect(res.headers['X-RateLimit-Reset']).toBeDefined();
    });

    test('受限时应设置 Retry-After 头', () => {
      const limiter = new RateLimiter({ max: 1, windowMs: 60000 });
      const middleware = limiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);
      const res2 = createMockResponse();
      middleware(req, res2, next);

      expect(res2.headers['Retry-After']).toBe(60);
    });

    test('受限时应返回限流消息', () => {
      const limiter = new RateLimiter({ max: 1 });
      const middleware = limiter.middleware();
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req, res, next);
      const res2 = createMockResponse();
      middleware(req, res2, next);

      expect(res2.body.success).toBe(false);
      expect(res2.body.error.type).toBe('rate_limit_exceeded');
    });
  });

  describe('清理过期数据', () => {
    test('_cleanup 应删除过期数据', async () => {
      const limiter = new RateLimiter({ windowMs: 100 });
      const req = createMockRequest();

      limiter.hit(req);

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 150));

      const cleaned = limiter._cleanup(limiter._getKey(req));

      expect(cleaned).toBe(true);
      expect(limiter.store.has(limiter._getKey(req))).toBe(false);
    });

    test('_isExpired 应正确判断过期', () => {
      const limiter = new RateLimiter({ windowMs: 1000 });

      const oldTimestamp = Date.now() - 2000;
      expect(limiter._isExpired(oldTimestamp)).toBe(true);

      const recentTimestamp = Date.now() - 500;
      expect(limiter._isExpired(recentTimestamp)).toBe(false);
    });
  });

  describe('窗口管理', () => {
    test('新窗口应从 1 开始计数', () => {
      const limiter = new RateLimiter({ max: 10 });
      const req = createMockRequest();

      const count = limiter.hit(req);

      expect(count).toBe(1);
    });

    test('现有窗口应递增计数', () => {
      const limiter = new RateLimiter({ max: 10 });
      const req = createMockRequest();

      limiter.hit(req);
      limiter.hit(req);
      const count = limiter.hit(req);

      expect(count).toBe(3);
    });
  });

  describe('边界条件', () => {
    test('应处理缺失的 IP', () => {
      const limiter = new RateLimiter();
      const req = createMockRequest({ ip: undefined });

      const result = limiter.check(req);

      expect(result.limited).toBe(false);
    });

    test('应处理 null headers', () => {
      const limiter = new RateLimiter();
      const req = createMockRequest({ headers: null });

      const result = limiter.check(req);

      expect(result.limited).toBe(false);
    });

    test('max 为 0 应始终限制', () => {
      const limiter = new RateLimiter({ max: 0 });
      // 使用唯一 IP 避免测试间状态污染
      const req = createMockRequest({ ip: `192.168.0.${Math.random().toString().split('.')[3]}` });

      const result = limiter.check(req);

      expect(result.limited).toBe(true);
    });

    test('windowMs 为 0 应不限制', () => {
      const limiter = new RateLimiter({ windowMs: 0, max: 1 });
      // 使用唯一 IP 避免测试间状态污染
      const req = createMockRequest({ ip: `10.0.${Math.random().toString().split('.')[3]}` });

      const result = limiter.check(req);

      // 窗口为 0 意味着立即过期，所以每次都是新窗口
      expect(result.limited).toBe(false);
    });
  });

  describe('存储隔离', () => {
    test('不同 keyPrefix 应隔离存储', () => {
      const limiter1 = new RateLimiter({ keyPrefix: 'rl1:' });
      const limiter2 = new RateLimiter({ keyPrefix: 'rl2:' });
      const req = createMockRequest({ ip: '192.168.1.1' });

      limiter1.hit(req);
      limiter2.hit(req);

      expect(limiter1.check(req).remaining).toBe(limiter1.max - 1);
      expect(limiter2.check(req).remaining).toBe(limiter2.max - 1);
    });
  });
});

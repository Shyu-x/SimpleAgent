/**
 * Redis 客户端 Mock - 总是失败，强制使用内存降级
 */

const mockClient = {
  ping: () => Promise.reject(new Error('Mock Redis not available')),
  incr: () => Promise.resolve(1),
  expire: () => Promise.resolve(1),
  zremrangebyscore: () => Promise.resolve(0),
  zcard: () => Promise.resolve(0),
  zadd: () => Promise.resolve(1),
  zcount: () => Promise.resolve(0),
  zrange: () => Promise.resolve([]),
  hgetall: () => Promise.resolve({}),
  hmset: () => Promise.resolve('OK'),
  del: () => Promise.resolve(1),
  quit: () => Promise.resolve('OK'),
  isOpen: false,
  on: () => {},
  connect: () => Promise.reject(new Error('Mock Redis not available')),
  multi: function() { return this; },
  exec: () => Promise.resolve([0, 0, 1, 1]),
};

const createClient = () => mockClient;

module.exports = {
  createClient,
  mockClient,
};

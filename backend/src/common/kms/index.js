/**
 * KMS Factory - 根据环境变量返回对应的 KMSClient 实现
 *
 * 选取规则 (按优先级):
 * 1. KMS_TYPE=local -> LocalKMSService (默认)
 * 2. KMS_TYPE=vault -> VaultKMSService (生产推荐, 当前为 stub)
 * 3. KMS_TYPE=mock -> MockKMSService (仅测试)
 * 4. 未设置 -> 根据 NODE_ENV 推断: production=local (Fail-Fast), 其他=local
 *
 * 单例模式: 整个进程共享一个 KMSClient, 避免重复初始化主密钥
 */

const LocalKMSService = require('./local-kms.service');
const VaultKMSService = require('./vault-kms.service');

let _instance = null;

/**
 * 获取 KMS 客户端单例
 * @param {object} options 覆盖选项 (仅当 forceNew=true 时生效)
 * @param {boolean} options.forceNew 强制创建新实例 (用于测试)
 * @returns {object} 实现 KMSClient 接口的对象
 */
function getKMSClient(options = {}) {
  if (_instance && !options.forceNew) {
    return _instance;
  }

  const type = (options.type || process.env.KMS_TYPE || 'local').toLowerCase();

  switch (type) {
    case 'local':
      _instance = new LocalKMSService(options);
      break;
    case 'vault':
      _instance = new VaultKMSService(options);
      break;
    case 'mock':
      // 测试场景: 直接返回 mock, 避免依赖 LocalKMS 的主密钥
      _instance = options.mockInstance || _createDefaultMock();
      break;
    default:
      throw new Error(`不支持的 KMS_TYPE: ${type} (支持: local / vault / mock)`);
  }

  return _instance;
}

/**
 * 重置单例 (仅供测试使用, 业务代码不要调用)
 */
function _resetForTesting() {
  _instance = null;
}

function _createDefaultMock() {
  // 简单 mock: 不做实际加密, 仅返回 Base64 编码的 plaintext + keyId
  return {
    encrypt: async (plaintext, keyId) => Buffer.from(`mock:${keyId}:${plaintext}`).toString('base64'),
    decrypt: async (ciphertext, keyId) => {
      const decoded = Buffer.from(ciphertext, 'base64').toString('utf8');
      const match = decoded.match(/^mock:([^:]+):(.*)$/s);
      if (!match) throw new Error('Mock 密文格式错误');
      if (match[1] !== keyId) throw new Error(`Mock keyId 不匹配: 期望 ${keyId}, 实际 ${match[1]}`);
      return match[2];
    },
    rotateKey: async (keyId) => `${keyId}-rotated`,
  };
}

module.exports = {
  getKMSClient,
  _resetForTesting,
  LocalKMSService,
  VaultKMSService,
};

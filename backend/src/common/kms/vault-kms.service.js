/**
 * VaultKMSService - HashiCorp Vault 集成 (Stub)
 *
 * 设计目标:
 * 1. 提供与 LocalKMSService 一致的接口, 便于切换实现
 * 2. 真实 Vault 集成需要:
 *    - VAULT_ADDR 环境变量
 *    - VAULT_TOKEN (或 K8s service account 认证)
 *    - Transit Engine mount path (默认 "transit")
 * 3. 真实实现应使用 @hashiCorp/vault-client 或 node-vault SDK,
 *    调 Vault Transit Engine 的 encrypt/decrypt 端点
 *
 * 当前状态: Stub
 * - encrypt/decrypt/rotateKey 全部抛 "not yet implemented" 错误
 * - 业务侧通过 factory 选择此实现时, 调用会立即失败 (Fail-Fast)
 * - 这样可以避免"配置了 Vault 但实际跑的是 Local 加密"的安全事故
 *
 * 未来实现参考:
 * ```js
 * const vault = require('node-vault')({
 *   endpoint: process.env.VAULT_ADDR,
 *   token: process.env.VAULT_TOKEN,
 * });
 * await vault.write(`${mount}/encrypt/${keyId}`, { plaintext: b64 });
 * await vault.write(`${mount}/decrypt/${keyId}`, { ciphertext });
 * ```
 */

class VaultKMSService {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.VAULT_ADDR || 'https://vault:8200';
    this.token = options.token || process.env.VAULT_TOKEN || null;
    this.mountPath = options.mountPath || process.env.VAULT_TRANSIT_MOUNT || 'transit';
    this._initialized = false;
  }

  async _ensureInitialized() {
    if (this._initialized) return;
    if (!this.token) {
      throw new Error('Vault not yet implemented: VAULT_TOKEN 未配置');
    }
    // 此处后续会调用 vault.sys.health() 验证连通性
    // 目前仅做基础配置校验
    this._initialized = true;
  }

  async encrypt(plaintext, keyId) {
    await this._ensureInitialized();
    throw new Error('Vault not yet implemented: encrypt');
  }

  async decrypt(ciphertext, keyId) {
    await this._ensureInitialized();
    throw new Error('Vault not yet implemented: decrypt');
  }

  async rotateKey(keyId) {
    await this._ensureInitialized();
    throw new Error('Vault not yet implemented: rotateKey');
  }
}

module.exports = VaultKMSService;

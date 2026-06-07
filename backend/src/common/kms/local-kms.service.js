/**
 * LocalKMSService - 基于 AES-256-GCM 的本地密钥管理实现
 *
 * 适用场景:
 * - 开发与测试环境 (无外部 KMS 依赖)
 * - 单机部署 (POC / 内网系统)
 * - 不需要 FIPS-140 合规的小型生产环境
 *
 * 安全特性:
 * - AES-256-GCM (认证加密, 同时保证机密性与完整性)
 * - 每个 keyId 派生独立密钥 (HKDF-SHA256, 从主密钥 + keyId)
 * - 每次加密使用随机 IV (12 bytes, GCM 推荐长度)
 * - 密文自带 IV + AuthTag + keyId, 自描述, 无需额外元数据存储
 *
 * 已知限制:
 * - 主密钥 (LOCAL_KMS_MASTER_KEY) 必须妥善保管, 建议从环境变量或密钥文件注入
 * - 不支持多节点密钥分发 (每个节点需要相同的主密钥才能互通)
 * - rotateKey 仅在内存中标记新版本, 不持久化 (重启后回到原 keyId)
 *
 * 密文格式 (Base64 编码后):
 *   [version:1B][keyIdLen:1B][keyId:N bytes][iv:12B][authTag:16B][ciphertext:M bytes]
 */

const crypto = require('crypto');

// 密文格式版本 (未来格式变更时升级, 兼容旧版本)
const CIPHER_FORMAT_VERSION = 0x01;

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 bytes
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256

class LocalKMSService {
  constructor(options = {}) {
    // 主密钥: 优先使用 env, 否则使用 options, 否则使用固定 dev key (仅开发)
    const masterKeyHex = process.env.LOCAL_KMS_MASTER_KEY || options.masterKey;

    if (masterKeyHex) {
      if (typeof masterKeyHex !== 'string' || masterKeyHex.length !== 64) {
        throw new Error('LOCAL_KMS_MASTER_KEY 必须是 64 个十六进制字符 (32 bytes)');
      }
      this.masterKey = Buffer.from(masterKeyHex, 'hex');
      if (this.masterKey.length !== KEY_LENGTH) {
        throw new Error('LOCAL_KMS_MASTER_KEY 长度必须为 32 bytes');
      }
    } else {
      // 开发模式: 使用固定 dev key, 启动时打印强警告
      if (process.env.NODE_ENV === 'production') {
        throw new Error('生产环境必须显式设置 LOCAL_KMS_MASTER_KEY');
      }
      this.masterKey = crypto.createHash('sha256')
        .update('simpleagent-dev-kms-master-key-do-not-use-in-prod')
        .digest();
      // eslint-disable-next-line no-console
      console.warn('[LocalKMS] 使用开发主密钥, 生产环境必须设置 LOCAL_KMS_MASTER_KEY');
    }

    // keyId 版本映射: keyId -> 当前活跃版本 (用于 rotateKey)
    this._keyVersions = new Map();
  }

  /**
   * 从主密钥派生指定 keyId 的实际加密密钥 (HKDF-SHA256)
   */
  _deriveKey(keyId) {
    if (typeof keyId !== 'string' || keyId.length === 0) {
      throw new Error('keyId 必须是非空字符串');
    }
    if (keyId.length > 255) {
      throw new Error('keyId 长度不能超过 255 字节');
    }
    // 简单 HKDF-Extract 模式: salt=固定值, ikm=masterKey, info=keyId
    // 注: 生产环境建议用真正的 HKDF (hkdf 库), 此处使用简化版保持零依赖
    const salt = crypto.createHash('sha256').update('simpleagent-kms-salt').digest();
    return crypto.hkdfSync
      ? crypto.hkdfSync('sha256', this.masterKey, salt, Buffer.from(keyId), KEY_LENGTH)
      : this._simpleHkdf(this.masterKey, salt, Buffer.from(keyId), KEY_LENGTH);
  }

  /**
   * 简化的 HKDF 实现 (Node.js < 15.0.0 兼容)
   */
  _simpleHkdf(ikm, salt, info, length) {
    // Extract
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
    // Expand
    const out = Buffer.alloc(length);
    let prev = Buffer.alloc(0);
    let generated = 0;
    let counter = 1;
    while (generated < length) {
      const h = crypto.createHmac('sha256', prk);
      h.update(prev);
      h.update(info);
      h.update(Buffer.from([counter]));
      prev = h.digest();
      const take = Math.min(prev.length, length - generated);
      prev.copy(out, generated, 0, take);
      generated += take;
      counter += 1;
    }
    return out;
  }

  /**
   * 编码密文: [version][keyIdLen][keyId][iv][authTag][ciphertext]
   */
  _pack(keyId, iv, authTag, ciphertext) {
    const keyIdBuf = Buffer.from(keyId, 'utf8');
    if (keyIdBuf.length > 255) {
      throw new Error('keyId 编码后不能超过 255 字节');
    }
    return Buffer.concat([
      Buffer.from([CIPHER_FORMAT_VERSION, keyIdBuf.length]),
      keyIdBuf,
      iv,
      authTag,
      ciphertext,
    ]);
  }

  /**
   * 解码密文
   */
  _unpack(packed) {
    if (packed.length < 2) {
      throw new Error('密文格式错误: 长度不足');
    }
    const version = packed[0];
    if (version !== CIPHER_FORMAT_VERSION) {
      throw new Error(`不支持的密文格式版本: ${version}`);
    }
    const keyIdLen = packed[1];
    if (packed.length < 2 + keyIdLen + IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('密文格式错误: 数据不完整');
    }
    const keyId = packed.slice(2, 2 + keyIdLen).toString('utf8');
    const iv = packed.slice(2 + keyIdLen, 2 + keyIdLen + IV_LENGTH);
    const authTag = packed.slice(2 + keyIdLen + IV_LENGTH, 2 + keyIdLen + IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.slice(2 + keyIdLen + IV_LENGTH + AUTH_TAG_LENGTH);
    return { keyId, iv, authTag, ciphertext };
  }

  async encrypt(plaintext, keyId) {
    if (typeof plaintext !== 'string') {
      throw new Error('plaintext 必须是字符串');
    }
    const effectiveKeyId = this._resolveKeyId(keyId);
    const key = this._deriveKey(effectiveKeyId);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    const packed = this._pack(effectiveKeyId, iv, authTag, ciphertext);
    return packed.toString('base64');
  }

  async decrypt(ciphertextB64, keyId) {
    if (typeof ciphertextB64 !== 'string') {
      throw new Error('ciphertext 必须是 Base64 字符串');
    }
    if (typeof keyId !== 'string' || keyId.length === 0) {
      throw new Error('keyId 必须是非空字符串');
    }
    const packed = Buffer.from(ciphertextB64, 'base64');
    const { keyId: embeddedKeyId, iv, authTag, ciphertext } = this._unpack(packed);
    if (embeddedKeyId !== keyId) {
      throw new Error(`keyId 不匹配: 期望 ${keyId}, 密文内嵌 ${embeddedKeyId}`);
    }
    const key = this._deriveKey(keyId);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    try {
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch (err) {
      throw new Error(`解密失败 (密文被篡改或 AuthTag 不匹配): ${err.message}`);
    }
  }

  async rotateKey(keyId) {
    if (typeof keyId !== 'string' || keyId.length === 0) {
      throw new Error('keyId 必须是非空字符串');
    }
    const currentVersion = this._keyVersions.get(keyId) || 1;
    const newVersion = currentVersion + 1;
    // 提取 keyId 的基础名 (去除已有的 -vN 后缀)
    const baseName = keyId.replace(/-v\d+$/, '');
    const newKeyId = `${baseName}-v${newVersion}`;
    this._keyVersions.set(baseName, newVersion);
    this._keyVersions.set(newKeyId, 1);
    return newKeyId;
  }

  /**
   * 获取 keyId 的当前活跃版本 (用于支持 rotateKey 后的版本路由)
   * 简化实现: 如果传入了 -vN 后缀的 keyId, 直接使用; 否则返回原 keyId
   */
  _resolveKeyId(keyId) {
    return keyId;
  }
}

module.exports = LocalKMSService;

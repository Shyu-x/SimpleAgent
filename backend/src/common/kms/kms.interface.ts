/**
 * KMS 抽象层 - 统一密钥管理接口
 *
 * 设计目标:
 * 1. 屏蔽底层 KMS 供应商差异 (本地 AES-256-GCM / HashiCorp Vault / AWS KMS / 阿里云 KMS)
 * 2. 业务侧通过依赖注入获取 KMSClient, 无需关心实现
 * 3. 支持密钥轮换 (rotateKey) 与版本管理
 *
 * 选用 TypeScript interface 而非 class 是因为:
 * - 业务侧通常不直接 new KMSClient, 而是通过 factory getKMSClient() 获取
 * - interface 允许多种实现并存 (Local / Vault / Mock), 便于测试
 */

/**
 * KMS 客户端统一接口
 *
 * 所有方法均为 async, 即使 Local 实现是同步的也保持异步签名, 以匹配
 * 真实 KMS (Vault / 云 KMS) 的网络调用语义, 避免业务侧出现"本地能跑
 * 生产挂掉"的情况。
 */
export interface KMSClient {
  /**
   * 加密明文
   * @param plaintext 待加密的明文 (UTF-8 字符串, 业务侧负责序列化)
   * @param keyId 密钥标识符 (例如 "user-pii-key-v1")
   * @returns 加密后的密文 (Base64 字符串, 自带 IV + AuthTag + keyId 元数据)
   */
  encrypt(plaintext: string, keyId: string): Promise<string>;

  /**
   * 解密密文
   * @param ciphertext encrypt() 返回的密文
   * @param keyId 密钥标识符 (必须与加密时一致, 否则抛错)
   * @returns 解密后的明文
   * @throws Error 当 keyId 不匹配 / 密文被篡改 / 密钥已轮换且旧版本被清理时
   */
  decrypt(ciphertext: string, keyId: string): Promise<string>;

  /**
   * 轮换密钥
   * @param keyId 旧密钥标识符
   * @returns 新密钥标识符 (通常是旧 keyId 加上版本号, 例如 "user-pii-key-v2")
   * @note 轮换后旧 keyId 仍可用于解密历史密文, 但 encrypt() 默认使用新 keyId
   */
  rotateKey(keyId: string): Promise<string>;
}

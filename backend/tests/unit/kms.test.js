/**
 * KMS 抽象层 单元测试
 *
 * 测试覆盖:
 * 1. encrypt + decrypt 往返 (确保密文可还原)
 * 2. 不同 keyId 加密结果不同 (确保密钥隔离)
 * 3. 错误 keyId 解密抛错 (确保 keyId 校验生效)
 * 4. factory 选择正确实现 (mock env 验证 local/vault/mock 分流)
 * 5. 篡改密文抛错 (AuthTag 验证)
 * 6. rotateKey 返回新 keyId
 */

const assert = require('assert');
const { getKMSClient, _resetForTesting, LocalKMSService, VaultKMSService } = require('../../src/common/kms');

describe('KMS - LocalKMSService (AES-256-GCM)', () => {
  let kms;

  beforeEach(() => {
    _resetForTesting();
    // 使用显式 masterKey 避免 dev warning
    kms = new LocalKMSService({
      masterKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
  });

  it('encrypt + decrypt 应该完整往返', async () => {
    const plaintext = '用户手机号: 13800138000, 邮箱: alice@example.com';
    const keyId = 'user-pii-key-v1';
    const ciphertext = await kms.encrypt(plaintext, keyId);
    assert.strictEqual(typeof ciphertext, 'string');
    assert.notStrictEqual(ciphertext, plaintext, '密文不应等于明文');
    const decrypted = await kms.decrypt(ciphertext, keyId);
    assert.strictEqual(decrypted, plaintext);
  });

  it('不同 keyId 加密同一明文应产生不同密文', async () => {
    const plaintext = 'same plaintext';
    const c1 = await kms.encrypt(plaintext, 'key-a');
    const c2 = await kms.encrypt(plaintext, 'key-b');
    assert.notStrictEqual(c1, c2, '不同 keyId 应产生不同密文');
    // 各自解密应该都能还原
    assert.strictEqual(await kms.decrypt(c1, 'key-a'), plaintext);
    assert.strictEqual(await kms.decrypt(c2, 'key-b'), plaintext);
  });

  it('错误 keyId 解密应抛错', async () => {
    const ciphertext = await kms.encrypt('secret', 'key-a');
    await assert.rejects(
      () => kms.decrypt(ciphertext, 'key-b'),
      /keyId 不匹配/,
      '错误 keyId 解密必须抛错'
    );
  });

  it('篡改密文应抛错 (GCM AuthTag 验证)', async () => {
    const ciphertext = await kms.encrypt('secret', 'key-a');
    // 翻转密文的最后一位 (Base64 解码后)
    const buf = Buffer.from(ciphertext, 'base64');
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    await assert.rejects(
      () => kms.decrypt(tampered, 'key-a'),
      /解密失败/,
      '篡改密文必须被检测到'
    );
  });

  it('rotateKey 应返回新 keyId', async () => {
    const newKeyId = await kms.rotateKey('user-pii-key-v1');
    assert.strictEqual(typeof newKeyId, 'string');
    assert.notStrictEqual(newKeyId, 'user-pii-key-v1');
    assert.ok(/v\d+/.test(newKeyId), '新 keyId 应包含版本号');
  });

  it('空 keyId 应抛错', async () => {
    await assert.rejects(() => kms.encrypt('p', ''), /keyId/);
    await assert.rejects(() => kms.decrypt('xxx', ''), /keyId/);
  });

  it('非字符串 plaintext 应抛错', async () => {
    await assert.rejects(() => kms.encrypt(123, 'key-a'), /plaintext/);
  });
});

describe('KMS - Factory', () => {
  beforeEach(() => {
    _resetForTesting();
    // 清除可能影响测试的 env
    delete process.env.KMS_TYPE;
  });

  it('默认 (KMS_TYPE 未设置) 应返回 LocalKMSService 实例', () => {
    const client = getKMSClient();
    assert.ok(client instanceof LocalKMSService, '默认实现应为 LocalKMSService');
  });

  it('KMS_TYPE=local 应返回 LocalKMSService', () => {
    process.env.KMS_TYPE = 'local';
    const client = getKMSClient();
    assert.ok(client instanceof LocalKMSService);
  });

  it('KMS_TYPE=vault 应返回 VaultKMSService', () => {
    process.env.KMS_TYPE = 'vault';
    const client = getKMSClient();
    assert.ok(client instanceof VaultKMSService);
  });

  it('KMS_TYPE=mock 应返回 mock 实现 (encrypt/decrypt 不依赖主密钥)', async () => {
    process.env.KMS_TYPE = 'mock';
    const client = getKMSClient();
    const ct = await client.encrypt('hello', 'test-key');
    const pt = await client.decrypt(ct, 'test-key');
    assert.strictEqual(pt, 'hello');
  });

  it('KMS_TYPE=invalid 应抛错 (Fail-Fast)', () => {
    process.env.KMS_TYPE = 'unknown-provider';
    assert.throws(() => getKMSClient(), /不支持的 KMS_TYPE/);
  });

  it('Vault 实现的 encrypt 应立即抛错 (Stub 行为)', async () => {
    process.env.KMS_TYPE = 'vault';
    const client = getKMSClient();
    await assert.rejects(
      () => client.encrypt('p', 'k'),
      /Vault not yet implemented/,
      'Vault stub 必须在调用时立即失败, 避免生产事故'
    );
  });

  it('getKMSClient 应返回单例 (避免重复初始化)', () => {
    const c1 = getKMSClient();
    const c2 = getKMSClient();
    assert.strictEqual(c1, c2, '默认应返回同一实例');
  });

  it('forceNew=true 应创建新实例 (测试隔离)', () => {
    const c1 = getKMSClient();
    const c2 = getKMSClient({ forceNew: true });
    assert.notStrictEqual(c1, c2);
  });
});

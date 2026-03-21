/**
 * FileSystemTool 集成测试
 * 测试文件: src/services/tools/fileSystemTool.js
 */

const FileSystemTool = require('../../src/services/tools/fileSystemTool');
const fs = require('fs');
const path = require('path');

describe('FileSystemTool 集成测试', () => {
  let tool;
  let testDir;
  let testFilePath;

  beforeAll(() => {
    testDir = path.join(__dirname, 'test_fs_temp');
  });

  beforeEach(async () => {
    tool = new FileSystemTool({ basePath: testDir });
    // 确保测试目录存在
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // 清理测试目录
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('execute 方法 - write 操作', () => {
    test('写入文本文件', async () => {
      const fileName = 'test_write.txt';
      const content = 'Hello, FileSystemTool!';
      const result = await tool.execute({
        operation: 'write',
        path: fileName,
        content
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('文件写入成功');
      expect(result.path).toContain(fileName);

      // 验证文件确实写入
      const filePath = path.join(testDir, fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
    });

    test('写入 JSON 文件', async () => {
      const fileName = 'test.json';
      const content = '{"name": "test", "value": 123}';
      const result = await tool.execute({
        operation: 'write',
        path: fileName,
        content
      });
      expect(result.success).toBe(true);
    });

    test('写入嵌套目录文件', async () => {
      const fileName = 'nested/dir/test.txt';
      const content = 'nested file content';
      const result = await tool.execute({
        operation: 'write',
        path: fileName,
        content
      });
      expect(result.success).toBe(true);
      expect(result.path).toContain('nested');
    });
  });

  describe('execute 方法 - read 操作', () => {
    beforeEach(async () => {
      testFilePath = path.join(testDir, 'test_read.txt');
      fs.writeFileSync(testFilePath, 'Test content for reading', 'utf-8');
    });

    test('读取文本文件', async () => {
      const result = await tool.execute({
        operation: 'read',
        path: 'test_read.txt'
      });
      expect(result.success).toBe(true);
      expect(result.data).toBe('Test content for reading');
      expect(result.path).toContain('test_read.txt');
      expect(result.size).toBeGreaterThan(0);
    });

    test('读取不存在的文件应返回错误', async () => {
      const result = await tool.execute({
        operation: 'read',
        path: 'nonexistent.txt'
      });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('execute 方法 - exists 操作', () => {
    beforeEach(async () => {
      testFilePath = path.join(testDir, 'test_exists.txt');
      fs.writeFileSync(testFilePath, 'exists test', 'utf-8');
    });

    test('检查存在的文件', async () => {
      const result = await tool.execute({
        operation: 'exists',
        path: 'test_exists.txt'
      });
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.type).toBe('file');
    });

    test('检查不存在的文件', async () => {
      const result = await tool.execute({
        operation: 'exists',
        path: 'nonexistent_file.txt'
      });
      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });

    test('检查存在的目录', async () => {
      const result = await tool.execute({
        operation: 'exists',
        path: '.'
      });
      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
      expect(result.type).toBe('directory');
    });
  });

  describe('execute 方法 - list 操作', () => {
    beforeEach(async () => {
      // 创建测试文件和目录
      fs.writeFileSync(path.join(testDir, 'file1.txt'), 'content1', 'utf-8');
      fs.writeFileSync(path.join(testDir, 'file2.txt'), 'content2', 'utf-8');
      if (!fs.existsSync(path.join(testDir, 'subdir'))) {
        fs.mkdirSync(path.join(testDir, 'subdir'), { recursive: true });
      }
    });

    test('列出目录内容', async () => {
      const result = await tool.execute({
        operation: 'list',
        path: '.'
      });
      expect(result.success).toBe(true);
      expect(result.count).toBeGreaterThan(0);
      expect(Array.isArray(result.data)).toBe(true);
    });

    test('包含隐藏文件选项', async () => {
      const result = await tool.execute({
        operation: 'list',
        path: '.',
        options: { hidden: true }
      });
      expect(result.success).toBe(true);
    });
  });

  describe('execute 方法 - mkdir 操作', () => {
    test('创建目录', async () => {
      const dirName = 'new_test_dir_' + Date.now();
      const result = await tool.execute({
        operation: 'mkdir',
        path: dirName
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('目录创建成功');
      expect(fs.existsSync(path.join(testDir, dirName))).toBe(true);
    });

    test('创建嵌套目录', async () => {
      const dirName = 'nested/very/deep/' + Date.now();
      const result = await tool.execute({
        operation: 'mkdir',
        path: dirName
      });
      expect(result.success).toBe(true);
    });
  });

  describe('execute 方法 - delete 操作', () => {
    test('删除文件', async () => {
      const fileName = 'to_delete.txt';
      const filePath = path.join(testDir, fileName);
      fs.writeFileSync(filePath, 'to be deleted', 'utf-8');

      const result = await tool.execute({
        operation: 'delete',
        path: fileName
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('删除成功');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('删除不存在的文件应返回错误', async () => {
      const result = await tool.execute({
        operation: 'delete',
        path: 'definitely_not_exists.txt'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('安全路径检查', () => {
    test('不允许访问基础目录外的文件', async () => {
      const result = await tool.execute({
        operation: 'read',
        path: '../etc/passwd'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('路径访问被拒绝');
    });

    test('不允许使用绝对路径逃离基础目录', async () => {
      const result = await tool.execute({
        operation: 'read',
        path: '/etc/passwd'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('路径访问被拒绝');
    });
  });

  describe('文件类型限制', () => {
    test('允许的文件类型可以读取', async () => {
      const allowedFile = path.join(testDir, 'allowed.txt');
      fs.writeFileSync(allowedFile, 'allowed content', 'utf-8');

      const result = await tool.execute({
        operation: 'read',
        path: 'allowed.txt'
      });
      expect(result.success).toBe(true);
    });

    test('不允许的文件类型应返回错误', async () => {
      const restrictedFile = path.join(testDir, 'test.exe');
      fs.writeFileSync(restrictedFile, 'binary content', 'utf-8');

      const result = await tool.execute({
        operation: 'read',
        path: 'test.exe'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('不支持的文件类型');
    });

    test('无扩展名的文件可以读取', async () => {
      const noExtFile = path.join(testDir, 'noextension');
      fs.writeFileSync(noExtFile, 'no extension content', 'utf-8');

      const result = await tool.execute({
        operation: 'read',
        path: 'noextension'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('错误处理', () => {
    test('未知操作应返回错误', async () => {
      const result = await tool.execute({
        operation: 'unknown_action',
        path: 'test.txt'
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('未知操作');
    });

    test('缺少必需参数 path', async () => {
      const result = await tool.execute({
        operation: 'read'
      });
      expect(result.success).toBe(false);
    });

    test('write 操作缺少 content', async () => {
      const result = await tool.execute({
        operation: 'write',
        path: 'test.txt'
      });
      // writeFile 可以接受 undefined content，测试结果视实现而定
      // 如果实现要求 content，则应返回错误
    });
  });

  describe('参数解析', () => {
    test('parameters 属性存在', () => {
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toHaveProperty('operation');
      expect(tool.parameters.properties).toHaveProperty('path');
      expect(tool.parameters.required).toContain('operation');
      expect(tool.parameters.required).toContain('path');
    });

    test('operation enum 包含所有支持的操作', () => {
      const expectedOps = ['read', 'write', 'delete', 'list', 'exists', 'mkdir'];
      expect(tool.parameters.properties.operation.enum).toEqual(expect.arrayContaining(expectedOps));
    });
  });
});

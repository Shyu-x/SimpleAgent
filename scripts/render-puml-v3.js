#!/usr/bin/env node
/**
 * PlantUML 渲染脚本 - 使用正确的 PlantUML 编码
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PlantUML 编码：使用自定义字符映射表
const PUML_CODES = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_-';
const STANDARD_CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodePuml(data) {
  // 1. UTF-8 编码
  const utf8 = Buffer.from(data, 'utf8');
  // 2. 原始 DEFLATE 压缩 (不带 zlib 包装头)
  const compressed = zlib.deflateRawSync(utf8, { level: 9 });
  // 3. 标准 base64 编码
  let encoded = Buffer.from(compressed).toString('base64');
  // 4. 转换为 PlantUML 特有的字符映射
  // 标准 base64: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/
  // PlantUML:   0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_-
  let result = '';
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    if (char === '=') continue; // 移除 padding
    const idx = STANDARD_CODES.indexOf(char);
    if (idx >= 0) {
      result += PUML_CODES[idx];
    } else {
      result += char;
    }
  }
  return result;
}

function extractDiagrams(content) {
  const diagrams = [];
  const regex = /@startuml([\s\S]*?)@enduml/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    diagrams.push(`@startuml${match[1]}@enduml`);
  }
  return diagrams;
}

async function downloadSvg(url, encoded, pumlLength) {
  // 如果 URL 太长（> 2000字符），使用 form POST 方式
  if (url.length > 2000) {
    // 使用 PlantUML 的 form-based API
    const formData = new URLSearchParams();
    formData.append('text', encoded);

    const response = await fetch('https://www.plantuml.com/plantuml/svg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get('content-type');
    const text = await response.text();
    return { content: text, contentType };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type');
  const text = await response.text();
  return { content: text, contentType };
}

async function processDiagrams(pumlPath, outputDir) {
  const basename = path.basename(pumlPath, '.puml');
  const content = fs.readFileSync(pumlPath, 'utf-8');
  const diagrams = extractDiagrams(content);

  console.log(`  找到 ${diagrams.length} 个图表`);

  const results = [];
  for (let i = 0; i < diagrams.length; i++) {
    const diagram = diagrams[i];
    let svgName;
    if (diagrams.length === 1) {
      svgName = `${basename}.svg`;
    } else {
      svgName = `${basename}_${i + 1}.svg`;
    }
    const svgPath = path.join(outputDir, svgName);

    try {
      console.log(`    渲染图表 ${i + 1}/${diagrams.length} -> ${svgName}`);
      const encoded = encodePuml(diagram);
      const url = `https://www.plantuml.com/plantuml/svg/${encoded}`;
      const { content, contentType } = await downloadSvg(url, diagram);

      // 检查返回的是否是有效的 SVG
      if (contentType && contentType.includes('image/svg+xml') || content.startsWith('<?xml') || content.startsWith('<svg')) {
        fs.writeFileSync(svgPath, content, 'utf-8');
        console.log(`    ✓ 已保存 ${svgName} (${content.length} bytes)`);
        results.push({ name: svgName, success: true });
      } else {
        console.log(`    ⚠ 返回的不是 SVG，内容类型: ${contentType}`);
        console.log(`    内容前200字符: ${content.substring(0, 200)}`);
        results.push({ name: svgName, success: false, error: 'Not SVG' });
      }
    } catch (error) {
      console.error(`    ✗ 失败: ${error.message}`);
      results.push({ name: svgName, success: false, error: error.message });
    }

    // 避免限流
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}

async function processFile(pumlPath, outputDir) {
  console.log(`\n▶️ 处理文件: ${pumlPath}`);
  try {
    return await processDiagrams(pumlPath, outputDir);
  } catch (error) {
    console.error(`✗ 处理失败: ${error.message}`);
    return [{ name: path.basename(pumlPath), success: false, error: error.message }];
  }
}

async function main() {
  const args = process.argv.slice(2);
  let inputPath = args[0] || 'docs/framework';
  const outputDir = args[1] || inputPath;

  console.log(`='========================================================='`);
  console.log(`PlantUML SVG 渲染 (正确编码方式)`);
  console.log(`输入: ${inputPath}`);
  console.log(`输出目录: ${outputDir}`);
  console.log(`='========================================================='\n`);

  if (!fs.existsSync(inputPath)) {
    console.error(`错误: 输入 ${inputPath} 不存在`);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let files = [];
  if (fs.statSync(inputPath).isDirectory()) {
    files = fs.readdirSync(inputPath)
      .filter(f => f.endsWith('.puml'))
      .map(f => path.join(inputPath, f));
  } else {
    files = [inputPath];
  }

  console.log(`找到 ${files.length} 个 .puml 文件\n`);

  const allResults = [];
  for (const file of files) {
    const results = await processFile(file, outputDir);
    allResults.push(...results);
  }

  console.log(`\n='========================================================='`);
  console.log(`全部完成!`);
  const successCount = allResults.filter(r => r.success).length;
  const totalCount = allResults.length;
  console.log(`成功: ${successCount}/${totalCount}`);

  const failed = allResults.filter(r => !r.success);
  if (failed.length > 0) {
    console.log(`失败:`);
    failed.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  }
  console.log(`='========================================================='`);
}

main().catch(console.error);
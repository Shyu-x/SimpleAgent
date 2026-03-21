#!/usr/bin/env node
/**
 * PlantUML 渲染脚本 - 使用 base64url 编码通过 URL 参数渲染
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PlantUML 特有的 base64url 编码
function encodePuml(data) {
  // 使用 deflate 压缩
  const compressed = zlib.deflateSync(data, { level: 9 });
  // 转换为 PlantUML 特有的 base64 变种
  let result = '';
  for (let i = 0; i < compressed.length; i++) {
    result += String.fromCharCode(compressed[i]);
  }
  // 使用标准的 base64 编码
  result = Buffer.from(result, 'binary').toString('base64');
  // 转换为 PlantUML 的 URL 安全 base64
  result = result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

async function downloadSvg(url) {
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
      // 使用 ~1 前缀表示 HUFFMAN 编码
      const url = `https://www.plantuml.com/plantuml/svg/~1${encoded}`;
      const { content, contentType } = await downloadSvg(url);

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
  console.log(`PlantUML SVG 渲染 (URL 编码方式)`);
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
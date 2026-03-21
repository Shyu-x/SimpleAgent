#!/usr/bin/env node
/**
 * PlantUML 渲染脚本 - 使用 Kroki.io API
 * Kroki 使用标准 base64 编码，比 PlantUML 服务器更可靠
 */

const fs = require('fs');
const path = require('path');

async function renderWithKroki(content) {
  // Kroki 使用标准 base64url 编码
  const encoded = Buffer.from(content, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const url = `https://kroki.io/plantuml/svg/${encoded}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'image/svg+xml',
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return await response.text();
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
      const svg = await renderWithKroki(diagram);

      // 验证是有效的 SVG
      if (svg.startsWith('<?xml') || svg.startsWith('<svg')) {
        fs.writeFileSync(svgPath, svg, 'utf-8');
        console.log(`    ✓ 已保存 ${svgName} (${svg.length} bytes)`);
        results.push({ name: svgName, success: true });
      } else {
        console.log(`    ⚠ 返回的不是 SVG`);
        results.push({ name: svgName, success: false, error: 'Not SVG' });
      }
    } catch (error) {
      console.error(`    ✗ 失败: ${error.message}`);
      results.push({ name: svgName, success: false, error: error.message });
    }

    // 避免限流
    await new Promise(resolve => setTimeout(resolve, 1000));
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
  console.log(`PlantUML SVG 渲染 (Kroki.io)`);
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

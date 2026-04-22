/**
 * extract-formula.mjs — KpiCard 인라인 formula/benchmark/description/reason 추출기.
 *
 * Phase 4 Day 9 산출물. PM/분석가가 CSV를 검토한 뒤 glossary로 수동 이관 시 참고.
 *
 * 사용법:
 *   node scripts/extract-formula.mjs
 *
 * 출력:
 *   docs/formula-inventory.csv
 *
 * 처리 방식:
 *   - 정규식 기반 간이 스캐너 (AST 대신)
 *   - KpiCard JSX 블록을 매칭하고 title/formula/benchmark/description/reason 속성 추출
 *   - 제안 metricId는 title의 snake_case 변형
 *
 * 주의:
 *   - 변수 참조·삼항·템플릿 리터럴은 원문 그대로 기록 (후처리에서 수동 정리)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd(), "src", "app", "dashboard");
const OUTPUT = join(process.cwd(), "docs", "formula-inventory.csv");

function listTsxFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...listTsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

function extractKpiCards(source, filePath) {
  const results = [];
  const regex = /<KpiCard\b([\s\S]*?)\/>/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const block = match[1];
    const lineNo = source.slice(0, match.index).split("\n").length;

    const getProp = (name) => {
      const str = new RegExp(name + '=\"([^\"]*)\"').exec(block);
      if (str) return str[1];
      const expr = new RegExp(name + "=\\{([^}]+)\\}").exec(block);
      if (expr) return "{" + expr[1].trim() + "}";
      return "";
    };

    const title = getProp("title");
    if (!title) continue;

    const suggestedMetricId = title
      .replace(/\{[^}]*\}/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s_]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);

    results.push({
      file: filePath.replace(process.cwd(), "").replace(/\\/g, "/"),
      line: lineNo,
      title,
      formula: getProp("formula"),
      benchmark: getProp("benchmark"),
      description: getProp("description"),
      reason: getProp("reason"),
      suggestedMetricId,
    });
  }
  return results;
}

function csvCell(s) {
  if (s === null || s === undefined) return "";
  const str = String(s);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const files = listTsxFiles(ROOT);
const allCards = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  allCards.push(...extractKpiCards(src, f));
}

const header = "file,line,title,suggestedMetricId,formula,benchmark,description,reason\n";
const rows = allCards.map((c) =>
  [c.file, c.line, c.title, c.suggestedMetricId, c.formula, c.benchmark, c.description, c.reason]
    .map(csvCell)
    .join(",")
);

writeFileSync(OUTPUT, header + rows.join("\n") + "\n", "utf8");

const byFile = new Map();
for (const c of allCards) byFile.set(c.file, (byFile.get(c.file) ?? 0) + 1);

console.log("Extracted " + allCards.length + " KpiCard entries from " + files.length + " files.");
console.log("Output: " + OUTPUT);
console.log("\nTop 10 files by KpiCard count:");
Array.from(byFile.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([f, count]) => console.log("  " + String(count).padStart(3) + " x " + f));

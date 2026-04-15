// 3-Way 원가 대시보드 실제 데이터 검증 스크립트
// 실제 업로드될 3개 엑셀 파일을 파싱하여 예상 결과 출력
import XLSX from "xlsx";

// ── 파일 로드 ─────────────────────────────────────
const files = {
  standardYangsan: "업로드자료/양산공장 표준원가 3월31일 기준.xlsx",
  standardCheongsan: "업로드자료/청산공장 표준원가 3월31일 기준.xlsx",
  manufacturing: "업로드자료/픔목별 제조원가(1~3).xlsx",
  customerItem: "업로드자료/100거래처별,품목별 손익.xlsx",
  itemProfit: "업로드자료/200.품목별 수익성 분석(회계).xlsx",
};

const safeDivide = (a, b, fallback = 0) => (b === 0 || !isFinite(b) ? fallback : a / b);
const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const str = (v) => (v == null ? "" : String(v).trim());

function normalizeFactoryName(raw) {
  if (!raw) return "unknown";
  if (/양산/.test(raw)) return "양산";
  if (/청산|옥천/.test(raw)) return "청산";
  if (/울산/.test(raw)) return "울산";
  if (/용산/.test(raw)) return "용산";
  return raw.replace(/공장/g, "").replace(/\(.*\)/g, "").trim() || "unknown";
}

// ── 1. 표준원가 book 파싱 ───────────────────────────
function parseStandardCost(file, factory) {
  const wb = XLSX.readFile(file);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || !r[1]) continue;
    rows.push({
      factory,
      품목코드: str(r[1]),
      품목명: str(r[2]),
      품목계정그룹: str(r[3]),
      표준원가: num(r[6]),
    });
  }
  return rows;
}

const stdBook = [
  ...parseStandardCost(files.standardYangsan, "양산"),
  ...parseStandardCost(files.standardCheongsan, "청산"),
];

console.log("=== 📦 표준원가 Book 파싱 ===");
console.log(`총 ${stdBook.length}건`);
const byFactoryGroup = new Map();
for (const r of stdBook) {
  const key = `${r.factory}/${r.품목계정그룹}`;
  byFactoryGroup.set(key, (byFactoryGroup.get(key) || 0) + 1);
}
console.log("공장×품목그룹 분포:", Object.fromEntries(byFactoryGroup));
const stdProductOnly = stdBook.filter((r) => r.품목계정그룹 === "제품");
console.log(`제품만: ${stdProductOnly.length}건\n`);

// ── 2. 제조원가 BOM 집계 ─────────────────────────
const wbMfg = XLSX.readFile(files.manufacturing);
const dMfg = XLSX.utils.sheet_to_json(wbMfg.Sheets[wbMfg.SheetNames[0]], { header: 1, defval: null });

const mfgMap = new Map();
let bomRows = 0;
for (let i = 2; i < dMfg.length; i++) {
  const row = dMfg[i];
  if (!row || !row[3] || !row[5]) continue;
  bomRows++;
  const factory = normalizeFactoryName(str(row[3]));
  const key = `${factory}||${str(row[5])}`;
  const qty = num(row[11]);
  if (!mfgMap.has(key)) {
    mfgMap.set(key, {
      factory,
      생산품코드: str(row[5]),
      생산품명: str(row[6]),
      대분류: str(row[7]),
      생산입고수량: qty,
      원재료비: num(row[17]),
      부재료비: num(row[18]),
      노무비V: num(row[20]),
      외주가공비: num(row[26]),
      고정노무비: num(row[31]),
      감가상각비: num(row[32]),
      기타경비: num(row[33]),
      otherVC: num(row[19]) + num(row[21]) + num(row[22]) + num(row[23]) + num(row[24]) + num(row[25]) + num(row[27]) + num(row[28]) + num(row[29]) + num(row[30]),
      bomLineCount: 1,
    });
  } else {
    const e = mfgMap.get(key);
    e.원재료비 += num(row[17]);
    e.부재료비 += num(row[18]);
    e.노무비V += num(row[20]);
    e.외주가공비 += num(row[26]);
    e.고정노무비 += num(row[31]);
    e.감가상각비 += num(row[32]);
    e.기타경비 += num(row[33]);
    e.otherVC += num(row[19]) + num(row[21]) + num(row[22]) + num(row[23]) + num(row[24]) + num(row[25]) + num(row[27]) + num(row[28]) + num(row[29]) + num(row[30]);
    e.bomLineCount += 1;
  }
}
for (const r of mfgMap.values()) {
  r.totalVariableCost = r.원재료비 + r.부재료비 + r.노무비V + r.외주가공비 + r.otherVC;
  r.totalFixedCost = r.고정노무비 + r.감가상각비 + r.기타경비;
  r.actualUnitCost = r.생산입고수량 > 0 ? (r.totalVariableCost + r.totalFixedCost) / r.생산입고수량 : 0;
}

console.log("=== 🏭 제조원가 BOM 집계 ===");
console.log(`원본 ${bomRows}행 → 집계 ${mfgMap.size}개 생산품`);
const facDist = new Map();
for (const r of mfgMap.values()) facDist.set(r.factory, (facDist.get(r.factory) || 0) + 1);
console.log("공장별 생산품 수:", Object.fromEntries(facDist));
const avgBomLines = Array.from(mfgMap.values()).reduce((s, r) => s + r.bomLineCount, 0) / mfgMap.size;
console.log(`평균 BOM 라인 수: ${avgBomLines.toFixed(1)}개\n`);

// ── 3. 품목명↔코드 매핑 (표준원가/제조원가 기반) ─────
const nameToCode = new Map();
for (const r of stdBook) {
  if (r.품목계정그룹 === "제품" && r.품목명 && !nameToCode.has(r.품목명)) {
    nameToCode.set(r.품목명, r.품목코드);
  }
}
for (const r of mfgMap.values()) {
  if (r.생산품명 && !nameToCode.has(r.생산품명)) {
    nameToCode.set(r.생산품명, r.생산품코드);
  }
}
console.log("=== 🔗 품목명↔코드 매핑 (200 매개 맵) ===");
console.log(`매핑 가능 품목: ${nameToCode.size}건`);
console.log("샘플:", Array.from(nameToCode.entries()).slice(0, 3), "\n");

// 100 보고서 Q1 판매 집계
const wb100 = XLSX.readFile(files.customerItem);
const d100 = XLSX.utils.sheet_to_json(wb100.Sheets[wb100.SheetNames[0]], { header: 1, defval: null });
const salesByItem = new Map();
let q1Rows = 0;
for (let i = 2; i < d100.length; i++) {
  const row = d100[i];
  if (!row) continue;
  const month = str(row[13]); // 매출연월
  if (!month || month < "202601" || month > "202603") continue;
  const itemName = str(row[5]); // 품목
  if (!itemName) continue;
  q1Rows++;
  const qty = num(row[42]) || num(row[43]); // 매출수량 (계획/실적)
  const rev = num(row[45]) || num(row[46]); // 매출액
  if (qty === 0 && rev === 0) continue;
  const factory = normalizeFactoryName(str(row[28])); // 공장
  const code = nameToCode.get(itemName);
  const key = code ? `${code}||${factory}` : `__name__||${itemName}`;
  const agg = salesByItem.get(key) || { itemName, code: code || null, factory, qty: 0, rev: 0 };
  agg.qty += qty;
  agg.rev += rev;
  salesByItem.set(key, agg);
}

console.log("=== 💰 100 보고서 Q1 판매 집계 ===");
console.log(`Q1 판매 행수: ${q1Rows}행`);
console.log(`Unique 판매 품목: ${salesByItem.size}건`);
const mapped = Array.from(salesByItem.values()).filter((r) => r.code);
console.log(`품목 매핑 성공: ${mapped.length}건 (${(mapped.length / salesByItem.size * 100).toFixed(1)}%)\n`);

// ── 4. 3-Way 비교 ─────────────────────────────────
const stdLookup = new Map();
for (const s of stdBook) stdLookup.set(`${s.factory}||${s.품목코드}`, s.표준원가);
for (const s of stdBook) {
  const codeOnly = `*||${s.품목코드}`;
  if (!stdLookup.has(codeOnly)) stdLookup.set(codeOnly, s.표준원가);
}

let threeWay = 0, twoWay = 0, salesOnly = 0;
const rows = [];
for (const agg of salesByItem.values()) {
  if (!agg.code || agg.qty <= 0) { salesOnly++; continue; }
  const mfgKey = `${agg.factory}||${agg.code}`;
  const mfgFallback = `*||${agg.code}`;
  const mfg = mfgMap.get(mfgKey) || mfgMap.get(mfgFallback);
  const stdKey = `${agg.factory}||${agg.code}`;
  const stdFallback = `*||${agg.code}`;
  const stdCost = stdLookup.get(stdKey) || stdLookup.get(stdFallback) || null;
  const actualCost = mfg?.actualUnitCost || null;
  const avgSalesPrice = agg.rev / agg.qty;

  if (stdCost && actualCost) threeWay++;
  else if (actualCost) twoWay++;
  else salesOnly++;

  if (stdCost && actualCost) {
    rows.push({
      code: agg.code,
      name: agg.itemName,
      factory: agg.factory,
      qty: agg.qty,
      salesPrice: Math.round(avgSalesPrice),
      stdCost: Math.round(stdCost),
      actualCost: Math.round(actualCost),
      stdVsActualPct: ((actualCost - stdCost) / stdCost * 100),
      salesImpact: (actualCost - stdCost) * agg.qty,
    });
  }
}

console.log("=== 🎯 3-Way 비교 커버리지 ===");
console.log(`3-Way 매칭 (표준+실제): ${threeWay}건`);
console.log(`2-Way 매칭 (실제만): ${twoWay}건`);
console.log(`판매만 (상품/외주): ${salesOnly}건`);
console.log(`커버리지: ${(threeWay / salesByItem.size * 100).toFixed(1)}%\n`);

// Top 10 판매영향액
rows.sort((a, b) => Math.abs(b.salesImpact) - Math.abs(a.salesImpact));
console.log("=== 🏆 판매영향액 Top 10 (3-Way 매칭 품목) ===");
console.log("품목명 | 공장 | 판매단가 | 표준 | 실제 | 변동률 | 영향액");
for (const r of rows.slice(0, 10)) {
  const nameShort = r.name.length > 25 ? r.name.slice(0, 25) + "..." : r.name;
  const sign = r.stdVsActualPct >= 0 ? "+" : "";
  console.log(
    `${nameShort.padEnd(28)} | ${r.factory.padEnd(4)} | ${r.salesPrice.toLocaleString().padStart(10)} | ${r.stdCost.toLocaleString().padStart(8)} | ${r.actualCost.toLocaleString().padStart(8)} | ${(sign + r.stdVsActualPct.toFixed(1) + "%").padStart(8)} | ${r.salesImpact >= 0 ? "+" : ""}${Math.round(r.salesImpact).toLocaleString()}원`
  );
}
console.log();

// 공장별 집계
const byFac = new Map();
for (const r of rows) {
  const e = byFac.get(r.factory) || { count: 0, pcts: [], impact: 0 };
  e.count++;
  e.pcts.push(r.stdVsActualPct);
  e.impact += r.salesImpact;
  byFac.set(r.factory, e);
}
console.log("=== 🏭 공장별 평균 변동률 ===");
for (const [factory, v] of byFac.entries()) {
  const avg = v.pcts.reduce((s, x) => s + x, 0) / v.pcts.length;
  console.log(`${factory}: ${v.count}건, 평균 변동률 ${avg.toFixed(1)}%, 총 영향액 ${Math.round(v.impact).toLocaleString()}원`);
}

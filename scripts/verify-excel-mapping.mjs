/**
 * Excel 컬럼 인덱스 매핑 검증 스크립트
 * parser.ts에서 사용하는 컬럼 인덱스가 실제 엑셀 헤더와 일치하는지 검증
 *
 * Usage: node scripts/verify-excel-mapping.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, "..", "업로드자료");

// ── 검증 대상 정의 ──────────────────────────────────────
const VERIFICATIONS = [
  {
    name: "salesList (매출리스트)",
    file: "매출리스트.xlsx",
    headerRow: 0,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 1, expected: "공장" },
      { idx: 3, expected: "매출일" },
      { idx: 7, expected: "매출처" },
      { idx: 8, expected: "매출처명" },
      { idx: 13, expected: "결제조건" },
      { idx: 21, expected: "품목" },
      { idx: 22, expected: "품목명" },
      { idx: 25, expected: "대분류" },
      { idx: 30, expected: "수량" },
      { idx: 35, expected: "판매단가" },
      { idx: 36, expected: "판매금액" },
      { idx: 37, expected: "장부단가" },
      { idx: 38, expected: "장부금액" },
      { idx: 39, expected: "부가세" },
      { idx: 40, expected: "총금액" },
      { idx: 42, expected: "영업조직" },
      { idx: 44, expected: "제품군" },
      { idx: 46, expected: "사업부" },
      { idx: 48, expected: "영업담당자" },
      { idx: 49, expected: "영업담당자명" },
      { idx: 57, expected: "수주번호" },
      { idx: 64, expected: "출고일" },
      { idx: 76, expected: "수주유형" },
    ],
  },
  {
    name: "customerItemDetail (100 거래처별품목별손익)",
    file: "100거래처별,품목별 손익.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 3, expected: "영업조직" },
      { idx: 4, expected: "매출거래처" },
      { idx: 5, expected: "품목" },
      { idx: 9, expected: "거래처대분류" },
      { idx: 13, expected: "매출연월" },
      { idx: 15, expected: "영업담당사번" },
      { idx: 30, expected: "품목제품군" },
      { idx: 42, expected: "매출수량" },
      { idx: 45, expected: "매출액" },
      { idx: 48, expected: "실적매출원가" },
      { idx: 66, expected: "매출총이익" },
      { idx: 69, expected: "판매관리비" },
      { idx: 72, expected: "직접판매운반비" },
      { idx: 75, expected: "영업이익" },
    ],
  },
  {
    name: "itemCostDetail (501 품목별매출원가상세)",
    file: "501.품목별매출원가(상세).xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 1, expected: "판매사업본부" },
      { idx: 2, expected: "영업조직" },
      { idx: 3, expected: "품목" },
      { idx: 4, expected: "매출수량" },
      { idx: 7, expected: "매출액" },
      { idx: 10, expected: "실적매출원가" },
      { idx: 13, expected: "원재료비" },
      { idx: 55, expected: "제조변동비소계" },
      { idx: 70, expected: "매출총이익" },
      { idx: 73, expected: "공헌이익" },
      { idx: 76, expected: "공헌이익율" },
    ],
  },
  {
    name: "profitabilityAnalysis (901 수익성분석)",
    file: "901담당자,거래처,품목별 수익성 분석.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 1, expected: "영업조직" },
      { idx: 2, expected: "영업담당사번" },
      { idx: 3, expected: "매출거래처" },
      { idx: 4, expected: "품목" },
      { idx: 5, expected: "제품내수매출" },
      { idx: 8, expected: "제품수출매출" },
      { idx: 11, expected: "매출수량" },
      { idx: 14, expected: "환산수량" },
      { idx: 17, expected: "매출액" },
      { idx: 20, expected: "실적매출원가" },
      { idx: 23, expected: "매출총이익" },
      { idx: 26, expected: "판매관리비" },
      { idx: 29, expected: "직접판매운반비" },
      { idx: 32, expected: "영업이익" },
    ],
  },
  {
    name: "orgProfit (303 조직별손익)",
    file: "303 조직별손익II.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 1, expected: "판매사업본부" },
      { idx: 2, expected: "판매사업부" },
      { idx: 3, expected: "영업조직" },
      { idx: 4, expected: "매출액" },
      { idx: 7, expected: "실적매출원가" },
      { idx: 10, expected: "매출총이익" },
      { idx: 22, expected: "영업이익" },
      { idx: 25, expected: "공헌이익" },
    ],
  },
  {
    name: "orgCustomerProfit (303 조직별거래처별손익)",
    file: "303조직별거래처별 손익.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 3, expected: "영업조직" },
      { idx: 4, expected: "거래처대분류" },
      { idx: 7, expected: "판매거래처" },
      { idx: 8, expected: "매출액" },
      { idx: 11, expected: "실적매출원가" },
      { idx: 14, expected: "매출총이익" },
      { idx: 17, expected: "판매관리비" },
      { idx: 20, expected: "영업이익" },
    ],
  },
  {
    name: "hqCustomerItemProfit (304 본부거래처품목손익)",
    file: "304 본부 거래처 품목 손익.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 2, expected: "영업조직" },
      { idx: 4, expected: "매출거래처" },
      { idx: 5, expected: "품목계정그룹" },
      { idx: 7, expected: "품목" },
      { idx: 8, expected: "매출수량" },
      { idx: 14, expected: "매출액" },
      { idx: 17, expected: "실적매출원가" },
      { idx: 20, expected: "매출총이익" },
      { idx: 23, expected: "판매관리비" },
      { idx: 26, expected: "영업이익" },
    ],
  },
  {
    name: "teamContribution (401 팀원별공헌이익)",
    file: "401팀원별 공헌이익.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 1, expected: "영업그룹" },
      { idx: 2, expected: "영업조직" },
      { idx: 3, expected: "영업담당사번" },
      { idx: 4, expected: "매출액" },
      { idx: 7, expected: "실적매출원가" },
      { idx: 10, expected: "매출총이익" },
      { idx: 22, expected: "영업이익" },
      { idx: 109, expected: "공헌이익" },
      { idx: 112, expected: "공헌이익율" },
    ],
  },
  {
    name: "receivableAging (미수채권연령)",
    file: "건자재_미수채권연령.xlsx",
    headerRow: 0,
    subHeaderRow: 1,
    mergedHeader: true,
    checks: [
      { idx: 0, expected: "No" },
      { idx: 1, expected: "영업조직" },
      { idx: 2, expected: "담당자" },
      { idx: 3, expected: "판매처" },
      { idx: 4, expected: "판매처명" },
      { idx: 5, expected: "통화" },
      { idx: 6, expected: "1개월" },
      { idx: 27, expected: "합계" },
      { idx: 30, expected: "여신한도" },
    ],
  },
];

// ── 검증 실행 ──────────────────────────────────────
let totalChecks = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

for (const v of VERIFICATIONS) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 ${v.name}`);
  console.log(`   파일: ${v.file}`);

  let filePath;
  try {
    filePath = join(UPLOAD_DIR, v.file);
    if (!existsSync(filePath)) throw new Error("not found");
  } catch {
    console.log(`   ⚠️  파일 없음 - SKIP`);
    continue;
  }

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // 헤더 행 가져오기
  const headerRow = data[v.headerRow] || [];
  const subHeaderRow = v.subHeaderRow !== undefined ? data[v.subHeaderRow] || [] : null;

  // 전체 헤더 출력 (디버깅용)
  console.log(`   총 컬럼 수: ${headerRow.length}`);

  for (const check of v.checks) {
    totalChecks++;
    const actual0 = String(headerRow[check.idx] || "").trim();
    const actual1 = subHeaderRow ? String(subHeaderRow[check.idx] || "").trim() : "";

    // 병합 헤더: row0 또는 row1 중 하나에 매칭되면 OK
    const match =
      actual0.includes(check.expected) ||
      actual1.includes(check.expected) ||
      check.expected.includes(actual0) ||
      (actual1 && check.expected.includes(actual1));

    if (match) {
      passCount++;
      console.log(`   ✅ [${check.idx}] "${check.expected}" → "${actual0}"${actual1 ? ` / "${actual1}"` : ""}`);
    } else {
      failCount++;
      const msg = `   ❌ [${check.idx}] 기대: "${check.expected}" → 실제: "${actual0}"${actual1 ? ` / "${actual1}"` : ""}`;
      console.log(msg);
      failures.push({ file: v.name, idx: check.idx, expected: check.expected, actual0, actual1 });
    }
  }

  // 교차 검증용 데이터 샘플 (첫 5행)
  if (data.length > 2) {
    console.log(`   📊 데이터 행 수: ${data.length - (v.mergedHeader ? 2 : 1)}`);
  }
}

// ── 결과 요약 ──────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`📊 검증 결과 요약`);
console.log(`   총 검증: ${totalChecks}건`);
console.log(`   ✅ 통과: ${passCount}건`);
console.log(`   ❌ 실패: ${failCount}건`);
console.log(`   통과율: ${((passCount / totalChecks) * 100).toFixed(1)}%`);

if (failures.length > 0) {
  console.log(`\n⚠️  실패 목록:`);
  for (const f of failures) {
    console.log(`   ${f.file} [${f.idx}] 기대="${f.expected}" 실제="${f.actual0}"${f.actual1 ? ` / "${f.actual1}"` : ""}`);
  }
}

// ── 교차 검증: 주요 합계 비교 ──────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`📊 교차 검증: 매출 합계 비교`);

try {
  // salesList 장부금액 합계
  const salesWb = XLSX.readFile(join(UPLOAD_DIR, "매출리스트.xlsx"));
  const salesSheet = salesWb.Sheets[salesWb.SheetNames[0]];
  const salesData = XLSX.utils.sheet_to_json(salesSheet, { header: 1, defval: "" });
  let salesTotal = 0;
  for (let i = 1; i < salesData.length; i++) {
    salesTotal += Number(salesData[i][38]) || 0; // 장부금액
  }
  console.log(`   매출리스트 장부금액합: ${(salesTotal / 1e8).toFixed(2)}억`);

  // orgProfit 매출액.실적 합계
  const orgWb = XLSX.readFile(join(UPLOAD_DIR, "303 조직별손익II.xlsx"));
  const orgSheet = orgWb.Sheets[orgWb.SheetNames[0]];
  const orgData = XLSX.utils.sheet_to_json(orgSheet, { header: 1, defval: "" });
  let orgSalesTotal = 0;
  let orgGrossTotal = 0;
  for (let i = 2; i < orgData.length; i++) {
    const org = String(orgData[i][3] || "").trim();
    if (!org || org === "합계" || org.includes("합계") || org.includes("소계")) continue;
    const sales = Number(orgData[i][5]) || 0; // 매출액.실적 (idx 4=계획, 5=실적, 6=차이)
    const gross = Number(orgData[i][11]) || 0; // 매출총이익.실적
    orgSalesTotal += sales;
    orgGrossTotal += gross;
  }
  console.log(`   조직별손익 매출액.실적합: ${(orgSalesTotal / 1e8).toFixed(2)}억`);
  console.log(`   조직별손익 매출총이익.실적합: ${(orgGrossTotal / 1e8).toFixed(2)}억`);

  // profitabilityAnalysis 매출액.실적 합계
  const profWb = XLSX.readFile(join(UPLOAD_DIR, "901담당자,거래처,품목별 수익성 분석.xlsx"));
  const profSheet = profWb.Sheets[profWb.SheetNames[0]];
  const profData = XLSX.utils.sheet_to_json(profSheet, { header: 1, defval: "" });
  let profSalesTotal = 0;
  for (let i = 2; i < profData.length; i++) {
    profSalesTotal += Number(profData[i][18]) || 0; // 매출액.실적 (idx 17=계획, 18=실적, 19=차이)
  }
  console.log(`   수익성분석 매출액.실적합: ${(profSalesTotal / 1e8).toFixed(2)}억`);

  // teamContribution 매출총이익 합계
  const teamWb = XLSX.readFile(join(UPLOAD_DIR, "401팀원별 공헌이익.xlsx"));
  const teamSheet = teamWb.Sheets[teamWb.SheetNames[0]];
  const teamData = XLSX.utils.sheet_to_json(teamSheet, { header: 1, defval: "" });
  let teamGrossTotal = 0;
  for (let i = 2; i < teamData.length; i++) {
    const empNo = String(teamData[i][3] || "").trim();
    if (!empNo) continue; // 소계 행 제외
    teamGrossTotal += Number(teamData[i][11]) || 0; // 매출총이익.실적
  }
  console.log(`   팀원별공헌이익 매출총이익.실적합: ${(teamGrossTotal / 1e8).toFixed(2)}억`);

  // 비교
  const diff1 = Math.abs(orgSalesTotal - profSalesTotal);
  const diff2 = Math.abs(orgGrossTotal - teamGrossTotal);
  console.log(`\n   orgProfit매출 vs 수익성분석매출 차이: ${(diff1 / 1e8).toFixed(2)}억 (${orgSalesTotal !== 0 ? ((diff1 / orgSalesTotal) * 100).toFixed(1) : 'N/A'}%)`);
  console.log(`   orgProfit매출총이익 vs 팀원별매출총이익 차이: ${(diff2 / 1e8).toFixed(2)}억 (${orgGrossTotal !== 0 ? ((diff2 / orgGrossTotal) * 100).toFixed(1) : 'N/A'}%)`);

  if (diff1 / Math.max(orgSalesTotal, 1) < 0.05) {
    console.log(`   ✅ 매출 합계 교차 검증 통과 (<5% 차이)`);
  } else {
    console.log(`   ⚠️  매출 합계 교차 검증 주의 (>5% 차이) — 기간/조직 범위 차이 확인 필요`);
  }
} catch (e) {
  console.log(`   ⚠️  교차 검증 실패: ${e.message}`);
}

console.log(`\n✅ 검증 완료`);

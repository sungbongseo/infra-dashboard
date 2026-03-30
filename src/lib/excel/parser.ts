import * as XLSX from "xlsx";
import type {
  OrgProfitRecord,
  ProfitabilityAnalysisRecord,
  OrgCustomerProfitRecord,
  HqCustomerItemProfitRecord,
  CustomerItemDetailRecord,
  ItemCostDetailRecord,
  ItemProfitabilityRecord,
  ReceivableAgingRecord,
  InventoryMovementRecord,
  PlanActualDiff,
  AgingAmounts,
} from "@/types";
import { detectFileType, getAgingSourceName, getFactoryName, type FileSchema } from "./schemas";
import { calcRatioPAD } from "@/lib/utils";

export interface ParseResult {
  fileType: string;
  data: unknown[];
  rowCount: number;
  sourceName?: string;
  warnings: string[];
  filterInfo?: string;
  skippedRows: number;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// 신규: 금액/수량 등 0이 의미 있는 필드용 (0 vs 누락 구분)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parsePlanActualDiff(row: unknown[], startIdx: number): PlanActualDiff {
  return {
    계획: num(row[startIdx]),
    실적: num(row[startIdx + 1]),
    차이: num(row[startIdx + 2]),
  };
}

/**
 * 합계/소계 행 여부 판별 (개선된 정규식)
 * "합계", "총합계", "소계", "구간합계", "전체합계", "(합계)" 등 다양한 변형 감지
 */
const TOTAL_PATTERN = /^(합계|총합계|소계|구간합계|전체합계|총계)$|\(합계\)$|합계$/i;

// 품목원가(501) 필터 상수
const ITEM_COST_HQ_FILTER = "Infra사업본부";
const ITEM_COST_EXCLUDED_TEAM = "설계영업팀";

function isTotalRow(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return TOTAL_PATTERN.test(normalized);
}

/**
 * 소계행에서 카테고리명 추출: "시트 합계" → "시트", "도막재 합계" → "도막재"
 * 순수 "합계"/"소계" 등은 null 반환 (카테고리명 없음).
 * itemProfitability의 대분류/중분류/소분류 fill-down에서만 사용.
 */
function extractCategoryFromTotal(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(.+?)[\s]*(합계|소계|총합계|총계)$/);
  if (m && m[1].trim()) return m[1].trim();
  return null;
}

/** 구분자/헤더 행 판별 (fill-down 시 전파 차단) */
function isSeparatorRow(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  // 숫자만으로 구성된 행 (행번호 등), "---" 패턴
  if (/^[\d\s.,]+$/.test(v) || /^[-=_]{3,}$/.test(v)) return true;
  return false;
}

/**
 * 빈 조직명 비율 검증 - 10% 이상 비어있으면 경고
 */
function validateOrgField<T extends Record<string, any>>(
  records: T[],
  field: string,
  warnings: string[],
  fileType: string
): void {
  if (records.length === 0) return;

  const emptyCount = records.filter(r => !String(r[field] || "").trim()).length;
  const emptyRatio = emptyCount / records.length;

  if (emptyRatio > 0.1) {
    warnings.push(
      `[${fileType}] ⚠️ ${field} 필드가 ${(emptyRatio * 100).toFixed(1)}% 비어있음 (${emptyCount}/${records.length}행) - 병합 셀 처리 확인 필요`
    );
  }
}

function parseAgingAmounts(row: unknown[], startIdx: number): AgingAmounts {
  return {
    출고금액: num(row[startIdx]),
    장부금액: num(row[startIdx + 1]),
    거래금액: num(row[startIdx + 2]),
  };
}

/**
 * SAP 리포트 병합 셀 처리: 영업조직팀 필드를 하위 행에 전파(fill-down)
 * SAP 계층 리포트에서 영업조직팀은 소계 행에만 표시되고 하위 상세 행은 비어있으므로,
 * 소계 행의 영업조직팀 값을 이후 비어있는 상세 행에 채워넣는다.
 *
 * 개선: 양방향 fill-down으로 역순 병합도 처리
 * - 1차: 순방향 (위→아래) fill-down
 * - 2차: 역방향 (아래→위) fill-down (역순 병합 대응)
 * - "합계/소계" 변형 정규식으로 다양한 패턴 감지
 */
function fillDownHierarchicalOrg<T extends { 영업조직팀: string }>(
  records: T[],
  warnings?: string[],
  fileType?: string
): T[] {
  // 1차: 순방향 fill-down (기존 로직)
  let currentOrg = "";
  for (const rec of records) {
    const org = rec.영업조직팀.trim();
    if (org !== "" && !isTotalRow(org)) {
      currentOrg = org;
    } else if (org === "" && currentOrg !== "") {
      rec.영업조직팀 = currentOrg;
    }
  }

  // 2차: 역방향 fill-down (역순 병합 대응) — 소계 경계에서 중단
  currentOrg = "";
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const org = rec.영업조직팀.trim();
    if (org !== "" && !isTotalRow(org)) {
      currentOrg = org;
    } else if (isTotalRow(org)) {
      // 소계행을 만나면 역방향 전파 중단 (조직 경계)
      currentOrg = "";
    } else if (org === "" && currentOrg !== "") {
      rec.영업조직팀 = currentOrg;
    }
  }

  // 빈 조직명 검증 (fill-down 후에도 빈 값이 있으면 경고)
  if (warnings && fileType) {
    validateOrgField(records, "영업조직팀", warnings, fileType);
  }

  // "합계/소계" 행 제거 (전체 소계 → 조직별 상세와 중복)
  return records.filter((r) => !isTotalRow(r.영업조직팀.trim()));
}

/**
 * SAP 다중 레벨 계층 리포트 fill-down.
 * levels는 상위→하위 순으로 [주필드, ...연관필드] 배열.
 * 상위 레벨 값이 바뀌면 하위 레벨을 리셋하여 교차 오염 방지.
 *
 * 개선: 양방향 fill-down으로 역순 병합도 처리
 * - 1차: 순방향 (위→아래) fill-down
 * - 2차: 역방향 (아래→위) fill-down (역순 병합 대응)
 * - "합계/소계" 변형 정규식으로 다양한 패턴 감지
 */
function fillDownMultiLevel<T extends Record<string, any>>(
  records: T[],
  levels: string[][],
  warnings?: string[],
  fileType?: string
): T[] {
  const lastLevelPrimary = levels[levels.length - 1][0];

  // 1단계: 최하위 레벨이 원본에서 채워져 있는 행만 상세행으로 표시
  const isDetailRow = records.map((rec) => {
    const val = String(rec[lastLevelPrimary] || "").trim();
    return val !== "" && !isTotalRow(val);
  });

  // 2단계: 순방향 fill-down 수행
  const current: Record<string, string> = {};
  for (const rec of records) {
    for (let i = 0; i < levels.length; i++) {
      const fields = levels[i];
      const primary = fields[0];
      const val = String(rec[primary] || "").trim();

      if (isTotalRow(val) || isSeparatorRow(val)) {
        // 합계/구분자 행 → fill-down 중단 (경계)
        continue;
      }

      if (val !== "") {
        // 새 값 감지 → 현재값 갱신
        if (current[primary] !== val) {
          for (const f of fields) {
            current[f] = String(rec[f] || "").trim();
          }
          // 하위 레벨 리셋 (교차 오염 방지)
          for (let j = i + 1; j < levels.length; j++) {
            for (const f of levels[j]) {
              current[f] = "";
            }
          }
        }
      } else {
        // 빈 값 → fill-down
        for (const f of fields) {
          if (!String(rec[f] || "").trim() && current[f]) {
            (rec as Record<string, any>)[f] = current[f];
          }
        }
      }
    }
  }

  // 3단계: 역방향 fill-down (역순 병합 대응) — 소계 경계에서 중단
  // 최상위 레벨(영업조직팀 등)만 역방향 처리 (하위 레벨은 역방향 시 교차 오염 위험)
  const topLevelFields = levels[0];
  const topLevelPrimary = topLevelFields[0];
  let currentTop = "";
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const val = String(rec[topLevelPrimary] || "").trim();
    if (val !== "" && !isTotalRow(val)) {
      currentTop = val;
    } else if (isTotalRow(val)) {
      // 소계행을 만나면 역방향 전파 중단 (조직 경계)
      currentTop = "";
    } else if (val === "" && currentTop !== "") {
      (rec as Record<string, any>)[topLevelPrimary] = currentTop;
    }
  }

  // 4단계: 빈 조직명 검증 (fill-down 후에도 빈 값이 있으면 경고)
  if (warnings && fileType) {
    validateOrgField(records, topLevelPrimary, warnings, fileType);
  }

  // 5단계: 상세행만 유지 (소계/합계 행 및 중간 레벨 소계 제거)
  return records.filter((r, idx) => {
    if (!isDetailRow[idx]) return false;
    // 모든 레벨에서 합계/소계 체크
    for (const level of levels) {
      const v = String(r[level[0]] || "").trim();
      if (isTotalRow(v)) return false;
    }
    return true;
  });
}

/** Row-level safe parser: catches individual row errors and collects warnings
 * @param filterEmptyFirstCol true(기본값)=첫 번째 컬럼이 비어있는 행 제거 (플랫 데이터용)
 *   false=완전히 빈 행만 제거 (계층형 SAP 보고서 - fill-down 전에 상세 행이 삭제되는 것 방지)
 */
function safeParseRows<T>(
  data: unknown[][],
  skipRows: number,
  parser: (row: unknown[]) => T,
  warnings: string[],
  fileType: string,
  filterEmptyFirstCol: boolean = true,
): { parsed: T[]; skipped: number } {
  let skipped = 0;
  const parsed: T[] = [];
  const rows = filterEmptyFirstCol
    ? data.slice(skipRows).filter(r => r[0] !== null && r[0] !== undefined && String(r[0]).trim() !== "")
    : data.slice(skipRows).filter(r =>
        r.some(cell => cell !== "" && cell !== null && cell !== undefined)
      );
  const allErrors: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      parsed.push(parser(rows[i]));
    } catch (e: any) {
      if (e.message === "SKIP_ROW") continue; // 의도적 필터링 (합계/소계행 등)
      skipped++;
      allErrors.push(`${i + skipRows + 1}행: ${e.message || "알 수 없는 오류"}`);
    }
  }
  if (allErrors.length > 0) {
    const show = allErrors.slice(0, 20);
    for (const msg of show) {
      warnings.push(`[${fileType}] ${msg}`);
    }
    if (allErrors.length > 20) {
      warnings.push(`[${fileType}] ... 외 ${allErrors.length - 20}행 추가 실패`);
    }
  }
  return { parsed, skipped };
}

/**
 * 200 품목별 수익성 분석(회계) 파서.
 * 엑셀 구조: col 0-9 = 텍스트 필드, col 10+ = PAD 3열(계획/실적/차이) 반복.
 * 여기서는 실적(actual) 값만 읽는다 (PAD 그룹의 두 번째 열).
 *
 * PAD 그룹 시작 인덱스:
 *   매출수량(10) 매출액(13) 차이매출(16) 매출단가(19) 표준매출원가(22)
 *   실적매출원가(25) 차이매출원가(28) 매입할인(31) 매출원가율(34) 매출총이익(37)
 *   매출총이익율(40) 영업이익(43) 직접판매운반비(46) 판매관리비(49) 영업이익율(52)
 *   원재료비(55) 부재료비(58) 상품매입(61) 노무비(64) 복리후생비(67) 소모품비(70)
 *   수도광열비(73) 수선비(76) 연료비(79) 외주가공비(82) 운반비(85) 전력비(88)
 *   지급수수료(91) 견본비(94) 제조고정노무비(97) 감가상각비(100) 기타경비(103)
 */
function parseItemProfitabilityRow(row: unknown[]): ItemProfitabilityRecord {
  return {
    판매사업부: str(row[1]),
    영업조직팀: str(row[2]),
    대분류: str(row[3]),
    중분류: str(row[4]),
    소분류: str(row[5]),
    품목계정그룹: str(row[6]),
    품목: str(row[7]),
    기준단위: str(row[8]),
    계정구분: str(row[9]),
    매출수량: num(row[11]),        // PAD(10): 실적=col 11
    매출액: num(row[14]),          // PAD(13): 실적=col 14
    매출단가: num(row[20]),        // PAD(19): 실적=col 20
    매출수량_계획: num(row[10]),   // PAD(10): 계획=col 10
    매출액_계획: num(row[13]),     // PAD(13): 계획=col 13
    표준매출원가: num(row[23]),    // PAD(22): 실적=col 23
    실적매출원가: num(row[26]),    // PAD(25): 실적=col 26
    매출원가율: num(row[35]),      // PAD(34): 실적=col 35
    실적매출원가_계획: num(row[25]), // PAD(25): 계획=col 25
    매출총이익: num(row[38]),      // PAD(37): 실적=col 38
    매출총이익율: num(row[41]),    // PAD(40): 실적=col 41
    영업이익: num(row[44]),        // PAD(43): 실적=col 44
    직접판매운반비: num(row[47]),  // PAD(46): 실적=col 47
    판매관리비: num(row[50]),      // PAD(49): 실적=col 50
    영업이익율: num(row[53]),      // PAD(52): 실적=col 53
    매출총이익_계획: num(row[37]), // PAD(37): 계획=col 37
    영업이익_계획: num(row[43]),   // PAD(43): 계획=col 43
    원재료비: num(row[56]),        // PAD(55): 실적=col 56
    부재료비: num(row[59]),        // PAD(58): 실적=col 59
    상품매입: num(row[62]),        // PAD(61): 실적=col 62
    노무비: num(row[65]),          // PAD(64): 실적=col 65
    복리후생비: num(row[68]),      // PAD(67): 실적=col 68
    소모품비: num(row[71]),        // PAD(70): 실적=col 71
    수도광열비: num(row[74]),      // PAD(73): 실적=col 74
    수선비: num(row[77]),          // PAD(76): 실적=col 77
    연료비: num(row[80]),          // PAD(79): 실적=col 80
    외주가공비: num(row[83]),      // PAD(82): 실적=col 83
    운반비: num(row[86]),          // PAD(85): 실적=col 86
    전력비: num(row[89]),          // PAD(88): 실적=col 89
    지급수수료: num(row[92]),      // PAD(91): 실적=col 92
    견본비: num(row[95]),          // PAD(94): 실적=col 95
    제조고정노무비: num(row[98]),  // PAD(97): 실적=col 98
    감가상각비: num(row[101]),     // PAD(100): 실적=col 101
    기타경비: num(row[104]),       // PAD(103): 실적=col 104
  };
}

function parseReceivableAging(data: unknown[][], warnings: string[]): ReceivableAgingRecord[] {
  const { parsed } = safeParseRows<ReceivableAgingRecord>(
    data, 2,
    (row) => {
      const org = str(row[1]).trim();
      const mgr = str(row[2]).trim();
      const customer = str(row[4]).trim();
      if (isTotalRow(org) || isTotalRow(mgr)) throw new Error("SKIP_ROW");
      if (org.includes("소계") || mgr.includes("소계")) throw new Error("SKIP_ROW");
      if (!customer) throw new Error("SKIP_ROW");
      const record: ReceivableAgingRecord = {
        No: num(row[0]),
        영업조직: org,
        담당자: mgr,
        판매처: str(row[3]),
        판매처명: customer,
        통화: str(row[5]),
        month1: parseAgingAmounts(row, 6),
        month2: parseAgingAmounts(row, 9),
        month3: parseAgingAmounts(row, 12),
        month4: parseAgingAmounts(row, 15),
        month5: parseAgingAmounts(row, 18),
        month6: parseAgingAmounts(row, 21),
        overdue: parseAgingAmounts(row, 24),
        // 합계 구간은 sub-header 순서가 다름: 출고금액, 거래금액, 장부금액
        합계: {
          출고금액: num(row[27]),
          장부금액: num(row[29]),
          거래금액: num(row[28]),
        },
        여신한도: num(row[30]),
      };

      // 교차 검증: 개별 월별 장부금액 합산 vs 합계.장부금액
      const calculatedTotal =
        record.month1.장부금액 + record.month2.장부금액 + record.month3.장부금액 +
        record.month4.장부금액 + record.month5.장부금액 + record.month6.장부금액 +
        record.overdue.장부금액;
      if (Math.abs(calculatedTotal - record.합계.장부금액) > 1) {
        warnings.push(
          `[receivableAging] ${customer} 장부금액 합계 불일치: 계산=${calculatedTotal.toLocaleString()}, 보고=${record.합계.장부금액.toLocaleString()}`
        );
      }

      return record;
    },
    warnings, "미수채권연령", true
  );
  return parsed;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// ─── 월별 시트 감지 ────────────────────────────────────────────────

interface MonthlySheet {
  sheetName: string;
  month: string; // YYYYMM
}

/**
 * 워크북 시트 이름 중 YYYYMM 형식(6자리 숫자)을 감지.
 * 최소 2개 이상이어야 월별 데이터로 판정.
 */
function detectMonthlySheets(sheetNames: string[]): MonthlySheet[] {
  const monthly = sheetNames
    .filter(name => {
      const s = name.trim();
      if (!/^\d{6}$/.test(s)) return false;
      const month = parseInt(s.slice(4, 6), 10);
      return month >= 1 && month <= 12;
    })
    .map(name => ({ sheetName: name, month: name.trim() }));
  return monthly.length >= 2 ? monthly : [];
}

interface SheetParseResult {
  data: unknown[];
  skippedRows: number;
}

/**
 * 단일 시트의 rawData를 파일타입에 따라 파싱.
 * parseExcelFile()의 switch 로직을 추출하여 다중 시트에서도 재사용.
 */
function parseSheetData(
  rawData: unknown[][],
  schema: FileSchema,
  warnings: string[],
  fileName: string,
): SheetParseResult {
  let parsed: unknown[];
  let skippedRows = 0;

  switch (schema.fileType) {
    case "organization": {
      const rOrg = safeParseRows(rawData, 1, (row) => ({
        영업조직: str(row[0]),
        영업조직명: str(row[1]),
        최하위조직여부: str(row[2]),
        시작일: str(row[3]),
        종료일: str(row[4]),
        통합조직여부: str(row[5]),
      }), warnings, "담당조직");
      parsed = rOrg.parsed;
      skippedRows = rOrg.skipped;
      break;
    }
    case "salesList": {
      const r = safeParseRows(rawData, 1, (row) => ({
        No: num(row[0]), 공장: str(row[1]), 매출번호: str(row[2]), 매출일: str(row[3]),
        세무분류: str(row[4]), 세무구분: str(row[5]), 거래처소분류: str(row[6]),
        매출처: str(row[7]), 매출처명: str(row[8]), 수금처: str(row[9]), 수금처명: str(row[10]),
        납품처: str(row[11]), 납품처명: str(row[12]), 결제조건: str(row[13]),
        수금예정일: str(row[14]), 부가세사업장: str(row[15]),
        매출상태: str(row[16]), 매출유형: str(row[17]),
        품목: str(row[21]), 품목명: str(row[22]), 규격: str(row[23]),
        대분류: str(row[25]), 중분류: str(row[26]), 소분류: str(row[27]),
        단위: str(row[28]), 수량: num(row[30]), 거래통화: str(row[31]),
        환율: num(row[32]), 판매단가: num(row[35]), 판매금액: num(row[36]),
        장부단가: num(row[37]), 장부금액: num(row[38]), 부가세: num(row[39]),
        총금액: num(row[40]), 품목범주: str(row[41]), 영업조직: str(row[42]), 유통경로: str(row[43]),
        제품군: str(row[44]), 품목제품군: str(row[45]), 사업부: str(row[46]), 영업그룹: str(row[47]),
        계정구분: str(row[52]),
        영업담당자: str(row[48]), 영업담당자명: str(row[49]), 수주번호: str(row[57]),
        수주유형: str(row[77]), 출고일: str(row[64]),
      }), warnings, "매출리스트");
      parsed = r.parsed; skippedRows = r.skipped;
      break;
    }
    case "collectionList": {
      const rCL = safeParseRows(rawData, 1, (row) => ({
        No: num(row[0]),
        수금문서번호: str(row[1]),
        수금유형: str(row[2]),
        결재방법: str(row[3]),
        수금계정: str(row[4]),
        거래처명: str(row[5]),
        영업조직: str(row[6]),
        담당자: str(row[7]),
        수금일: str(row[8]),
        통화: str(row[9]),
        금융기관: str(row[11]),
        만기일: str(row[15]),
        수금액: num(row[16]),
        장부수금액: num(row[17]),
        선수금액: num(row[18]),
        장부선수금액: num(row[19]),
      }), warnings, "수금리스트");
      parsed = rCL.parsed;
      skippedRows = rCL.skipped;
      break;
    }
    case "orderList": {
      const rOL = safeParseRows(rawData, 1, (row) => ({
        No: num(row[0]),
        수주번호: str(row[1]),
        순번: num(row[2]),
        수주일: str(row[3]),
        납품요청일: str(row[4]),
        판매처: str(row[5]),
        판매처명: str(row[6]),
        판매처약칭: str(row[7]),
        영업그룹: str(row[8]),
        영업담당자: str(row[9]),
        영업담당자명: str(row[10]),
        판매지역: str(row[11]),
        수주유형: str(row[12]),
        수주유형명: str(row[13]),
        영업조직: str(row[14]),
        유통경로: str(row[15]),
        거래구분: str(row[16]),
        출하조건: str(row[17]),
        품목: str(row[19]),
        품목명: str(row[20]),
        규격: str(row[21]),
        판매수량: num(row[23]),
        판매단가: num(row[24]),
        단가통화: str(row[25]),
        판매금액: num(row[26]),
        환율: num(row[27]),
        장부단가: num(row[28]),
        장부금액: num(row[29]),
        부가세: num(row[30]),
        총금액: num(row[31]),
        납품처: str(row[32]),
        품목제품군: str(row[37]),
        품목범주: str(row[38]),
        품목상태: str(row[39]),
        저장위치: str(row[40]),
        대분류: str(row[43]),
        중분류: str(row[44]),
        소분류: str(row[45]),
      }), warnings, "수주리스트");
      parsed = rOL.parsed;
      skippedRows = rOL.skipped;
      break;
    }
    case "orgProfit": {
      const rOP = safeParseRows<OrgProfitRecord>(rawData, 2, (row) => {
        const org = str(row[3]).trim();
        if (!org || isTotalRow(org)) throw new Error("SKIP_ROW");
        return {
          No: num(row[0]),
          판매사업본부: str(row[1]),
          판매사업부: str(row[2]),
          영업조직팀: org,
          매출액: parsePlanActualDiff(row, 4),
          실적매출원가: parsePlanActualDiff(row, 7),
          매출총이익: parsePlanActualDiff(row, 10),
          판관변동_직접판매운반비: parsePlanActualDiff(row, 13),
          판관변동_운반비: parsePlanActualDiff(row, 16),
          판매관리비: parsePlanActualDiff(row, 19),
          영업이익: parsePlanActualDiff(row, 22),
          공헌이익: parsePlanActualDiff(row, 25),
          매출원가율: parsePlanActualDiff(row, 28),
          매출총이익율: parsePlanActualDiff(row, 31),
          판관비율: parsePlanActualDiff(row, 34),
          영업이익율: parsePlanActualDiff(row, 37),
          공헌이익율: parsePlanActualDiff(row, 40),
        };
      }, warnings, "조직별손익", false);
      let abnormalCount = 0;
      for (const p of rOP.parsed) {
        if (Math.abs(p.영업이익율.실적) >= 1000 || Math.abs(p.공헌이익율.실적) >= 1000) {
          abnormalCount++;
          if (abnormalCount <= 3) {
            warnings.push(`[조직별손익] ${p.영업조직팀}: 극단 이익율 감지 (영업이익율 ${p.영업이익율.실적.toFixed(1)}%, 공헌이익율 ${p.공헌이익율.실적.toFixed(1)}%) - 차트 스케일에 영향 가능`);
          }
        }
      }
      if (abnormalCount > 3) {
        warnings.push(`[조직별손익] 외 ${abnormalCount - 3}개 조직의 극단 이익율 데이터가 감지되었습니다. Excel 파일의 수식을 확인하세요.`);
      }
      const nonZero = rOP.parsed.filter(row => row.매출액.실적 !== 0 || row.매출액.계획 !== 0);
      parsed = fillDownHierarchicalOrg(nonZero, warnings, "조직별손익");
      skippedRows = rOP.skipped;
      break;
    }
    case "teamContribution": {
      {
        let curGroup = "";
        let curTeam = "";
        for (let i = 2; i < rawData.length; i++) {
          const row = rawData[i];
          const g = String(row[1] || "").trim();
          const t = String(row[2] || "").trim();
          if (g && !isTotalRow(g)) {
            if (g !== curGroup) { curGroup = g; curTeam = ""; }
          } else if (!g && curGroup) {
            row[1] = curGroup;
          }
          if (t && !isTotalRow(t)) {
            curTeam = t;
          } else if (!t && curTeam) {
            row[2] = curTeam;
          }
        }
      }
      const r = safeParseRows(rawData, 2, (row) => {
        const empNo = str(row[3]).trim();
        if (!empNo) {
          throw new Error("SKIP_ROW");
        }

        const record = {
          No: num(row[0]), 영업그룹: str(row[1]), 영업조직팀: str(row[2]),
          영업담당사번: empNo,
          매출액: parsePlanActualDiff(row, 4), 실적매출원가: parsePlanActualDiff(row, 7),
          매출총이익: parsePlanActualDiff(row, 10), 매출총이익율: parsePlanActualDiff(row, 13),
          판관변동_직접판매운반비: parsePlanActualDiff(row, 16),
          판매관리비: parsePlanActualDiff(row, 19), 영업이익: parsePlanActualDiff(row, 22),
          영업이익율: parsePlanActualDiff(row, 25),
          판관변동_노무비: parsePlanActualDiff(row, 28), 판관변동_복리후생비: parsePlanActualDiff(row, 31),
          판관변동_소모품비: parsePlanActualDiff(row, 34), 판관변동_수도광열비: parsePlanActualDiff(row, 37),
          판관변동_수선비: parsePlanActualDiff(row, 40), 판관변동_외주가공비: parsePlanActualDiff(row, 43),
          판관변동_운반비: parsePlanActualDiff(row, 46), 판관변동_지급수수료: parsePlanActualDiff(row, 49),
          판관변동_견본비: parsePlanActualDiff(row, 52),
          판관고정_노무비: parsePlanActualDiff(row, 55), 판관고정_감가상각비: parsePlanActualDiff(row, 58),
          판관고정_기타경비: parsePlanActualDiff(row, 61),
          제조변동_원재료비: parsePlanActualDiff(row, 64), 제조변동_부재료비: parsePlanActualDiff(row, 67),
          변동_상품매입: parsePlanActualDiff(row, 70), 제조변동_노무비: parsePlanActualDiff(row, 73),
          제조변동_복리후생비: parsePlanActualDiff(row, 76), 제조변동_소모품비: parsePlanActualDiff(row, 79),
          제조변동_수도광열비: parsePlanActualDiff(row, 82), 제조변동_수선비: parsePlanActualDiff(row, 85),
          제조변동_연료비: parsePlanActualDiff(row, 88), 제조변동_외주가공비: parsePlanActualDiff(row, 91),
          제조변동_운반비: parsePlanActualDiff(row, 94), 제조변동_전력비: parsePlanActualDiff(row, 97),
          제조변동_견본비: parsePlanActualDiff(row, 100), 제조변동_지급수수료: parsePlanActualDiff(row, 103),
          변동비합계: parsePlanActualDiff(row, 106), 공헌이익: parsePlanActualDiff(row, 109),
          공헌이익율: parsePlanActualDiff(row, 112),
        };

        if (Math.abs(record.공헌이익율.실적) >= 500 || Math.abs(record.영업이익율.실적) >= 500) {
          warnings.push(`팀원별공헌이익: 사번 ${record.영업담당사번} 이익율 이상치 감지 (공헌이익율=${record.공헌이익율.실적.toFixed(0)}%, 영업이익율=${record.영업이익율.실적.toFixed(0)}%) — 원본 보존, 차트 클램핑 적용`);
          // 원본 데이터 보존: SAP 원본 값은 변조하지 않음
          // 차트 렌더링 시 ±200% 클램핑은 UI 레이어(profiling.ts)에서 처리
        }

        return record;
      }, warnings, "팀원별공헌이익", false);
      const deduped = new Map<string, (typeof r.parsed)[0]>();
      for (const row of r.parsed) {
        const key = `${(row.영업조직팀 || "").trim()}_${(row.영업담당사번 || "").trim()}`;
        deduped.set(key, row);
      }
      const dupCount = r.parsed.length - deduped.size;
      if (dupCount > 0) {
        warnings.push(`팀원별공헌이익: ${dupCount}건 중복(조직+사번) 감지 → 상세 섹션 데이터로 대체`);
      }
      parsed = Array.from(deduped.values());
      skippedRows = r.skipped;
      break;
    }
    case "profitabilityAnalysis": {
      const r = safeParseRows<ProfitabilityAnalysisRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[1]),
        영업담당사번: str(row[2]),
        매출거래처: str(row[3]),
        품목: str(row[4]),
        제품내수매출: parsePlanActualDiff(row, 5),
        제품수출매출: parsePlanActualDiff(row, 8),
        매출수량: parsePlanActualDiff(row, 11),
        환산수량: parsePlanActualDiff(row, 14),
        매출액: parsePlanActualDiff(row, 17),
        실적매출원가: parsePlanActualDiff(row, 20),
        차이매출원가: parsePlanActualDiff(row, 23),
        매출총이익: parsePlanActualDiff(row, 26),
        판매관리비: parsePlanActualDiff(row, 29),
        판관변동_직접판매운반비: parsePlanActualDiff(row, 32),
        영업이익: parsePlanActualDiff(row, 35),
      }), warnings, "수익성분석", false);
      parsed = fillDownHierarchicalOrg(r.parsed, warnings, "수익성분석");
      skippedRows = r.skipped;
      break;
    }
    case "orgCustomerProfit": {
      const r = safeParseRows<OrgCustomerProfitRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[3]),
        거래처대분류: str(row[4]),
        거래처중분류: str(row[5]),
        거래처소분류: str(row[6]),
        매출거래처: str(row[7]),
        매출거래처명: str(row[7]),
        매출액: parsePlanActualDiff(row, 8),
        실적매출원가: parsePlanActualDiff(row, 11),
        매출총이익: parsePlanActualDiff(row, 14),
        판매관리비: parsePlanActualDiff(row, 17),
        영업이익: parsePlanActualDiff(row, 20),
        매출총이익율: calcRatioPAD(parsePlanActualDiff(row, 14), parsePlanActualDiff(row, 8)),
        영업이익율: calcRatioPAD(parsePlanActualDiff(row, 20), parsePlanActualDiff(row, 8)),
        판관변동_노무비: parsePlanActualDiff(row, 23),
        판관변동_복리후생비: parsePlanActualDiff(row, 26),
        판관변동_소모품비: parsePlanActualDiff(row, 29),
        판관변동_수도광열비: parsePlanActualDiff(row, 32),
        판관변동_수선비: parsePlanActualDiff(row, 35),
        판관변동_외주가공비: parsePlanActualDiff(row, 38),
        판관변동_운반비: parsePlanActualDiff(row, 41),
        판관변동_직접판매운반비: parsePlanActualDiff(row, 44),
        판관변동_지급수수료: parsePlanActualDiff(row, 47),
        판관변동_견본비: parsePlanActualDiff(row, 50),
        판관고정_노무비: parsePlanActualDiff(row, 53),
        판관고정_감가상각비: parsePlanActualDiff(row, 56),
        판관고정_기타경비: parsePlanActualDiff(row, 59),
      }), warnings, "조직별거래처별손익", false);
      parsed = fillDownMultiLevel(r.parsed, [
        ["영업조직팀"],
        ["거래처대분류"],
        ["거래처중분류"],
        ["거래처소분류"],
        ["매출거래처", "매출거래처명"],
      ], warnings, "조직별거래처별손익");
      skippedRows = r.skipped;
      break;
    }
    case "hqCustomerItemProfit": {
      const r = safeParseRows<HqCustomerItemProfitRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[2]),
        매출거래처: str(row[4]),
        매출거래처명: str(row[4]),
        품목: str(row[7]),
        품목명: str(row[7]),
        매출수량: parsePlanActualDiff(row, 8),
        매출액: parsePlanActualDiff(row, 14),
        실적매출원가: parsePlanActualDiff(row, 17),
        매출총이익: parsePlanActualDiff(row, 20),
        판매관리비: parsePlanActualDiff(row, 23),
        영업이익: parsePlanActualDiff(row, 26),
        매출총이익율: calcRatioPAD(parsePlanActualDiff(row, 20), parsePlanActualDiff(row, 14)),
        영업이익율: calcRatioPAD(parsePlanActualDiff(row, 26), parsePlanActualDiff(row, 14)),
      }), warnings, "본부거래처품목손익", false);
      parsed = fillDownMultiLevel(r.parsed, [
        ["영업조직팀"],
        ["매출거래처", "매출거래처명"],
        ["품목", "품목명"],
      ], warnings, "본부거래처품목손익");
      skippedRows = r.skipped;
      break;
    }
    case "customerItemDetail": {
      const r = safeParseRows<CustomerItemDetailRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[3]),
        영업담당사번: str(row[15]),
        매출거래처: str(row[4]),
        매출거래처명: str(row[4]),
        품목: str(row[5]),
        품목명: str(row[5]),
        거래처대분류: str(row[9]),
        거래처중분류: str(row[10]),
        거래처소분류: str(row[11]),
        제품군: str(row[30]),
        매출연월: str(row[13]),
        계정구분: str(row[8]),
        매출유형: str(row[12]),
        품목군: str(row[24]),
        중분류코드: str(row[25]),
        공장: str(row[28]),
        제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },
        제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },
        매출수량: parsePlanActualDiff(row, 42),
        환산수량: { 계획: 0, 실적: 0, 차이: 0 },
        매출액: parsePlanActualDiff(row, 45),
        실적매출원가: parsePlanActualDiff(row, 48),
        상품매입: parsePlanActualDiff(row, 63),
        매출총이익: parsePlanActualDiff(row, 66),
        판매관리비: parsePlanActualDiff(row, 69),
        판관변동_직접판매운반비: parsePlanActualDiff(row, 72),
        영업이익: parsePlanActualDiff(row, 75),
        매출총이익율: calcRatioPAD(parsePlanActualDiff(row, 66), parsePlanActualDiff(row, 45)),
        영업이익율: calcRatioPAD(parsePlanActualDiff(row, 75), parsePlanActualDiff(row, 45)),
      }), warnings, "거래처별품목별손익", false);
      parsed = fillDownMultiLevel(r.parsed, [
        ["영업조직팀"],
        ["매출거래처", "매출거래처명"],
        ["품목", "품목명", "제품군"],
      ], warnings, "거래처별품목별손익");
      skippedRows = r.skipped;
      break;
    }
    case "itemProfitability": {
      const rIP = safeParseRows<ItemProfitabilityRecord>(
        rawData, 2, parseItemProfitabilityRow, warnings, "품목별수익성분석", false
      );
      const ipRows = rIP.parsed;
      const origItemValues = ipRows.map(r => String(r.품목 || "").trim());

      const ipLevels = ["판매사업부", "영업조직팀", "대분류", "중분류", "소분류", "품목계정그룹", "품목"];
      // 대분류/중분류/소분류: 소계행("시트 합계" 등)에서 카테고리명 추출 대상
      const ipCategoryFields = new Set(["대분류", "중분류", "소분류"]);
      const ipCurrent: Record<string, string> = {};
      for (const rec of ipRows) {
        for (let i = 0; i < ipLevels.length; i++) {
          const field = ipLevels[i];
          const val = String((rec as Record<string, any>)[field] || "").trim();
          if (val !== "" && !isTotalRow(val)) {
            if (ipCurrent[field] !== val) {
              ipCurrent[field] = val;
              for (let j = i + 1; j < ipLevels.length; j++) {
                ipCurrent[ipLevels[j]] = "";
              }
            }
          } else if (val !== "" && isTotalRow(val) && ipCategoryFields.has(field)) {
            // "시트 합계" → "시트" 추출하여 캐시 업데이트 + 레코드 교체
            const extracted = extractCategoryFromTotal(val);
            if (extracted) {
              if (ipCurrent[field] !== extracted) {
                ipCurrent[field] = extracted;
                for (let j = i + 1; j < ipLevels.length; j++) {
                  ipCurrent[ipLevels[j]] = "";
                }
              }
              (rec as Record<string, any>)[field] = extracted;
            }
          } else if (val === "" && ipCurrent[field]) {
            (rec as Record<string, any>)[field] = ipCurrent[field];
          }
        }
      }

      // 역방향 fill-down 제거: 파일 시작부의 빈 영업조직팀 행에 마지막 조직을
      // 역전파하면 타 사업부 품목이 잘못된 조직으로 배정됨.
      // 순방향 fill-down(lines 774-791)만으로 충분하며,
      // 영업조직팀이 비어있는 행은 org 필터에서 자연 제외됨.

      const mergedIP: ItemProfitabilityRecord[] = [];
      for (let i = 0; i < ipRows.length; i++) {
        const cur = ipRows[i];
        const curItem = String(cur.품목 || "").trim();
        if (curItem === "" || isTotalRow(curItem)) continue;
        let isTotal = false;
        for (const f of ipLevels) {
          const fVal = String((cur as Record<string, any>)[f] || "").trim();
          if (ipCategoryFields.has(f)) {
            // 대분류/중분류/소분류: fill-down에서 이미 "시트 합계"→"시트" 교체됨
            // 순수 합계 키워드만 소계행으로 판정
            if (/^(합계|소계|총합계|총계|전체합계|구간합계)$/i.test(fVal)) { isTotal = true; break; }
          } else {
            if (isTotalRow(fVal)) { isTotal = true; break; }
          }
        }
        if (isTotal) continue;

        const curUnit = String(cur.기준단위 || "").trim();
        const next = i + 1 < ipRows.length ? ipRows[i + 1] : null;
        if (next) {
          const nextItemOrig = origItemValues[i + 1] ?? "";
          const nextUnit = String(next.기준단위 || "").trim();
          if (nextItemOrig === "" && nextUnit === "KG" && curUnit !== "KG") {
            // KG 행 기반으로 병합 — 숫자 필드는 KG 우선, 0이면 non-KG 보충
            const merged = { ...next };
            // 텍스트 필드: cur(non-KG)에서 보충
            if (!merged.품목 || merged.품목.trim() === "") merged.품목 = cur.품목;
            if (!merged.품목계정그룹 || merged.품목계정그룹.trim() === "") merged.품목계정그룹 = cur.품목계정그룹;
            // 핵심 수치: KG 값이 0이면 non-KG 값 사용
            const numericKeys = ["매출수량", "매출액", "매출총이익", "영업이익", "실적매출원가",
              "매출단가", "표준매출원가", "매출원가율", "매출총이익율", "영업이익율",
              "직접판매운반비", "판매관리비"] as const;
            for (const key of numericKeys) {
              if ((merged as any)[key] === 0 && (cur as any)[key] !== 0) {
                (merged as any)[key] = (cur as any)[key];
              }
            }
            // 계획 필드도 동일 처리
            const planKeys = ["매출수량_계획", "매출액_계획", "매출총이익_계획", "영업이익_계획", "실적매출원가_계획"] as const;
            for (const key of planKeys) {
              if (((merged as any)[key] ?? 0) === 0 && ((cur as any)[key] ?? 0) !== 0) {
                (merged as any)[key] = (cur as any)[key];
              }
            }
            // 원가 상세 필드 보충
            const costKeys = ["원재료비", "부재료비", "상품매입", "노무비", "복리후생비",
              "소모품비", "수도광열비", "수선비", "연료비", "외주가공비", "운반비",
              "전력비", "지급수수료", "견본비", "제조고정노무비", "감가상각비", "기타경비"] as const;
            for (const key of costKeys) {
              if ((merged as any)[key] === 0 && (cur as any)[key] !== 0) {
                (merged as any)[key] = (cur as any)[key];
              }
            }
            warnings.push(`[품목별수익성] ${cur.품목}: KG/non-KG 행 병합 (단위: ${curUnit}→KG)`);
            mergedIP.push(merged);
            i++;
            continue;
          }
        }
        mergedIP.push(cur);
      }

      parsed = mergedIP;
      skippedRows = rIP.skipped;
      break;
    }
    case "itemCostDetail": {
      const r = safeParseRows<ItemCostDetailRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        판매사업본부: str(row[1]),
        영업조직팀: str(row[2]),
        품목: str(row[3]),
        매출수량: parsePlanActualDiff(row, 4),
        매출액: parsePlanActualDiff(row, 7),
        실적매출원가: parsePlanActualDiff(row, 10),
        원재료비: parsePlanActualDiff(row, 13),
        부재료비: parsePlanActualDiff(row, 16),
        상품매입: parsePlanActualDiff(row, 19),
        노무비: parsePlanActualDiff(row, 22),
        복리후생비: parsePlanActualDiff(row, 25),
        소모품비: parsePlanActualDiff(row, 28),
        수도광열비: parsePlanActualDiff(row, 31),
        수선비: parsePlanActualDiff(row, 34),
        연료비: parsePlanActualDiff(row, 37),
        외주가공비: parsePlanActualDiff(row, 40),
        운반비: parsePlanActualDiff(row, 43),
        전력비: parsePlanActualDiff(row, 46),
        지급수수료: parsePlanActualDiff(row, 49),
        견본비: parsePlanActualDiff(row, 52),
        제조변동비소계: parsePlanActualDiff(row, 55),
        제조고정노무비: parsePlanActualDiff(row, 58),
        감가상각비: parsePlanActualDiff(row, 61),
        기타경비: parsePlanActualDiff(row, 64),
        제조고정비소계: parsePlanActualDiff(row, 67),
        매출총이익: parsePlanActualDiff(row, 70),
        공헌이익: parsePlanActualDiff(row, 73),
        공헌이익율: parsePlanActualDiff(row, 76),
      }), warnings, "품목별매출원가상세", false);

      let filled = fillDownMultiLevel(r.parsed, [
        ["판매사업본부"],
        ["영업조직팀"],
        ["품목"],
      ], warnings, "품목별매출원가상세");
      const beforeFilterCount = filled.length;
      filled = filled.filter(
        (row) => row.판매사업본부 === ITEM_COST_HQ_FILTER && row.영업조직팀 !== ITEM_COST_EXCLUDED_TEAM
      );
      if (filled.length === 0 && beforeFilterCount > 0) {
        console.warn(`[parser] itemCostDetail: fillDown 후 ${beforeFilterCount}행 중 ${ITEM_COST_HQ_FILTER} 필터 결과 0행. 판매사업본부/영업조직팀 값을 확인하세요.`);
        warnings.push(`품목별매출원가: ${beforeFilterCount}행 중 ${ITEM_COST_HQ_FILTER} 필터 후 0행 — 데이터 확인 필요`);
      }
      parsed = filled;
      skippedRows = r.skipped;
      break;
    }
    case "inventoryMovement": {
      const factory = getFactoryName(fileName);
      const rIM = safeParseRows<InventoryMovementRecord>(rawData, 1, (row) => ({
        factory,
        no: num(row[0]),
        품목: str(row[1]),
        품목명: str(row[2]),
        규격: str(row[3]),
        세부규격: str(row[4]),
        품목그룹: str(row[5]),
        품목계정그룹: str(row[6]),
        자재유형: str(row[7]),
        주거래처: str(row[8]),
        대분류: str(row[9]),
        중분류: str(row[10]),
        소분류: str(row[11]),
        단위: str(row[12]),
        기초: num(row[13]),
        입고: num(row[14]),
        출고: num(row[15]),
        기말: num(row[16]),
      }), warnings, "품목별수불현황");
      parsed = rIM.parsed;
      skippedRows = rIM.skipped;
      break;
    }
    case "receivableAging":
      parsed = parseReceivableAging(rawData, warnings);
      break;
    default:
      throw new Error(`파서 미구현: ${schema.fileType}`);
  }

  return { data: parsed, skippedRows };
}

/**
 * 셀 병합 자동 해제: !merges 메타데이터에 등록된 병합 셀만 해제.
 * 좌상단 셀 값을 병합 범위 내 나머지 셀에 복사한 뒤 !merges를 삭제.
 */
function unmergeSheet(sheet: XLSX.WorkSheet, warnings?: string[]): number {
  const merges = sheet["!merges"];
  if (!merges || merges.length === 0) return 0;
  let filledCount = 0;
  let emptyMergeCount = 0;
  for (const merge of merges) {
    const originAddr = XLSX.utils.encode_cell(merge.s);
    const originCell = sheet[originAddr];
    if (!originCell) {
      emptyMergeCount++;
      continue;
    }
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        sheet[addr] = { ...originCell };
        filledCount++;
      }
    }
  }
  if (emptyMergeCount > 0 && warnings) {
    warnings.push(`[unmerge] ${emptyMergeCount}개 머지 영역의 원본 셀이 비어있어 해제 실패`);
  }
  delete sheet["!merges"];
  return filledCount;
}

export function parseExcelFile(
  buffer: ArrayBuffer,
  fileName: string,
  orgNames?: Set<string>
): ParseResult {
  const warnings: string[] = [];

  // File size validation
  if (buffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`파일 크기 초과: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB (최대 100MB)`);
  }

  const schema = detectFileType(fileName);
  if (!schema) {
    throw new Error(`인식할 수 없는 파일: ${fileName}`);
  }

  // Workbook validation
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array" });
  } catch (e: any) {
    throw new Error(`엑셀 파일 읽기 실패: ${e.message || "파일이 손상되었거나 올바른 엑셀 형식이 아닙니다"}`);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("엑셀 파일에 시트가 없습니다");
  }

  let parsed: unknown[];
  let skippedRows = 0;

  // 월별 시트 감지: YYYYMM 형식 시트가 2개 이상이면 다중 시트 파싱
  const monthlySheets = detectMonthlySheets(workbook.SheetNames);

  if (monthlySheets.length > 0) {
    // ─── 다중 월별 시트 파싱 ─────────────────────────────────────
    const strategy = schema.monthlyStrategy || "concat";

    if (strategy === "latest") {
      // 누계 보고서: 마지막 시트(가장 최근 월)만 사용
      const lastSheet = monthlySheets[monthlySheets.length - 1];
      const sheet = workbook.Sheets[lastSheet.sheetName];
      if (!sheet) {
        throw new Error(`최신 시트 '${lastSheet.sheetName}' 읽기 실패`);
      }
      const unmergedCount = unmergeSheet(sheet, warnings);
      if (unmergedCount > 0) {
        warnings.push(`[${schema.fileType}] ${unmergedCount}개 병합 셀 자동 해제`);
      }
      const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const minRows = schema.hasMergedHeader ? 3 : 2;
      if (rawData.length < minRows) {
        throw new Error(`최신 시트 '${lastSheet.sheetName}': 데이터 부족 (${rawData.length}행)`);
      }
      const skipRows = schema.hasMergedHeader ? 2 : 1;
      const dataRowCount = rawData.length - skipRows;
      if (dataRowCount < 1) {
        throw new Error(`최신 시트 '${lastSheet.sheetName}': 헤더만 있고 데이터 행이 없습니다`);
      }
      const sheetResult = parseSheetData(rawData, schema, warnings, fileName);
      for (const row of sheetResult.data) {
        (row as Record<string, unknown>).month = lastSheet.month;
      }
      parsed = sheetResult.data;
      skippedRows = sheetResult.skippedRows;
      warnings.push(`월별 시트 ${monthlySheets.length}개 중 최신(${lastSheet.month})만 사용 (누계 보고서)`);
    } else {
      // concat: 모든 시트 합산 (월별 독립 데이터)
      const allRows: unknown[] = [];
      for (const ms of monthlySheets) {
        const sheet = workbook.Sheets[ms.sheetName];
        if (!sheet) {
          warnings.push(`시트 '${ms.sheetName}' 읽기 실패 — 건너뜀`);
          continue;
        }
        const msUnmerged = unmergeSheet(sheet, warnings);
        if (msUnmerged > 0) {
          warnings.push(`[${schema.fileType}] 시트 '${ms.sheetName}': ${msUnmerged}개 병합 셀 자동 해제`);
        }
        const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
        const minRows = schema.hasMergedHeader ? 3 : 2;
        if (rawData.length < minRows) {
          warnings.push(`시트 '${ms.sheetName}': 데이터 부족 (${rawData.length}행) — 건너뜀`);
          continue;
        }
        const skipRowsMs = schema.hasMergedHeader ? 2 : 1;
        const dataRowCountMs = rawData.length - skipRowsMs;
        if (dataRowCountMs < 1) {
          warnings.push(`시트 '${ms.sheetName}': 헤더만 있고 데이터 행이 없습니다 — 건너뜀`);
          continue;
        }
        const sheetResult = parseSheetData(rawData, schema, warnings, fileName);
        for (const row of sheetResult.data) {
          (row as Record<string, unknown>).month = ms.month;
        }
        allRows.push(...sheetResult.data);
        skippedRows += sheetResult.skippedRows;
      }
      warnings.push(`월별 시트 ${monthlySheets.length}개 파싱 완료 (${allRows.length}행 통합)`);
      parsed = allRows;
    }
  } else {
    // ─── 기존 단일 시트 파싱 (하위호환) ──────────────────────────
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`시트 '${sheetName}'를 읽을 수 없습니다`);
    }

    const singleUnmerged = unmergeSheet(sheet, warnings);
    if (singleUnmerged > 0) {
      warnings.push(`[${schema.fileType}] ${singleUnmerged}개 병합 셀 자동 해제`);
    }
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
    const minRows = schema.hasMergedHeader ? 3 : 2;
    if (rawData.length < minRows) {
      throw new Error(`데이터가 부족합니다: ${rawData.length}행 (최소 ${minRows}행 필요)`);
    }
    const skipRowsSingle = schema.hasMergedHeader ? 2 : 1;
    const dataRowCountSingle = rawData.length - skipRowsSingle;
    if (dataRowCountSingle < 1) {
      throw new Error(`${schema.fileType}: 헤더만 있고 데이터 행이 없습니다`);
    }

    const sheetResult = parseSheetData(rawData, schema, warnings, fileName);
    parsed = sheetResult.data;
    skippedRows = sheetResult.skippedRows;
  }

  // 원본 보존: 파싱 시점에 조직 필터를 적용하지 않음.
  // 모든 데이터를 저장하고, 필터링은 각 페이지의 렌더 시점에 filterByOrg()로 적용.
  let filterInfo: string | undefined;
  if (orgNames && orgNames.size > 0 && schema.orgFilterField && schema.fileType !== "organization") {
    const field = schema.orgFilterField;
    const orgSet = new Set<string>();
    let matchCount = 0;
    for (const row of parsed) {
      const orgValue = String((row as Record<string, unknown>)[field] || "").trim();
      if (orgValue) {
        orgSet.add(orgValue);
        if (orgNames.has(orgValue)) matchCount++;
      }
    }
    filterInfo = `전체 ${parsed.length}행 보존 (${orgSet.size}개 조직 중 ${matchCount}행이 선택된 조직에 해당)`;
  }

  if (skippedRows > 0) {
    warnings.push(`총 ${skippedRows}행 파싱 실패 (전체 대비 ${((skippedRows / (parsed.length + skippedRows)) * 100).toFixed(1)}%)`);
  }

  const result: ParseResult = {
    fileType: schema.fileType,
    data: parsed,
    rowCount: parsed.length,
    warnings,
    filterInfo,
    skippedRows,
  };

  if (schema.fileType === "receivableAging") {
    result.sourceName = getAgingSourceName(fileName);
  } else if (schema.fileType === "inventoryMovement") {
    result.sourceName = getFactoryName(fileName);
  }

  return result;
}

// ── Data Quality Metrics ──────────────────────────────────────

export interface DataQualityMetrics {
  fileType: string;
  totalRows: number;
  parsedRows: number;
  skippedRows: number;
  parseSuccessRate: number; // parsedRows / totalRows * 100
  nullFieldCounts: Record<string, number>; // field name → count of null/empty values
  completenessRate: number; // average field fill rate
}

/**
 * 파싱된 데이터에 대해 품질 지표를 계산합니다.
 * PlanActualDiff 타입 필드(객체)는 존재 여부로 판별하고,
 * 일반 필드는 null/undefined/빈문자열/NaN을 빈 값으로 처리합니다.
 */
export function calcDataQualityMetrics(
  data: any[],
  fileType: string,
  requiredFields: string[]
): DataQualityMetrics {
  if (data.length === 0) {
    return {
      fileType,
      totalRows: 0,
      parsedRows: 0,
      skippedRows: 0,
      parseSuccessRate: 100,
      nullFieldCounts: {},
      completenessRate: 100,
    };
  }

  const nullFieldCounts: Record<string, number> = {};
  for (const field of requiredFields) {
    nullFieldCounts[field] = 0;
  }

  for (const row of data) {
    for (const field of requiredFields) {
      const val = row[field];
      // PlanActualDiff 객체 필드: 존재하고 객체이면 유효
      if (val !== null && val !== undefined && typeof val === "object") {
        continue;
      }
      // 일반 필드: null, undefined, 빈문자열, NaN은 빈 값
      if (val === undefined || val === null || val === "" || (typeof val === "number" && isNaN(val))) {
        nullFieldCounts[field] = (nullFieldCounts[field] || 0) + 1;
      }
    }
  }

  const totalFieldChecks = data.length * requiredFields.length;
  const totalNulls = Object.values(nullFieldCounts).reduce((s, n) => s + n, 0);
  const completenessRate =
    totalFieldChecks > 0 ? ((totalFieldChecks - totalNulls) / totalFieldChecks) * 100 : 100;

  return {
    fileType,
    totalRows: data.length,
    parsedRows: data.length,
    skippedRows: 0,
    parseSuccessRate: 100,
    nullFieldCounts,
    completenessRate,
  };
}

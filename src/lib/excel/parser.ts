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
import { detectFileType, getAgingSourceName, getFactoryName } from "./schemas";

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

  // 2차: 역방향 fill-down (역순 병합 대응)
  // 아직 빈 값인 행을 아래→위로 채움
  currentOrg = "";
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const org = rec.영업조직팀.trim();
    if (org !== "" && !isTotalRow(org)) {
      currentOrg = org;
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

      if (val !== "" && !isTotalRow(val)) {
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
      } else if (val === "") {
        // 빈 값 → fill-down
        for (const f of fields) {
          if (!String(rec[f] || "").trim() && current[f]) {
            (rec as Record<string, any>)[f] = current[f];
          }
        }
      }
    }
  }

  // 3단계: 역방향 fill-down (역순 병합 대응)
  // 최상위 레벨(영업조직팀 등)만 역방향 처리 (하위 레벨은 역방향 시 교차 오염 위험)
  const topLevelFields = levels[0];
  const topLevelPrimary = topLevelFields[0];
  let currentTop = "";
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i];
    const val = String(rec[topLevelPrimary] || "").trim();
    if (val !== "" && !isTotalRow(val)) {
      currentTop = val;
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
  for (let i = 0; i < rows.length; i++) {
    try {
      parsed.push(parser(rows[i]));
    } catch (e: any) {
      if (e.message === "SKIP_ROW") continue; // 의도적 필터링 (합계/소계행 등)
      skipped++;
      if (skipped <= 5) {
        warnings.push(`[${fileType}] ${i + skipRows + 1}행 파싱 실패: ${e.message || "알 수 없는 오류"}`);
      }
    }
  }
  if (skipped > 5) {
    warnings.push(`[${fileType}] ... 외 ${skipped - 5}행 추가 실패`);
  }
  return { parsed, skipped };
}

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
    계정구분: str(row[9]),        // P1-4: 제품/상품/원자재/부재료
    매출수량: num(row[10]),
    매출액: num(row[11]),
    매출단가: num(row[13]),
    표준매출원가: num(row[14]),   // P1-4: 표준원가 기준선
    실적매출원가: num(row[15]),
    매출원가율: num(row[18]),
    매출총이익: num(row[19]),
    매출총이익율: num(row[20]),
    영업이익: num(row[21]),
    직접판매운반비: num(row[22]),
    판매관리비: num(row[23]),
    영업이익율: num(row[24]),
    원재료비: num(row[25]),
    부재료비: num(row[26]),
    상품매입: num(row[27]),
    노무비: num(row[28]),
    복리후생비: num(row[29]),
    소모품비: num(row[30]),
    수도광열비: num(row[31]),
    수선비: num(row[32]),
    연료비: num(row[33]),
    외주가공비: num(row[34]),
    운반비: num(row[35]),
    전력비: num(row[36]),
    지급수수료: num(row[37]),
    견본비: num(row[38]),
    제조고정노무비: num(row[39]),
    감가상각비: num(row[40]),
    기타경비: num(row[41]),
  };
}

function parseReceivableAging(data: unknown[][]): ReceivableAgingRecord[] {
  return data.slice(2)
    .filter(r => {
      if (!r[0]) return false;
      // 소계행 제거: 담당자/영업조직에 "소계" 포함, 판매처명이 비어있는 행
      const org = String(r[1] || "").trim();
      const mgr = String(r[2] || "").trim();
      const customer = String(r[4] || "").trim();
      if (isTotalRow(org) || isTotalRow(mgr)) return false;
      if (org.includes("소계") || mgr.includes("소계")) return false;
      if (!customer) return false; // 판매처명 없는 소계/합계행 제외
      return true;
    })
    .map((row) => ({
      No: num(row[0]),
      영업조직: str(row[1]),
      담당자: str(row[2]),
      판매처: str(row[3]),
      판매처명: str(row[4]),
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
    }));
}

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

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

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`시트 '${sheetName}'를 읽을 수 없습니다`);
  }

  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const minRows = schema.hasMergedHeader ? 3 : 2; // header + at least 1 data row
  if (rawData.length < minRows) {
    throw new Error(`데이터가 부족합니다: ${rawData.length}행 (최소 ${minRows}행 필요)`);
  }

  let parsed: unknown[];
  let skippedRows = 0;

  // Row-level safe parsing for complex types, direct parsing for simple types
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
        총금액: num(row[40]), 영업조직: str(row[42]), 유통경로: str(row[43]),
        제품군: str(row[44]), 품목범주: str(row[45]), 사업부: str(row[46]), 영업그룹: str(row[47]),
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
        영업그룹: str(row[7]),
        영업담당자: str(row[8]),
        영업담당자명: str(row[9]),
        판매지역: str(row[10]),
        수주유형: str(row[11]),
        수주유형명: str(row[12]),
        영업조직: str(row[13]),
        유통경로: str(row[14]),
        거래구분: str(row[15]),
        품목: str(row[18]),
        품목명: str(row[19]),
        규격: str(row[20]),
        판매수량: num(row[22]),
        판매단가: num(row[23]),
        단가통화: str(row[24]),
        판매금액: num(row[25]),
        환율: num(row[26]),
        장부단가: num(row[27]),
        장부금액: num(row[28]),
        부가세: num(row[29]),
        총금액: num(row[30]),
        납품처: str(row[31]),
        품목상태: str(row[37]),
        저장위치: str(row[38]),
        대분류: str(row[41]),
        중분류: str(row[42]),
        소분류: str(row[43]),
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
      // 비정상 이익율 보정 (절대값 ≥500%는 계산 오류로 간주)
      let abnormalCount = 0;
      for (const p of rOP.parsed) {
        if (Math.abs(p.영업이익율.실적) >= 500 || Math.abs(p.공헌이익율.실적) >= 500) {
          abnormalCount++;
          if (abnormalCount <= 3) {
            warnings.push(`[조직별손익] ${p.영업조직팀}: 비정상 이익율 감지 (영업이익율 ${p.영업이익율.실적.toFixed(1)}%, 공헌이익율 ${p.공헌이익율.실적.toFixed(1)}%) - 해당 데이터는 분석에서 제외됩니다`);
          }
          p.영업이익율 = { 실적: 0, 계획: 0, 차이: 0 };
          p.공헌이익율 = { 실적: 0, 계획: 0, 차이: 0 };
        }
      }
      if (abnormalCount > 3) {
        warnings.push(`[조직별손익] 외 ${abnormalCount - 3}개 조직의 비정상 이익율 데이터가 제외되었습니다. Excel 파일의 수식을 확인하세요.`);
      }
      // 실적·계획 모두 0인 행만 제외
      const nonZero = rOP.parsed.filter(row => row.매출액.실적 !== 0 || row.매출액.계획 !== 0);
      parsed = fillDownHierarchicalOrg(nonZero, warnings, "조직별손익");
      skippedRows = rOP.skipped;
      break;
    }
    case "teamContribution": {
      // Pre-pass: rawData에서 영업그룹/영업조직팀 fill-down 수행
      // SKIP_ROW가 소계 행(영업담당사번 없음)을 제거하기 전에 조직명을 채움
      // → 이후 상세 행이 올바른 조직명을 갖게 됨
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
      // teamContribution has wide rows (index up to 112), use safe parsing
      // filterEmptyFirstCol=false: SAP 병합 셀에서 No 컬럼이 비어있는 상세 행 보존
      const r = safeParseRows(rawData, 2, (row) => {
        // 합계 행 필터링: 영업담당사번이 없으면 제외
        const empNo = str(row[3]).trim();
        if (!empNo) {
          throw new Error("SKIP_ROW"); // safeParseRows에서 자동으로 skip됨
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

        // 비정상 데이터 검증: 이익율 절대값 >500%는 계산 오류 (100~500%는 정상 가능)
        if (Math.abs(record.공헌이익율.실적) >= 500 || Math.abs(record.영업이익율.실적) >= 500) {
          warnings.push(`팀원별공헌이익: 사번 ${record.영업담당사번} 이익율 이상치 보정 (공헌이익율=${record.공헌이익율.실적.toFixed(0)}%, 영업이익율=${record.영업이익율.실적.toFixed(0)}%)`);
          record.공헌이익율.실적 = 0;
          record.공헌이익율.계획 = 0;
          record.공헌이익율.차이 = 0;
          record.영업이익율.실적 = 0;
          record.영업이익율.계획 = 0;
          record.영업이익율.차이 = 0;
        }

        return record;
      }, warnings, "팀원별공헌이익", false);
      // rawData pre-pass에서 이미 fill-down 완료 → fillDownMultiLevel 불필요
      // Excel에 요약/상세 두 섹션이 있어 동일 조직+사번이 중복됨 → 중복 제거
      // 키: 조직_사번 (같은 사번이라도 다른 조직이면 별도 유지)
      // 나중에 나오는 행(상세 섹션)이 더 완전한 데이터이므로 후순위 우선
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
      // filterEmptyFirstCol=false: SAP 병합 셀에서 No 컬럼이 비어있는 상세 행 보존
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
        매출총이익: parsePlanActualDiff(row, 23),
        판매관리비: parsePlanActualDiff(row, 26),
        판관변동_직접판매운반비: parsePlanActualDiff(row, 29),
        영업이익: parsePlanActualDiff(row, 32),
      }), warnings, "수익성분석", false);
      // SAP 계층 리포트: 영업조직팀이 소계 행에만 존재하므로 하위 행에 전파
      parsed = fillDownHierarchicalOrg(r.parsed, warnings, "수익성분석");
      skippedRows = r.skipped;
      break;
    }
    case "orgCustomerProfit": {
      // 303 실제 컬럼: 0:No 1:판매사업본부 2:판매사업부 3:영업조직(팀) 4:거래처대분류
      // 5:거래처중분류 6:거래처소분류 7:판매거래처 8~10:매출액 11~13:실적매출원가
      // 14~16:매출총이익 17~19:판매관리비 20~22:영업이익 23+:판관비세부
      // filterEmptyFirstCol=false: SAP 병합 셀에서 No 컬럼이 비어있는 상세 행 보존
      const r = safeParseRows<OrgCustomerProfitRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[3]),
        거래처대분류: str(row[4]),
        거래처중분류: str(row[5]),
        거래처소분류: str(row[6]),
        매출거래처: str(row[7]),
        매출거래처명: str(row[7]),  // 별도 이름 컬럼 없음, 판매거래처가 이름 역할
        매출액: parsePlanActualDiff(row, 8),
        실적매출원가: parsePlanActualDiff(row, 11),
        매출총이익: parsePlanActualDiff(row, 14),
        판매관리비: parsePlanActualDiff(row, 17),
        영업이익: parsePlanActualDiff(row, 20),
        매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        영업이익율: { 계획: 0, 실적: 0, 차이: 0 },     // 엑셀에 미존재
        // 판관비 세부 13개 항목 (col23~61)
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
      // SAP 다중 레벨 계층: 영업조직팀→거래처대분류→중분류→소분류→매출거래처
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
      // 304 실제 컬럼: 0:No 1:판매사업본부 2:영업조직(팀) 3:판매사업부 4:매출거래처
      // 5:품목계정그룹 6:중분류코드 7:품목 8~10:매출수량 11~13:환산수량
      // 14~16:매출액 17~19:실적매출원가 20~22:매출총이익 23~25:판매관리비 26~28:영업이익
      // filterEmptyFirstCol=false: SAP 병합 셀에서 No 컬럼이 비어있는 상세 행 보존
      const r = safeParseRows<HqCustomerItemProfitRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[2]),
        매출거래처: str(row[4]),
        매출거래처명: str(row[4]),  // 별도 이름 컬럼 없음
        품목: str(row[7]),
        품목명: str(row[5]) || str(row[7]),  // 품목계정그룹 또는 품목명
        매출수량: parsePlanActualDiff(row, 8),
        매출액: parsePlanActualDiff(row, 14),
        실적매출원가: parsePlanActualDiff(row, 17),
        매출총이익: parsePlanActualDiff(row, 20),
        판매관리비: parsePlanActualDiff(row, 23),
        영업이익: parsePlanActualDiff(row, 26),
        매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        영업이익율: { 계획: 0, 실적: 0, 차이: 0 },     // 엑셀에 미존재
      }), warnings, "본부거래처품목손익", false);
      // SAP 다중 레벨 계층: 영업조직팀→매출거래처→품목
      parsed = fillDownMultiLevel(r.parsed, [
        ["영업조직팀"],
        ["매출거래처", "매출거래처명"],
        ["품목", "품목명"],
      ], warnings, "본부거래처품목손익");
      skippedRows = r.skipped;
      break;
    }
    case "customerItemDetail": {
      // 100 실제 컬럼: 0:No 1:판매사업본부 2:판매사업부 3:영업조직(팀) 4:매출거래처
      // 5:품목 6:대분류 7:환산단위 8:계정구분 9:거래처대분류 10:거래처중분류
      // 11:거래처소분류 12:매출유형 13:매출연월 14:사업장 15:영업담당사번
      // ... 30:품목제품군 ... 41:결제조건
      // 42~44:매출수량 45~47:매출액 48~50:실적매출원가 51~53:차이매출원가
      // 54~56:매입할인 57~59:원재료비 60~62:부재료비 63~65:상품매입
      // 66~68:매출총이익 69~71:판매관리비 72~74:직접판매운반비 75~77:영업이익
      // filterEmptyFirstCol=false: SAP 병합 셀에서 No 컬럼이 비어있는 상세 행 보존
      const r = safeParseRows<CustomerItemDetailRecord>(rawData, 2, (row) => ({
        No: num(row[0]),
        영업조직팀: str(row[3]),
        영업담당사번: str(row[15]),
        매출거래처: str(row[4]),
        매출거래처명: str(row[4]),  // 별도 이름 컬럼 없음
        품목: str(row[5]),
        품목명: str(row[5]),  // 별도 이름 컬럼 없음
        거래처대분류: str(row[9]),
        거래처중분류: str(row[10]),
        거래처소분류: str(row[11]),
        제품군: str(row[30]),  // 품목제품군
        매출연월: str(row[13]),  // YYYYMM 형식
        계정구분: str(row[8]),      // P1-3: 제품/상품/원자재/부재료/저장품
        매출유형: str(row[12]),     // P1-3: 일반매출/해외매출 등
        품목군: str(row[24]),       // P1-3: 34종 제품군 분류
        중분류코드: str(row[25]),   // P1-3: 43종 상세분류
        공장: str(row[28]),         // P1-3: 5개 생산공장
        제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        매출수량: parsePlanActualDiff(row, 42),
        환산수량: { 계획: 0, 실적: 0, 차이: 0 },  // 환산단위는 문자열(col 7)
        매출액: parsePlanActualDiff(row, 45),
        실적매출원가: parsePlanActualDiff(row, 48),
        상품매입: parsePlanActualDiff(row, 63),   // P1-3: 거래처x품목별 상품매입 원가
        매출총이익: parsePlanActualDiff(row, 66),
        판매관리비: parsePlanActualDiff(row, 69),
        판관변동_직접판매운반비: parsePlanActualDiff(row, 72),
        영업이익: parsePlanActualDiff(row, 75),
        매출총이익율: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        영업이익율: { 계획: 0, 실적: 0, 차이: 0 },     // 엑셀에 미존재
      }), warnings, "거래처별품목별손익", false);
      // SAP 계층: 영업조직팀→매출거래처→품목
      // 거래처대분류/중분류/소분류는 행별 속성이지 계층 부모가 아님
      // (대분류 변경이 매출거래처 fill-down을 리셋하면 안 됨)
      parsed = fillDownMultiLevel(r.parsed, [
        ["영업조직팀"],
        ["매출거래처", "매출거래처명"],
        ["품목", "품목명", "제품군"],
      ], warnings, "거래처별품목별손익");
      skippedRows = r.skipped;
      break;
    }
    case "itemProfitability": {
      // filterEmptyFirstCol=false: SAP 계층 데이터에서 No 빈 행 보존
      const rIP = safeParseRows<ItemProfitabilityRecord>(
        rawData, 1, parseItemProfitabilityRow, warnings, "품목별수익성분석", false
      );
      // fillDownMultiLevel을 사용하지 않음 — KG 소계행 보존이 필요하므로 직접 fill-down 수행
      // SAP 200 보고서 구조: 각 품목은 (상세행: 비-KG, 소량) + (KG소계행: 실제 총량) 쌍으로 구성
      // fillDownMultiLevel은 lastLevel 빈 행을 소계로 판단해 제거하므로 사용 불가
      const ipRows = rIP.parsed;
      // fill-down 전 원본 품목값 보존 (KG 소계행 감지에 필요)
      const origItemValues = ipRows.map(r => String(r.품목 || "").trim());

      // 1단계: 7개 계층 필드 순방향 fill-down (판매사업부→영업조직팀→대분류→중분류→소분류→품목계정그룹→품목)
      const ipLevels = ["판매사업부", "영업조직팀", "대분류", "중분류", "소분류", "품목계정그룹", "품목"];
      const ipCurrent: Record<string, string> = {};
      for (const rec of ipRows) {
        for (let i = 0; i < ipLevels.length; i++) {
          const field = ipLevels[i];
          const val = String((rec as Record<string, any>)[field] || "").trim();
          if (val !== "" && !isTotalRow(val)) {
            if (ipCurrent[field] !== val) {
              ipCurrent[field] = val;
              // 하위 레벨 리셋
              for (let j = i + 1; j < ipLevels.length; j++) {
                ipCurrent[ipLevels[j]] = "";
              }
            }
          } else if (val === "" && ipCurrent[field]) {
            (rec as Record<string, any>)[field] = ipCurrent[field];
          }
        }
      }

      // 2단계: 영업조직팀 역방향 fill-down (역순 머지 대응)
      let ipCurrentOrg = "";
      for (let i = ipRows.length - 1; i >= 0; i--) {
        const val = String(ipRows[i].영업조직팀 || "").trim();
        if (val !== "" && !isTotalRow(val)) {
          ipCurrentOrg = val;
        } else if (val === "" && ipCurrentOrg !== "") {
          (ipRows[i] as Record<string, any>).영업조직팀 = ipCurrentOrg;
        }
      }

      // 3단계: KG 소계행 병합 — 품목 상세행 + KG 소계행 쌍이면 KG행 수치 사용
      const mergedIP: ItemProfitabilityRecord[] = [];
      for (let i = 0; i < ipRows.length; i++) {
        const cur = ipRows[i];
        const curItem = String(cur.품목 || "").trim();
        // 합계/소계 행 및 빈 품목 행 건너뛰기
        if (curItem === "" || isTotalRow(curItem)) continue;
        // 모든 레벨에서 합계 체크
        let isTotal = false;
        for (const f of ipLevels) {
          if (isTotalRow(String((cur as Record<string, any>)[f] || "").trim())) { isTotal = true; break; }
        }
        if (isTotal) continue;

        const curUnit = String(cur.기준단위 || "").trim();
        const next = i + 1 < ipRows.length ? ipRows[i + 1] : null;
        if (next) {
          const nextItemOrig = origItemValues[i + 1] ?? ""; // fill-down 전 원래 품목값
          const nextUnit = String(next.기준단위 || "").trim();
          // 다음 행이 원래 품목이 비어있고 KG 단위이며 현재행이 KG가 아닌 경우 → KG 소계행 사용
          if (nextItemOrig === "" && nextUnit === "KG" && curUnit !== "KG") {
            mergedIP.push({ ...next }); // KG행 수치 + fill-down된 계층 정보
            i++; // KG 소계행 건너뛰기
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

      // SAP 계층 fill-down: 판매사업본부 → 영업조직팀 → 품목
      // 품목이 lastLevelPrimary → 품목 비어있는 팀소계행은 non-detail로 제거됨
      let filled = fillDownMultiLevel(r.parsed, [
        ["판매사업본부"],
        ["영업조직팀"],
        ["품목"],
      ], warnings, "품목별매출원가상세");
      // 사업본부/팀 필터 (상수 참조)
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
      parsed = parseReceivableAging(rawData);
      break;
    default:
      throw new Error(`파서 미구현: ${schema.fileType}`);
  }

  // Apply org filter if available and applicable
  let filterInfo: string | undefined;
  if (orgNames && orgNames.size > 0 && schema.orgFilterField && schema.fileType !== "organization") {
    const field = schema.orgFilterField;
    const beforeCount = parsed.length;
    let emptyOrgCount = 0;
    parsed = parsed.filter((row: any) => {
      const orgValue = String(row[field] || "").trim();
      if (orgValue === "") { emptyOrgCount++; return false; }
      return orgNames.has(orgValue);
    });
    const filtered = beforeCount - parsed.length;
    if (filtered > 0) {
      filterInfo = `조직 필터 적용: ${filtered}행 제외 (${parsed.length}행 유지)`;
    }
    if (emptyOrgCount > 0) {
      warnings.push(`[${schema.fileType}] ${field} 필드가 비어있는 ${emptyOrgCount}행이 조직 필터에서 제외됨 — fill-down 처리를 확인하세요`);
    }
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

import * as XLSX from "xlsx";
import type {
  Organization,
  CollectionRecord,
  OrderRecord,
  OrgProfitRecord,
  ProfitabilityAnalysisRecord,
  OrgCustomerProfitRecord,
  HqCustomerItemProfitRecord,
  CustomerItemDetailRecord,
  ItemCostDetailRecord,
  ReceivableAgingRecord,
  PlanActualDiff,
  AgingAmounts,
} from "@/types";
import { detectFileType, getAgingSourceName } from "./schemas";

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
 * "합계" 행은 제외하여 전체 합산 중복 방지.
 */
function fillDownHierarchicalOrg<T extends { 영업조직팀: string }>(
  records: T[],
): T[] {
  let currentOrg = "";
  for (const rec of records) {
    const org = rec.영업조직팀.trim();
    if (org !== "" && org !== "합계") {
      currentOrg = org;
    } else if (org === "" && currentOrg !== "") {
      rec.영업조직팀 = currentOrg;
    }
  }
  // "합계" 행 제거 (전체 소계 → 조직별 상세와 중복)
  return records.filter((r) => r.영업조직팀.trim() !== "합계");
}

/**
 * SAP 다중 레벨 계층 리포트 fill-down.
 * levels는 상위→하위 순으로 [주필드, ...연관필드] 배열.
 * 상위 레벨 값이 바뀌면 하위 레벨을 리셋하여 교차 오염 방지.
 * "합계"/"소계" 행은 제외.
 */
function fillDownMultiLevel<T extends Record<string, any>>(
  records: T[],
  levels: string[][],
): T[] {
  const lastLevelPrimary = levels[levels.length - 1][0];

  // 1단계: 최하위 레벨이 원본에서 채워져 있는 행만 상세행으로 표시
  const isDetailRow = records.map((rec) => {
    const val = String(rec[lastLevelPrimary] || "").trim();
    return val !== "" && val !== "합계" && val !== "소계";
  });

  // 2단계: fill-down 수행
  const current: Record<string, string> = {};
  for (const rec of records) {
    for (let i = 0; i < levels.length; i++) {
      const fields = levels[i];
      const primary = fields[0];
      const val = String(rec[primary] || "").trim();

      if (val !== "" && val !== "합계" && val !== "소계") {
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

  // 3단계: 상세행만 유지 (소계/합계 행 및 중간 레벨 소계 제거)
  return records.filter((r, idx) => {
    if (!isDetailRow[idx]) return false;
    // 모든 레벨에서 합계/소계 체크
    for (const level of levels) {
      const v = String(r[level[0]] || "").trim();
      if (v === "합계" || v === "소계") return false;
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
    ? data.slice(skipRows).filter(r => r[0] !== null && r[0] !== undefined && r[0] !== "")
    : data.slice(skipRows).filter(r =>
        r.some(cell => cell !== "" && cell !== null && cell !== undefined)
      );
  for (let i = 0; i < rows.length; i++) {
    try {
      parsed.push(parser(rows[i]));
    } catch (e: any) {
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

function parseOrganization(data: unknown[][]): Organization[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
    영업조직: str(row[0]),
    영업조직명: str(row[1]),
    최하위조직여부: str(row[2]),
    시작일: str(row[3]),
    종료일: str(row[4]),
    통합조직여부: str(row[5]),
  }));
}

function parseCollectionList(data: unknown[][]): CollectionRecord[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
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
    수금액: num(row[16]),
    장부수금액: num(row[17]),
    선수금액: num(row[18]),
    장부선수금액: num(row[19]),
  }));
}

function parseOrderList(data: unknown[][]): OrderRecord[] {
  return data.slice(1).filter(r => r[0]).map((row) => ({
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
    판매금액: num(row[25]),
    환율: num(row[26]),
    장부단가: num(row[27]),
    장부금액: num(row[28]),
    부가세: num(row[29]),
    총금액: num(row[30]),
    대분류: str(row[41]),
    중분류: str(row[42]),
    소분류: str(row[43]),
  }));
}

function parseOrgProfit(data: unknown[][], warnings: string[]): OrgProfitRecord[] {
  let abnormalCount = 0;
  const result = data.slice(2)
    .filter(r => {
      // 합계 행 제외: No 컬럼 있고, 영업조직팀이 유효한 값이어야 함
      if (!r[0]) return false;
      const org = str(r[3]).trim();
      // 공백, "합계", "총계" 등 합계 행 제외
      if (!org || org === "합계" || org === "총계" || org.includes("합계")) return false;
      return true;
    })
    .map((row) => {
      const parsed = {
        No: num(row[0]),
        판매사업본부: str(row[1]),
        판매사업부: str(row[2]),
        영업조직팀: str(row[3]),
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

      // 비정상 데이터 검증: 영업이익율 100% 또는 절대값 >200%는 계산 오류로 간주
      // → 0으로 대체하여 차트에서 제외되도록 함
      if (Math.abs(parsed.영업이익율.실적) >= 100 || Math.abs(parsed.공헌이익율.실적) >= 100) {
        abnormalCount++;
        if (abnormalCount <= 3) {
          warnings.push(`[조직별손익] ${parsed.영업조직팀}: 비정상 이익율 감지 (영업이익율 ${parsed.영업이익율.실적.toFixed(1)}%, 공헌이익율 ${parsed.공헌이익율.실적.toFixed(1)}%) - 해당 데이터는 분석에서 제외됩니다`);
        }
        parsed.영업이익율.실적 = 0;
        parsed.영업이익율.계획 = 0;
        parsed.영업이익율.차이 = 0;
        parsed.공헌이익율.실적 = 0;
        parsed.공헌이익율.계획 = 0;
        parsed.공헌이익율.차이 = 0;
      }

      return parsed;
    })
    .filter(r => r.매출액.실적 !== 0); // 매출액 0인 행도 제외

  if (abnormalCount > 3) {
    warnings.push(`[조직별손익] 외 ${abnormalCount - 3}개 조직의 비정상 이익율 데이터가 제외되었습니다. Excel 파일의 수식을 확인하세요.`);
  }

  return result;
}

// parseProfitabilityAnalysis는 parseExcelFile 내부에서 safeParseRows로 처리

function parseReceivableAging(data: unknown[][]): ReceivableAgingRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
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
    합계: parseAgingAmounts(row, 27),
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
    case "organization":
      parsed = parseOrganization(rawData);
      break;
    case "salesList": {
      const r = safeParseRows(rawData, 1, (row) => ({
        No: num(row[0]), 공장: str(row[1]), 매출번호: str(row[2]), 매출일: str(row[3]),
        세무분류: str(row[4]), 세무구분: str(row[5]), 거래처소분류: str(row[6]),
        매출처: str(row[7]), 매출처명: str(row[8]), 수금처: str(row[9]), 수금처명: str(row[10]),
        납품처: str(row[11]), 납품처명: str(row[12]), 결제조건: str(row[13]),
        수금예정일: str(row[14]), 매출상태: str(row[16]), 매출유형: str(row[17]),
        품목: str(row[21]), 품목명: str(row[22]), 규격: str(row[23]),
        대분류: str(row[25]), 중분류: str(row[26]), 소분류: str(row[27]),
        단위: str(row[28]), 수량: num(row[30]), 거래통화: str(row[31]),
        환율: num(row[32]), 판매단가: num(row[35]), 판매금액: num(row[36]),
        장부단가: num(row[37]), 장부금액: num(row[38]), 부가세: num(row[39]),
        총금액: num(row[40]), 영업조직: str(row[42]), 유통경로: str(row[43]),
        제품군: str(row[44]), 사업부: str(row[46]), 영업그룹: str(row[47]),
        영업담당자: str(row[48]), 영업담당자명: str(row[49]), 수주번호: str(row[57]),
        수주유형: str(row[76]), 출고일: str(row[64]),
      }), warnings, "매출리스트");
      parsed = r.parsed; skippedRows = r.skipped;
      break;
    }
    case "collectionList":
      parsed = parseCollectionList(rawData);
      break;
    case "orderList":
      parsed = parseOrderList(rawData);
      break;
    case "orgProfit":
      // 방어적 fill-down: 현재 행당 1개 조직 요약이라 no-op이지만, SAP 형식 변경 대비
      parsed = fillDownHierarchicalOrg(parseOrgProfit(rawData, warnings));
      break;
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
          if (g && g !== "합계" && g !== "소계") {
            if (g !== curGroup) { curGroup = g; curTeam = ""; }
          } else if (!g && curGroup) {
            row[1] = curGroup;
          }
          if (t && t !== "합계" && t !== "소계") {
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

        // 비정상 데이터 검증: 공헌이익율 >=100% 또는 절대값 >200%는 계산 오류
        if (Math.abs(record.공헌이익율.실적) >= 100 || Math.abs(record.영업이익율.실적) >= 100) {
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
      // Excel에 요약/상세 두 섹션이 있어 동일 사번이 중복됨 → 사번별 중복 제거
      // 나중에 나오는 행(상세 섹션)이 더 완전한 데이터이므로 후순위 우선
      const deduped = new Map<string, (typeof r.parsed)[0]>();
      for (const row of r.parsed) {
        deduped.set(row.영업담당사번, row);
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
      parsed = fillDownHierarchicalOrg(r.parsed);
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
      }), warnings, "조직별거래처별손익", false);
      // SAP 다중 레벨 계층: 영업조직팀→거래처대분류→중분류→소분류→매출거래처
      parsed = fillDownMultiLevel(r.parsed, [
        ["영업조직팀"],
        ["거래처대분류"],
        ["거래처중분류"],
        ["거래처소분류"],
        ["매출거래처", "매출거래처명"],
      ]);
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
      ]);
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
        제품내수매출: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        제품수출매출: { 계획: 0, 실적: 0, 차이: 0 },  // 엑셀에 미존재
        매출수량: parsePlanActualDiff(row, 42),
        환산수량: { 계획: 0, 실적: 0, 차이: 0 },  // 환산단위는 문자열(col 7)
        매출액: parsePlanActualDiff(row, 45),
        실적매출원가: parsePlanActualDiff(row, 48),
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
      ]);
      skippedRows = r.skipped;
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
      ]);
      // Infra사업본부만 유지 + 설계영업팀 제외
      const beforeFilterCount = filled.length;
      filled = filled.filter(
        (row) => row.판매사업본부 === "Infra사업본부" && row.영업조직팀 !== "설계영업팀"
      );
      if (filled.length === 0 && beforeFilterCount > 0) {
        console.warn(`[parser] itemCostDetail: fillDown 후 ${beforeFilterCount}행 중 Infra필터 결과 0행. 판매사업본부/영업조직팀 값을 확인하세요.`);
        warnings.push(`품목별매출원가: ${beforeFilterCount}행 중 Infra사업본부 필터 후 0행 — 데이터 확인 필요`);
      }
      parsed = filled;
      skippedRows = r.skipped;
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
    parsed = parsed.filter((row: any) => {
      const orgValue = String(row[field] || "").trim();
      return orgValue !== "" && orgNames.has(orgValue);
    });
    const filtered = beforeCount - parsed.length;
    if (filtered > 0) {
      filterInfo = `조직 필터 적용: ${filtered}행 제외 (${parsed.length}행 유지)`;
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

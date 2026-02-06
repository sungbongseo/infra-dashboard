import * as XLSX from "xlsx";
import type {
  Organization,
  CollectionRecord,
  OrderRecord,
  OrgProfitRecord,
  ProfitabilityAnalysisRecord,
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

/** Row-level safe parser: catches individual row errors and collects warnings */
function safeParseRows<T>(
  data: unknown[][],
  skipRows: number,
  parser: (row: unknown[]) => T,
  warnings: string[],
  fileType: string,
): { parsed: T[]; skipped: number } {
  let skipped = 0;
  const parsed: T[] = [];
  const rows = data.slice(skipRows).filter(r => r[0]);
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

function parseOrgProfit(data: unknown[][]): OrgProfitRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
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
  }));
}

function parseProfitabilityAnalysis(data: unknown[][]): ProfitabilityAnalysisRecord[] {
  return data.slice(2).filter(r => r[0]).map((row) => ({
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
  }));
}

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
      parsed = parseOrgProfit(rawData);
      break;
    case "teamContribution": {
      // teamContribution has wide rows (index up to 112), use safe parsing
      const r = safeParseRows(rawData, 2, (row) => ({
        No: num(row[0]), 영업그룹: str(row[1]), 영업조직팀: str(row[2]),
        영업담당사번: str(row[3]),
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
      }), warnings, "팀원별공헌이익");
      parsed = r.parsed; skippedRows = r.skipped;
      break;
    }
    case "profitabilityAnalysis":
      parsed = parseProfitabilityAnalysis(rawData);
      break;
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

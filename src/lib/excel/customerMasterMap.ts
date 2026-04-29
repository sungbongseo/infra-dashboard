/**
 * 거래처 마스터 매핑 — Phase A-1 (Critical C-01 해결).
 *
 * @problem
 *   100/303/304 손익 데이터의 매출거래처 필드는 "이름"만 가지고 있고,
 *   미수채권 aging 데이터는 "판매처(코드) + 판매처명" 둘 다 가지고 있다.
 *   두 데이터를 매칭할 때 fuzzy contains 매칭에 의존하면 거짓 양성/음성 위험.
 *
 * @solution
 *   Aging 파일 7개에서 [판매처코드, 판매처명] 쌍을 추출하여 마스터 매핑 빌드.
 *   100 손익에서 거래처명을 조회하여 정규 코드로 변환.
 *
 *   매칭 단계 (정확도 우선):
 *     1) 정확 매칭     — name === master.판매처명
 *     2) Trim/Whitespace 정규화 매칭
 *     3) 안전 fuzzy   — 길이 ≥ 4자 + 시작/끝 일치 only
 *
 *   거짓 양성 방지: 짧은 이름 ("일성"/"한일" 등)은 fuzzy 미적용.
 */

import type { ReceivableAgingRecord } from "@/types";

// ─── Types ───────────────────────────────────────────────

export interface CustomerMasterMap {
  /** 코드 → 이름 (e.g. "C100002775" → "리본TS") */
  codeToName: Map<string, string>;
  /** 이름 → 코드 (e.g. "리본TS" → "C100002775") */
  nameToCode: Map<string, string>;
  /** 정규화 이름(trim, 공백 제거) → 코드 (fallback 매칭용) */
  normalizedNameToCode: Map<string, string>;
}

/** 안전 fuzzy 매칭 최소 길이 */
const SAFE_FUZZY_MIN_LENGTH = 4;

// ─── Builder ─────────────────────────────────────────────

/**
 * Aging 파일들에서 [판매처코드, 판매처명] 마스터 매핑 빌드.
 *
 * 같은 코드가 여러 사무소에 등장 시 첫 번째 이름 유지 (이름 충돌 시 무시).
 */
export function buildCustomerMasterMap(
  agingMap: Map<string, ReceivableAgingRecord[]>,
): CustomerMasterMap {
  const codeToName = new Map<string, string>();
  const nameToCode = new Map<string, string>();
  const normalizedNameToCode = new Map<string, string>();

  for (const records of Array.from(agingMap.values())) {
    for (const r of records) {
      const code = (r.판매처 || "").trim();
      const name = (r.판매처명 || "").trim();
      if (!code || !name) continue;

      // 코드 → 이름 (첫 등장 우선)
      if (!codeToName.has(code)) {
        codeToName.set(code, name);
      }

      // 이름 → 코드 (첫 등장 우선)
      if (!nameToCode.has(name)) {
        nameToCode.set(name, code);
      }

      // 정규화 이름 → 코드 (공백/특수문자 제거)
      const normalized = normalizeCustomerName(name);
      if (normalized && !normalizedNameToCode.has(normalized)) {
        normalizedNameToCode.set(normalized, code);
      }
    }
  }

  return { codeToName, nameToCode, normalizedNameToCode };
}

// ─── Lookup ──────────────────────────────────────────────

/**
 * 거래처명/코드 → 정규 코드 lookup.
 *
 * @returns 매칭 시 마스터 코드, 실패 시 null
 */
export function lookupCustomerCode(
  query: string,
  master: CustomerMasterMap,
): string | null {
  if (!query) return null;
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Stage 1: 코드 직접 매칭 (이미 코드인 경우)
  if (master.codeToName.has(trimmed)) {
    return trimmed;
  }

  // Stage 2: 정확 이름 매칭
  const exact = master.nameToCode.get(trimmed);
  if (exact) return exact;

  // Stage 3: 정규화 이름 매칭 (공백 차이 등)
  const normalized = normalizeCustomerName(trimmed);
  const fromNormalized = master.normalizedNameToCode.get(normalized);
  if (fromNormalized) return fromNormalized;

  // Stage 4: 안전 fuzzy 매칭 (길이 ≥ 4자 + 시작/끝 일치)
  if (trimmed.length >= SAFE_FUZZY_MIN_LENGTH) {
    for (const [name, code] of Array.from(master.nameToCode.entries())) {
      if (name.length < SAFE_FUZZY_MIN_LENGTH) continue;
      // 시작 또는 끝 정확 일치 (긴 이름 안에 짧은 이름이 포함되는 케이스)
      // e.g. "대성이앤씨" startsWith "대성이앤씨" → "대성이앤씨 주식회사"
      if (
        name.startsWith(trimmed) ||
        trimmed.startsWith(name) ||
        name.endsWith(trimmed) ||
        trimmed.endsWith(name)
      ) {
        return code;
      }
    }
  }

  return null;
}

/**
 * 코드 → 정규 이름 lookup.
 */
export function lookupCustomerName(
  code: string,
  master: CustomerMasterMap,
): string | null {
  if (!code) return null;
  return master.codeToName.get(code.trim()) || null;
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * 거래처명 정규화 — 매칭 robustness 강화.
 *
 * 적용:
 *   - 양 끝 공백 제거
 *   - 내부 multiple whitespace → single space
 *   - "(주)", "주식회사" 등 공통 접미사 보존 (의미 있는 정보)
 */
export function normalizeCustomerName(name: string): string {
  return (name || "")
    .trim()
    .replace(/\s+/g, " ");
}

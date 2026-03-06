/**
 * 조직명 통합 매칭 유틸리티
 * "영업조직"(매출/수금/수주/미수금) ↔ "영업조직팀"(조직손익/공헌이익/수익성) 간
 * 이름 불일치를 해결하는 통합 매핑 시스템
 */

/**
 * 조직명 정규화
 * - 앞뒤 공백 제거
 * - _INF, _베트남 등 접미사 유지 (구분 필요)
 */
export function normalizeOrgName(name: string): string {
  return (name || "").trim();
}

/**
 * 두 조직명이 같은 조직을 가리키는지 판정
 * 정확 일치 → 부분 포함 순으로 비교
 */
export function isSameOrg(orgA: string, orgB: string): boolean {
  const a = normalizeOrgName(orgA);
  const b = normalizeOrgName(orgB);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}


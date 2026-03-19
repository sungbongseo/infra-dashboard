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
 * 부분 포함은 최소 3자 이상일 때만 적용 (false positive 방지)
 */
export function isSameOrg(orgA: string, orgB: string): boolean {
  const a = normalizeOrgName(orgA);
  const b = normalizeOrgName(orgB);
  if (!a || !b) return false;
  if (a === b) return true;
  // 부분 매칭: 짧은 쪽이 3자 이상이어야 적용 (1~2자 포함 매칭은 오탐 위험)
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length < 3) return false;
  return a.includes(b) || b.includes(a);
}


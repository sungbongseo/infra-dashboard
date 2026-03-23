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

/** 조직명 접미사 제거 (팀, _INF, _베트남, 본부, 사업부 등) */
function stripOrgSuffix(name: string): string {
  return name
    .replace(/(팀|본부|사업부|그룹|센터|실|부|과)$/g, "")
    .replace(/_(INF|베트남|해외|국내)$/gi, "")
    .trim();
}

/**
 * 두 조직명이 같은 조직을 가리키는지 판정
 * 정확 일치 → 접미사 제거 후 일치 → 부분 포함(70% 이상) 순으로 비교
 */
export function isSameOrg(orgA: string, orgB: string): boolean {
  const a = normalizeOrgName(orgA);
  const b = normalizeOrgName(orgB);
  if (!a || !b) return false;
  if (a === b) return true;

  // 접미사 제거 후 비교
  const sa = stripOrgSuffix(a);
  const sb = stripOrgSuffix(b);
  if (sa && sb && sa === sb) return true;

  // 부분 매칭: 짧은 쪽이 3자 이상 + 짧은 쪽이 긴 쪽의 70% 이상이어야 적용
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 3) return false;
  if (shorter.length / longer.length < 0.7) return false;
  return longer.includes(shorter);
}


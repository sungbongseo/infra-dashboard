/**
 * 조직명 통합 매칭 유틸리티
 * "영업조직"(매출/수금/수주/미수금) ↔ "영업조직팀"(조직손익/공헌이익/수익성) 간
 * 이름 불일치를 해결하는 통합 매핑 시스템
 */

/** 정확 매칭 → 부분 매칭(contains) 순으로 탐색 */
export function fuzzyMatchOrg<T>(
  map: Map<string, T>,
  name: string
): T | undefined {
  if (!name) return undefined;
  const trimmed = name.trim();

  // 1. 정확 매칭
  const exact = map.get(trimmed);
  if (exact !== undefined) return exact;

  // 2. 부분 매칭: key가 name을 포함하거나, name이 key를 포함
  for (const [key, val] of Array.from(map.entries())) {
    if (key.includes(trimmed) || trimmed.includes(key)) return val;
  }

  return undefined;
}

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

/**
 * 조직 필터를 영업조직 / 영업조직팀 양쪽에 적용 가능한 필터 함수
 * orgNames에 포함되거나 fuzzy 매칭되는 행만 반환
 */
export function filterByOrgFuzzy<T extends Record<string, any>>(
  data: T[],
  orgNames: Set<string>,
  field: string = "영업조직"
): T[] {
  if (orgNames.size === 0) return data;
  return data.filter(row => {
    const val = normalizeOrgName(String(row[field] || ""));
    if (!val) return false;
    // 정확 매칭
    if (orgNames.has(val)) return true;
    // fuzzy 매칭
    for (const org of Array.from(orgNames)) {
      if (val.includes(org) || org.includes(val)) return true;
    }
    return false;
  });
}

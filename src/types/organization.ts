export interface Organization {
  영업조직: string;
  영업조직명: string;
  최하위조직여부: string;
  시작일: string;
  종료일: string;
  통합조직여부: string;
}

export type OrgCode = string;
export type OrgCodeSet = Set<OrgCode>;

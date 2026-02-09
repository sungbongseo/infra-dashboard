import Dexie, { type Table } from "dexie";

/**
 * IndexedDB 데이터 영속성
 * 파싱된 엑셀 데이터를 브라우저 IndexedDB에 저장/복원
 * 새로고침 시 17개 파일 재업로드 불필요
 */

export interface StoredDataset {
  id: string; // "salesList", "collectionList", etc.
  data: any[];  // 파싱된 레코드 배열
  updatedAt: Date;
  rowCount: number;
}

export interface StoredAgingData {
  id: string; // source name (e.g., "건자재")
  data: any[];
  updatedAt: Date;
  rowCount: number;
}

export interface StoredUploadedFile {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: Date;
  rowCount: number;
  status: string;
  warnings?: string[];
  filterInfo?: string;
  skippedRows?: number;
}

export interface StoredOrgFilter {
  id: string; // "default"
  orgNames: string[];
  orgCodes: string[];
}

export interface StoredFilterState {
  id: string; // "default"
  selectedOrgs: string[];
  dateRange: { from: string; to: string } | null;
  comparisonRange: { from: string; to: string } | null;
  comparisonPreset: string | null;
  updatedAt: Date;
}

class DashboardDB extends Dexie {
  datasets!: Table<StoredDataset>;
  agingData!: Table<StoredAgingData>;
  uploadedFiles!: Table<StoredUploadedFile>;
  orgFilter!: Table<StoredOrgFilter>;
  filterState!: Table<StoredFilterState>;

  constructor() {
    super("infra-dashboard");
    this.version(1).stores({
      datasets: "id",
      agingData: "id",
      uploadedFiles: "id",
      orgFilter: "id",
    });
    this.version(2).stores({
      datasets: "id",
      agingData: "id",
      uploadedFiles: "id",
      orgFilter: "id",
      filterState: "id",
    });
  }
}

export const db = new DashboardDB();

/** 데이터셋 저장 */
export async function saveDataset(id: string, data: any[]): Promise<void> {
  await db.datasets.put({
    id,
    data,
    updatedAt: new Date(),
    rowCount: data.length,
  });
}

/** 데이터셋 로드 */
export async function loadDataset(id: string): Promise<any[] | null> {
  const stored = await db.datasets.get(id);
  return stored?.data ?? null;
}

/** Aging 데이터 저장 (소스별) */
export async function saveAgingData(source: string, data: any[]): Promise<void> {
  await db.agingData.put({
    id: source,
    data,
    updatedAt: new Date(),
    rowCount: data.length,
  });
}

/** 모든 Aging 데이터 로드 */
export async function loadAllAgingData(): Promise<Map<string, any[]>> {
  const allAging = await db.agingData.toArray();
  const map = new Map<string, any[]>();
  for (const item of allAging) {
    map.set(item.id, item.data);
  }
  return map;
}

/** 업로드 파일 목록 저장 */
export async function saveUploadedFiles(files: StoredUploadedFile[]): Promise<void> {
  await db.uploadedFiles.clear();
  await db.uploadedFiles.bulkPut(files);
}

/** 업로드 파일 목록 로드 */
export async function loadUploadedFiles(): Promise<StoredUploadedFile[]> {
  return db.uploadedFiles.toArray();
}

/** 조직 필터 저장 */
export async function saveOrgFilter(orgNames: string[], orgCodes: string[]): Promise<void> {
  await db.orgFilter.put({
    id: "default",
    orgNames,
    orgCodes,
  });
}

/** 조직 필터 로드 */
export async function loadOrgFilter(): Promise<{ orgNames: string[]; orgCodes: string[] } | null> {
  const stored = await db.orgFilter.get("default");
  if (!stored) return null;
  return { orgNames: stored.orgNames, orgCodes: stored.orgCodes };
}

/** 필터 상태 저장 */
export async function saveFilterState(state: {
  selectedOrgs: string[];
  dateRange: { from: string; to: string } | null;
  comparisonRange: { from: string; to: string } | null;
  comparisonPreset: string | null;
}): Promise<void> {
  await db.filterState.put({
    id: "default",
    ...state,
    updatedAt: new Date(),
  });
}

/** 필터 상태 로드 */
export async function loadFilterState(): Promise<StoredFilterState | null> {
  return (await db.filterState.get("default")) ?? null;
}

/** 전체 DB 초기화 */
export async function clearAllDB(): Promise<void> {
  await Promise.all([
    db.datasets.clear(),
    db.agingData.clear(),
    db.uploadedFiles.clear(),
    db.orgFilter.clear(),
    db.filterState.clear(),
  ]);
}

/** DB에 저장된 데이터 존재 여부 확인 */
export async function hasStoredData(): Promise<boolean> {
  const count = await db.datasets.count();
  return count > 0;
}

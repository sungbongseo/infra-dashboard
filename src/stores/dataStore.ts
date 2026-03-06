import { create } from "zustand";
import {
  saveDataset,
  loadDataset,
  saveAgingData,
  loadAllAgingData,
  saveInventoryData,
  loadAllInventoryData,
  saveUploadedFiles,
  loadUploadedFiles,
  saveOrgFilter,
  loadOrgFilter,
  clearAllDB,
  hasStoredData as checkStoredData,
} from "@/lib/db";
import type { StoredUploadedFile } from "@/lib/db";

// Infra 사업본부 기본 담당조직명 (조직 파일 미업로드 시에도 필터링 적용)
export const DEFAULT_INFRA_ORG_NAMES = new Set([
  "Infra사업본부",
  "건축사업부",
  "건자재팀",
  "광주사무소",
  "대전사무소",
  "대구사무소",
  "부산지점_INF",
  "해외사업팀_INF",
  "해외사업팀_베트남",
  "전략구매혁신팀",
]);

import type {
  SalesRecord,
  CollectionRecord,
  OrderRecord,
  OrgProfitRecord,
  TeamContributionRecord,
  ProfitabilityAnalysisRecord,
  OrgCustomerProfitRecord,
  HqCustomerItemProfitRecord,
  CustomerItemDetailRecord,
  ItemCostDetailRecord,
  ItemProfitabilityRecord,
  ReceivableAgingRecord,
  InventoryMovementRecord,
  Organization,
  UploadedFile,
} from "@/types";

/** 현재 uploadedFiles 상태를 IndexedDB에 저장 */
function persistUploadedFiles(files: UploadedFile[]): void {
  const stored: StoredUploadedFile[] = files.map((f) => ({
    id: f.id,
    fileName: f.fileName,
    fileType: f.fileType,
    uploadedAt: f.uploadedAt,
    rowCount: f.rowCount,
    status: f.status,
    warnings: f.warnings,
    filterInfo: f.filterInfo,
    skippedRows: f.skippedRows,
  }));
  saveUploadedFiles(stored).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
}

/** 현재 orgNames/orgCodes를 IndexedDB에 저장 */
function persistOrgFilter(orgNames: Set<string>, orgCodes: Set<string>): void {
  saveOrgFilter(Array.from(orgNames), Array.from(orgCodes)).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
}

interface DataState {
  organizations: Organization[];
  orgCodes: Set<string>;
  orgNames: Set<string>;
  salesList: SalesRecord[];
  collectionList: CollectionRecord[];
  orderList: OrderRecord[];
  orgProfit: OrgProfitRecord[];
  teamContribution: TeamContributionRecord[];
  profitabilityAnalysis: ProfitabilityAnalysisRecord[];
  orgCustomerProfit: OrgCustomerProfitRecord[];
  hqCustomerItemProfit: HqCustomerItemProfitRecord[];
  customerItemDetail: CustomerItemDetailRecord[];
  itemCostDetail: ItemCostDetailRecord[];
  itemProfitability: ItemProfitabilityRecord[];
  receivableAging: Map<string, ReceivableAgingRecord[]>;
  inventoryMovement: Map<string, InventoryMovementRecord[]>;
  uploadedFiles: UploadedFile[];
  isLoading: boolean;
  loadingProgress: { fileName: string; progress: number } | null;
  hasStoredData: boolean;

  setOrganizations: (orgs: Organization[]) => void;
  setOrgCodes: (codes: Set<string>) => void;
  setOrgNames: (names: Set<string>) => void;
  setSalesList: (data: SalesRecord[]) => void;
  setCollectionList: (data: CollectionRecord[]) => void;
  setOrderList: (data: OrderRecord[]) => void;
  setOrgProfit: (data: OrgProfitRecord[]) => void;
  setTeamContribution: (data: TeamContributionRecord[]) => void;
  setProfitabilityAnalysis: (data: ProfitabilityAnalysisRecord[]) => void;
  setOrgCustomerProfit: (data: OrgCustomerProfitRecord[]) => void;
  setHqCustomerItemProfit: (data: HqCustomerItemProfitRecord[]) => void;
  setCustomerItemDetail: (data: CustomerItemDetailRecord[]) => void;
  setItemCostDetail: (data: ItemCostDetailRecord[]) => void;
  setItemProfitability: (data: ItemProfitabilityRecord[]) => void;
  setReceivableAging: (source: string, data: ReceivableAgingRecord[]) => void;
  setInventoryMovement: (factory: string, data: InventoryMovementRecord[]) => void;
  addUploadedFile: (file: UploadedFile) => void;
  updateUploadedFile: (id: string, updates: Partial<UploadedFile>) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingProgress: (progress: { fileName: string; progress: number } | null) => void;
  clearAllData: () => void;
  restoreFromDB: () => Promise<void>;
  persistToDB: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  organizations: [],
  orgCodes: new Set(),
  orgNames: new Set(DEFAULT_INFRA_ORG_NAMES),
  salesList: [],
  collectionList: [],
  orderList: [],
  orgProfit: [],
  teamContribution: [],
  profitabilityAnalysis: [],
  orgCustomerProfit: [],
  hqCustomerItemProfit: [],
  customerItemDetail: [],
  itemCostDetail: [],
  itemProfitability: [],
  receivableAging: new Map(),
  inventoryMovement: new Map(),
  uploadedFiles: [],
  isLoading: false,
  loadingProgress: null,
  hasStoredData: false,

  setOrganizations: (orgs) => {
    set({ organizations: orgs });
    saveDataset("organizations", orgs).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setOrgCodes: (codes) => {
    set({ orgCodes: codes });
    // orgCodes는 orgFilter에 함께 저장
    const state = get();
    persistOrgFilter(state.orgNames, codes);
  },
  setOrgNames: (names) => {
    set({ orgNames: names });
    // orgNames는 orgFilter에 함께 저장
    const state = get();
    persistOrgFilter(names, state.orgCodes);
  },
  setSalesList: (data) => {
    set({ salesList: data });
    saveDataset("salesList", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setCollectionList: (data) => {
    set({ collectionList: data });
    saveDataset("collectionList", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setOrderList: (data) => {
    set({ orderList: data });
    saveDataset("orderList", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setOrgProfit: (data) => {
    set({ orgProfit: data });
    saveDataset("orgProfit", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setTeamContribution: (data) => {
    set({ teamContribution: data });
    saveDataset("teamContribution", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setProfitabilityAnalysis: (data) => {
    set({ profitabilityAnalysis: data });
    saveDataset("profitabilityAnalysis", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setOrgCustomerProfit: (data) => {
    set({ orgCustomerProfit: data });
    saveDataset("orgCustomerProfit", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setHqCustomerItemProfit: (data) => {
    set({ hqCustomerItemProfit: data });
    saveDataset("hqCustomerItemProfit", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setCustomerItemDetail: (data) => {
    set({ customerItemDetail: data });
    saveDataset("customerItemDetail", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setItemCostDetail: (data) => {
    set({ itemCostDetail: data });
    saveDataset("itemCostDetail", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setItemProfitability: (data) => {
    set({ itemProfitability: data });
    saveDataset("itemProfitability", data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setReceivableAging: (source, data) => {
    set((s) => {
      const next = new Map(s.receivableAging);
      next.set(source, data);
      return { receivableAging: next };
    });
    saveAgingData(source, data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  setInventoryMovement: (factory, data) => {
    set((s) => {
      const next = new Map(s.inventoryMovement);
      next.set(factory, data);
      return { inventoryMovement: next };
    });
    saveInventoryData(factory, data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
  },
  addUploadedFile: (file) =>
    set((s) => {
      const next = [...s.uploadedFiles, file];
      persistUploadedFiles(next);
      return { uploadedFiles: next };
    }),
  updateUploadedFile: (id, updates) =>
    set((s) => {
      const next = s.uploadedFiles.map((f) => (f.id === id ? { ...f, ...updates } : f));
      persistUploadedFiles(next);
      return { uploadedFiles: next };
    }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
  clearAllData: () => {
    clearAllDB().catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    set({
      organizations: [],
      orgCodes: new Set(),
      orgNames: new Set(DEFAULT_INFRA_ORG_NAMES),
      salesList: [],
      collectionList: [],
      orderList: [],
      orgProfit: [],
      teamContribution: [],
      profitabilityAnalysis: [],
      orgCustomerProfit: [],
      hqCustomerItemProfit: [],
      customerItemDetail: [],
      itemCostDetail: [],
      itemProfitability: [],
      receivableAging: new Map(),
      inventoryMovement: new Map(),
      uploadedFiles: [],
      hasStoredData: false,
    });
  },

  restoreFromDB: async () => {
    set({ isLoading: true });
    try {
      const stored = await checkStoredData();
      if (!stored) {
        set({ isLoading: false, hasStoredData: false });
        return;
      }

      // 모든 데이터를 병렬로 로드
      const [
        organizations,
        salesList,
        collectionList,
        orderList,
        orgProfit,
        teamContribution,
        profitabilityAnalysis,
        orgCustomerProfit,
        hqCustomerItemProfit,
        customerItemDetail,
        itemCostDetail,
        itemProfitability,
        agingMap,
        inventoryMap,
        storedFiles,
        orgFilter,
      ] = await Promise.all([
        loadDataset("organizations"),
        loadDataset("salesList"),
        loadDataset("collectionList"),
        loadDataset("orderList"),
        loadDataset("orgProfit"),
        loadDataset("teamContribution"),
        loadDataset("profitabilityAnalysis"),
        loadDataset("orgCustomerProfit"),
        loadDataset("hqCustomerItemProfit"),
        loadDataset("customerItemDetail"),
        loadDataset("itemCostDetail"),
        loadDataset("itemProfitability"),
        loadAllAgingData(),
        loadAllInventoryData(),
        loadUploadedFiles(),
        loadOrgFilter(),
      ]);

      // uploadedFiles: 저장된 uploadedAt 문자열 → Date 변환
      const uploadedFiles: UploadedFile[] = storedFiles.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType as UploadedFile["fileType"],
        uploadedAt: new Date(f.uploadedAt),
        rowCount: f.rowCount,
        status: f.status as UploadedFile["status"],
        warnings: f.warnings,
        filterInfo: f.filterInfo,
        skippedRows: f.skippedRows,
      }));

      // orgFilter 복원
      const orgNames = orgFilter
        ? new Set<string>(orgFilter.orgNames)
        : new Set(DEFAULT_INFRA_ORG_NAMES);
      const orgCodes = orgFilter
        ? new Set<string>(orgFilter.orgCodes)
        : new Set<string>();

      set({
        organizations: (organizations as Organization[]) ?? [],
        salesList: (salesList as SalesRecord[]) ?? [],
        collectionList: (collectionList as CollectionRecord[]) ?? [],
        orderList: (orderList as OrderRecord[]) ?? [],
        orgProfit: (orgProfit as OrgProfitRecord[]) ?? [],
        teamContribution: (teamContribution as TeamContributionRecord[]) ?? [],
        profitabilityAnalysis: (profitabilityAnalysis as ProfitabilityAnalysisRecord[]) ?? [],
        orgCustomerProfit: (orgCustomerProfit as OrgCustomerProfitRecord[]) ?? [],
        hqCustomerItemProfit: (hqCustomerItemProfit as HqCustomerItemProfitRecord[]) ?? [],
        customerItemDetail: (customerItemDetail as CustomerItemDetailRecord[]) ?? [],
        itemCostDetail: (itemCostDetail as ItemCostDetailRecord[]) ?? [],
        itemProfitability: (itemProfitability as ItemProfitabilityRecord[]) ?? [],
        receivableAging: agingMap,
        inventoryMovement: (() => {
          // 구 스키마(기초수량/기초금액 등) 데이터 검증 → 무효 시 빈 Map
          if (inventoryMap.size > 0) {
            const firstEntries = Array.from(inventoryMap.values())[0];
            if (firstEntries && firstEntries.length > 0) {
              const sample = firstEntries[0];
              if (typeof sample.기초 !== "number") {
                console.warn("Stale inventory data detected, skipping restore");
                return new Map();
              }
            }
          }
          return inventoryMap;
        })(),
        uploadedFiles,
        orgNames,
        orgCodes,
        isLoading: false,
        hasStoredData: true,
      });
    } catch (err) {
      console.error("[IndexedDB] restoreFromDB 실패:", err);
      set({ isLoading: false, hasStoredData: false });
    }
  },

  persistToDB: () => {
    const state = get();
    // 모든 데이터셋을 IndexedDB에 저장 (fire-and-forget)
    saveDataset("organizations", state.organizations).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("salesList", state.salesList).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("collectionList", state.collectionList).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("orderList", state.orderList).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("orgProfit", state.orgProfit).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("teamContribution", state.teamContribution).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("profitabilityAnalysis", state.profitabilityAnalysis).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("orgCustomerProfit", state.orgCustomerProfit).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("hqCustomerItemProfit", state.hqCustomerItemProfit).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("customerItemDetail", state.customerItemDetail).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("itemCostDetail", state.itemCostDetail).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    saveDataset("itemProfitability", state.itemProfitability).catch(err => console.warn('[IndexedDB] 저장 실패:', err));

    // Aging 데이터: 소스별로 저장
    Array.from(state.receivableAging.entries()).forEach(([source, data]) => {
      saveAgingData(source, data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    });

    // Inventory 데이터: 공장별로 저장
    Array.from(state.inventoryMovement.entries()).forEach(([factory, data]) => {
      saveInventoryData(factory, data).catch(err => console.warn('[IndexedDB] 저장 실패:', err));
    });

    // 업로드 파일 목록 저장
    persistUploadedFiles(state.uploadedFiles);

    // 조직 필터 저장
    persistOrgFilter(state.orgNames, state.orgCodes);
  },
}));

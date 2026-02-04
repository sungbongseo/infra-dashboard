import { create } from "zustand";
import type {
  SalesRecord,
  CollectionRecord,
  OrderRecord,
  OrgProfitRecord,
  TeamContributionRecord,
  ProfitabilityAnalysisRecord,
  ReceivableAgingRecord,
  CustomerLedgerRecord,
  Organization,
  UploadedFile,
} from "@/types";

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
  receivableAging: Map<string, ReceivableAgingRecord[]>;
  customerLedger: CustomerLedgerRecord[];
  uploadedFiles: UploadedFile[];
  isLoading: boolean;
  loadingProgress: { fileName: string; progress: number } | null;

  setOrganizations: (orgs: Organization[]) => void;
  setOrgCodes: (codes: Set<string>) => void;
  setOrgNames: (names: Set<string>) => void;
  setSalesList: (data: SalesRecord[]) => void;
  setCollectionList: (data: CollectionRecord[]) => void;
  setOrderList: (data: OrderRecord[]) => void;
  setOrgProfit: (data: OrgProfitRecord[]) => void;
  setTeamContribution: (data: TeamContributionRecord[]) => void;
  setProfitabilityAnalysis: (data: ProfitabilityAnalysisRecord[]) => void;
  setReceivableAging: (source: string, data: ReceivableAgingRecord[]) => void;
  setCustomerLedger: (data: CustomerLedgerRecord[]) => void;
  addUploadedFile: (file: UploadedFile) => void;
  updateUploadedFile: (id: string, updates: Partial<UploadedFile>) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingProgress: (progress: { fileName: string; progress: number } | null) => void;
  clearAllData: () => void;
}

export const useDataStore = create<DataState>((set) => ({
  organizations: [],
  orgCodes: new Set(),
  orgNames: new Set(),
  salesList: [],
  collectionList: [],
  orderList: [],
  orgProfit: [],
  teamContribution: [],
  profitabilityAnalysis: [],
  receivableAging: new Map(),
  customerLedger: [],
  uploadedFiles: [],
  isLoading: false,
  loadingProgress: null,

  setOrganizations: (orgs) => set({ organizations: orgs }),
  setOrgCodes: (codes) => set({ orgCodes: codes }),
  setOrgNames: (names) => set({ orgNames: names }),
  setSalesList: (data) => set({ salesList: data }),
  setCollectionList: (data) => set({ collectionList: data }),
  setOrderList: (data) => set({ orderList: data }),
  setOrgProfit: (data) => set({ orgProfit: data }),
  setTeamContribution: (data) => set({ teamContribution: data }),
  setProfitabilityAnalysis: (data) => set({ profitabilityAnalysis: data }),
  setReceivableAging: (source, data) =>
    set((s) => {
      const next = new Map(s.receivableAging);
      next.set(source, data);
      return { receivableAging: next };
    }),
  setCustomerLedger: (data) => set({ customerLedger: data }),
  addUploadedFile: (file) => set((s) => ({ uploadedFiles: [...s.uploadedFiles, file] })),
  updateUploadedFile: (id, updates) =>
    set((s) => ({
      uploadedFiles: s.uploadedFiles.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    })),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setLoadingProgress: (progress) => set({ loadingProgress: progress }),
  clearAllData: () =>
    set({
      organizations: [],
      orgCodes: new Set(),
      orgNames: new Set(),
      salesList: [],
      collectionList: [],
      orderList: [],
      orgProfit: [],
      teamContribution: [],
      profitabilityAnalysis: [],
      receivableAging: new Map(),
      customerLedger: [],
      uploadedFiles: [],
    }),
}));

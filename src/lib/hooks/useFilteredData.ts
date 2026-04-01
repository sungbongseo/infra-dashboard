"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import {
  filterByOrg,
  filterByDateRange,
  filterByMonth,
  filterOrgProfitLeafOnly,
  aggregateOrgProfit,
  aggregateTeamContribution,
  aggregateOrgCustomerProfit,
  aggregateHqCustomerItemProfit,
  aggregateCustomerItemDetail,
  aggregateItemCostDetail,
  aggregateProfitabilityAnalysis,
  aggregateItemProfitability,
} from "@/lib/utils";
import type { ReceivableAgingRecord, InventoryMovementRecord } from "@/types";

/**
 * 공통 필터링 훅 - 모든 대시보드 페이지의 데이터 필터링 패턴을 통합
 *
 * 사용법:
 * const { effectiveOrgNames, dateRange, comparisonRange } = useFilterContext();
 * const { filteredSales } = useFilteredSales();
 */

/** 거래처명 필드로 데이터를 필터링하는 헬퍼 */
function filterByCustomer<T extends Record<string, any>>(
  data: T[],
  selectedCustomers: string[],
  customerField: string,
): T[] {
  if (!selectedCustomers || selectedCustomers.length === 0) return data;
  const customerSet = new Set(selectedCustomers);
  return data.filter((row) => customerSet.has(row[customerField] as string));
}

// ─── 필터 컨텍스트 ────────────────────────────────────────────────

export function useFilterContext() {
  const orgNames = useDataStore((s) => s.orgNames);
  const selectedOrgs = useFilterStore((s) => s.selectedOrgs);
  const selectedCustomers = useFilterStore((s) => s.selectedCustomers);
  const dateRange = useFilterStore((s) => s.dateRange);
  const comparisonRange = useFilterStore((s) => s.comparisonRange);

  const effectiveOrgNames = useMemo(() => {
    return selectedOrgs && selectedOrgs.length > 0 ? new Set(selectedOrgs) : orgNames;
  }, [selectedOrgs, orgNames]);

  return { effectiveOrgNames, selectedCustomers, dateRange, comparisonRange, orgNames };
}

// ─── 매출 데이터 필터링 ────────────────────────────────────────────

export function useFilteredSales() {
  const salesList = useDataStore((s) => s.salesList);
  const { effectiveOrgNames, selectedCustomers, dateRange } = useFilterContext();

  const filteredSales = useMemo(() => {
    const orgFiltered = filterByOrg(salesList, effectiveOrgNames);
    const dateFiltered = filterByDateRange(orgFiltered, dateRange, "매출일");
    return filterByCustomer(dateFiltered, selectedCustomers, "매출처명");
  }, [salesList, effectiveOrgNames, dateRange, selectedCustomers]);

  return { filteredSales, salesList };
}

// ─── 수금 데이터 필터링 ────────────────────────────────────────────

export function useFilteredCollections() {
  const collectionList = useDataStore((s) => s.collectionList);
  const { effectiveOrgNames, selectedCustomers, dateRange } = useFilterContext();

  const filteredCollections = useMemo(() => {
    const orgFiltered = filterByOrg(collectionList, effectiveOrgNames);
    const dateFiltered = filterByDateRange(orgFiltered, dateRange, "수금일");
    return filterByCustomer(dateFiltered, selectedCustomers, "거래처명");
  }, [collectionList, effectiveOrgNames, dateRange, selectedCustomers]);

  return { filteredCollections, collectionList };
}

// ─── 수주 데이터 필터링 ────────────────────────────────────────────

export function useFilteredOrders() {
  const orderList = useDataStore((s) => s.orderList);
  const { effectiveOrgNames, selectedCustomers, dateRange } = useFilterContext();

  const filteredOrders = useMemo(() => {
    const orgFiltered = filterByOrg(orderList, effectiveOrgNames);
    const dateFiltered = filterByDateRange(orgFiltered, dateRange, "수주일");
    return filterByCustomer(dateFiltered, selectedCustomers, "판매처명");
  }, [orderList, effectiveOrgNames, dateRange, selectedCustomers]);

  return { filteredOrders, orderList };
}

// ─── 미수금 데이터 (Map 기반) ──────────────────────────────────────

export function useFilteredReceivables() {
  const receivableAging = useDataStore((s) => s.receivableAging);
  const { effectiveOrgNames } = useFilterContext();

  const filteredAgingMap = useMemo(() => {
    const filtered = new Map<string, ReceivableAgingRecord[]>();
    for (const [key, records] of Array.from(receivableAging.entries())) {
      const filteredRecords = filterByOrg(records, effectiveOrgNames, "영업조직");
      if (filteredRecords.length > 0) {
        filtered.set(key, filteredRecords);
      }
    }
    return filtered;
  }, [receivableAging, effectiveOrgNames]);

  const filteredRecords = useMemo(() => {
    const records: ReceivableAgingRecord[] = [];
    Array.from(filteredAgingMap.values()).forEach((arr) => records.push(...arr));
    return records;
  }, [filteredAgingMap]);

  return { filteredRecords, filteredAgingMap, receivableAging };
}

// ─── 조직손익 데이터 필터링 (소계 제거 + 합산) ────────────────────

export function useFilteredOrgProfit() {
  const orgProfit = useDataStore((s) => s.orgProfit);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredOrgProfit = useMemo(() => {
    const orgFiltered = filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    const leafOnly = filterOrgProfitLeafOnly(monthFiltered);
    return aggregateOrgProfit(leafOnly);
  }, [orgProfit, effectiveOrgNames, dateRange]);

  return { filteredOrgProfit, orgProfit };
}

// ─── 팀기여도 데이터 필터링 ────────────────────────────────────────

export function useFilteredTeamContribution() {
  const teamContribution = useDataStore((s) => s.teamContribution);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredTeamContrib = useMemo(() => {
    const orgFiltered = filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    // 월별 시트 concat으로 동일 (사번, 조직)이 중복되므로 합산
    return aggregateTeamContribution(monthFiltered);
  }, [teamContribution, effectiveOrgNames, dateRange]);

  return { filteredTeamContrib, teamContribution };
}

// ─── 거래처손익 데이터 필터링 ──────────────────────────────────────

export function useFilteredOrgCustomerProfit() {
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const { effectiveOrgNames, selectedCustomers, dateRange } = useFilterContext();

  const filteredOrgCustomerProfit = useMemo(() => {
    const orgFiltered = filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    const custFiltered = filterByCustomer(monthFiltered, selectedCustomers, "매출거래처명");
    return aggregateOrgCustomerProfit(custFiltered);
  }, [orgCustomerProfit, effectiveOrgNames, selectedCustomers, dateRange]);

  return { filteredOrgCustomerProfit, orgCustomerProfit };
}

// ─── 거래처별 품목별 손익 (100) ────────────────────────────────────

export function useFilteredCustomerItemDetail() {
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);
  const { effectiveOrgNames, selectedCustomers, dateRange } = useFilterContext();

  const filteredCustomerItemDetail = useMemo(() => {
    const orgFiltered = filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀");
    const custFiltered = filterByCustomer(orgFiltered, selectedCustomers, "매출거래처명");
    const dateFiltered = (!dateRange || !dateRange.from || !dateRange.to)
      ? custFiltered
      : filterByDateRange(custFiltered, dateRange, "매출연월");
    return aggregateCustomerItemDetail(dateFiltered);
  }, [customerItemDetail, effectiveOrgNames, selectedCustomers, dateRange]);

  return { filteredCustomerItemDetail, customerItemDetail };
}

// ─── 품목별 매출원가 상세 ──────────────────────────────────────────

export function useFilteredItemCostDetail() {
  const itemCostDetail = useDataStore((s) => s.itemCostDetail);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredItemCostDetail = useMemo(() => {
    const orgFiltered = filterByOrg(itemCostDetail, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateItemCostDetail(monthFiltered);
  }, [itemCostDetail, effectiveOrgNames, dateRange]);

  return { filteredItemCostDetail, itemCostDetail };
}

// ─── 본부 거래처 품목 손익 ─────────────────────────────────────────

export function useFilteredHqCustomerItemProfit() {
  const hqCustomerItemProfit = useDataStore((s) => s.hqCustomerItemProfit);
  const { effectiveOrgNames, selectedCustomers, dateRange } = useFilterContext();

  const filteredHqProfit = useMemo(() => {
    const orgFiltered = filterByOrg(hqCustomerItemProfit, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    const custFiltered = filterByCustomer(monthFiltered, selectedCustomers, "매출거래처명");
    return aggregateHqCustomerItemProfit(custFiltered);
  }, [hqCustomerItemProfit, effectiveOrgNames, selectedCustomers, dateRange]);

  return { filteredHqProfit, hqCustomerItemProfit };
}

// ─── 조직 품목 화이트리스트 (재고 간접 필터용) ────────────────────

export interface OrgFilterStats {
  totalCount: number;
  matchedCount: number;
  sharedCount: number;
  isOrgFiltered: boolean;
}

/**
 * 조직 필터된 매출/원가/수익성 데이터에서 품목 코드를 추출하여 화이트리스트 생성.
 * 재고 데이터에는 영업조직 필드가 없으므로, 이 화이트리스트로 간접 필터링.
 */
export function useOrgItemWhitelist(): { orgItemCodes: Set<string>; isOrgFiltered: boolean } {
  const { filteredSales } = useFilteredSales();
  const { filteredItemCostDetail } = useFilteredItemCostDetail();
  const { filteredItemProfit } = useFilteredItemProfitability();
  const orgNames = useDataStore((s) => s.orgNames);

  // 조직 필터 활성 판정: orgNames가 비어있지 않으면 항상 필터 (DEFAULT_INFRA_ORG_NAMES 포함)
  // (매출/수주 등은 orgNames가 비어있지 않으면 항상 필터되므로 재고도 동일하게 적용)
  const isOrgFiltered = orgNames.size > 0;

  const orgItemCodes = useMemo(() => {
    if (!isOrgFiltered) return new Set<string>();

    const codes = new Set<string>();

    // Source 1: 매출 데이터 (품목 코드)
    for (const r of filteredSales) {
      const code = (r.품목 || "").trim();
      if (code) codes.add(code);
      // 품목명도 추가 (재고 데이터와 품목명 매칭용)
      const name = (r.품목명 || "").trim();
      if (name) codes.add(name);
    }

    // Source 2: 품목별 매출원가 상세 (품목 코드)
    for (const r of filteredItemCostDetail) {
      const code = ((r as any).품목 || "").trim();
      if (code) codes.add(code);
    }

    // Source 3: 품목별 수익성 (200) — [CODE] NAME 형식에서 코드 추출
    for (const r of filteredItemProfit) {
      const raw = ((r as any).품목 || "").trim();
      if (!raw) continue;
      const match = raw.match(/^\[([^\]]+)\]/);
      if (match) codes.add(match[1].trim());
      else codes.add(raw);
    }

    return codes;
  }, [filteredSales, filteredItemCostDetail, filteredItemProfit, isOrgFiltered]);

  return { orgItemCodes, isOrgFiltered };
}

// ─── 재고 수불 데이터 (Map 기반 + 월별/조직 필터) ─────────────────

export function useFilteredInventory() {
  const inventoryMovement = useDataStore((s) => s.inventoryMovement);
  const { dateRange } = useFilterContext();
  const { orgItemCodes, isOrgFiltered } = useOrgItemWhitelist();

  const { filteredInventoryMap, sharedInventoryMap, orgFilterStats } = useMemo(() => {
    const filtered = new Map<string, InventoryMovementRecord[]>();
    const shared = new Map<string, InventoryMovementRecord[]>();
    let totalCount = 0;
    let matchedCount = 0;
    let sharedCount = 0;

    for (const [factory, records] of Array.from(inventoryMovement.entries())) {
      const monthFiltered = filterByMonth(records, dateRange);
      if (monthFiltered.length === 0) continue;

      if (!isOrgFiltered) {
        filtered.set(factory, monthFiltered);
        totalCount += monthFiltered.length;
        continue;
      }

      const orgMatched: InventoryMovementRecord[] = [];
      const orgShared: InventoryMovementRecord[] = [];

      for (const r of monthFiltered) {
        totalCount++;
        const code = (r.품목 || "").trim();
        const name = (r.품목명 || "").trim();
        if (orgItemCodes.has(code) || orgItemCodes.has(name)) {
          orgMatched.push(r);
          matchedCount++;
        } else {
          orgShared.push(r);
          sharedCount++;
        }
      }

      if (orgMatched.length > 0) filtered.set(factory, orgMatched);
      if (orgShared.length > 0) shared.set(factory, orgShared);
    }

    return {
      filteredInventoryMap: filtered,
      sharedInventoryMap: shared,
      orgFilterStats: { totalCount, matchedCount, sharedCount, isOrgFiltered } as OrgFilterStats,
    };
  }, [inventoryMovement, dateRange, orgItemCodes, isOrgFiltered]);

  const filteredInventoryRecords = useMemo(() => {
    const records: InventoryMovementRecord[] = [];
    Array.from(filteredInventoryMap.values()).forEach((arr) => records.push(...arr));
    return records;
  }, [filteredInventoryMap]);

  const sharedInventoryRecords = useMemo(() => {
    const records: InventoryMovementRecord[] = [];
    Array.from(sharedInventoryMap.values()).forEach((arr) => records.push(...arr));
    return records;
  }, [sharedInventoryMap]);

  return { filteredInventoryRecords, filteredInventoryMap, sharedInventoryRecords, sharedInventoryMap, orgFilterStats, inventoryMovement };
}

// ─── 수익성분석 (901) ─────────────────────────────────────────────

export function useFilteredProfitabilityAnalysis() {
  const profitabilityAnalysis = useDataStore((s) => s.profitabilityAnalysis);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredProfAnalysis = useMemo(() => {
    const orgFiltered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateProfitabilityAnalysis(monthFiltered);
  }, [profitabilityAnalysis, effectiveOrgNames, dateRange]);

  return { filteredProfAnalysis, profitabilityAnalysis };
}

// ─── 품목별 수익성 (200) ──────────────────────────────────────────

export function useFilteredItemProfitability() {
  const itemProfitability = useDataStore((s) => s.itemProfitability);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredItemProfit = useMemo(() => {
    const orgFiltered = filterByOrg(itemProfitability, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateItemProfitability(monthFiltered);
  }, [itemProfitability, effectiveOrgNames, dateRange]);

  return { filteredItemProfit, itemProfitability };
}

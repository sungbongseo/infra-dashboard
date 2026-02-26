"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import {
  filterByOrg,
  filterByDateRange,
  filterOrgProfitLeafOnly,
  aggregateOrgProfit,
} from "@/lib/utils";
import type { ReceivableAgingRecord } from "@/types";

/**
 * 공통 필터링 훅 - 모든 대시보드 페이지의 데이터 필터링 패턴을 통합
 *
 * 사용법:
 * const { effectiveOrgNames, dateRange, comparisonRange } = useFilterContext();
 * const { filteredSales } = useFilteredSales();
 */

// ─── 필터 컨텍스트 ────────────────────────────────────────────────

export function useFilterContext() {
  const orgNames = useDataStore((s) => s.orgNames);
  const selectedOrgs = useFilterStore((s) => s.selectedOrgs);
  const dateRange = useFilterStore((s) => s.dateRange);
  const comparisonRange = useFilterStore((s) => s.comparisonRange);

  const effectiveOrgNames = useMemo(() => {
    return selectedOrgs && selectedOrgs.length > 0 ? new Set(selectedOrgs) : orgNames;
  }, [selectedOrgs, orgNames]);

  return { effectiveOrgNames, dateRange, comparisonRange, orgNames };
}

// ─── 매출 데이터 필터링 ────────────────────────────────────────────

export function useFilteredSales() {
  const salesList = useDataStore((s) => s.salesList);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredSales = useMemo(() => {
    const orgFiltered = filterByOrg(salesList, effectiveOrgNames);
    return filterByDateRange(orgFiltered, dateRange, "매출일");
  }, [salesList, effectiveOrgNames, dateRange]);

  return { filteredSales, salesList };
}

// ─── 수금 데이터 필터링 ────────────────────────────────────────────

export function useFilteredCollections() {
  const collectionList = useDataStore((s) => s.collectionList);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredCollections = useMemo(() => {
    const orgFiltered = filterByOrg(collectionList, effectiveOrgNames);
    return filterByDateRange(orgFiltered, dateRange, "수금일");
  }, [collectionList, effectiveOrgNames, dateRange]);

  return { filteredCollections, collectionList };
}

// ─── 수주 데이터 필터링 ────────────────────────────────────────────

export function useFilteredOrders() {
  const orderList = useDataStore((s) => s.orderList);
  const { effectiveOrgNames, dateRange } = useFilterContext();

  const filteredOrders = useMemo(() => {
    const orgFiltered = filterByOrg(orderList, effectiveOrgNames);
    return filterByDateRange(orgFiltered, dateRange, "수주일");
  }, [orderList, effectiveOrgNames, dateRange]);

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
  const { effectiveOrgNames } = useFilterContext();

  const filteredOrgProfit = useMemo(() => {
    const orgFiltered = filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀");
    const leafOnly = filterOrgProfitLeafOnly(orgFiltered);
    return aggregateOrgProfit(leafOnly);
  }, [orgProfit, effectiveOrgNames]);

  return { filteredOrgProfit, orgProfit };
}

// ─── 팀기여도 데이터 필터링 ────────────────────────────────────────

export function useFilteredTeamContribution() {
  const teamContribution = useDataStore((s) => s.teamContribution);
  const { effectiveOrgNames } = useFilterContext();

  const filteredTeamContrib = useMemo(() => {
    return filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀");
  }, [teamContribution, effectiveOrgNames]);

  return { filteredTeamContrib, teamContribution };
}

// ─── 거래처손익 데이터 필터링 ──────────────────────────────────────

export function useFilteredOrgCustomerProfit() {
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const { effectiveOrgNames } = useFilterContext();

  const filteredOrgCustomerProfit = useMemo(() => {
    return filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀");
  }, [orgCustomerProfit, effectiveOrgNames]);

  return { filteredOrgCustomerProfit, orgCustomerProfit };
}

// ─── 품목별 매출원가 상세 ──────────────────────────────────────────

export function useFilteredItemCostDetail() {
  const itemCostDetail = useDataStore((s) => s.itemCostDetail);
  const { effectiveOrgNames } = useFilterContext();

  const filteredItemCostDetail = useMemo(() => {
    return filterByOrg(itemCostDetail, effectiveOrgNames, "영업조직팀");
  }, [itemCostDetail, effectiveOrgNames]);

  return { filteredItemCostDetail, itemCostDetail };
}

// ─── 본부 거래처 품목 손익 ─────────────────────────────────────────

export function useFilteredHqCustomerItemProfit() {
  const hqCustomerItemProfit = useDataStore((s) => s.hqCustomerItemProfit);
  const { effectiveOrgNames } = useFilterContext();

  const filteredHqProfit = useMemo(() => {
    return filterByOrg(hqCustomerItemProfit, effectiveOrgNames, "영업조직팀");
  }, [hqCustomerItemProfit, effectiveOrgNames]);

  return { filteredHqProfit, hqCustomerItemProfit };
}

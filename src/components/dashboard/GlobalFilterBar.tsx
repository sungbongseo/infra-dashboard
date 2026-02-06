"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import type { ComparisonPreset } from "@/stores/filterStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as Popover from "@radix-ui/react-popover";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Filter, X, Building2, Calendar, Check, GitCompareArrows } from "lucide-react";

export function GlobalFilterBar() {
  const orgNames = useDataStore((s) => s.orgNames);
  const {
    selectedOrgs,
    dateRange,
    comparisonRange,
    comparisonPreset,
    setSelectedOrgs,
    setDateRange,
    setComparisonRange,
    applyComparisonPreset,
    resetFilters,
  } = useFilterStore();

  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);

  const orgList = useMemo(() => Array.from(orgNames).sort(), [orgNames]);

  const [compPopoverOpen, setCompPopoverOpen] = useState(false);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedOrgs.length > 0) count++;
    if (dateRange) count++;
    if (comparisonRange) count++;
    return count;
  }, [selectedOrgs, dateRange, comparisonRange]);

  const COMPARISON_PRESETS: { value: ComparisonPreset; label: string }[] = [
    { value: null, label: "비교 없음" },
    { value: "prev_month", label: "전월 대비" },
    { value: "prev_quarter", label: "전분기 대비" },
    { value: "prev_year", label: "전년 동기" },
    { value: "custom", label: "사용자 지정" },
  ];

  const handleOrgToggle = (org: string) => {
    if (selectedOrgs.includes(org)) {
      setSelectedOrgs(selectedOrgs.filter((o) => o !== org));
    } else {
      setSelectedOrgs([...selectedOrgs, org]);
    }
  };

  const handleSelectAllOrgs = () => {
    if (selectedOrgs.length === orgList.length) {
      setSelectedOrgs([]);
    } else {
      setSelectedOrgs([...orgList]);
    }
  };

  const handleDateFromChange = (value: string) => {
    if (!value) {
      if (!dateRange?.to) {
        setDateRange(null);
      } else {
        setDateRange({ from: "", to: dateRange.to });
      }
      return;
    }
    setDateRange({ from: value, to: dateRange?.to || value });
  };

  const handleDateToChange = (value: string) => {
    if (!value) {
      if (!dateRange?.from) {
        setDateRange(null);
      } else {
        setDateRange({ from: dateRange.from, to: "" });
      }
      return;
    }
    setDateRange({ from: dateRange?.from || value, to: value });
  };

  return (
    <div className="bg-card border-b px-6 py-3 flex items-center gap-3 flex-wrap">
      {/* Filter icon + label */}
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span>필터</span>
        {activeFilterCount > 0 && (
          <Badge variant="default" className="ml-1 h-5 min-w-[20px] flex items-center justify-center px-1.5 text-[10px]">
            {activeFilterCount}
          </Badge>
        )}
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-border" />

      {/* Organization multi-select */}
      <Popover.Root open={orgPopoverOpen} onOpenChange={setOrgPopoverOpen}>
        <Popover.Trigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" />
            <span>
              {selectedOrgs.length === 0
                ? "전체 조직"
                : selectedOrgs.length === 1
                ? selectedOrgs[0]
                : `${selectedOrgs.length}개 조직`}
            </span>
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 w-64 rounded-lg border bg-popover p-0 shadow-md animate-in fade-in-0 zoom-in-95"
            sideOffset={5}
            align="start"
          >
            {/* Select All */}
            <div className="border-b px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox.Root
                  className="h-4 w-4 shrink-0 rounded border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  checked={selectedOrgs.length === orgList.length && orgList.length > 0}
                  onCheckedChange={handleSelectAllOrgs}
                >
                  <Checkbox.Indicator className="flex items-center justify-center">
                    <Check className="h-3 w-3" />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                <span className="font-medium">전체 선택</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedOrgs.length}/{orgList.length}
                </span>
              </label>
            </div>
            {/* Org list */}
            <ScrollArea className="max-h-60">
              <div className="p-2 space-y-0.5">
                {orgList.map((org) => (
                  <label
                    key={org}
                    className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  >
                    <Checkbox.Root
                      className="h-4 w-4 shrink-0 rounded border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                      checked={selectedOrgs.includes(org)}
                      onCheckedChange={() => handleOrgToggle(org)}
                    >
                      <Checkbox.Indicator className="flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </Checkbox.Indicator>
                    </Checkbox.Root>
                    <span className="truncate">{org}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
            {/* Clear org selection */}
            {selectedOrgs.length > 0 && (
              <div className="border-t px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => setSelectedOrgs([])}
                >
                  조직 선택 해제
                </Button>
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="month"
          value={dateRange?.from || ""}
          onChange={(e) => handleDateFromChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="시작"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <input
          type="month"
          value={dateRange?.to || ""}
          onChange={(e) => handleDateToChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="종료"
        />
      </div>

      {/* Comparison period */}
      <div className="h-6 w-px bg-border" />
      <Popover.Root open={compPopoverOpen} onOpenChange={setCompPopoverOpen}>
        <Popover.Trigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <GitCompareArrows className="h-3.5 w-3.5" />
            <span>
              {comparisonPreset === "prev_month" ? "전월" :
               comparisonPreset === "prev_quarter" ? "전분기" :
               comparisonPreset === "prev_year" ? "전년" :
               comparisonPreset === "custom" ? "사용자지정" : "비교기간"}
            </span>
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="z-50 w-72 rounded-lg border bg-popover p-3 shadow-md animate-in fade-in-0 zoom-in-95"
            sideOffset={5}
            align="start"
          >
            <p className="text-xs font-medium text-muted-foreground mb-2">비교 기간 프리셋</p>
            <div className="space-y-1">
              {COMPARISON_PRESETS.map((p) => (
                <button
                  key={p.value ?? "none"}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                    comparisonPreset === p.value
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => {
                    applyComparisonPreset(p.value);
                    if (p.value !== "custom") setCompPopoverOpen(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {comparisonPreset === "custom" && (
              <div className="mt-3 pt-3 border-t space-y-2">
                <p className="text-xs text-muted-foreground">비교 기간 직접 입력</p>
                <div className="flex items-center gap-1.5">
                  <input
                    type="month"
                    value={comparisonRange?.from || ""}
                    onChange={(e) =>
                      setComparisonRange({
                        from: e.target.value,
                        to: comparisonRange?.to || e.target.value,
                      })
                    }
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">~</span>
                  <input
                    type="month"
                    value={comparisonRange?.to || ""}
                    onChange={(e) =>
                      setComparisonRange({
                        from: comparisonRange?.from || e.target.value,
                        to: e.target.value,
                      })
                    }
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}
            {comparisonRange && !dateRange && (
              <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400">
                기간 필터를 먼저 설정하면 프리셋이 자동 계산됩니다
              </p>
            )}
            {comparisonRange && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                비교: {comparisonRange.from || "?"} ~ {comparisonRange.to || "?"}
              </p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {/* Reset button */}
      {activeFilterCount > 0 && (
        <>
          <div className="h-6 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={resetFilters}
          >
            <X className="h-3.5 w-3.5" />
            필터 초기화
          </Button>
        </>
      )}

      {/* Active filter summary badges */}
      {selectedOrgs.length > 0 && (
        <Badge variant="secondary" className="text-[10px] gap-1 h-6">
          조직: {selectedOrgs.length}개
          <button
            onClick={() => setSelectedOrgs([])}
            className="ml-0.5 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {dateRange && (dateRange.from || dateRange.to) && (
        <Badge variant="secondary" className="text-[10px] gap-1 h-6">
          기간: {dateRange.from || "?"} ~ {dateRange.to || "?"}
          <button
            onClick={() => setDateRange(null)}
            className="ml-0.5 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {comparisonRange && (comparisonRange.from || comparisonRange.to) && (
        <Badge variant="secondary" className="text-[10px] gap-1 h-6">
          비교: {comparisonRange.from || "?"} ~ {comparisonRange.to || "?"}
          <button
            onClick={() => applyComparisonPreset(null)}
            className="ml-0.5 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
    </div>
  );
}

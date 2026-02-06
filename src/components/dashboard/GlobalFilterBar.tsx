"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as Popover from "@radix-ui/react-popover";
import * as Checkbox from "@radix-ui/react-checkbox";
import { Filter, X, Building2, Calendar, Check } from "lucide-react";

export function GlobalFilterBar() {
  const orgNames = useDataStore((s) => s.orgNames);
  const {
    selectedOrgs,
    dateRange,
    setSelectedOrgs,
    setDateRange,
    resetFilters,
  } = useFilterStore();

  const [orgPopoverOpen, setOrgPopoverOpen] = useState(false);

  const orgList = useMemo(() => Array.from(orgNames).sort(), [orgNames]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedOrgs.length > 0) count++;
    if (dateRange) count++;
    return count;
  }, [selectedOrgs, dateRange]);

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
    </div>
  );
}

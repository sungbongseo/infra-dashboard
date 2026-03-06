"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface TabGroupDef {
  id: string;
  label: string;
  tabs: string[];
}

interface TabGroupProps {
  groups: TabGroupDef[];
  activeTab: string;
  onGroupChange?: (groupId: string) => void;
}

/**
 * 2-level 탭 네비게이션 — 상위 카테고리 그룹 pill 버튼
 * 선택된 그룹의 하위 탭만 TabsList에 표시되도록 필터링 용도로 사용
 */
export function TabGroup({ groups, activeTab, onGroupChange }: TabGroupProps) {
  const activeGroup = groups.find((g) => g.tabs.includes(activeTab)) || groups[0];
  const [selectedGroupId, setSelectedGroupId] = useState(activeGroup?.id || groups[0]?.id);

  const handleGroupClick = (groupId: string) => {
    setSelectedGroupId(groupId);
    onGroupChange?.(groupId);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap mb-2">
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => handleGroupClick(g.id)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
            selectedGroupId === g.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {g.label}
          <span className="ml-1 opacity-60">({g.tabs.length})</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 현재 선택된 그룹의 탭 목록을 반환하는 훅
 */
export function useTabGroup(groups: TabGroupDef[], activeTab: string) {
  const activeGroup = groups.find((g) => g.tabs.includes(activeTab)) || groups[0];
  return {
    activeGroupId: activeGroup?.id || groups[0]?.id,
    visibleTabs: new Set(activeGroup?.tabs || []),
  };
}

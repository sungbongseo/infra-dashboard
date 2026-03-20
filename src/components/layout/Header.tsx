"use client";

import { useMemo } from "react";
import { Moon, Sun, Menu, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/uiStore";
import { useDataStore } from "@/stores/dataStore";
import { AlertPanel } from "@/components/dashboard/AlertPanel";

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function Header() {
  const { darkMode, toggleDarkMode, toggleSidebar, sidebarOpen } = useUIStore();
  const setPresentationMode = useUIStore((s) => s.setPresentationMode);
  const { uploadedFiles } = useDataStore();

  const readyCount = uploadedFiles.filter((f) => f.status === "ready").length;

  const lastUploadLabel = useMemo(() => {
    if (uploadedFiles.length === 0) return null;
    const latest = uploadedFiles.reduce((a, b) =>
      new Date(b.uploadedAt).getTime() > new Date(a.uploadedAt).getTime() ? b : a
    );
    return formatTimeAgo(new Date(latest.uploadedAt));
  }, [uploadedFiles]);

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6"
      style={{ marginLeft: sidebarOpen ? 256 : 64 }}
    >
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar} aria-label="메뉴 열기/닫기">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1">
        <h1 className="text-lg font-semibold">영업 대시보드</h1>
      </div>

      <div className="flex items-center gap-3">
        {readyCount > 0 && (
          <span className="text-xs text-muted-foreground">
            데이터: {readyCount}개 파일 로드됨
          </span>
        )}
        {lastUploadLabel && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            마지막 업로드: {lastUploadLabel}
          </span>
        )}
        <AlertPanel />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPresentationMode(true)}
          aria-label="발표 모드"
          title="발표 모드"
        >
          <Presentation className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}

"use client";

import { Moon, Sun, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/uiStore";
import { useDataStore } from "@/stores/dataStore";
import { AlertPanel } from "@/components/dashboard/AlertPanel";

export function Header() {
  const { darkMode, toggleDarkMode, toggleSidebar, sidebarOpen } = useUIStore();
  const { uploadedFiles } = useDataStore();

  const readyCount = uploadedFiles.filter((f) => f.status === "ready").length;

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6"
      style={{ marginLeft: sidebarOpen ? 256 : 64 }}
    >
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar}>
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
        <AlertPanel />
        <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}

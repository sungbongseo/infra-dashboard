"use client";

/**
 * /dashboard/glossary — 전사 지표 사전 페이지.
 *
 * 기능:
 * - 카테고리별 그리드 + 검색 필터
 * - 엔트리 클릭 시 상세 펼침 (beginner / intermediate / expert 3-레이어)
 * - 관련 지표(relatedIds) 상호 네비게이션
 *
 * 단일 소스(glossary.ts)를 기반으로 자동 렌더 — 새 엔트리 추가 시 여기는 수정 불필요.
 */

import { useMemo, useState } from "react";
import { Search, BookOpen } from "lucide-react";
import { GLOSSARY, type MetricCategory, type MetricEntry } from "@/lib/metrics/glossary";

const CATEGORY_LABELS: Record<MetricCategory, { name: string; emoji: string; color: string }> = {
  overview: { name: "전체 개요", emoji: "📊", color: "blue" },
  sales: { name: "매출 분석", emoji: "💰", color: "green" },
  profitability: { name: "수익성 분석", emoji: "📈", color: "purple" },
  receivables: { name: "미수금 관리", emoji: "💳", color: "amber" },
  orders: { name: "수주·수금", emoji: "📦", color: "sky" },
  profiles: { name: "영업사원 성과", emoji: "👥", color: "rose" },
};

export default function GlossaryPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MetricCategory | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [level, setLevel] = useState<"beginner" | "intermediate" | "expert">("intermediate");

  const allEntries = useMemo(() => Object.values(GLOSSARY) as MetricEntry[], []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEntries.filter((e) => {
      if (selectedCategory !== "all" && e.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.beginner.toLowerCase().includes(q) ||
        e.intermediate.toLowerCase().includes(q)
      );
    });
  }, [allEntries, selectedCategory, search]);

  const byCategory = useMemo(() => {
    const map = new Map<MetricCategory, MetricEntry[]>();
    for (const e of filtered) {
      const prev = map.get(e.category) ?? [];
      prev.push(e);
      map.set(e.category, prev);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totalCount = allEntries.length;

  return (
    <div className="space-y-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">지표 사전 (Glossary)</h1>
          <p className="text-sm text-muted-foreground">
            대시보드에서 사용하는 {totalCount}개 지표의 정의·공식·해석을 한 곳에서 확인합니다.
          </p>
        </div>
      </div>

      {/* 검색 + 카테고리 필터 */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="지표명 / ID / 내용 검색..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${selectedCategory === "all" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            전체 ({totalCount})
          </button>
          {(Object.keys(CATEGORY_LABELS) as MetricCategory[]).map((cat) => {
            const count = allEntries.filter((e) => e.category === cat).length;
            if (count === 0) return null;
            const lbl = CATEGORY_LABELS[cat];
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${selectedCategory === cat ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {lbl.emoji} {lbl.name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 레벨 탭 */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">표시 레벨:</span>
        {(["beginner", "intermediate", "expert"] as const).map((lv) => {
          const label = lv === "beginner" ? "초급 (비유)" : lv === "intermediate" ? "중급 (공식+해석)" : "전문가 (출처+주의)";
          return (
            <button
              key={lv}
              onClick={() => setLevel(lv)}
              className={`px-2.5 py-1 rounded border transition-colors ${level === lv ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 결과 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          검색 결과가 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {byCategory.map(([cat, entries]) => (
            <div key={cat}>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span>{CATEGORY_LABELS[cat].emoji}</span>
                <span>{CATEGORY_LABELS[cat].name}</span>
                <span className="text-xs text-muted-foreground">({entries.length})</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {entries.map((entry) => {
                  const expanded = expandedId === entry.id;
                  const text =
                    level === "beginner" ? entry.beginner :
                    level === "expert" ? entry.expert : entry.intermediate;
                  return (
                    <button
                      key={entry.id}
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      className={`text-left rounded-lg border p-3 transition-colors ${expanded ? "bg-primary/5 border-primary/30" : "bg-background hover:bg-muted/40"}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-sm font-semibold">{entry.name}</h3>
                        <code className="text-[10px] text-muted-foreground">{entry.id}</code>
                      </div>
                      <p className="text-xs leading-relaxed whitespace-pre-line mb-2">{text}</p>
                      {expanded && (
                        <div className="space-y-2 pt-2 border-t">
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">📐 공식</p>
                            <p className="text-[11px] font-mono bg-muted/50 rounded px-2 py-1 leading-snug whitespace-pre-line">{entry.formula}</p>
                          </div>
                          {entry.benchmark && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">📏 분석 기준</p>
                              <p className="text-[11px]">{entry.benchmark}</p>
                            </div>
                          )}
                          {entry.commonMistakes && entry.commonMistakes.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-0.5">⚠️ 흔한 오해</p>
                              <ul className="text-[11px] list-disc pl-4 space-y-0.5 text-amber-800 dark:text-amber-300">
                                {entry.commonMistakes.map((m, i) => <li key={i}>{m}</li>)}
                              </ul>
                            </div>
                          )}
                          {entry.relatedIds && entry.relatedIds.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">🔗 관련 지표</p>
                              <ul className="text-[11px] space-y-0.5">
                                {entry.relatedIds.map((rid) => {
                                  const rel = (GLOSSARY as Record<string, MetricEntry>)[rid];
                                  return (
                                    <li key={rid}>
                                      · <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setExpandedId(rid); setSelectedCategory(rel?.category ?? "all"); }}
                                        className="text-primary hover:underline"
                                      >
                                        {rel?.name ?? rid}
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          )}
                          {entry.sourceNote && (
                            <p className="text-[10px] text-muted-foreground pt-1">📊 {entry.sourceNote}</p>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

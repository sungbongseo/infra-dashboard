"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { calcCustomerCompositeRisks, type CustomerCompositeRisk } from "@/lib/analysis/customerCompositeRisk";
import { generateNegotiationMemo, type NegotiationMemo } from "@/lib/analysis/negotiationMemoGenerator";
import { formatCurrency } from "@/lib/utils";
import type { ReceivableAgingRecord, CustomerItemDetailRecord } from "@/types";
import { ChevronDown, ChevronRight, Printer, AlertTriangle, AlertCircle } from "lucide-react";

// ─── Props ──────────────────────────────────────────

interface NegotiationPriorityTabProps {
  agingMap: Map<string, ReceivableAgingRecord[]>;
  customerItemDetail: CustomerItemDetailRecord[];
}

// ─── 카테고리 색상 매핑 ──────────────────────────────

const CATEGORY_STYLE: Record<CustomerCompositeRisk["category"], {
  bg: string; text: string; icon: typeof AlertTriangle;
}> = {
  거래중단: {
    bg: "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-700",
    text: "text-red-700 dark:text-red-300",
    icon: AlertTriangle,
  },
  "회수+단가": {
    bg: "bg-amber-100 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700",
    text: "text-amber-700 dark:text-amber-300",
    icon: AlertCircle,
  },
  단가조정: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-700",
    text: "text-yellow-700 dark:text-yellow-400",
    icon: AlertCircle,
  },
  정상: {
    bg: "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700",
    text: "text-green-700 dark:text-green-300",
    icon: AlertCircle,
  },
};

function categoryEmoji(c: CustomerCompositeRisk["category"]): string {
  switch (c) {
    case "거래중단": return "🚨🚨";
    case "회수+단가": return "🚨";
    case "단가조정": return "⚠";
    case "정상": return "✅";
  }
}

// ─── 한 거래처 카드 (expandable) ────────────────────

function CustomerRiskCard({
  rank, risk, memo, isSelected, isExpanded, onToggleSelect, onToggleExpand,
}: {
  rank: number;
  risk: CustomerCompositeRisk;
  memo: NegotiationMemo;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}) {
  const style = CATEGORY_STYLE[risk.category];
  const Icon = style.icon;
  const m = risk.metrics;

  return (
    <div className={`border-2 rounded-lg ${style.bg} transition-all ${isSelected ? "ring-2 ring-violet-500" : ""}`}>
      {/* 카드 헤더 */}
      <div className="p-3 flex items-center gap-3 flex-wrap">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="h-4 w-4 accent-violet-600 cursor-pointer"
          title="협상 카드 PDF 일괄 출력 대상으로 선택"
        />
        <span className="text-sm font-mono text-muted-foreground w-6">#{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold truncate">{risk.거래처명}</span>
            <span className="text-xs font-mono text-muted-foreground">[{risk.거래처코드}]</span>
            <Badge variant="outline" className={`${style.text} text-xs`}>
              <Icon className="w-3 h-3 mr-1" />
              {categoryEmoji(risk.category)} {risk.category}
            </Badge>
            {risk.offices.length > 1 && (
              <Badge variant="outline" className="text-xs">
                {risk.offices.length}개 사무소
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {risk.영업조직} · 담당 {risk.담당자 || "(미지정)"} · 사무소 {risk.offices.join(", ")}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${style.text}`}>{risk.riskScore}</div>
          <div className="text-[10px] text-muted-foreground">위험점수</div>
        </div>
        <button
          onClick={onToggleExpand}
          className="px-2 py-1 rounded hover:bg-background/60 transition-colors"
          aria-label={isExpanded ? "축소" : "상세 펼치기"}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {/* 4 KPI 요약 (항상 표시) */}
      <div className="px-3 pb-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        <div className="bg-background/40 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">미수</div>
          <div className="font-mono font-semibold">{formatCurrency(m.totalReceivable)}</div>
        </div>
        <div className="bg-background/40 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">한도사용</div>
          <div className={`font-mono font-semibold ${m.creditUsageRate >= 0.9 ? "text-red-600 dark:text-red-400" : ""}`}>
            {(m.creditUsageRate * 100).toFixed(1)}%
          </div>
        </div>
        <div className="bg-background/40 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">
            {m.totalProfit13M < 0 ? "13M 적자" : "13M 영업이익"}
          </div>
          <div className={`font-mono font-semibold ${m.totalProfit13M < 0 ? "text-red-600 dark:text-red-400" : "text-green-600"}`}>
            {formatCurrency(m.totalProfit13M)}
          </div>
        </div>
        <div className="bg-background/40 rounded p-1.5">
          <div className="text-[10px] text-muted-foreground">장기연체 (6M+)</div>
          <div className={`font-mono font-semibold ${m.longOverdueRatio >= 0.3 ? "text-red-600 dark:text-red-400" : ""}`}>
            {formatCurrency(m.longOverdueAmount)} ({(m.longOverdueRatio * 100).toFixed(0)}%)
          </div>
        </div>
      </div>

      {/* 펼친 상세 (expandable) */}
      {isExpanded && (
        <div className="border-t border-border/40 p-3 space-y-3 bg-background/30">
          {/* 압박 근거 */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">📋 압박 근거 (자동 도출)</div>
            <ul className="space-y-0.5">
              {memo.pressurePoints.map((p, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="font-mono text-violet-600 dark:text-violet-400 shrink-0">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 협상 멘트 */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">🎤 권장 협상 멘트</div>
            <div className="text-xs italic bg-violet-50/50 dark:bg-violet-950/30 border-l-2 border-violet-500 rounded p-2 leading-relaxed">
              &ldquo;{memo.scriptedSentence}&rdquo;
            </div>
          </div>

          {/* 권장 액션 */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">🎯 권장 액션</div>
            <ol className="space-y-1">
              {memo.recommendedActions.map((a) => (
                <li key={a.rank} className="text-xs flex items-start gap-2 bg-background/60 rounded p-1.5">
                  <span className="font-bold text-violet-700 dark:text-violet-300 shrink-0">{a.rank}.</span>
                  <div className="flex-1">
                    <div className="font-medium">{a.action}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">→ {a.rationale}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* 추가 메트릭 */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="bg-background/40 rounded p-1.5">
              <div className="text-muted-foreground">적자 월</div>
              <div className="font-mono">{m.deficitMonthCount}/{m.monthCount} (최장 {m.consecutiveDeficitMonths}M)</div>
            </div>
            <div className="bg-background/40 rounded p-1.5">
              <div className="text-muted-foreground">매출 QoQ</div>
              <div className={`font-mono ${m.salesQoQ < -0.3 ? "text-red-600" : ""}`}>{(m.salesQoQ * 100).toFixed(1)}%</div>
            </div>
            <div className="bg-background/40 rounded p-1.5">
              <div className="text-muted-foreground">단일 품목</div>
              <div className="font-mono truncate" title={m.topItemName}>
                {m.itemHHI > 0 ? `${(m.topItemShare * 100).toFixed(0)}%` : "-"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 탭 컴포넌트 ───────────────────────────────

export function NegotiationPriorityTab({ agingMap, customerItemDetail }: NegotiationPriorityTabProps) {
  // UI 상태
  const [topN, setTopN] = useState(10);
  const [minScore, setMinScore] = useState(40);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  // 위험 점수 계산
  const allRisks = useMemo(() => {
    return calcCustomerCompositeRisks({ agingMap, customerItemDetail, minScore });
  }, [agingMap, customerItemDetail, minScore]);

  // 검색 필터 + Top N
  const visibleRisks = useMemo(() => {
    const filtered = searchTerm.trim()
      ? allRisks.filter(r =>
          r.거래처명.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.거래처코드.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : allRisks;
    return filtered.slice(0, topN);
  }, [allRisks, searchTerm, topN]);

  // 멘트 생성 (visibleRisks에 한해)
  const memos = useMemo(() => {
    const map = new Map<string, NegotiationMemo>();
    for (const r of visibleRisks) {
      map.set(r.거래처코드, generateNegotiationMemo(r));
    }
    return map;
  }, [visibleRisks]);

  // 선택된 거래처 (PDF Bulk export 대상)
  const selectedRisks = useMemo(
    () => visibleRisks.filter(r => selectedCodes.has(r.거래처코드)),
    [visibleRisks, selectedCodes]
  );

  // Helpers
  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };
  const toggleExpand = (code: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const selectAll = () => setSelectedCodes(new Set(visibleRisks.map(r => r.거래처코드)));
  const clearAll = () => setSelectedCodes(new Set());
  const expandAll = () => setExpandedCodes(new Set(visibleRisks.map(r => r.거래처코드)));
  const collapseAll = () => setExpandedCodes(new Set());

  // PDF 출력 (개선 4에서 구현 — 일단 trigger)
  const handlePdfBulkExport = async () => {
    if (selectedRisks.length === 0) {
      alert("PDF 출력할 거래처를 1개 이상 선택하세요.");
      return;
    }
    // 동적 import — bundle size 절약
    const { exportNegotiationCardsBulk } = await import("@/components/dashboard/PdfBulkExportButton");
    const memoList = selectedRisks.map(r => memos.get(r.거래처코드)!).filter(Boolean);
    const riskList = selectedRisks;
    exportNegotiationCardsBulk(riskList, memoList);
  };

  // 카테고리 분포
  const categoryCounts = useMemo(() => {
    const counts = { 거래중단: 0, "회수+단가": 0, 단가조정: 0, 정상: 0 };
    for (const r of allRisks) counts[r.category]++;
    return counts;
  }, [allRisks]);

  if (allRisks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <div className="text-sm">위험 거래처 분석 결과가 없습니다.</div>
          <div className="text-xs mt-1">미수채권 + 100 손익 데이터를 업로드하면 자동 분석됩니다.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">전체 분석 거래처</div>
            <div className="text-2xl font-bold">{allRisks.length.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-red-700 dark:text-red-400">🚨🚨 거래중단 검토</div>
            <div className="text-2xl font-bold text-red-700 dark:text-red-400">{categoryCounts.거래중단}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-amber-700 dark:text-amber-400">🚨 회수+단가</div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{categoryCounts["회수+단가"]}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-yellow-700 dark:text-yellow-400">⚠ 단가조정</div>
            <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{categoryCounts.단가조정}</div>
          </CardContent>
        </Card>
      </div>

      {/* 컨트롤 바 */}
      <Card>
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="거래처명/코드 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-xs border rounded px-2 py-1 w-48"
          />
          <label className="text-xs flex items-center gap-1.5">
            Top N:
            <select
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="text-xs border rounded px-1 py-0.5"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <label className="text-xs flex items-center gap-1.5">
            점수 ≥
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="text-xs border rounded px-1 py-0.5 w-14"
              min={0} max={100} step={10}
            />
          </label>
          <div className="flex-1" />
          <div className="flex gap-1">
            <button onClick={selectAll} className="text-[11px] px-2 py-1 rounded border hover:bg-muted">전체 선택</button>
            <button onClick={clearAll} className="text-[11px] px-2 py-1 rounded border hover:bg-muted">선택 해제</button>
            <button onClick={expandAll} className="text-[11px] px-2 py-1 rounded border hover:bg-muted">모두 펼치기</button>
            <button onClick={collapseAll} className="text-[11px] px-2 py-1 rounded border hover:bg-muted">모두 접기</button>
          </div>
          <button
            onClick={handlePdfBulkExport}
            disabled={selectedRisks.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="선택된 거래처의 협상 카드를 A4 1장 × N개 PDF로 일괄 출력"
          >
            <Printer className="w-3.5 h-3.5" />
            협상 카드 PDF ({selectedRisks.length})
          </button>
        </CardContent>
      </Card>

      {/* 거래처 카드 리스트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            🚨 협상 우선순위 — 위험 거래처 Top {topN}
            <span className="text-xs font-normal text-muted-foreground">
              (총 {allRisks.length}개 분석 / 표시 {visibleRisks.length}개 / 선택 {selectedRisks.length}개)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleRisks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              검색 조건에 맞는 거래처가 없습니다.
            </div>
          ) : (
            visibleRisks.map((risk, idx) => {
              const memo = memos.get(risk.거래처코드);
              if (!memo) return null;
              return (
                <CustomerRiskCard
                  key={risk.거래처코드}
                  rank={idx + 1}
                  risk={risk}
                  memo={memo}
                  isSelected={selectedCodes.has(risk.거래처코드)}
                  isExpanded={expandedCodes.has(risk.거래처코드)}
                  onToggleSelect={() => toggleSelect(risk.거래처코드)}
                  onToggleExpand={() => toggleExpand(risk.거래처코드)}
                />
              );
            })
          )}
        </CardContent>
      </Card>

      {/* 안내 */}
      <div className="text-[11px] text-muted-foreground italic px-2">
        💡 위험점수는 미수(25)+적자(25)+장기연체(20)+한도(15)+매출감소(10)+품목집중(5) = 100점 만점.
        압박 근거와 협상 멘트는 자동 도출이며 실제 협상 시 거래처별 컨텍스트 확인 필요.
      </div>
    </div>
  );
}

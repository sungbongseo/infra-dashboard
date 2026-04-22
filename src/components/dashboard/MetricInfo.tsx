"use client";

/**
 * MetricInfo — 통합 툴팁 컴포넌트.
 *
 * 3 variants:
 *   - "inline"  : 슬라이더/컬럼 헤더/차트 라벨 옆 (Info 12px)
 *   - "compact" : 숫자 옆·판정 결과 카드 (Info 12px, 팝오버 좁음)
 *   - "heavy"   : KpiCard 제목·섹션 헤더 (Info 16px, 팝오버 넓음)
 *
 * 2 stages (Progressive Disclosure):
 *   - Stage 1 (hover): 기본 설명 + "자세히 보기" 링크
 *   - Stage 2 (click): 레벨 탭(초/중/전) + 공식 + 주의 + 관련 지표
 *
 * glossary 연동:
 *   - id prop 지정 시 GLOSSARY에서 자동 조회
 *   - id 미지정 시 직접 prop (title/formula/beginner/intermediate/expert/note) 사용
 *
 * 레거시 호환:
 *   - AnalysisTooltip 대체(variant="heavy"), VerdictInfo 대체(variant="compact") 가능.
 *   - 기존 컴포넌트는 Phase 3 정리 단계까지 유지.
 */

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import {
  getMetricEntry,
  resolveContextBranch,
  type MetricId,
  type MetricEntry,
  type MetricTone,
} from "@/lib/metrics/glossary";

export type MetricInfoVariant = "inline" | "compact" | "heavy";
export type MetricInfoLevel = "beginner" | "intermediate" | "expert";

export interface MetricInfoProps {
  /** glossary.ts의 MetricId (우선). 지정 시 아래 override props는 모두 무시 */
  id?: MetricId;
  variant?: MetricInfoVariant;
  /** Stage 2 진입 시 기본 선택 탭 */
  defaultLevel?: MetricInfoLevel;
  /** Override — glossary 미참조 시 직접 기입 (레거시·inline 전용) */
  title?: string;
  formula?: string;
  beginner?: string;
  intermediate?: string;
  expert?: string;
  note?: string;
  /** 현재 지표 값 — contextBranches 조건 매칭용 */
  currentValue?: number;
  /** Cross-reference 관련 지표 id (UI에 링크로 표시 — 현재 버전은 라벨만, 네비게이션은 Phase 3) */
  relatedIds?: string[];
  /** Radix Tooltip side */
  side?: "top" | "bottom" | "left" | "right";
  /** aria-label override */
  ariaLabel?: string;
  /** 트리거 옆에 표시할 짧은 텍스트 (inline variant에서만 사용 권장) */
  triggerSuffix?: React.ReactNode;
}

const VARIANT_CONFIG: Record<
  MetricInfoVariant,
  { iconClass: string; contentClass: string }
> = {
  inline: {
    iconClass: "h-3 w-3",
    contentClass: "max-w-[320px] md:max-w-sm p-3 z-[70]",
  },
  compact: {
    iconClass: "h-3 w-3",
    contentClass: "max-w-[320px] md:max-w-sm p-3 z-[70]",
  },
  heavy: {
    iconClass: "h-4 w-4",
    contentClass: "max-w-xs md:max-w-sm p-4 z-[70]",
  },
};

const TONE_BG: Record<MetricTone, string> = {
  info: "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  warning: "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  success: "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800",
  danger: "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800",
};

/** 관련 지표 라벨 조회 — glossary에 있으면 name, 없으면 id 그대로 */
function getRelatedLabel(relatedId: string): string {
  try {
    const e = getMetricEntry(relatedId as MetricId);
    return e.name;
  } catch {
    return relatedId;
  }
}

export function MetricInfo({
  id,
  variant = "inline",
  defaultLevel = "intermediate",
  title: titleProp,
  formula: formulaProp,
  beginner: beginnerProp,
  intermediate: intermediateProp,
  expert: expertProp,
  note,
  currentValue,
  relatedIds: relatedIdsProp,
  side = "bottom",
  ariaLabel,
  triggerSuffix,
}: MetricInfoProps) {
  const [stage, setStage] = useState<"quick" | "detail">("quick");
  const [level, setLevel] = useState<MetricInfoLevel>(defaultLevel);

  // glossary 참조 우선, 없으면 props fallback
  const entry: Partial<MetricEntry> = id
    ? getMetricEntry(id)
    : {
        name: titleProp,
        formula: formulaProp,
        beginner: beginnerProp,
        intermediate: intermediateProp,
        expert: expertProp,
      };

  const title = entry.name ?? titleProp ?? "";
  const formula = entry.formula ?? formulaProp;
  const beginner = entry.beginner ?? beginnerProp;
  const intermediate = entry.intermediate ?? intermediateProp;
  const expertText = entry.expert ?? expertProp;
  const benchmark = (entry as MetricEntry).benchmark;
  const commonMistakes = (entry as MetricEntry).commonMistakes;
  const relatedIds = (entry as MetricEntry).relatedIds ?? relatedIdsProp;
  const sourceNote = (entry as MetricEntry).sourceNote;

  const ctxBranch = id && currentValue !== undefined
    ? resolveContextBranch(entry as MetricEntry, currentValue)
    : undefined;

  const hasContent = Boolean(formula || beginner || intermediate || expertText || note);
  if (!hasContent) {
    return null;
  }

  const cfg = VARIANT_CONFIG[variant];

  // 레벨별 본문 문자열 선택
  const layerText = level === "beginner"
    ? beginner ?? intermediate ?? ""
    : level === "expert"
    ? expertText ?? intermediate ?? ""
    : intermediate ?? "";

  return (
    <Tooltip
      delayDuration={0}
      onOpenChange={(open) => {
        // 팝오버가 닫힐 때 Stage를 quick으로 리셋 (사용자가 다시 열면 요약 먼저 표시)
        if (!open) setStage("quick");
      }}
    >
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? `${title || "지표"} 설명 보기`}
          className="inline-flex items-center justify-center shrink-0 gap-1 align-middle"
          onClick={(e) => e.preventDefault()}
        >
          <Info
            className={`${cfg.iconClass} text-muted-foreground/60 hover:text-primary transition-colors cursor-help`}
          />
          {triggerSuffix}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className={cfg.contentClass}>
        {/* 제목 영역 */}
        {title && (
          <p className={variant === "heavy" ? "text-sm font-semibold mb-2" : "text-xs font-semibold mb-2"}>
            {title}
          </p>
        )}

        {/* Stage 1 (quick) — Hover 진입 시 요약만 */}
        {stage === "quick" && (
          <div>
            {(intermediate ?? beginner) && (
              <p className={variant === "heavy" ? "text-xs leading-relaxed mb-2" : "text-[11px] leading-snug mb-2"}>
                {intermediate ?? beginner}
              </p>
            )}

            {/* 맥락 분기 메시지 (currentValue 기반) */}
            {ctxBranch && (
              <div className={`mb-2 px-2 py-1.5 rounded border text-[11px] leading-snug ${TONE_BG[ctxBranch.tone ?? "info"]}`}>
                <span className="font-semibold">📏 현재 값:</span> {ctxBranch.message}
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStage("detail");
              }}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              자세히 보기 →
            </button>
          </div>
        )}

        {/* Stage 2 (detail) — 레벨 탭 + 전체 내용 */}
        {stage === "detail" && (
          <div>
            {/* 레벨 탭 */}
            {(beginner || intermediate || expertText) && (
              <div className="flex gap-1 mb-2 border-b border-muted pb-1">
                {(["beginner", "intermediate", "expert"] as MetricInfoLevel[]).map((lv) => {
                  const label = lv === "beginner" ? "초급" : lv === "intermediate" ? "중급" : "전문가";
                  const has = lv === "beginner" ? !!beginner : lv === "intermediate" ? !!intermediate : !!expertText;
                  if (!has) return null;
                  return (
                    <button
                      key={lv}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLevel(lv);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                        level === lv
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 계산방법 (formula) — beginner 레이어에서는 숨김 */}
            {formula && level !== "beginner" && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">📐 계산방법</p>
                <p className="text-[11px] font-mono bg-muted/60 rounded px-1.5 py-1 leading-snug whitespace-pre-line">
                  {formula}
                </p>
              </div>
            )}

            {/* 본문 */}
            {layerText && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">📖 해석방법</p>
                <p className="text-[11px] leading-snug whitespace-pre-line">{layerText}</p>
              </div>
            )}

            {/* 분석 기준 (benchmark) */}
            {benchmark && level !== "beginner" && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">📏 분석 기준</p>
                <p className="text-[11px] leading-snug">{benchmark}</p>
              </div>
            )}

            {/* 맥락 분기 */}
            {ctxBranch && (
              <div className={`mb-2 px-2 py-1.5 rounded border text-[11px] leading-snug ${TONE_BG[ctxBranch.tone ?? "info"]}`}>
                <span className="font-semibold">📏 현재 값:</span> {ctxBranch.message}
              </div>
            )}

            {/* 흔한 오해 */}
            {commonMistakes && commonMistakes.length > 0 && level === "expert" && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-0.5">⚠️ 흔한 오해</p>
                <ul className="text-[11px] leading-snug list-disc pl-4 space-y-0.5 text-amber-800 dark:text-amber-300">
                  {commonMistakes.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 직접 전달된 note (legacy) */}
            {note && (
              <div className="pt-1.5 border-t border-muted">
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mb-0.5">⚠️ 주의</p>
                <p className="text-[11px] leading-snug whitespace-pre-line text-amber-800 dark:text-amber-300">{note}</p>
              </div>
            )}

            {/* 관련 지표 (cross-ref) */}
            {relatedIds && relatedIds.length > 0 && (
              <div className="pt-1.5 border-t border-muted">
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">🔗 관련 지표</p>
                <ul className="text-[11px] leading-snug space-y-0.5">
                  {relatedIds.map((rid) => (
                    <li key={rid}>· {getRelatedLabel(rid)}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 출처 */}
            {sourceNote && level === "expert" && (
              <p className="text-[10px] text-muted-foreground mt-2">📊 {sourceNote}</p>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStage("quick");
              }}
              className="text-[11px] font-medium text-muted-foreground hover:underline mt-2"
            >
              ← 요약으로 돌아가기
            </button>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

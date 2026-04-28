/**
 * 협상 카드 Bulk PDF Export — 브라우저 네이티브 print 활용 (의존성 0).
 *
 * @design
 *   - Blob URL로 임시 HTML 파일 생성 → window.open(blob) → 자동 print
 *   - 사용자는 인쇄 다이얼로그에서 "PDF로 저장" 선택 가능
 *   - @media print 최적화로 화면/인쇄 분리
 *   - 의존성 0 (jsPDF / react-to-print 불필요) → 번들 영향 0
 *   - document.write() 회피 (XSS 안전)
 */

import type { CustomerCompositeRisk } from "@/lib/analysis/customerCompositeRisk";
import type { NegotiationMemo } from "@/lib/analysis/negotiationMemoGenerator";

// ─── 통화 포맷 (PDF용 단순) ────────────────────────

function fmt(v: number): string {
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(2)}억`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(0)}만`;
  return v.toLocaleString();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── HTML 카드 1장 생성 (A4) ───────────────────────

function buildCardHTML(risk: CustomerCompositeRisk, memo: NegotiationMemo): string {
  const m = risk.metrics;
  const categoryColor = {
    거래중단: "#dc2626",
    "회수+단가": "#d97706",
    단가조정: "#ca8a04",
    정상: "#16a34a",
  }[risk.category];

  const categoryEmoji = {
    거래중단: "🚨🚨",
    "회수+단가": "🚨",
    단가조정: "⚠",
    정상: "✅",
  }[risk.category];

  return `
    <div class="card">
      <div class="card-header">
        <div>
          <h2>🏢 ${escapeHtml(risk.거래처명)}</h2>
          <div class="meta">
            <span>${escapeHtml(risk.거래처코드)}</span> ·
            <span>${escapeHtml(risk.영업조직)}</span> ·
            <span>담당 ${escapeHtml(risk.담당자 || "(미지정)")}</span>
            ${risk.offices.length > 1 ? `<span> · 사무소 ${risk.offices.length}곳 (${risk.offices.map(escapeHtml).join(", ")})</span>` : ""}
          </div>
        </div>
        <div class="risk-score" style="color: ${categoryColor};">
          <div class="score-num">${risk.riskScore}</div>
          <div class="score-label">위험점수</div>
          <div class="score-cat" style="background: ${categoryColor};">
            ${categoryEmoji} ${escapeHtml(risk.category)}
          </div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">총 미수</div><div class="kpi-value">${fmt(m.totalReceivable)}</div></div>
        <div class="kpi"><div class="kpi-label">여신한도</div><div class="kpi-value">${fmt(m.creditLimit)}</div></div>
        <div class="kpi ${m.creditUsageRate >= 0.9 ? "danger" : ""}"><div class="kpi-label">한도사용률</div><div class="kpi-value">${(m.creditUsageRate * 100).toFixed(1)}%</div></div>
        <div class="kpi ${m.totalProfit13M < 0 ? "danger" : ""}"><div class="kpi-label">13M 영업이익</div><div class="kpi-value">${m.totalProfit13M >= 0 ? "+" : ""}${fmt(m.totalProfit13M)}</div></div>
        <div class="kpi ${m.longOverdueRatio >= 0.3 ? "danger" : ""}"><div class="kpi-label">장기연체</div><div class="kpi-value">${fmt(m.longOverdueAmount)} (${(m.longOverdueRatio * 100).toFixed(0)}%)</div></div>
        <div class="kpi"><div class="kpi-label">평균 마진</div><div class="kpi-value ${m.avgMarginRate < 0 ? "danger" : ""}">${m.avgMarginRate.toFixed(1)}%</div></div>
        <div class="kpi"><div class="kpi-label">적자 월 수</div><div class="kpi-value">${m.deficitMonthCount}/${m.monthCount} (최장 ${m.consecutiveDeficitMonths}M)</div></div>
        <div class="kpi"><div class="kpi-label">매출 QoQ</div><div class="kpi-value ${m.salesQoQ < -0.3 ? "danger" : ""}">${(m.salesQoQ * 100).toFixed(1)}%</div></div>
      </div>

      <div class="section">
        <h3>📋 압박 근거 (자동 도출)</h3>
        <ol class="pressure-list">
          ${memo.pressurePoints.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
        </ol>
      </div>

      <div class="section script">
        <h3>🎤 권장 협상 멘트</h3>
        <div class="script-box">"${escapeHtml(memo.scriptedSentence)}"</div>
      </div>

      <div class="section">
        <h3>🎯 권장 액션</h3>
        <ol class="action-list">
          ${memo.recommendedActions.map(a => `
            <li>
              <strong>${escapeHtml(a.action)}</strong>
              <div class="rationale">→ ${escapeHtml(a.rationale)}</div>
            </li>
          `).join("")}
        </ol>
      </div>

      ${m.itemHHI >= 0.5 ? `
        <div class="section concentration">
          <strong>📦 단일 품목 집중:</strong>
          ${escapeHtml(m.topItemName)} ${(m.topItemShare * 100).toFixed(0)}% 의존 (HHI ${m.itemHHI.toFixed(2)})
        </div>
      ` : ""}

      <div class="footer">
        <span>인프라 대시보드 자동 생성 · 자료 기준일 ${new Date().toISOString().slice(0, 10)}</span>
        <span class="confidential">CONFIDENTIAL · INTERNAL USE ONLY</span>
      </div>
    </div>
  `;
}

// ─── 전체 HTML 문서 (스타일 포함) ──────────────────

function buildDocumentHTML(cards: string[], title: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1f2937;
      background: #f3f4f6;
      padding: 12px;
    }

    .card {
      background: white;
      width: 210mm;
      min-height: 297mm;
      max-width: 100%;
      margin: 0 auto 16px;
      padding: 16mm;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      page-break-after: always;
      page-break-inside: avoid;
    }
    .card:last-child { page-break-after: auto; }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #6d28d9;
      margin-bottom: 12px;
    }
    .card-header h2 {
      font-size: 18px;
      color: #111827;
      margin-bottom: 4px;
    }
    .card-header .meta {
      font-size: 9.5px;
      color: #6b7280;
    }

    .risk-score {
      text-align: right;
      flex-shrink: 0;
    }
    .risk-score .score-num {
      font-size: 32px;
      font-weight: 800;
      line-height: 1;
    }
    .risk-score .score-label {
      font-size: 9px;
      color: #6b7280;
      margin-top: 2px;
    }
    .risk-score .score-cat {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      color: white;
      font-size: 10px;
      font-weight: 600;
      margin-top: 4px;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .kpi {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 6px 8px;
    }
    .kpi.danger {
      background: #fef2f2;
      border-color: #fecaca;
    }
    .kpi-label {
      font-size: 9px;
      color: #6b7280;
      margin-bottom: 2px;
    }
    .kpi-value {
      font-size: 12px;
      font-weight: 600;
      color: #111827;
      font-family: ui-monospace, "Roboto Mono", monospace;
    }
    .kpi-value.danger { color: #dc2626; }

    .section {
      margin-bottom: 10px;
      padding: 8px;
      background: #fafafa;
      border-radius: 4px;
      border-left: 3px solid #6d28d9;
    }
    .section h3 {
      font-size: 11px;
      color: #4c1d95;
      margin-bottom: 6px;
      font-weight: 700;
    }
    .pressure-list, .action-list {
      list-style: none;
      counter-reset: item;
    }
    .pressure-list li, .action-list li {
      counter-increment: item;
      padding: 4px 0 4px 24px;
      position: relative;
      font-size: 11px;
    }
    .pressure-list li::before, .action-list li::before {
      content: counter(item) ".";
      position: absolute;
      left: 0;
      top: 4px;
      color: #6d28d9;
      font-weight: 700;
      font-family: ui-monospace, monospace;
    }
    .action-list li {
      padding: 6px 0 6px 24px;
      border-bottom: 1px dashed #e5e7eb;
    }
    .action-list li:last-child { border-bottom: none; }
    .action-list .rationale {
      font-size: 9.5px;
      color: #6b7280;
      margin-top: 2px;
      font-style: italic;
    }

    .script .script-box {
      background: white;
      border-left: 3px solid #ef4444;
      padding: 8px 10px;
      font-style: italic;
      font-size: 10.5px;
      line-height: 1.6;
      color: #1f2937;
      border-radius: 0 4px 4px 0;
    }

    .concentration {
      background: #fef3c7;
      border-left-color: #d97706;
      font-size: 10px;
      padding: 6px 8px;
    }
    .concentration strong { color: #78350f; }

    .footer {
      margin-top: 16px;
      padding-top: 8px;
      border-top: 1px dashed #e5e7eb;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #9ca3af;
    }
    .footer .confidential {
      font-weight: 600;
      color: #ef4444;
    }

    .toolbar {
      max-width: 210mm;
      margin: 0 auto 16px;
      padding: 12px;
      background: white;
      border-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .toolbar button {
      background: #6d28d9;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .toolbar button:hover { background: #5b21b6; }
    .toolbar .info {
      font-size: 11px;
      color: #6b7280;
    }

    @media print {
      body { background: white; padding: 0; }
      .toolbar { display: none; }
      .card {
        box-shadow: none;
        margin: 0;
        padding: 14mm;
        width: 100%;
        min-height: auto;
      }

      @page {
        size: A4;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ 인쇄 / PDF로 저장</button>
    <span class="info">총 ${cards.length}장 카드. 인쇄 다이얼로그에서 "PDF로 저장" 선택 시 1개 PDF 파일로 통합됩니다.</span>
  </div>
  ${cards.join("\n")}
  <script>
    // 콘텐츠 렌더링 후 자동 print 다이얼로그
    window.addEventListener("load", function() {
      setTimeout(function() {
        try { window.print(); } catch (e) { console.error("auto-print failed:", e); }
      }, 400);
    });
  </script>
</body>
</html>`;
}

// ─── Public API: Bulk Export ────────────────────────

/**
 * Top N 거래처 협상 카드를 일괄 PDF로 출력.
 * Blob URL → window.open → 자동 print 다이얼로그
 */
export function exportNegotiationCardsBulk(
  risks: CustomerCompositeRisk[],
  memos: NegotiationMemo[],
): void {
  if (risks.length === 0) {
    alert("PDF 출력할 거래처가 없습니다.");
    return;
  }
  if (risks.length !== memos.length) {
    alert("거래처 수와 멘트 수가 일치하지 않습니다.");
    return;
  }

  const cards = risks.map((r, i) => buildCardHTML(r, memos[i]));
  const title = `협상 카드 ${risks.length}건 — ${new Date().toISOString().slice(0, 10)}`;
  const html = buildDocumentHTML(cards, title);

  // Blob URL 생성 (XSS 안전, document.write 회피)
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const win = window.open(url, "_blank", "width=900,height=1200");
  if (!win) {
    URL.revokeObjectURL(url);
    alert("팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.");
    return;
  }

  // 새 창이 닫히거나 1분 후 blob URL 정리 (메모리 리크 방지)
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

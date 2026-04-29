# ⚠ ARCHIVE — 백업 / 구버전 데이터

**작성일**: 2026-04-29
**상태**: archive (대시보드는 이 폴더를 사용하지 않음)

## 진실의 원천 (Single Source of Truth)

대시보드 + Phase v3 P0/P1/UX 자산은 다음 경로의 파일을 사용합니다:

```
./업로드자료/
```

**이 폴더 (`./기타/업로드자료/`)는 archive 백업** 입니다.

## 알려진 차이

같은 파일명이라도 두 경로의 내용이 다를 수 있습니다. 예시:

| 거래처 | `./업로드자료/` (truth) | `./기타/업로드자료/` (archive) |
|---|---|---|
| 리본TS 미수 | 138,828,895 | 151,344,230 |
| 일성 미수 | 195,504,970 | 180,093,015 |

→ **회수 의사결정/협상은 항상 `./업로드자료/` 기준** 사용.

## 점진적 정리 계획

다음 스크립트들이 아직 본 폴더를 참조 중. 향후 운영 cycle에서 `./업로드자료/`로 일괄 이전 예정:

- `scripts/generate-bulk-cards.py`
- `scripts/customer-visit-ribbon.py`
- `scripts/customer-visit-analysis.py`
- `scripts/customer-search-fuzzy.py`
- `scripts/dry-run-cannibalization.py`

## 삭제 가능 시점

- 위 스크립트들이 모두 `./업로드자료/`로 이전된 후
- 운영 데이터 누적 1-2개월 검증 후
- 사용자 승인 시점에 폴더 전체 삭제 가능

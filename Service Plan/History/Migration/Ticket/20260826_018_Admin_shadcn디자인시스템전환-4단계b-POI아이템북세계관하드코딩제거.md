---
id: 20260826_018
category: Admin
status: OPEN
created: 2026-08-26
---

# [Admin] shadcn 디자인시스템 전환 — 4단계b: POI·아이템북·세계관 하드코딩 제거

## 배경 / 문제 정의

4단계a(`20260826_017`, CLOSED)에서 선행 인프라 버그(`--color-border`/`--color-primary`/
`--color-secondary` 스코프 누락, Radix Portal container 미적용)를 이미 고쳤고 배지 도메인
전환도 마쳤다. 이 티켓(4단계b)은 그 기반 위에서 POI·아이템북·세계관 도메인의 하드코딩을
제거한다 — **인프라는 이미 갖춰져 있으니 재작업 불필요, 매핑 작업만 하면 된다.**

시작 전 `Service Plan/Specs/PRD/AdminUI/PHASES.md`의 "Phase 4" 절과 `20260826_017` 티켓의
"구현 기록"(색상 매핑 규칙 예시: `#111111`→`text-foreground`/`bg-primary`, `#374151`→
`text-foreground`, `#6b7280`/`#898989`/`#9ca3af`→`text-muted-foreground`, `#e5e7eb`/
`#f3f4f6`→`border-border`, `#f5f5f5`/`#f8f9fa`→`bg-muted` 등)를 반드시 먼저 읽고 동일한
매핑 규칙을 따를 것 — 화면마다 색상 이름이 다르게 매핑되면 일관성이 깨진다.

## 상세 요구사항

### 대상 파일 (실측 occurrence 수, 2026-08-26 재확인)

- `src/app/admin/poi/CategoryManager.tsx` (45건)
- `src/app/admin/poi/PoiForm.tsx` (38건)
- `src/app/admin/poi/Pagination.tsx` (10건)
- `src/app/admin/itembooks/ItemBookForm.tsx` (56건)
- `src/app/admin/factions/FactionForm.tsx` (45건)
- `src/app/admin/factions/[id]/AdjacencyEditor.tsx` (10건)
- 소형 파일(개별 건수는 적지만 누락 방지를 위해 포함): `src/app/admin/poi/new/page.tsx`,
  `src/app/admin/poi/categories/page.tsx`, `src/app/admin/itembooks/new/page.tsx`,
  `src/app/admin/factions/page.tsx`, `src/app/admin/factions/new/page.tsx`,
  `src/app/admin/factions/[id]/page.tsx`

`text-[#...]`/`border-[#...]`/`bg-[#...]` 형태의 하드코딩 hex 클래스를 4단계a와 동일한
규칙으로 shadcn 시맨틱 토큰에 매핑한다.

### 참고 — Data Table 관련 파일은 이미 완료됨

`PoiTable.tsx`/`ItemBookTable.tsx`/`FactionsTable.tsx`와 그 필터바(`PoiFilters.tsx`/
`ItemBookFilters.tsx`)는 3단계에서 이미 shadcn Data Table 컴포넌트로 전환됐다 — 이
파일들은 하드코딩 스캔에 안 걸렸을 것이나, 혹시 잔존 hex가 있다면 이 티켓에서 같이
정리해도 된다(범위 확장이지만 작은 규모면 무방).

## 절대 건드리면 안 되는 것

- 미리보기 프레임(`BadgeDetailPreviewFrame.tsx`, `ItemBookDetailPreviewFrame.tsx`) — MODULAR
  유지 대상, 이 티켓과 무관
- 배지 도메인(4단계a 산출물) — 이 티켓과 무관, 손대지 않음
- 4c/4d 대상 파일(운영 도구, 미션/투데이/레시피/유저/포인트/어뷰징 등) — 이 티켓에서
  손대지 않음
- POI·아이템북·세계관 CRUD 로직·API — 색상 클래스만 교체
- `--color-border`/`--color-primary`/`--color-secondary` 스코프 오버라이드, Radix Portal
  container prop 인터페이스(4단계a 산출물) — 재사용만 하고 재설계하지 않는다

## 구현 계획

1. `CategoryManager.tsx`(가장 크니 먼저) → `ItemBookForm.tsx` → `FactionForm.tsx` →
   `PoiForm.tsx` → `AdjacencyEditor.tsx` → `Pagination.tsx` → 소형 파일들
2. 각 다이얼로그/셀렉트에서 4단계a가 추가한 `container` prop을 실제로 연결(4단계a는 배지
   화면 1곳에서만 예시로 연결했다 — 이 티켓에서 다루는 화면의 다이얼로그/셀렉트도 동일하게
   `[data-admin-theme]`로 연결할 것)
3. 로컬 dev 서버 + 임시 `ADMIN_EMAILS` 오버라이드로 실제 확인 — **1440px 데스크탑에서
   POI·아이템북·세계관 목록/등록/수정 화면을 전부 실제 브라우저로 확인할 것**
4. `npx tsc --noEmit` / `npm test` / `npx next build` 통과 확인
5. `grep -rn "text-\[#\|border-\[#\|bg-\[#" src/app/admin/poi src/app/admin/itembooks
   src/app/admin/factions`로 잔존 0건 확인(미리보기 프레임 제외)
6. `PHASES.md`에 4단계b 완료 상태 기록

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

## 구현 기록 (2026-08-26, 리뷰 대기)

**실측 재확인**: 대상 12개 파일의 hex 대괄호 클래스 occurrence를 `grep -o`로 정밀 재측정한
결과 총 217건(`CategoryManager.tsx` 45 · `PoiForm.tsx` 38 · `Pagination.tsx` 10 ·
`ItemBookForm.tsx` 56 · `FactionForm.tsx` 45 · `AdjacencyEditor.tsx` 10 · 소형 페이지 6개
합 13) — 티켓 추정치(약 209건)와 근사, 파일별 개별 건수는 정확히 일치했다.

**매핑**: 4단계a(`20260826_017`) 규칙을 그대로 재사용해 217건 전부 치환했다. 추가로
정립한 패턴(4a에 없던 케이스):
- `hover:bg-[#242424]`(버튼 hover, 항상 `bg-[#111111]` 짝) → `hover:bg-primary/90`
- `hover:text-[#242424]`(텍스트 hover, `text-[#111111]` 짝) → `hover:text-foreground/80`
  (`#242424`가 `#111111`보다 밝은 회색이라 "옅어지는" 효과 — opacity 축소로 동일 방향 재현)
- `bg-[#f3f4f6] hover:bg-[#e5e7eb]`(보조 버튼) → `bg-muted hover:bg-accent`(shadcn 표준
  secondary/ghost hover 관용구)
- `hover:border-[#d1d5db]`(드롭존 hover 테두리 강조, 대응 시맨틱 토큰 없음) →
  `hover:border-foreground/30`
- `AdjacencyEditor.tsx`의 "선택됨" 칩(`bg-[#111111]/15 border-[#111111]/60 text-[#111111]`)은
  텍스트가 opacity 없는 순수 hex라, 4a의 `BadgeMultiSearchSelect` 특례(칩 4개 속성이 전부
  같은 hex의 opacity 변형 → `text-primary` 통일)와 달리 `text-foreground`로 분리 매핑
  (bg/border만 `primary` 계열 opacity, text는 일반 전경색)

정리 결과 `text-[#374151] hover:text-[#111111]`(수정 버튼) 같은 조합은 둘 다
`text-foreground`로 수렴해 hover 시 색 변화가 사라지는 경우가 일부 있다 — 이는 4a에서
이미 확정된 매핑(`#374151`→`text-foreground`)의 부수 효과이며 이번 티켓에서 새로 만든
손실은 아니다.

**Portal container 연결**: `CategoryManager.tsx`·`PoiForm.tsx`·`ItemBookForm.tsx`·
`FactionForm.tsx` 4개 파일에 `themeContainer` state(`document.querySelector('[data-admin-
theme]')`, `BadgeForm.tsx`와 동일 패턴)를 추가하고, Select 6곳 + `ItemBookForm.tsx`의
AlertDialog(컬렉션 비활성화 확인 모달) 1곳에 `container={themeContainer ?? undefined}`를
연결했다. Playwright로 `[role=listbox]`/`[role=alertdialog]`가 실제로 `[data-admin-theme]`
스코프의 자손 DOM에 포털됨을 프로그램적으로 확인(POI 카테고리 Select, 아이템북 소속세계관
Select, 아이템북 비활성화 AlertDialog 3곳 표본 검증). `select.tsx`/`alert-dialog.tsx`/
`dialog.tsx` 자체의 하드코딩 뉴트럴 팔레트는 4a와 동일하게 이번 티켓 범위 밖으로 판단해
건드리지 않았다(티켓 대상 파일 목록·완료 기준 grep 모두 `src/components/admin/ui/`를
포함하지 않음).

**검증**: `npx tsc --noEmit`(0 에러) / `npm test`(60파일 562테스트 전부 통과) / `npx next
build`(성공, 전체 라우트 정상) 모두 통과. `grep -rn "text-\[#\|border-\[#\|bg-\[#"
src/app/admin/poi src/app/admin/itembooks src/app/admin/factions` 결과
`ItemBookDetailPreviewFrame.tsx`(MODULAR 제외 대상) 1건만 남고 0건. 로컬 `next dev` +
임시 `ADMIN_EMAILS=dev-tester@jam.local` 셸 환경변수(`.env.local` 자체는 수정 안 함) +
`/api/dev-login` 세션 발급 후 Playwright로 1440px 데스크탑 실렌더링 확인:
- POI 목록·등록·카테고리 관리·수정 화면
- 아이템북(컬렉션) 목록·등록·수정 화면(배경 테마 카드, 배지 슬롯 관리 포함)
- 세계관 목록·등록·수정 화면(인접 세계관 토글 칩 선택 상태 포함)
- 전 화면 스크린샷 시각 확인 결과 기존과 색상·레이아웃 크게 다르지 않음, 콘솔 에러 0건
- AlertDialog 오버레이(`bg-black/70`)가 `getComputedStyle`상 정확한 opacity·전체 뷰포트
  크기로 렌더링됨을 확인(스크린샷에서 오버레이가 흐릿하게 보이는 건 headless 캡처 시점
  타이밍 이슈로 판단, DOM 실측은 정상)

**변경 파일**: `src/app/admin/poi/CategoryManager.tsx`·`PoiForm.tsx`·`Pagination.tsx`·
`new/page.tsx`·`categories/page.tsx`, `src/app/admin/itembooks/ItemBookForm.tsx`·
`new/page.tsx`, `src/app/admin/factions/FactionForm.tsx`·`page.tsx`·`new/page.tsx`·
`[id]/page.tsx`·`[id]/AdjacencyEditor.tsx`.

`PHASES.md`의 "Phase 4 — 하드코딩 제거" 절에 4단계b 완료(리뷰 대기) 상태와 위 구현 노트
요약을 함께 기록했다.

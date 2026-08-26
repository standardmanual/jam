---
id: 20260826_014
category: Admin
status: OPEN
created: 2026-08-26
---

# [Admin] shadcn 디자인시스템 전환 — 3단계a: Data Table 공용 컴포넌트 + 배지 목록 파일럿

## 배경 / 문제 정의

전체 배경·원칙은 `Service Plan/Specs/PRD/AdminUI/REDESIGN.md`(4절 "데이터 테이블") 참조.
실행 순서·완료 기준은 `Service Plan/Specs/PRD/AdminUI/PHASES.md`의 "Phase 3 — Data Table
전면 도입" 절 참조.

**3단계는 두 티켓으로 나눈다** — 1·2단계 모두 게이트 리뷰 후 실브라우저 검증에서 추가 버그가
나왔던 선례(20260826_012·013)를 감안해, 10개 화면을 한 번에 다 바꾸기보다 **공용
컴포넌트를 먼저 하나의 화면(배지)에서 검증**하고, 패턴이 안정화된 뒤 나머지 화면으로
롤아웃하는 게 리스크가 낮다. 이 티켓(3단계a)은 공용 컴포넌트 구축 + 배지 목록 화면
전환까지만 다룬다. 나머지 9개 화면(POI·아이템북·미션·투데이·레시피·유저·세계관·포인트·
어뷰징) 롤아웃은 이 티켓이 CLOSED된 뒤 별도 티켓(3단계b)으로 진행한다.

### 사전 확인 결과 (2026-08-26) — 일괄 삭제 백엔드 API

`grep`으로 확인: 모든 어드민 리소스에 **단건 DELETE** 엔드포인트(`api/admin/{resource}/[id]/
route.ts`)는 있지만, **일괄(bulk) 삭제 엔드포인트는 어디에도 없다.** 이 티켓(배지)에서는
기존 단건 DELETE를 프론트에서 순차 호출하는 방식으로 시작하고(간단, 배지 목록 페이지 크기가
50건이라 규모상 문제없음), 진짜 원자적 일괄 처리가 필요한지는 실제 사용 패턴을 보고
판단한다 — 배지는 `active: false` 소프트 삭제라 되돌릴 수 있어 리스크가 낮다.

## 상세 요구사항

### 1. 공용 Data Table 컴포넌트 구축

참고: [ui.shadcn.com/docs/components/base/data-table](https://ui.shadcn.com/docs/components/base/data-table)
— **먼저 `npx shadcn@latest docs data-table`로 공식 소스·예제를 가져와 확인할 것.**

`@tanstack/react-table` 추가. 재사용 가능한 어드민 Data Table 컴포넌트 1종을 구축한다
(column-def 기반, 재사용을 고려해 제네릭하게):
- 행 선택 체크박스(`table.getIsAllPageRowsSelected()` 등, shadcn `Checkbox` 사용)
- 선택된 행 개수 표시 + 일괄 액션 툴바(이 티켓에서는 "일괄 비활성화" 액션 하나만 구현)
- 정렬(컬럼 헤더 클릭)
- **필터 UI는 공식 Data Table Toolbar 구성을 그대로 따른다** — `DataTableToolbar` +
  `DataTableFacetedFilter`(타입·등급 드롭다운 필터) + `DataTableViewOptions`(컬럼 표시
  토글) + 초기화 버튼. 커스텀 배치 금지.
- 서버사이드 페이지네이션과 결합 가능해야 한다 — 20260826_011에서 이미 배지 목록에
  `PAGE_SIZE=50` 서버 페이지네이션이 적용돼 있다(`admin/badges/page.tsx`). 클라이언트
  전체 재구현(전량 클라이언트 페칭)으로 되돌리지 말 것 — TanStack Table의
  `manualPagination`/`manualFiltering`/`manualSorting` 옵션으로 서버 사이드와 결합할 것.

컴포넌트 위치는 재량(예: `src/components/admin/data-table/`).

### 2. 배지 목록 화면 전환 (파일럿)

`src/components/admin/badges/BadgesTable.tsx`(현재 shadcn `Table` 프리미티브로 정적 렌더)를
위 공용 컴포넌트로 교체. `src/app/admin/badges/BadgesFilterBar.tsx`(현재 손수 배치된 타입/
등급/정렬 드롭다운)도 공식 Toolbar 패턴으로 흡수·교체.

- 컬럼: 이미지·이름·타입·등급·세계관·활동·조건·패치·액션(현재 `BadgesTable.tsx` 컬럼 구성
  유지)
- 행 선택 + "선택 항목 비활성화" 일괄 액션(기존 단건 `BadgeActiveToggleButton.tsx`의 API
  호출을 선택된 행 전체에 순차 적용)
- 필터: 타입·등급·활성 상태(기존 `BadgesFilterBar.tsx`가 지원하던 필터 그대로, Toolbar
  패턴으로 재구현)
- 서버 페이지네이션(`PAGE_SIZE=50`) 유지
- **모바일 카드 뷰(`BadgeCard.tsx`, `BadgeList.tsx`의 조건부 렌더)는 이번 티켓 범위 밖** —
  Data Table은 데스크탑 전용 패턴이라 모바일은 기존 카드 리스트를 그대로 유지한다(20260826_011
  에서 이미 이중 마운트 제거 작업을 해뒀으니 그 구조를 건드리지 말 것).

## 절대 건드리면 안 되는 것

- 모바일 카드 뷰(`BadgeCard.tsx`) 및 뷰포트 조건부 렌더 구조(`use-is-desktop.ts` 사용부) —
  20260826_011 산출물, 이번 티켓과 무관
- 배지 CRUD 로직·API — 화면 렌더링 방식만 교체
- 다른 9개 화면(POI·아이템북 등) — 3단계b 대상, 이 티켓에서 손대지 않음
- `[data-admin-theme]` CSS 스코프, shadcn 폴더 분리(1단계), Sidebar/Accordion(2단계) 산출물

## 구현 계획

1. `npx shadcn@latest docs data-table` 확인, `@tanstack/react-table` 설치
2. 공용 Data Table 컴포넌트 구축(1번 요구사항)
3. 배지 목록 화면에 적용(2번 요구사항)
4. 로컬 dev 서버 + 임시 `ADMIN_EMAILS` 오버라이드로 실제 확인: 행 선택, 일괄 비활성화,
   정렬, 필터, 페이지네이션 전부 동작 확인. **1440px 데스크탑에서 실제 브라우저 렌더링을
   반드시 확인할 것** — 1·2단계 선례상 서브에이전트 환경에 브라우저가 없으면 레이아웃
   버그를 놓칠 수 있다(20260826_013의 Tailwind v4 문법 버그 참고).
5. `npx tsc --noEmit` / `npm test` / `npx next build` 통과 확인
6. 이 티켓 완료 후 `PHASES.md`에 "3단계a 완료, 3단계b(나머지 9개 화면) 대기" 상태 기록

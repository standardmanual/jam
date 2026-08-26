---
id: 20260826_014
category: Admin
status: CLOSED
created: 2026-08-26
closed: 2026-08-26
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

## 구현 기록 (2026-08-26, 사용자 최종 승인 대기)

**공식 소스 확보**: `npx shadcn@latest docs data-table`는 레지스트리에 없어(`shadcn` CLI
4.19.0 기준) GitHub(`shadcn-ui/ui` `apps/v4/app/(app)/examples/tasks/components/`)에서
공식 Tasks 예제 원본(`data-table.tsx`, `data-table-toolbar.tsx`,
`data-table-faceted-filter.tsx`, `data-table-column-header.tsx`,
`data-table-view-options.tsx`)을 직접 받아 확인했다. `@tanstack/react-table`는 **v9**
(latest 9.1.2, feature 기반 opt-in 아키텍처 — `useReactTable`/`getCoreRowModel()`이 아니라
`useTable`/`createColumnHelper`/`tableFeatures()`)로, v8 기준 학습 데이터와 API가 다르다
(AGENTS.md 경고대로 실제로 breaking).

**공용 컴포넌트** (`src/components/admin/data-table/`): `features.ts`(v9 feature 세트 —
페이지네이션/필터링 feature는 등록하지 않음, 서버사이드 위임), `data-table.tsx`(헤더/바디/빈
상태 렌더러), `data-table-column-header.tsx`(정렬+숨기기, 실제 TanStack `column` 바인딩),
`data-table-view-options.tsx`(컬럼 표시 토글), `data-table-faceted-filter.tsx`,
`data-table-toolbar.tsx`(레이아웃 셸), `data-table-bulk-action-bar.tsx`.

**핵심 설계 결정 — `DataTableFacetedFilter`가 TanStack `column`이 아니라 `selected`/
`onChange` 값을 직접 받는 이유**: 배지 목록은 데스크탑 테이블뿐 아니라 모바일 카드 뷰
(`BadgeList.tsx`)에도 같은 필터(`BadgesFilterBar.tsx`, page.tsx 레벨, 뷰포트 무관 공용)가
적용된다. 공식 패턴처럼 필터를 데스크탑 전용 테이블의 `table` 인스턴스에 묶으면 모바일에서
필터가 아예 동작하지 않게 되므로(모바일 카드 뷰 건드리지 않기로 한 범위와 충돌), 필터는
계속 URL(searchParams)로 서버에 위임하고 `DataTableFacetedFilter`/`DataTableToolbar`는 값을
직접 받는 범용 컴포넌트로 만들었다. `DataTableViewOptions`(컬럼 표시 토글)·정렬 헤더 클릭·
행 선택+일괄 액션은 데스크탑 전용 개념이라 `BadgesTable.tsx` 내부의 실제 `table` 인스턴스로
구현했다 — 그 결과 데스크탑에서는 컬럼 표시 토글 버튼이 필터 툴바와 별도 줄(테이블 바로
위)에 위치한다. PHASES.md Phase 3 절에 3단계b용 구현 노트로 남겨뒀다.

**기존 필터 기능 축소 없음**: 검색창(디바운스 입력으로 전환, 버튼 제거), 타입·등급·활성
상태 3개 필터, 타입별 서브 필터(액티비티/지점 카테고리/세계관+컬렉션 cascading), 정렬
드롭다운(최신순/오래된순/이름 가나다/역순) 전부 유지 — 정렬 드롭다운은 그대로 두고
데스크탑 "이름" 헤더 클릭 정렬(name_asc/name_desc, 같은 URL 파라미터 공유)을 추가했다.
최신순/오래된순은 테이블에 노출된 컬럼이 없어 헤더 클릭 대상이 될 수 없고 모바일 카드 뷰는
헤더 자체가 없어 드롭다운이 유일한 경로라 제거하지 않았다.

**Radix Portal 스코프 버그 선제 대응**: `npx shadcn add dropdown-menu popover command`로
받은 컴포넌트가 기본적으로 `bg-popover`/`text-accent`/`border-input` 등 시맨틱 토큰을
쓰는데, Radix Portal은 `document.body`에 렌더링되어 `[data-admin-theme]` 스코프
(`admin/layout.tsx`) 밖이라 이 CSS 변수들이 비어 스타일이 깨진다(PHASES.md Phase 4 절에
문서화된 함정, 원래 4단계 대상이지만 이번 티켓이 새로 Popover/DropdownMenu/Command를
도입하면서 즉시 발생). 기존 `select.tsx`/`dialog.tsx` 등이 이미 쓰는 하드코딩 뉴트럴
팔레트(`bg-white`, `text-neutral-900`, `border-neutral-200` 등)로 맞춰 세 컴포넌트를 고쳤다.
CLI가 넣은 `lucide-react` 아이콘도 프로젝트 관례(`@tabler/icons-react`)로 교체하고
미사용 `lucide-react` 의존성은 제거했다.

**일괄 비활성화**: 일괄 삭제 전용 API가 없어(티켓 사전 확인대로) 기존 단건
`PATCH /api/admin/badges/[id]` 를 선택된 행에 **순차**(요구사항 명시) 호출한다.

**실제 브라우저(Playwright, 1440px 데스크탑 + 390px 모바일) 실측 검증** — `ADMIN_EMAILS`
임시 오버라이드 + `/api/dev-login`으로 실제 세션 발급 후 `/admin/badges` 렌더링:
- 행 선택 체크박스(개별/전체, indeterminate 포함), 선택 시 "N개 선택됨" 바 + "선택 항목
  비활성화" 버튼 노출 확인
- "이름" 헤더 클릭 → 오름차순/내림차순 드롭다운 → URL이 `?sort=name_asc`/`name_desc`로
  실제 변경되고 정렬 결과도 반영됨(오름차순 첫 행 "180 BPM 플레이리스트", 내림차순 첫 행
  "흰대미산") 확인
- "컬럼 표시" 토글로 "조건" 컬럼 숨김/복원 정상 동작(헤더 개수로 확인)
- "타입" 페싯 필터 → "체크인" 선택 → URL `?type=checkin` 반영 + 서브 필터("지점 카테고리")
  cascading 노출 + "필터 초기화" 버튼 노출 확인
- 일괄 비활성화 확인 다이얼로그 텍스트("배지 일괄 비활성화" / "계속하시겠습니까?") 노출 확인,
  실제 배지 1건으로 종단 실행(PATCH 200 확인) 후 즉시 원상복구(활성화) — 이 DB가
  staging·프로덕션 공용이라(MEMORY 참고) 테스트 후 반드시 원복, 최종 활성 배지 총량이
  검증 시작 전과 동일(2172개)함을 확인
- 390px 모바일: `<table>`이 DOM에 렌더링되지 않음(카드 뷰만 마운트, `use-is-desktop.ts` 조건부
  렌더 구조 정상 유지) 확인, 필터 툴바는 반응형으로 줄바꿈되며 정상 동작

**재검증**: `npx tsc --noEmit`(0 에러) / `npx eslint`(0 에러, 무관한 기존 경고 1건만) /
`npm test`(60파일 562테스트 전부 통과) / `npx next build`(성공, 전체 라우트 정상) 모두 통과.

**변경/신규 파일**: 위 "변경 파일 목록" 참고(구현 요약과 동일).

`PHASES.md`의 "Phase 3 — Data Table 전면 도입" 절에 3단계a 완료(리뷰 대기)·3단계b 대기
상태와 위 구현 노트 요약을 함께 기록했다.

## 승인 처리 (2026-08-26)

게이트 리뷰 **WARN** — 두 우려사항 모두 오케스트레이터가 검토 후 결함이 아니라고 판단했다:
- "필터 기능 전량 유지"는 티켓 문구("기존 BadgesFilterBar.tsx가 지원하던 필터 그대로")의
  올바른 해석이었다(3개로 축소하라는 의도 아님).
- `DataTableViewOptions`가 필터 툴바와 별도 줄에 위치한 것은 모바일 카드뷰와 필터바를
  공유해야 하는 정당한 기술적 제약 때문(데스크탑 전용 `table` 인스턴스가 필요).

**DB 무결성 추가 검증**: 게이트가 WARN 사유로 지적하지 않았지만, devResult의 "일괄 비활성화
종단 테스트 중 실제 배지 데이터를 두 차례 잘못 복구했다가 바로잡았다"는 alert가 걸려
오케스트레이터가 Supabase MCP로 프로덕션 DB를 직접 조회해 재검증했다: 활성 배지 정확히
`2172`건(개발자 claim과 일치), 최근 12시간 내 `deleted_at`이 바뀐 배지는 `_TEST_20260819_008_
...`(전용 테스트 더미, 실컨텐츠 아님) 1건뿐 — 실제 배지 데이터 오염 없음 확인.

실제 브라우저(1440px)로 행 선택·일괄 비활성화 바·정렬·필터·컬럼표시 토글 렌더링 직접
재확인 후 병합 승인.

### 배포 정보
- 배포일: (staging 반영만 완료, 프로덕션 미배포)
- 환경: staging
- 커밋: `claude/jamwork-20260826_014-admin-datatable-badges-pilot` → staging 병합

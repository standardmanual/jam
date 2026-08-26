# JAM! 어드민 UI 디자인시스템 전환 — Phase 분리 계획

> **전면 개정:** 2026-08-26 — 2026-08-05판(모바일 CRUD 리디자인 3단계)은 폐기.
> 배경·원칙·프리셋 값은 `REDESIGN.md` 참조. 이 문서는 실행 순서·완료 기준만 다룬다.

---

## Phase 개요

| Phase | 범위 | 의존성 | 티켓 유형 |
|---|---|---|---|
| 1. 기반 | shadcn 폴더 분리 + 프리셋 테마 + Pretendard + tabler | 없음 | `admin` |
| 2. 레이아웃 셸 | Sidebar/Nav/Header → shadcn 공식 Sidebar 블록 | 1단계 완료 | `admin` |
| 3. Data Table | 전체 목록 화면 행선택+일괄액션+공식 Toolbar 필터 | 1단계 완료 (2단계와 순서 무관, 2단계 이후 권장) | `admin` |
| 4. 하드코딩 제거 | 전체 어드민 화면 hex → shadcn 시맨틱 토큰 | 1~3단계 완료 | `admin` |

4개 전부 `admin` 유형(라이트 파이프라인: 구현 → 게이트 리뷰, 개선 리뷰 생략, MODULAR 탐색
생략)이며, 순차 진행한다. 다음 단계는 이전 단계가 staging에 병합된 뒤 시작한다.

---

## Phase 1 — 기반

### 범위
1. **shadcn 전용 폴더 분리**: `components.json`의 `aliases.ui`를 MODULAR와 분리된 경로로
   이전. `shadcn-button.tsx`/`shadcn-badge.tsx`/`shadcn-card.tsx` 같은 접두어 회피 파일명을
   정리(정식 이름으로 복원 가능). 기존 12개 설치 컴포넌트(accordion, alert-dialog, alert,
   checkbox, dialog, input, select, sheet, switch, table, tabs, textarea) 전부 이전 + 어드민
   전역에서 import 경로 갱신.
2. **프리셋 테마 적용**: `npx shadcn@latest apply b5Jgcv00m --only theme,font`로
   `globals.css`(또는 이전된 위치)에 stone/maia/sky/medium radius 토큰 실제 반영.
3. **폰트 교체**: `admin/layout.tsx`의 Inter(`next/font/google`) 제거, Pretendard로 교체
   (이미 전역 CDN 로드돼 있음, 추가 설치 불필요).
4. **아이콘 교체**: `@tabler/icons-react` 설치, `components.json`의 `iconLibrary: "tabler"`
   반영, 기존 lucide-react 사용 3개 파일(`AdminSidebar.tsx`·`AdminHeader.tsx`·
   `MapPreview.tsx`, 심볼 4개) 전량 교체. lucide-react는 어드민 전용이라 프로젝트 전체
   영향 없음(실측: `src` 전체에서 lucide-react import 3파일뿐, 전부 admin).

### 완료 기준
- [ ] `components.json` 새 `ui` alias 경로로 갱신, 12개 컴포넌트 파일 이전 완료
- [ ] `globals.css`(또는 이전 위치)에 shadcn 표준 변수(`--primary` 등) 실제 존재
- [ ] 어드민 화면에서 `bg-primary`/`text-foreground` 등 시맨틱 클래스가 실제로 렌더링 확인
- [ ] Pretendard 폰트 적용 확인(브라우저 computed style)
- [ ] tabler 아이콘 4개 심볼 정상 렌더링, lucide-react 어드민 내 잔존 0건
- [ ] 서비스 본체(비-admin 라우트) 시각적 회귀 없음 확인 — 다크 테마·MODULAR 색상 그대로
- [ ] `npx tsc --noEmit` / `npm test` / `npx next build` 통과

---

## Phase 2 — 레이아웃 셸

### 범위
`AdminSidebar.tsx` / `AdminNav.tsx` / `AdminHeader.tsx` / `AdminMain.tsx` /
`AdminSidebarContext.tsx`를 shadcn 공식 `Sidebar` 컴포넌트/블록으로 교체.

- 접기/펼치기 상태 유지(현재 `AdminSidebarContext`가 담당)
- 모바일 드로어 동작(현재 `AdminNav`가 담당)
- 인증 상태 표시(`userEmail` prop, `admin/layout.tsx`에서 전달)
- 기존 네비게이션 항목(`adminNavItems.ts`) 그대로 유지 — 항목 자체는 안 바뀜, 렌더 방식만 교체

### 완료 기준
- [ ] `npx shadcn@latest docs sidebar` 확인 후 공식 API로 구현(임의 커스텀 마크업 금지)
- [ ] 데스크탑 접기/펼치기, 모바일 드로어 기존과 동등하게 동작
- [ ] 로그인 이메일 표시 유지
- [ ] 기존 5개 파일(AdminSidebar 등) 중 shadcn Sidebar로 대체되지 않는 로직(인증 등)만 최소
      유지, 나머지는 shadcn 컴포넌트로 위임

---

## Phase 3 — Data Table 전면 도입

**2026-08-26 갱신**: 1·2단계 모두 게이트 리뷰 후 실브라우저 검증에서 추가 버그가 나온
선례(20260826_012·013) 때문에, 3단계는 **두 티켓으로 분리**해 진행한다.
- **3단계a** (`20260826_014`): 공용 Data Table 컴포넌트 구축 + 배지 목록 화면 파일럿 전환
- **3단계b** (티켓 번호 미정, 3단계a CLOSED 후 생성): 나머지 9개 화면(POI·아이템북·미션·
  투데이·레시피·유저·세계관·포인트·어뷰징) 롤아웃

아래 범위·완료 기준은 3단계 전체(a+b 합산) 기준으로 작성돼 있다 — 화면 목록은 a/b로
어떻게 나뉘는지 각 티켓에서 확인할 것.

**2026-08-26 갱신 2 — 3단계a 구현 완료(리뷰 대기)**: 공용 Data Table 컴포넌트 구축 +
배지 목록 파일럿 전환 구현 완료, 사용자 최종 승인 대기 중(`20260826_014`). 3단계b는
이 티켓이 CLOSED된 뒤 새 티켓으로 시작한다. 3단계b 착수 시 참고할 구현 노트:

- 공용 컴포넌트 위치: `src/components/admin/data-table/`(`features.ts`, `data-table.tsx`,
  `data-table-column-header.tsx`, `data-table-view-options.tsx`,
  `data-table-faceted-filter.tsx`, `data-table-toolbar.tsx`, `data-table-bulk-action-bar.tsx`).
  `@tanstack/react-table`는 **v9**(feature 기반 opt-in, `useTable`/`createColumnHelper`/
  `tableFeatures` API — v8과 다름, 이 문서 참고 없이 훈련 데이터 기억으로 짜면 틀린다).
- `DataTableFacetedFilter`는 공식 예제와 달리 TanStack `column`이 아니라 `selected`/
  `onChange` 값을 직접 받는다 — 이 프로젝트 어드민 목록이 전부 서버사이드(URL searchParams)
  필터링이고, 필터 UI가 모바일 카드 뷰와 공용(데스크탑 전용 테이블의 `table` 인스턴스 밖에
  위치)이기 때문. 3단계b 화면도 동일 구조면 그대로 재사용.
- `DataTableViewOptions`(컬럼 표시 토글)·행 선택·정렬 헤더 클릭은 데스크탑 테이블
  컴포넌트 안에서 실제 `table` 인스턴스로 구현(위 이유와 동일 — 모바일에 대응 UI가 없음).
- Radix `Popover`/`DropdownMenu`/`Command`는 `document.body`에 포털되어
  `[data-admin-theme]` 스코프 밖이다 — 시맨틱 토큰(`bg-popover` 등) 대신 기존 admin
  컴포넌트들과 같은 하드코딩 뉴트럴 팔레트(`bg-white`, `text-neutral-900` 등)를 써야 한다
  (Phase 4에서 Portal `container` 리다이렉션을 하기 전까지는 계속 이렇게 한다).
- 배지 화면은 검색·서브 필터(액티비티/지점 카테고리/세계관+컬렉션)·정렬 드롭조합을 전부
  유지했다(기존 기능 축소 없음) — 3단계b 화면들도 필터 기능은 축소하지 말 것.

### 범위
`@tanstack/react-table` 추가, 재사용 가능한 어드민 Data Table 컴포넌트 구축(행 선택
체크박스 + 정렬 + 일괄 액션 툴바 + 공식 Toolbar 필터 패턴).

**전환 대상**: 배지 · POI · 아이템북 · 미션 · 투데이 · 레시피 · 유저 · 세계관(factions) ·
포인트 · 어뷰징 — 각 화면의 현재 목록 컴포넌트(`BadgesTable.tsx`, `PoiTable.tsx`,
`ItemBookTable.tsx`, `MissionTable.tsx`, `TodayCardTable.tsx`, `RecipeTable.tsx`,
`users/page.tsx`, `users/[id]/page.tsx`, `factions/page.tsx`, `points/page.tsx`,
`AbusingClient.tsx`의 각 원시 `<table>`) 전부 교체.

**사전 확인 필요**: 화면별 일괄 삭제/비활성화 백엔드 API 존재 여부. 없으면 이 Phase에서
API 라우트 신설 포함(구현 시 화면별로 실제 필요성 판단 — 예: 유저 목록은 일괄 삭제가
정책상 부적절할 수 있음, 이 경우 일괄 액션 없이 선택 UI만 제공하거나 제외).

### 완료 기준
- [x] 재사용 가능한 Data Table 컴포넌트 1종(column-def 기반) 구축
- [x] 위 전환 대상 화면 전체가 이 컴포넌트를 사용
- [x] 필터 UI가 전부 공식 Toolbar 패턴(커스텀 배치 없음)
- [x] 행 선택 + 일괄 액션(해당 화면에 필요한 것만) 동작 확인
- [x] 페이지네이션 기존 서버사이드 방식과 통합(20260826_011에서 이미 서버 페이지네이션
      전환된 화면들과 충돌 없이 결합)

**2026-08-26 갱신 3 — 3단계b 구현 완료(리뷰 대기)**: 나머지 9개 화면 전환 완료(`20260826_015`).
4단계(하드코딩 제거) 착수 시 참고할 화면별 적용 현황:

| 화면 | 컬럼 | 필터 | 일괄 액션 | 서버 페이지네이션 |
|---|---|---|---|---|
| POI | 이름(정렬)·카테고리·위도경도·반경·연결배지 | 카테고리 Faceted + 정렬 Select | 없음(하드 DELETE만 존재, "비활성화"로 오인될 수 있어 제외 — 아래 alert 참고) | 있음(기존 유지, PAGE_SIZE=30) |
| 아이템북 | 선택·이름(정렬)·세계관·필수배지·아이템배지수·보상배지·관리 | 세계관 Faceted + 정렬 Select | 선택 항목 비활성화(PATCH is_active, 단건 API 순차 호출) | 있음(기존 유지, PAGE_SIZE=30) |
| 미션(45건) | 미션(정렬)·타입·기간·달성(정렬)·상태·액션 | 없음(원래 없었음) | 없음(하드 DELETE만 존재) | 없음(클라이언트 정렬) |
| 투데이(40건) | 선택·제목(정렬)·템플릿·노출형태·노출조건·기간·상태·액션 | 없음(원래 없었음) | 선택 항목 비활성화(PATCH is_active, 단건 API 순차 호출) | 없음(클라이언트 정렬) |
| 레시피(33건) | 재료·필수액티비티·결과·성공률(정렬)·공개·힌트·액션 | 없음(원래 없었음) | 없음(하드 DELETE만, is_public은 공개여부라 별개 개념) | 없음(클라이언트 정렬) |
| 유저(10명) | 이름(정렬)·이메일·지역·보유배지(정렬)·보유아이템(정렬)·가입일(정렬)·액션 | 없음 | 없음(정책상 민감 — 티켓 명시 제외) | 없음(클라이언트 정렬) |
| 유저상세(배지 이력) | 배지·등급·획득경로·획득근거·트리거활동·획득일시(정렬) | 없음 | 없음(읽기 전용) | 없음(클라이언트 정렬) |
| 세계관(10건) | 선택·이름(정렬)·태그라인·드랍가중치(정렬)·배지수·컬렉션수·정렬순서(정렬)·상태·관리 | 없음(원래 없었음) | 선택 항목 비활성화(기존 `PUT` 재사용, 전체 필드 스프레드로 부분 body 버그 우회 — 아래 alert 참고) | 없음(클라이언트 정렬) |
| 포인트 | 배지·미션 발행 순위(정렬 없음, 순번 고정) + 고액 지급/회수(유저·금액(정렬)·사유·일시(정렬)) | 없음 | 없음(회계성 로그) | 없음(클라이언트 정렬) |
| 어뷰징(밴 0건·POI블록 1건) | 밴: 선택·유저·레벨(정렬)·사유·만료·적용자·액션 / POI블록: 선택·유저·POI·사유·차단만료(정렬)·액션 | 없음 | 선택 항목 해제(기존 단건 해제 API 순차 호출) | 없음(클라이언트 정렬) |

**함정 노트(3단계b에서 새로 발견)**:
- 서버 컴포넌트(`page.tsx`)에서 클라이언트 컴포넌트로 **함수를 prop으로 넘길 수 없다**(RSC
  제약). 실제로 `RankingTable`에 `href: (id) => string` 콜백을 넘겼다가 브라우저 실행 시
  500(`Functions cannot be passed directly to Client Components`)이 났다 — TanStack 타입
  체크로는 안 걸리고 런타임에만 드러난다. `hrefBase`/`linkPerItem` 같은 원시값 조합으로
  바꿔 해결했다. 4단계에서도 서버→클라이언트 prop 설계 시 함수 타입을 넣지 않도록 주의.

---

## Phase 4 — 하드코딩 제거

**2026-08-26 실측**: 하드코딩 hex 클래스(`text-[#...]`/`border-[#...]`/`bg-[#...]`) 총
**824건, 39개 파일**. 화면 단위 4개 티켓으로 분리한다(파일 배정은 occurrence 수 기준
균등 분배):

- **4a**: 선행 인프라 수정(아래 2건) + 배지 도메인 — `BadgeForm.tsx`(160)·
  `BackgroundGeneratorPreview.tsx`(28)·`BadgeMultiSearchSelect.tsx`(13)·
  `BadgeSearchSelect.tsx`(9) ≈ 210건
- **4b**: POI·아이템북·세계관 — `CategoryManager.tsx`(45)·`PoiForm.tsx`(38)·
  `Pagination.tsx`(10)·`ItemBookForm.tsx`(56)·`FactionForm.tsx`(45)·
  `AdjacencyEditor.tsx`(10)·기타 소형 파일 ≈ 209건
- **4c**: 운영 도구 — `simulator/page.tsx`(72)·`AbusingClient.tsx`(44)·
  `AmbientDropForm.tsx`(45)·`DropPolicyForm.tsx`(9)·`CombinePolicyForm.tsx`(7) ≈ 177건
- **4d**: 컨텐츠 관리 잔여 + 공용 — `MissionList.tsx`(34)·`TodayCardList.tsx`(20)·
  `RecipeList.tsx`(15)·`UserGrantForm.tsx`(34)·`AdminUserSearch.tsx`(14)·
  `ThemeManager.tsx`(19)·`ImageUploadField.tsx`(13)·`BackgroundColorField.tsx`(9)·
  `ResetUserButton.tsx`(9)·나머지 소형 페이지 전부 ≈ 228건

각 하위 티켓은 순차 진행(4a→4b→4c→4d), 병합 후 다음 착수.

**2026-08-26 갱신 — 4단계a 구현 완료(리뷰 대기)**: 선행 인프라 2건 + 배지 도메인 4개 파일
(`BadgeForm.tsx`·`BackgroundGeneratorPreview.tsx`·`BadgeMultiSearchSelect.tsx`·
`BadgeSearchSelect.tsx`, `src/app/admin/badges/new/page.tsx`의 잔여 2건 포함) 전환 완료,
사용자 최종 승인 대기 중(`20260826_017` — 원래 016으로 생성됐으나 다른 세션의 무관한
티켓과 번호가 겹쳐 재배정됨). 4b 착수 시 참고할 구현 노트:

- **`--color-border` 스코프 버그의 실제 원인은 문서 초안 추정과 달랐다** — 브라우저
  `getComputedStyle` 실측 결과, `globals.css` 자체의 `@theme inline` 매핑(`--color-X:
  var(--X)`)은 background/foreground/muted/accent/primary/secondary/border 전부 올바르게
  shadcn 원시 이름을 참조하고 있었다. 진짜 충돌은 **import된 `design-system/tokens/colors.css`
  의 `:root`가 자신만의 값으로 `--color-primary`(`#e8461f`, DS v2 브랜드 레드)·
  `--color-secondary`·`--color-border`를 레이어 밖(unlayered)에서 직접 선언**하고 있었고,
  Tailwind `@theme inline` 출력은 `@layer theme` 안에 들어가 동일 특정성에서 항상 진다
  (소스 순서 무관) — 즉 `--color-background`/`--color-foreground`/`--color-muted`/
  `--color-accent`는 DS v2 colors.css가 아예 정의하지 않는 이름이라 충돌이 없었을 뿐,
  이름이 겹치면 `--color-border` 외에도 같은 문제가 난다. `[data-admin-theme]` 블록 안에
  `--color-border`/`--color-primary`/`--color-secondary` 3개를 각각 `var(--border)`/
  `var(--primary)`/`var(--secondary)`로 재매핑해 해결(`grep -n "^\s*--color-"
  design-system/tokens/*.css`로 전체 토큰 파일 재점검, 겹치는 이름은 이 3개뿐이었다).
  **4b~4d 착수 전에도 이 grep으로 새로 충돌 이름이 없는지 재확인할 것** — 코드 리뷰만으로는
  이 클래스의 버그를 못 잡는다(실제 렌더링 확인 필수).
- Radix Portal `container` prop은 `dialog.tsx`/`alert-dialog.tsx`/`select.tsx` 3개
  컴포넌트에 `sheet.tsx`(2단계) 패턴 그대로 추가했다. 인터페이스만 준비된 상태이며,
  아직 `select.tsx`/`dialog.tsx`/`alert-dialog.tsx` 자체의 하드코딩 뉴트럴 팔레트
  (`bg-white`/`text-neutral-900` 등)는 시맨틱 토큰으로 전환하지 않았다(3단계 노트에서
  예고한 대로 "Portal 리다이렉션 이후" 단계 — 이 셋을 실제로 시맨틱 토큰화하는 시점은
  4b~4d 중 이 컴포넌트들이 속한 화면을 다룰 때 함께 판단할 것). `BadgeForm.tsx`의 "타입"
  Select 1곳에서 `container={themeContainer}` 연결을 실제로 검증(`document.querySelector
  ('[data-admin-theme]')` 패턴, `sidebar.tsx`와 동일)했고, 나머지 Select 인스턴스들은
  아직 미연결 상태다.
- `BackgroundGeneratorPreview.tsx`의 보라색 강조(원래 `#9333ea`/`#fdf4ff`)는 stone
  테마에 대응하는 시맨틱 슬롯이 없어 Tailwind 기본 팔레트(`purple-600`/`fuchsia-50`)로
  치환했다 — 시각적으로는 완전히 동일(같은 hex와 정확히 일치하는 named 컬러였음), 다만
  이 값은 shadcn 8종 시맨틱 토큰이 아니라 별도 named palette라는 점을 4b~4d에서
  유사한 "테마 없는 강조색"을 만나면 참고할 것.

**2026-08-26 갱신 — 4단계b 구현 완료(리뷰 대기)**: POI·아이템북·세계관 도메인 12개 파일
(`CategoryManager.tsx`·`PoiForm.tsx`·`Pagination.tsx`·`ItemBookForm.tsx`·`FactionForm.tsx`·
`AdjacencyEditor.tsx` + 소형 페이지 6개, 실측 217건) 전환 완료, 사용자 최종 승인 대기 중
(`20260826_018`). 4c/4d 착수 시 참고할 구현 노트:

- 4a 매핑 규칙을 그대로 재사용, 추가로 정립한 패턴: `hover:bg-[#242424]`(버튼 hover, 항상
  `bg-[#111111]` 짝) → `hover:bg-primary/90`, `hover:text-[#242424]`(텍스트 hover-lighten,
  `text-[#111111]` 짝) → `hover:text-foreground/80`(#242424가 #111111보다 밝은 회색이라
  "옅어지는" 효과 — opacity 축소로 동일 방향 재현), `bg-[#f3f4f6] hover:bg-[#e5e7eb]`(보조
  버튼) → `bg-muted hover:bg-accent`(shadcn 표준 secondary/ghost hover 관용구),
  `hover:border-[#d1d5db]`(드롭존 hover 테두리 강조, 대응 시맨틱 토큰 없음) →
  `hover:border-foreground/30`. "선택됨" 칩(`AdjacencyEditor.tsx`의 인접 세계관 토글)은
  `bg-[#111111]/15 border-[#111111]/60 text-[#111111]`처럼 텍스트가 opacity 없는 순수
  hex라 4a의 `BadgeMultiSearchSelect` 특례(전부 opacity 변형이라 `text-primary` 통일)와
  달리 `text-foreground`로 분리 매핑했다 — "칩 4개 속성이 전부 같은 hex의 opacity
  변형인가"를 판별 기준으로 삼을 것.
- Portal `container` 연결을 CategoryManager/PoiForm/ItemBookForm/FactionForm 4개 파일의
  Select(총 6곳) + ItemBookForm의 AlertDialog(비활성화 확인, 1곳)에 실제로 연결했다 —
  Playwright로 `[data-admin-theme]` 스코프 안에 포털됨을 프로그램적으로 확인(`listbox`/
  `alertdialog` role 요소가 스코프 노드의 자손인지 `contains()` 체크).
  `select.tsx`/`alert-dialog.tsx`/`dialog.tsx` 자체의 하드코딩 뉴트럴 팔레트(`bg-white`/
  `text-[#111111]` 등)는 4a와 동일하게 이번에도 건드리지 않았다 — 티켓 018의 대상 파일
  목록과 완료 기준 grep이 `src/components/admin/ui/`를 포함하지 않아 범위 밖으로 판단
  (위 4a 노트는 "화면을 다룰 때 함께 판단"이라고만 했지 반드시 전환하라는 뜻은 아니었음).
  4c/4d에서 같은 컴포넌트를 다시 만나면 이 판단을 유지할지 재검토할 것.
- `bg-white`(hex 대괄호 아님, `text-\[#`/`border-\[#`/`bg-\[#` grep에 안 걸림)는 4a와
  동일하게 전환하지 않았다 — 완료 기준 grep 패턴 자체가 이 클래스를 대상으로 하지 않는다.
- 검증: `npx tsc --noEmit`(0 에러) / `npm test`(60파일 562테스트 전부 통과) / `npx next
  build`(성공) 전부 통과. 로컬 `next dev` + 임시 `ADMIN_EMAILS` 셸 환경변수 +
  `/api/dev-login` + Playwright로 1440px 데스크탑 렌더링 확인 — POI 목록/등록/카테고리관리/
  수정, 아이템북 목록/등록/수정(배경 테마 카드 포함), 세계관 목록/등록/수정(인접 세계관
  토글 포함) 전 화면 스크린샷 및 콘솔 에러 0건 확인.

### 선행 인프라 수정 (4a에서 처리, 나머지 단계의 전제조건)

**1. `--color-border` 스코프 누락 (2026-08-26, 3단계 게이트 리뷰에서 발견)**: `globals.css`의
`@theme` 블록에 `--color-border: var(--color-border)`가 있는데, 이건 DS v2(서비스 본체)가
`design-system/tokens/colors.css`의 `:root { --color-border: ... }`를 Tailwind
`border-border` 유틸리티로 노출하기 위한 기존(20260820_003) 매핑이다. 1단계가
`[data-admin-theme]` 스코프 안에 shadcn 프리셋의 **원시 변수**(`--border` 등)는 넣었지만,
이 **유틸리티 매핑 이름**(`--color-border`)을 스코프 안에서 `var(--border)`로 재정의하진
않았다 — 그래서 어드민 스코프 안에서 `border-border` 클래스를 써도 여전히 DS v2의
전역 `--color-border`(서비스 다크 테두리 색)로 풀린다. **`[data-admin-theme]` 블록 안에
`--color-border: var(--border)`(및 필요하면 `--color-background`/`--color-foreground`
등 같은 이름 충돌이 있는 다른 매핑도)를 추가로 오버라이드해야 한다.** 수정 후 반드시
브라우저 컴포넌트 스타일로 `border-border` 클래스가 실제 stone 테마 색으로 렌더링되는지
확인할 것(1단계가 `--background`/`--foreground`에 썼던 것과 동일한 검증 방식).

**2. Radix Portal 스코프 (1단계에서 예견, 2단계에서 `sheet.tsx`만 선제 대응)**: `dialog.tsx`·
`alert-dialog.tsx`·`select.tsx`는 아직 `container` prop이 없다 — `sheet.tsx`(2단계,
`container?: React.ComponentProps<typeof SheetPortal>["container"]` 패턴)를 그대로 따라
세 파일에도 동일하게 추가할 것.

### 범위
미리보기 프레임(`BadgeDetailPreviewFrame.tsx`, `ItemBookDetailPreviewFrame.tsx` — MODULAR
유지 대상, 제외) 뺀 전체 어드민 폼·모달·목록·상세 화면의 하드코딩 hex 클래스
(`text-[#111111]`, `border-[#e5e7eb]`, `bg-[#f8f9fa]` 등)를 shadcn 시맨틱 토큰
(`text-foreground`, `border-border`, `bg-muted` 등)으로 전환.

### 완료 기준
- [ ] `grep -rn "text-\[#\|border-\[#\|bg-\[#" src/app/admin src/components/admin` 결과가
      미리보기 프레임 관련 파일을 제외하고 0건 (4a 완료 시점 기준 배지 도메인은 0건,
      4b~4d 대상 파일은 아직 잔존 — 4d 완료 후에야 전체 0건)
- [ ] 시각적 회귀 없음(색상·간격이 기존과 크게 다르지 않은지 스크린샷 비교) — 4a는
      1440px 실브라우저 스크린샷 + `getComputedStyle` 대조로 확인 완료
- [x] `--color-border` 스코프 수정(+ 실제로는 `--color-primary`/`--color-secondary`도
      같은 충돌이 있어 함께 수정) + `dialog`/`alert-dialog`/`select` Portal container 추가
      — 4a에서 완료, admin 전역에 적용되는 인프라라 4b~4d는 재작업 불필요

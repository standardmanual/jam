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

### 범위
미리보기 프레임(`BadgeDetailPreviewFrame.tsx`, `ItemBookDetailPreviewFrame.tsx` — MODULAR
유지 대상, 제외) 뺀 전체 어드민 폼·모달·목록·상세 화면의 하드코딩 hex 클래스
(`text-[#111111]`, `border-[#e5e7eb]`, `bg-[#f8f9fa]` 등)를 shadcn 시맨틱 토큰
(`text-foreground`, `border-border`, `bg-muted` 등)으로 전환.

범위가 사실상 `src/app/admin/`·`src/components/admin/` 전체라 화면 단위로 여러 티켓으로
쪼갤 가능성이 높다 — 실제 착수 시 오케스트레이터가 하드코딩 발생 빈도 기준으로 세부
티켓을 분리한다(예: 배지 관련, POI 관련, 폼 공통 컴포넌트 등).

**⚠️ Radix Portal 스코프 주의 (1단계 완료 시 발견, 2026-08-26)**: shadcn 테마 실값은
전역 `:root`가 아니라 `[data-admin-theme]` 스코프 셀렉터 안에만 존재한다(1단계에서
`--background`/`--foreground` 이름이 서비스 DS v2와 충돌해 스코프 격리함). `dialog`·
`sheet`·`alert-dialog`·`select` 등 Radix 프리미티브는 `document.body`에 포털 렌더링되므로
`[data-admin-theme]` DOM 서브트리 **밖**이다. 지금(1단계 완료 시점)은 이 컴포넌트들이
하드코딩 팔레트만 써서 무관하지만, 이 Phase에서 시맨틱 클래스(`bg-popover` 등)로 전환하는
순간 CSS 변수가 상속되지 않아 스타일이 깨진다 — Radix Portal의 `container` prop을 admin
스코프 노드로 지정하는 조치를 함께 해야 한다.

### 완료 기준
- [ ] `grep -rn "text-\[#\|border-\[#\|bg-\[#" src/app/admin src/components/admin` 결과가
      미리보기 프레임 관련 파일을 제외하고 0건
- [ ] 시각적 회귀 없음(색상·간격이 기존과 크게 다르지 않은지 스크린샷 비교)

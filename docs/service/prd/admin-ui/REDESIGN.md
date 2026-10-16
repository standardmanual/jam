---
type: prd
description: "어드민을 shadcn/ui 디자인시스템으로 전환하는 원칙, 폴더 분리, 프리셋 값과 미리보기 예외를 정의한 PRD다."
tags: [어드민, 디자인시스템]
code:
  - "jam-web/src/app/admin"
  - "jam-web/src/components/admin"
---

# JAM! 어드민 — UI 디자인시스템 전환 PRD

> **최초 작성:** 2026-08-05
> **전면 개정:** 2026-08-26 — 2026-08-05판은 "shadcn/ui 필수 사용"을 명시했으나 실제로는
> 하드코딩 hex 색상(`text-[#111111]` 등)으로 구현이 새어나가 shadcn 테마 레이어가 한 번도
> 제대로 적용되지 않았다(`components.json`은 있지만 `globals.css`에 shadcn 표준 변수
> `--primary`/`--secondary` 등이 아예 없었음, 2026-08-26 실측 확인). 이번 개정은 그 실패를
> 반복하지 않도록 **테마·아이콘·레이아웃·컴포넌트 전부를 새 프리셋 값으로 일괄 교체**하고,
> 어드민 전용 shadcn 컴포넌트 폴더를 분리해 향후에도 하드코딩으로 새지 않게 구조적으로 막는다.
> **기존 UI 디자인 토큰(2026-08-05판의 Slate 컬러 등)은 참고하지 않고 무시한다** — 아래 새
> 프리셋 값으로 전량 교체가 이번 개정의 원칙이다.

---

## 1. 핵심 원칙 — 두 디자인시스템의 완전 분리

| 영역 | 디자인시스템 |
|---|---|
| **JAM! 서비스 본체** (유저가 쓰는 실제 앱) | MODULAR (`jam-web/design-system/`) — 그대로 유지, 이번 개정과 무관 |
| **JAM! 어드민** (`src/app/admin/`, `src/components/admin/`) | **shadcn/ui** — 이번 개정 대상 |
| **어드민 내 서비스 미리보기** (배지 상세·컬렉션 상세 미리보기 프레임) | **MODULAR 예외 유지** — 실제 유저 화면을 그대로 재현해야 미리보기로서 의미가 있으므로 |

미리보기 예외 대상(이미 올바르게 구현돼 있음, 손대지 않음):
- `src/app/admin/badges/BadgeDetailPreviewFrame.tsx`
- `src/app/admin/itembooks/ItemBookDetailPreviewFrame.tsx`
- 위 두 컴포넌트가 쓰는 `src/components/ui/TopNav.tsx`, `Footer.tsx` 등 — `@ds/components/*`를
  감싼 서비스 전용 래퍼. 이 파일들은 이름은 `components/ui/`에 있지만 **MODULAR 소속**이다.

**원칙**: 어드민 화면에 하드코딩된 색상 값(`text-[#111111]`, `border-[#e5e7eb]` 등)이 하나도
남지 않아야 한다. 모든 시각 속성은 shadcn 시맨틱 토큰(`bg-primary`, `text-muted-foreground`
등)을 통해 제어된다.

### 폴더 분리 (구조적 안전장치)

`src/components/ui/`는 현재 MODULAR 래퍼(`Button.tsx`, `TopNav.tsx`, `TabBar.tsx` 등)와
shadcn 프리미티브(`table.tsx`, `select.tsx` 등)가 한 폴더에 뒤섞여 있고, 이름 충돌 때문에
`shadcn-button.tsx`·`shadcn-badge.tsx`·`shadcn-card.tsx`처럼 접두어로 회피한 흔적이 있다.
이게 2026-08-05 시도가 흐지부지된 원인 중 하나로 보인다. 이번 개정에서 shadcn 컴포넌트
전용 폴더를 분리하고 `components.json`의 `aliases.ui`를 그쪽으로 이전한다 — 자세한 이전
전략은 1단계 티켓에서 jam-developer가 확정(예: `src/components/admin/ui/`).

---

## 2. 테마 — shadcn 공식 프리셋

**프리셋 코드**: `b5Jgcv00m` ([ui.shadcn.com/create?preset=b5Jgcv00m](https://ui.shadcn.com/create?preset=b5Jgcv00m))

| 항목 | 값 | 비고 |
|---|---|---|
| style | `maia` | 컴포넌트 시각 스타일 |
| baseColor | `stone` | 현재 `neutral`에서 교체 |
| theme | `stone` | |
| chartColor | `sky` | |
| radius | `medium` | |
| menuAccent | `bold` | |
| menuColor | `default` | |
| font | ~~`inter`~~ → **Pretendard** | 프리셋 기본값 대신 한국어 최적화 폰트로 교체(아래 참고) |
| iconLibrary | ~~`lucide`~~ → **`tabler`** (`@tabler/icons-react`) | 어드민 전 범위 교체 |

### 적용 방법 (공식 shadcn CLI 사용, 하드코딩 금지)
```bash
npx shadcn@latest apply b5Jgcv00m --only theme,font
```
- `--only theme,font`로 부분 적용(기존 설치된 컴포넌트 재설치 안 함)
- **아이콘 라이브러리는 `--only`가 지원하지 않는다**(공식 제약 — 컴포넌트 재설치가 필요해서).
  `components.json`의 `iconLibrary: "tabler"` 수동 반영 + 기존 아이콘 사용처 3곳
  (`AdminSidebar.tsx`, `AdminHeader.tsx`, `MapPreview.tsx` — `ChevronLeft/Right`, `Menu`,
  `ExternalLink` 4개 심볼) 수동 교체로 처리.
- 폰트는 프리셋 기본값(`inter`)을 그대로 안 쓰고 **Pretendard**로 교체한다. Pretendard는
  이미 `globals.css` 최상단에 CDN import(`@import url('.../pretendard.css')`)로 전역 로드돼
  있어(서비스 본체·어드민 공용, 2026-08-24 확인) 추가 설치 없이 `font-family: 'Pretendard', ...`
  참조만 있으면 된다. 어드민은 지금 `admin/layout.tsx`에서 `next/font/google`로 Inter를
  별도 로드 중(`--font-admin-inter`) — 이 부분을 제거하고 Pretendard 참조로 교체.
  > 2026-10-16 갱신(티켓 20261015_2132): JAM 2.0에서 서비스·어드민 서체가 Noto Sans KR로 바뀌었다. 어드민은 `var(--font-family-base)`를 쓰고 `globals.css` 1행은 Google Fonts CDN이다. 위 서술은 2026-08 당시 기록이다(배지 이미지 생성기만 Pretendard를 따로 불러온다).
- `npx shadcn@latest preset decode b5Jgcv00m`로 언제든 프리셋 값 재확인 가능.

### 충돌 위험 없음 (실측 확인, 2026-08-26)
`globals.css`에는 shadcn 표준 테마 변수(`--primary`, `--secondary`, `--muted`, `--border` 등)가
지금 **전혀 정의돼 있지 않다** — `components.json`은 있지만 테마 레이어가 한 번도 실제
적용된 적이 없었다는 뜻. 서비스 본체(MODULAR)는 완전히 다른 이름 체계(`--color-bg`,
`--color-text` 등)를 쓰므로, 이 프리셋을 `globals.css`에 적용해도 **서비스 본체와 충돌하지
않는다.** 별도 CSS 파일 분리는 불필요 — shadcn CLI가 공식적으로 지원하는 방식(단일
`tailwindCssFile` 직접 수정)을 그대로 따른다.

---

## 3. 레이아웃 셸 — shadcn 공식 Sidebar 블록

현재 `AdminSidebar.tsx` / `AdminNav.tsx` / `AdminHeader.tsx` / `AdminMain.tsx` /
`AdminSidebarContext.tsx`는 전부 손수 구현이다. shadcn 공식 `Sidebar` 컴포넌트/블록으로
교체한다 — 접기/펼치기, 모바일 드로어, 인증 상태(`userEmail`) 표시 등 기존 기능은 유지해야
한다. `npx shadcn@latest docs sidebar`로 정확한 API·예제를 먼저 확인할 것.

---

## 4. 데이터 테이블 — 어드민 목록 표준

참고: [ui.shadcn.com/docs/components/base/data-table](https://ui.shadcn.com/docs/components/base/data-table)

shadcn 공식 Data Table 패턴(`@tanstack/react-table` + `Table` + `Checkbox` + `DropdownMenu`)
위에, 목록 화면마다 반복되던 검색·정렬·페이지 이동·선택·일괄 처리·확인창을 공용 부품으로
뽑았다(티켓 20260924_0940). 화면별 손수 구현을 늘리지 않고 이 부품을 그대로 조합한다.

### 4.1 부품 지도

공용 부품은 `jam-web/src/components/admin/data-table/`(문서 안에서 `DT/`로 줄여 쓴다)에
있다. **파일·export·props의 단일 원천은 티켓 `docs/tickets/p2-normal/20260924_0940_*.md`의
계약 표다** — 새 부품을 추가하거나 계약을 바꿀 때는 그 표부터 갱신한다(여기서는 중복
서술하지 않는다). 주요 구성:

| 구분 | 부품 |
|---|---|
| URL 상태(순수 함수) | `lib/admin/list-params.ts`(`applyListParamPatch`·`filterKeyOf`·`sortToSorting` 등) |
| URL 상태(훅) | `DT/use-list-params.ts`(`useListParams`·`useUrlSorting`) |
| 검색·정렬·페이지 이동 | `DT/data-table-search.tsx`·`DT/data-table-sort-select.tsx`·`DT/data-table-pagination.tsx` |
| 선택 | `DT/use-cross-page-selection.ts`·`DT/data-table-select-all-banner.tsx`·`DT/data-table-select-column.tsx` |
| 일괄 처리 | `lib/admin/bulk/shared.ts`(서버·클라이언트 공용 계약)·`DT/data-table-bulk-action-bar.tsx`·`DT/data-table-bulk-confirm-dialog.tsx` |
| 표 안 즉시 반영 | `DT/data-table-inline-switch.tsx` |
| 행 클릭 이동 | `DT/data-table.tsx`의 `getRowHref`·`DT/row-click.ts` |
| 내보내기 | `lib/admin/csv.ts` |
| 공용 fetch·포털 | `DT/admin-fetch.ts`·`DT/use-admin-portal-container.ts` |

### 4.2 목록 표준 8항목

모든 목록 화면(적용 대상은 상위 티켓 `20260924_0916` §5 참고, 예외 화면도 같은 곳에 있다)이
갖춰야 하는 것:

1. **전체 선택** — 머리 체크박스는 현재 페이지만 선택한다. 페이지 전체가 선택되면
   `DataTableSelectAllBanner`가 "이 조건의 N건 모두 선택"을 보여주고, 누르면 필터 결과
   전체(상한 이내)가 선택된다. 선택은 페이지를 넘겨도 유지된다.
2. **필터** — 메뉴의 상태 값(활성·노출·유형·분류)을 필터로 둔다. 연쇄 필터(예: 유형 →
   종목 → 트라이브)를 지원한다. 필터가 바뀌면 1쪽으로 돌아가고 선택이 풀린다.
3. **페이지 이동** — 번호형(처음·끝, 현재 ±2, 생략 표시, 이전·다음), 한 쪽 50건. 1쪽뿐이면
   숨긴다.
4. **상세 이동** — 같은 탭에서 이동한다. 행 아무 곳이나 눌러도 이동하고(`getRowHref`),
   체크박스·스위치·버튼을 누를 때는 이동하지 않는다.
5. **로더** — 목록 → 상세 이동에 전체 화면 로더를 띄우지 않는다(마우스 오버 시
   `router.prefetch`로 체감 지연만 줄인다).
6. **정렬** — 정렬 드롭다운(`DataTableSortSelect`)과 머리 칸 클릭 정렬(`useUrlSorting`)이
   같은 URL `sort` 값을 공유한다. 페이지가 나뉜 목록은 서버에서 정렬한다.
7. **대표 기능** — 메뉴별 대표 기능은 상위 티켓 §4 표를 따른다(여기서 복사하지 않는다).
   표 안 대표 기능은 메뉴당 1개, 누르면 바로 반영되고 실패하면 원래 값으로 돌아간다(끄는
   쪽이 등급 2인 메뉴는 확인창을 거친다). 일괄 처리 바는 대표 버튼 1~2개 + "더보기".
8. **이름 검색** — `DataTableSearch`가 0.4초 지연 후 URL `q`에 반영한다.

### 4.3 서버 일괄 처리 계약

- 일괄 기능은 메뉴마다 **요청 한 번**으로 처리한다(`POST /api/admin/<메뉴>/bulk`, 본문은
  `lib/admin/bulk/shared.ts`의 `parseBulkBody` 규격 — `{ ids, action, payload?, dry_run?,
  confirm_phrase? }`).
- 상태 변경은 모두 반영되거나 모두 취소된다. 200건 이하는 한 문장으로 처리하고, 200건을
  넘으면(`.in()` 목록이 URL 16KB 상한에 걸림) 바꾸기 전 값을 저장한 뒤 200건씩 반영하며,
  실패하면 저장한 값으로 되돌린다. DB 함수(RPC)는 쓰지 않는다.
- 삭제처럼 참조 보호가 걸린 동작은 막힌 항목만 건너뛰고(`BulkSkip`), 건너뛴 항목과 사유를
  돌려준다. 결과 요약은 `formatBulkResult`/`toastBulkResult`("N건 처리, M건 건너뜀" + 사유).
- 한 번에 처리하는 상한은 1,000건(`BULK_MAX_IDS`)이다. 무거운 동작은 동작별 상한을 더 낮게
  둔다(예: 배지 삭제 100, POI 삭제 200, 아이템 재배정 200, 유저 초기화·삭제 50).
- 등급 2·3의 영향 수치는 같은 API의 `dry_run` 응답(`impact`)이 계산한다. 등급 3의 확인
  문구(`confirmPhraseFor`)도 서버가 정하고, 실행 때 `confirm_phrase`를 다시 대조해 불일치하면
  409를 돌려준다.

### 4.4 위험 등급별 확인창

`BulkConfirmDialog`의 `level` prop이 아래를 그린다.

| 등급 | 해당 동작 | 확인창 |
|---|---|---|
| 1 되돌릴 수 있음 | 활성화, 노출 켜기, 분류 지정, 컬렉션·투데이 카드 비활성화 | "N건을 {동사}할까요?" |
| 2 되돌릴 수 있으나 유저에게 보임 | 배지·POI·트라이브 비활성화, 미션 숨김·기간 종료, 제재 등급 변경·해제·연장, 아이템 재배정 | 1 + 영향 건수 영역(`impact`, 불러오는 중엔 확인 버튼 비활성) |
| 3 되돌릴 수 없음 | 삭제, 아이템 폐기, 획득 이력 삭제, 유저 초기화, 포인트 지급·회수 | 2 + 확인 문구 입력(`isPhraseMatch`, 앞뒤 공백 무시) |

내보내기(CSV, `lib/admin/csv.ts`의 `toCsv`)는 데이터를 바꾸지 않으므로 확인창 없이 바로
내려받는다.

### 4.5 함정

- **`getRowId`는 필수다.** 없으면 행 키가 배열 인덱스로 떨어져 페이지가 달라도 같은 행
  번호끼리 선택이 섞인다 — `DataTable`이 개발 모드에서 감지해 경고한다.
- **서버 컴포넌트(`page.tsx`)에서 클라이언트 컴포넌트로 함수를 prop으로 넘길 수 없다**(RSC
  제약, Phase 3b에서 실측). `hrefBase`/`linkPerItem` 같은 원시값 조합으로 바꾼다.
- Radix Portal(`AlertDialog` 등)은 기본적으로 `document.body`에 렌더링돼 어드민 테마
  스코프(`[data-admin-theme]`) 밖이다 — `useAdminPortalContainer()`가 돌려주는 노드를
  `container` prop에 넘긴다.
- **어드민에 `loading.tsx`를 만들지 않는다** — 전역 로더가 어드민 경로를 일부러 제외한다
  (`NavigationLoader.tsx`, 표준 8항목의 "로더"). 체감 지연은 `router.prefetch`로 줄인다.
- 표 안 스위치·일괄 처리로 데이터를 바꾼 뒤에는 `router.refresh()`로 서버 값을 다시 읽는다.

---

## 5. Phase 분리

2026-08-05판의 Phase 1~3(모바일 CRUD 리디자인 중심)은 **폐기.** 이번 개정은 아래 4단계로
진행하며, 각 단계는 순차 진행(다음 단계는 이전 단계 병합 후 시작) — 상세 범위·완료 기준은
`PHASES.md` 참조.

| Phase | 범위 | 티켓 |
|---|---|---|
| 1. 기반 | shadcn 폴더 분리 + 프리셋 테마 적용 + Pretendard + tabler 아이콘 | (작성 예정) |
| 2. 레이아웃 셸 | Sidebar/Nav/Header → shadcn 공식 Sidebar 블록 | (작성 예정) |
| 3. Data Table | 전체 목록 화면 행선택+일괄액션+공식 Toolbar 필터 전환 | (작성 예정) |
| 4. 하드코딩 제거 | 미리보기 프레임 제외 전체 어드민 화면 하드코딩 hex → shadcn 시맨틱 토큰 | (작성 예정) |

---

## 6. 안 하는 것 / 범위 밖

- 서비스 본체(MODULAR)의 색상·컴포넌트 변경 — 이번 개정과 무관, 절대 건드리지 않음
- 미리보기 프레임(`BadgeDetailPreviewFrame`, `ItemBookDetailPreviewFrame`)의 MODULAR 사용 변경
- 어드민 기능(CRUD 로직, 시뮬레이터, 정책 로직) 자체 변경 — 이번 개정은 순수 UI 프레임워크
  전환이며, 기존 어드민 기능은 전량 유지
- 2026-08-05판 부록 A/B/C(구 shadcn/ui init 명령어, Slate 색상표, 구 컴포넌트 예시)는
  전부 폐기 — 참고하지 말 것

---

## 7. 이전 시도 실패 원인 (참고용, 반복 방지)

- `components.json`만 세팅하고 실제 테마 변수(`globals.css`)를 채우지 않아, 이후 개발자들이
  급한 대로 하드코딩 hex로 스타일을 채워 넣었다 — shadcn 프레임워크가 "설치는 됐지만 실제로
  작동하지 않는" 상태로 방치됨
- `components/ui/` 폴더를 MODULAR와 공유해 이름 충돌(`shadcn-button.tsx` 등 접두어 회피)이
  발생, 정리가 점점 더 어려워짐
- 이번 개정은 두 원인 모두를 구조적으로 제거한다: 프리셋 CLI로 테마를 실제로 채우고,
  shadcn 전용 폴더를 처음부터 분리한다.

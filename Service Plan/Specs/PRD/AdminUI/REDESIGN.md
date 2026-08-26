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

## 4. 데이터 테이블 — shadcn 공식 Data Table 패턴

참고: [ui.shadcn.com/docs/components/base/data-table](https://ui.shadcn.com/docs/components/base/data-table)

지금 어드민 목록 화면은 화면마다 손수 구현된 정적 `<table>`/`<Table>` 나열이라 **행 선택 +
일괄 액션(삭제 등)이 아예 없다.** shadcn 공식 Data Table 패턴(`@tanstack/react-table` +
`Table` + `Checkbox` + `DropdownMenu`)으로 전환한다:

- 행 선택 체크박스(`table.getIsAllPageRowsSelected()` 등)
- 선택된 행 개수 표시 + 일괄 삭제/비활성화 툴바
- **필터 UI도 커스텀 배치 금지** — 공식 Data Table Toolbar 구성
  (`DataTableToolbar` + `DataTableFacetedFilter` + `DataTableViewOptions`: 검색 입력 +
  페싯 필터 드롭다운 + 컬럼 표시 토글 + 초기화 버튼)을 그대로 따른다. 지금의
  `PoiFilters.tsx`/`ItemBookFilters.tsx`/`BadgesFilterBar.tsx` 같은 손수 배치형 필터바는
  전부 이 패턴으로 교체.

**전환 대상 전체 목록 화면**: 배지·POI·아이템북·미션·투데이·레시피·유저·세계관(factions)·
포인트·어뷰징. 일괄 삭제/비활성화용 백엔드 API가 없는 화면은 1단계 구현 시 필요 여부를
화면별로 판단해 신설.

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

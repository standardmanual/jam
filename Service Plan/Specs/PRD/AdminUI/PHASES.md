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
- [ ] 재사용 가능한 Data Table 컴포넌트 1종(column-def 기반) 구축
- [ ] 위 전환 대상 화면 전체가 이 컴포넌트를 사용
- [ ] 필터 UI가 전부 공식 Toolbar 패턴(커스텀 배치 없음)
- [ ] 행 선택 + 일괄 액션(해당 화면에 필요한 것만) 동작 확인
- [ ] 페이지네이션 기존 서버사이드 방식과 통합(20260826_011에서 이미 서버 페이지네이션
      전환된 화면들과 충돌 없이 결합)

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

### 완료 기준
- [ ] `grep -rn "text-\[#\|border-\[#\|bg-\[#" src/app/admin src/components/admin` 결과가
      미리보기 프레임 관련 파일을 제외하고 0건
- [ ] 시각적 회귀 없음(색상·간격이 기존과 크게 다르지 않은지 스크린샷 비교)

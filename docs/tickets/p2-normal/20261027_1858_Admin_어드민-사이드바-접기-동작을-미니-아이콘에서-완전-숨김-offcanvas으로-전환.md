---
id: "20261027_1858"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-27
closed: 2026-10-27
---

# [Admin] 어드민 사이드바 접기 동작을 미니 아이콘에서 완전 숨김(offcanvas)으로 전환

## 핵심 요약
- 요구사항: 어드민 좌측 사이드바 접기 동작을 미니 아이콘 레일 방식(`collapsible="icon"`)에서 화면 바깥으로 완전히 가려지는 오프캔버스 방식(`collapsible="offcanvas"`, shadcn `sidebar-01` 표준)으로 전환하고, 접힌 상태에서 상단 헤더 토글 아이콘 및 최좌측 가장자리 영역 클릭 시 다시 나타나도록 구현
- 구현 계획: `jam-web/src/components/admin/AdminSidebar.tsx`의 `Sidebar` prop을 `collapsible="offcanvas"`로 변경하고, icon 모드 전용 플랫 렌더링 분기(`isIconMode`)를 정리하여 아코디언 메뉴로 단일화, `SidebarRail` 및 `SidebarInset` 확장 동작 검증
- 관련 파일: `jam-web/src/components/admin/AdminSidebar.tsx`, `jam-web/src/components/admin/AdminHeader.tsx`, `jam-web/src/components/admin/ui/sidebar.tsx`

## 배경 / 문제 정의
현재 어드민 사이드바는 접기 버튼 클릭 시 48px 너비의 미니 아이콘 레일(`collapsible="icon"`)로 축소된다. 그러나 어드민 메뉴 그룹과 항목이 많아 아이콘만으로는 메뉴 구별이 어렵고, 최근 반영된 본문 가로 100% 활용 측면에서도 48px 고정 레일이 여전히 공간을 차지하는 한계가 있었다. shadcn UI의 `sidebar-01` 패턴처럼 접었을 때 사이드바를 완전히 숨기고 본문이 브라우저 최좌측까지 100% 확장되도록 개선할 필요가 있다.

## 상세 요구사항
1. 데스크톱 환경에서 사이드바 접기 토글 시 사이드바가 화면 좌측 바깥(`-16rem`)으로 완전히 슬라이드되어 숨겨짐
2. 사이드바가 접히면 본문 컨테이너(`SidebarInset`)가 브라우저 최좌측(`x = 0`)부터 화면 너비 100%를 온전히 채움
3. 접힌 상태에서 메뉴를 다시 여는 경로 보장:
   - 상단 헤더(`AdminHeader`) 최좌측에 위치하는 사이드바 토글 버튼(`SidebarTrigger`) 클릭 시 사이드바 재등장
   - 브라우저 가장 왼쪽 가장자리(`SidebarRail`) 클릭 시 사이드바 재등장
   - 단축키 `Cmd + B` / `Ctrl + B` 입력 시 토글 동작
4. 모바일 환경(768px 미만)에서는 기존 Sheet 드로어 동작 유지
5. `sidebar_state` 쿠키 기반 상태 유지 보장 (새로고침 시 접힘/펼침 상태 유지)
6. `AdminSidebar.tsx`에서 icon 모드 전용 분기(`isIconMode`) 정리

## 구현 계획
1. `jam-web/src/components/admin/AdminSidebar.tsx`:
   - `<Sidebar collapsible="icon">` → `<Sidebar collapsible="offcanvas">`로 변경
   - `isIconMode` 및 플랫 아이콘 렌더링 분기를 제거하고 통일된 아코디언 메뉴 구조 사용
   - 헤더 로고의 불필요한 `group-data-[collapsible=icon]` 조건부 스타일 간소화
2. 동작 검증:
   - 사이드바 접힘 시 너비 0 및 화면 밖 이동 애니메이션 확인
   - 헤더 토글 버튼 및 좌측 레일 클릭 시 재오픈 확인
   - 새로고침 시 쿠키 상태 반영 확인
   - `npm run typecheck`, `npm run lint:ci`, 테스트 및 빌드 검증

## 완료 조건
- [x] 데스크톱에서 사이드바 토글 시 미니 아이콘이 남지 않고 사이드바가 완전히 가려짐
- [x] 사이드바가 가려졌을 때 본문 및 상단 헤더가 브라우저 최좌측부터 100% 채움
- [x] 상단 헤더 좌측의 토글 버튼 클릭 시 사이드바가 다시 슬라이드되어 나타남
- [x] 화면 최좌측 레일 영역 클릭 시 사이드바가 다시 나타남
- [x] `npm run typecheck` 및 `npm run build` 통과

## 완료 기록
- 일자: 2026-10-27
- 작업 내역:
  1. `jam-web/src/components/admin/AdminSidebar.tsx`:
     - `Sidebar`의 `collapsible` 속성을 `"icon"`에서 `"offcanvas"`(shadcn `sidebar-01` 표준)로 전환.
     - 미니 아이콘 전용 플랫 렌더링 분기(`isIconMode`)를 정리하고, 아코디언 메뉴(`Accordion type="multiple"`)로 구조 일원화.
     - 불필요해진 `group-data-[collapsible=icon]` 관련 CSS 클래스 제거 및 스타일 정리.
  2. 동작 원리:
     - 데스크톱: 사이드바 접힘 시 `sidebar.tsx`의 `group-data-[collapsible=offcanvas]:w-0` 및 `left-[calc(var(--sidebar-width)*-1)]` 스타일을 통해 화면 좌측 밖으로 슬라이드되어 숨겨짐.
     - 본문 확장: 본문 영역(`SidebarInset`)이 최좌측(`x = 0`)부터 화면 너비 100%를 온전히 채움.
     - 재오픈 경로: 상단 헤더 좌측의 `SidebarTrigger` 토글 버튼, 최좌측 8px 폭의 `SidebarRail`, 단축키 `Cmd + B` / `Ctrl + B`를 통해 언제든 사이드바를 다시 펼칠 수 있음.
     - 모바일: `Sidebar`의 `isMobile` Radix Sheet 드로어 동작이 완벽히 유지됨.
- 검증 결과:
  - 타입체크: `npm --prefix jam-web run typecheck` 통과 (에러 0건)
  - 린트 검사: `npm --prefix jam-web run lint:ci` 통과 (에러 0건)
  - 단위/통합 테스트: `npx vitest run src/app/admin src/components/admin` 102개 테스트 파일, 1,718개 테스트 전체 통과
  - 프로덕션 빌드: `npm --prefix jam-web run build` Next.js 16.3.6 Turbopack 프로덕션 빌드 성공 (191개 정적 페이지 생성 완료)
- 변경 파일:
  - `jam-web/src/components/admin/AdminSidebar.tsx`
  - `docs/tickets/p2-normal/20261027_1858_Admin_어드민-사이드바-접기-동작을-미니-아이콘에서-완전-숨김-offcanvas으로-전환.md`

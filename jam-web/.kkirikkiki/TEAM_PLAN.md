# Phase 1 개발 팀 계획

- **팀명:** kkirikkiri-admin-ui-phase1
- **목표:** 배지/POI/아이템북 CRUD를 shadcn/ui 기반 모바일 최적화 UI로 구현
- **기간:** 1-2주 (2026-08-05 시작)
- **환경:** Node.js v25.9.0, npm 11.12.1, shadcn/ui ✅ 설치됨

---

## 팀 구성

| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| **Leader** | 팀장 | Opus | 전체 계획/배분/리뷰/통합 |
| **FrontDev-1** | Frontend Developer | Opus | AdminLayout + 네비게이션 구현 |
| **FrontDev-2** | Frontend Developer | Opus | Badge CRUD UI 구현 |
| **FrontDev-3** | Frontend Developer | Sonnet | POI + ItemBook CRUD UI 구현 |
| **Tester** | QA/Tester | Sonnet | 반응형 테스트 + 회귀 테스트 |

---

## 태스크 분배

### FrontDev-1: AdminLayout + 네비게이션 (핵심 기초)
1. `src/app/admin/layout.tsx` 생성 (공통 레이아웃)
2. `src/components/admin/AdminHeader.tsx` 생성 (헤더)
3. `src/components/admin/AdminSidebar.tsx` 생성 (데스크탑 사이드바)
4. `src/components/admin/AdminNav.tsx` 생성 (모바일 드로어 네비)
5. 반응형 테스트 (모바일 375px ~ 데스크탑 1440px)

**결과물:** 모든 어드민 페이지가 공통 레이아웃을 사용하며 모바일/데스크탑 모두 동작

### FrontDev-2: Badge CRUD UI
1. `src/components/admin/badges/BadgeCard.tsx` (모바일 카드)
2. `src/components/admin/badges/BadgesTable.tsx` (데스크탑 테이블)
3. `src/components/admin/badges/BadgeList.tsx` (목록 페이지 통합)
4. `src/app/admin/badges/page.tsx` 리디자인 (검색 + 필터 포함)
5. `src/components/admin/badges/BadgeDetail.tsx` (상세 페이지)
6. `src/app/admin/badges/[id]/page.tsx` 신규 생성
7. `src/components/admin/badges/BadgeForm.tsx` (수정/생성 폼)
8. 조건 빌더 shadcn/ui 통합 (기존 로직 재사용)

**결과물:** 배지 목록→상세→수정 전체 흐름 모바일 최적화

### FrontDev-3: POI + ItemBook CRUD UI
1. POI: BadgeCard/Table/List/Detail/Form 동일 패턴
2. ItemBook: Badge와 동일한 UI 구조
3. 반응형 + shadcn/ui 컴포넌트 사용

**결과물:** POI + ItemBook 완전 구현

### Tester: 반응형 테스트 + 회귀 테스트
1. 모바일 (375px, 480px, 600px) 테스트
2. 태블릿 (768px) 테스트
3. 데스크탑 (1024px, 1440px) 테스트
4. 다크 모드 테스트
5. 기존 배지/POI 기능 회귀 테스트 (생성/수정/삭제/필터)

**결과물:** 모든 화면 Lighthouse Mobile ≥ 80 확인

---

## 참고 문서

- **ADMIN_UI_REDESIGN_20260805.md** — 화면 설계 (먼저 읽기!)
- **ADMIN_UI_PROJECT_SPEC_20260805.md** — 코드 규칙 (개발 중 계속 참조)
- **ADMIN_UI_DATA_MODEL_20260805.md** — 데이터 구조

---

## 주요 결정사항

- shadcn/ui 컴포넌트만 사용 (커스텀 금지)
- 모바일 우선 Tailwind CSS (className="block md:hidden" 패턴)
- 터치 타겟 최소 44×44px
- Git 커밋: "feat: 배지 목록 모바일 UI" 형식
- 모든 변경사항을 TEAM_PROGRESS.md에 기록

---

## 예상 일정

| 날짜 | 마일스톤 | 담당 |
|------|----------|------|
| 08-05 | 레이아웃 기초 + 배지 CRUD 시작 | FrontDev-1/2 |
| 08-07 | 배지 CRUD 완료 | FrontDev-2 |
| 08-08 | POI + ItemBook CRUD 완료 | FrontDev-3 |
| 08-10 | 통합 테스트 + 버그 수정 | Tester |
| 08-12 | Phase 1 배포 ✅ | Leader |

---

## [NEEDS CLARIFICATION]

- [ ] 배포 담당자: Vercel 권한?
- [ ] 배포 시점: 완료 후 즉시 vs 별도 일정?


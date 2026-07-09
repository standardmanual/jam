# 진행 상황

## 2026-07-09 — 메인세션
- 상태: 팀 초기화 완료
- 작업: 공유 메모리 파일 생성, 팀 스폰 준비
- 다음: jam-lead 스폰 → 프로젝트 초기화 지시

## 2026-07-09 — jam-lead (Task #1 완료)
- 상태: 완료
- 프로젝트 경로: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/jam-web/
- 완료 항목:
  - Next.js 15 프로젝트 생성 (App Router, TypeScript, Tailwind CSS, ESLint)
  - @supabase/supabase-js @supabase/ssr 의존성 설치
  - 전체 디렉토리 구조 생성 (src/app/(auth), (main), api, components, lib, types)
  - .env.local / .env.example 생성 (환경변수 키 목록 포함)
  - supabase/migrations/001_initial_schema.sql — 전체 스키마 + RLS 정책 + 트리거
  - src/lib/supabase/client.ts — 브라우저 클라이언트
  - src/lib/supabase/server.ts — 서버 클라이언트 + 서비스 롤 클라이언트
  - src/types/database.ts — 전체 DB 스키마 TypeScript 타입
  - src/types/strava.ts — Strava API 응답 타입 (NormalizedActivity 포함)
  - src/lib/utils.ts — 암호화/복호화, 한국어 유틸, cn()
  - TypeScript 타입 체크 통과 (npx tsc --noEmit)

## Task #2, 3, 4 — 팀원 병렬 작업 시작 가능

## 2026-07-09 — jam-auth (Task #2 완료)
- 상태: 완료
- 담당: 인증 레이어 (미들웨어, 로그인, OAuth 콜백, 온보딩, 프로필)
- 완료 항목:
  - src/middleware.ts — Supabase SSR 미들웨어, 미인증 리다이렉트, /login 보호
  - src/app/(auth)/login/page.tsx — 구글 소셜 로그인 UI (모바일 우선, 에러 처리)
  - src/app/auth/callback/route.ts — OAuth 콜백, 온보딩 분기 처리
  - src/app/(main)/onboarding/page.tsx — 활동 종목/지역 선택, 유효성 검사
  - src/app/(main)/profile/page.tsx — 프로필 편집, Strava 연동 상태, 로그아웃
- 비고: supabase-js update() 파라미터 never 타입 이슈 — @ts-expect-error 처리. TEAM_FINDINGS.md DEAD_ENDS 참고

## 2026-07-09 — jam-strava (Task #3 완료)
- 상태: 완료
- 담당: Strava OAuth, 동기화 로직, 배지 발급 엔진
- 완료 항목:
  - src/lib/strava/api.ts — Strava API 래퍼 (getActivities, refreshStravaToken, getAthleteProfile, rate limit 체크)
  - src/app/api/strava/auth/route.ts — Strava OAuth 시작 (GET, userId를 state로 CSRF 방지)
  - src/app/api/strava/callback/route.ts — Strava OAuth 콜백 (토큰 교환 → encrypt → upsert → 즉시 동기화)
  - src/lib/strava/sync.ts — 핵심 동기화 로직 (토큰 갱신, last_synced_at 필터, 배지 엔진 연동)
  - src/lib/badge-engine/index.ts — 배지 발급 엔진 (condition_json 평가, AND 조건, streak 계산)
  - src/app/api/strava/sync/route.ts — 수동 동기화 API (POST)
  - src/app/api/cron/sync/route.ts — Vercel Cron 정기 동기화 (GET, CRON_SECRET 검증)
  - vercel.json — Cron 설정 (매일 12:00 UTC = 21:00 KST)
- 부수 수정: src/types/database.ts에 Relationships:[] 추가 + Views/Functions를 Record<never,never>로 변경 → TypeScript 전체 통과

## 2026-07-09 — jam-lead (Task #5 완료 — 통합 + 검증)
- 상태: 완료
- 담당: 통합 검증, 빌드 확인, 환경변수 가이드 작성
- 완료 항목:
  - TypeScript 타입 체크: 오류 없음 (npx tsc --noEmit 통과)
  - 빌드: 성공 (Next.js 16.2.10 Turbopack, 13개 페이지/라우트 생성)
  - 누락 파일 없음: 17개 핵심 파일 전체 존재 확인
  - SETUP.md 생성: jam-web/SETUP.md (Supabase/Google OAuth/Strava/Vercel 단계별 가이드)
- 빌드 경고:
  - middleware 파일 컨벤션 deprecated 경고 (proxy로 교체 권장 — Next.js 16 변경사항, 기능은 정상 작동)
- 남은 작업 (사람이 해야 하는 것):
  1. 환경변수 채우기 (.env.local) — SETUP.md 참고
  2. Supabase DB 마이그레이션 실행 (supabase db push)
  3. Google OAuth 앱 등록 및 Supabase에 Client ID/Secret 등록
  4. Strava API 앱 등록
  5. Vercel에 환경변수 등록 후 배포 (vercel --prod)

## 2026-07-09 — jam-ui (Task #4 완료)
- 상태: 완료
- 담당: UI 레이어 (홈 피드, 나의 배지, 배지 상세, 공유 카드, 공통 컴포넌트)
- 완료 항목:
  - src/components/ui/Button.tsx — 공통 버튼 (primary/secondary/ghost/danger, 사이즈, 로딩)
  - src/components/ui/Card.tsx — 카드 컨테이너 (glow 옵션)
  - src/components/ui/Badge.tsx — 희귀도 배지 컴포넌트 (common/rare/legendary/mythic)
  - src/components/ui/LoadingSpinner.tsx — 로딩 스피너
  - src/components/ui/Toast.tsx — 토스트 알림 (Context + Provider + useToast)
  - src/components/strava/StravaStatusCard.tsx — Strava 연동 상태 카드 (jam-auth 프로필에서 사용)
  - src/app/(main)/layout.tsx — 메인 레이아웃 (인증 체크, 헤더, 하단 탭바, safe-area)
  - src/app/(main)/TabBar.tsx — 하단 탭 네비게이션 (홈/배지/인벤토리-준비중/프로필)
  - src/app/(main)/page.tsx — 홈 피드 (닉네임 인사, Strava 상태, 최근 배지 3개)
  - src/app/(main)/SyncButton.tsx — 지금 동기화 버튼 (클라이언트 컴포넌트)
  - src/app/(main)/badges/page.tsx — 나의 배지 컬렉션 (서버 컴포넌트)
  - src/app/(main)/badges/BadgesClient.tsx — 배지 탭 UI (액티비티/아이템북 탭)
  - src/app/(main)/badges/[id]/page.tsx — 배지 상세 (POI 아웃링크, 실물 패치 버튼)
  - src/app/(main)/badges/[id]/ShareCardModal.tsx — 공유 카드 생성 모달 (Web Share API)
  - src/app/api/share-card/generate/route.tsx — 서버사이드 카드 생성 (@vercel/og, edge runtime)
- 비고:
  - @vercel/og 패키지 설치 완료
  - 내 코드 타입 오류 없음 (jam-strava 파일에 타입 오류 있음 — 해당 팀 수정 필요)
  - profile/page.tsx는 jam-auth가 이미 완료하여 중복 생성 안 함

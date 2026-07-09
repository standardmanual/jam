# 팀 작업 계획

- 팀명: kkirikkiri-dev-jam-phase1
- 목표: JAM! 유저 모바일 웹 Phase 1 병렬 구현
- 생성 시각: 2026-07-09

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| jam-lead | 팀장 | Opus | 아키텍처 설계, 프로젝트 초기화, 태스크 배분, 코드 리뷰, 통합/배포 |
| jam-auth | 개발자 1 | Opus | 인증 레이어 (구글 로그인, Supabase Auth, 프로필 설정 화면) |
| jam-strava | 개발자 2 | Opus | Strava 레이어 (OAuth, 동기화 로직, 배지 발급 엔진) |
| jam-ui | 개발자 3 | Opus | UI 레이어 (홈 피드, 나의 배지, 배지 상세, 인스타 공유 카드) |

## PRD 위치
- 요구사항: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/01_PRD.md
- 데이터 모델: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/02_DATA_MODEL.md
- Phase 계획: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/03_PHASES.md
- 프로젝트 스펙: /Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/PRD/04_PROJECT_SPEC.md

## Phase 1 범위 (팀장이 지휘)
- [ ] 프로젝트 초기화 (Next.js 15 + Supabase + Tailwind CSS 4) → jam-lead
- [ ] Supabase 스키마 마이그레이션 → jam-lead
- [ ] 구글 소셜 로그인 + 온보딩 화면 → jam-auth
- [ ] 프로필 설정 화면 (활동 종목, 지역) → jam-auth
- [ ] Strava OAuth 연동 → jam-strava
- [ ] 로그인 시점 동기화 → jam-strava
- [ ] 정기 동기화 (Vercel Cron) → jam-strava
- [ ] 배지 발급 엔진 (조건 매칭 로직) → jam-strava
- [ ] 홈 피드 화면 → jam-ui
- [ ] 나의 배지 컬렉션 화면 → jam-ui
- [ ] 배지 상세 화면 → jam-ui
- [ ] 인스타 공유 카드 생성 → jam-ui

## 절대 하지 마 (PRD 04_PROJECT_SPEC.md 기준)
- 자체 GPS 트래킹 UI 만들지 마
- 과거 데이터 소급 분석하지 마 (연동 이후 활동만)
- 인앱 지도 화면 만들지 마 (POI 아웃링크만)
- API 키/비밀번호 코드에 직접 쓰지 마 (.env.local 사용)
- Strava access_token 평문 저장하지 마 (암호화 필수)
- 목업/하드코딩 데이터로 완성이라고 하지 마

## 주요 결정사항

### 2026-07-09 — jam-lead

1. **Next.js 버전**: create-next-app이 16.2.10을 설치했으나 내부 Next.js는 15 계열 App Router 구조 사용
2. **Supabase 클라이언트 패턴**: `@supabase/ssr` 사용. client/server 분리. 서비스 롤은 `createServiceClient()`
3. **토큰 암호화**: Node.js 내장 crypto (AES-256-CBC). 외부 라이브러리 추가 없음
4. **DB 트리거**: `auth.users` INSERT 시 자동으로 `public.users` + `inventory` 생성 (온보딩 단계 간소화)
5. **RLS 전략**: 배지 발급(INSERT)은 클라이언트 정책 없음 → service_role만 가능 (어뷰징 방지)
6. **공유 카드**: Satori(서버사이드) 권장 — html2canvas는 Safari 호환성 이슈 있음 (jam-ui 참고)
7. **Strava 동기화**: Vercel Cron으로 일 1회. Webhook은 Phase 2+ 고려

### 2026-07-09 — jam-auth (통합 시 확인 필요)
- **타입 이슈**: `supabase-js update()` 파라미터가 `never`로 추론됨. 수동 정의 `Database` 타입과 supabase-js 제네릭 불일치가 원인. 현재 `@ts-expect-error`로 우회. 통합 단계에서 `supabase gen types typescript` 자동 생성 타입으로 교체 권장.

### 2026-07-09 — jam-ui (통합 시 확인 필요)
- **jam-strava 타입 오류**: jam-strava 파일들에 Database 제네릭 타입 미적용으로 인한 DB 타입 오류 다수 존재. jam-strava 완료 후 통합 단계에서 jam-lead가 일괄 수정할 것.
- **@vercel/og**: 설치 완료. share-card API는 edge runtime 사용.

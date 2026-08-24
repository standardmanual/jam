# JAM! 유저 모바일 웹 — 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.
>
> **2026-08-06 갱신**: 코드베이스(`jam-web/`) 전수 대조로 현재 상태 기준 재작성.
>
> **핵심 루프(동기화→배지→드랍→포인트)에 손대는 작업이면 [DEV_PROCESS_GUARDRAILS.md](../DEV_PROCESS_GUARDRAILS.md)를
> 먼저 확인하세요** — 과거에 반복된 개발 프로세스 실수 패턴과 의존성 지도가 정리돼 있습니다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| 프레임워크 | **Next.js 16.2.10** (App Router), React 19.2.4 | ⚠️ 원안은 Next.js 15로 기재돼 있었으나 실제는 16. Next 16은 브레이킹 체인지가 있어 `node_modules/next/dist/docs/`의 마이그레이션 노트를 먼저 확인할 것 |
| 미들웨어 | **`src/proxy.ts`** (`proxy()` export + `config.matcher`) | Next 16 컨벤션 변경 — `middleware.ts`가 아님. 인증 리다이렉트·어드민 접근 제어 담당 |
| DB / 백엔드 | Supabase (PostgreSQL) | `@supabase/supabase-js` ^2.110.1, `@supabase/ssr` ^0.12.0 |
| 배포 | Vercel | `vercel.json`에 Cron 4건 등록 (아래 참고) |
| 인증 | Supabase Auth + Google OAuth | 어드민은 이중 구조 — 아래 "어드민 인증" 참고 |
| 스타일링 | Tailwind CSS 4 | + Radix UI(accordion/checkbox/dialog/select/slot/tabs), `class-variance-authority`, `tailwind-merge`, `lucide-react` |
| 지도 | **네이버 지도 (NCP Maps.js)** | ⚠️ 원안은 Google Maps JS API였으나 2026-07-22 전환됨. `src/components/map/MapView.tsx` |
| POI 소스 (T2) | **네이버 지역검색 오픈API** | ⚠️ 원안은 OpenStreetMap Overpass API였으나 2026-07-22 전환됨. 캐시는 `poi_search_cache` 테이블(TTL) |
| 테스트 | **vitest** v4.1.10 + `@vitejs/plugin-react` | `npm test` (run) / `npm run test:watch` (watch). node:assert 기반 파일(`today`, `missions` __tests__)은 `npx tsx`로 직접 실행 |
| Strava 연동 | Strava OAuth 2.0 + Activities API | rate limit: 200/15분, 2000/일. `strava_activities` 테이블에 정규화 원본 저장 |

---

## 프로젝트 구조

```
jam-web/
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (main)/             # badges, collections, combine, drops, inventory,
│   │   │                       # missions, onboarding, points, profile, search,
│   │   │                       # today, [username] 등
│   │   ├── admin/               # abusing, ambient-drop-policy, badges, combine-policy,
│   │   │                       # drop-policy, factions, itembooks, missions, poi,
│   │   │                       # points, recipes, simulator, theme, today, users
│   │   ├── api/                 # admin, combine, cron, drops, follows, inventory,
│   │   │                       # itembooks, missions, onboarding, poi-badges,
│   │   │                       # points, profile, strava, username, users
│   │   └── auth/callback/
│   ├── proxy.ts                 # 미들웨어 (Next 16 컨벤션)
│   ├── components/
│   │   ├── ui/                  # Radix 기반 공통 컴포넌트
│   │   ├── badge/, map/, strava/ 등
│   ├── lib/
│   │   ├── supabase/            # 클라이언트 (server/client 분리)
│   │   ├── strava/              # Strava API 래퍼
│   │   ├── badge-engine/        # 액티비티배지 엔진 (+__tests__)
│   │   ├── drop-engine/         # 드랍엔진 v2 (+__tests__)
│   │   ├── ambient-drop/        # 앰비언트(시스템) POI 드랍
│   │   ├── combine/             # 아이템 조합 엔진
│   │   ├── missions/            # 미션 시스템 (+__tests__)
│   │   ├── points/              # 포인트 시스템 (+__tests__)
│   │   ├── poi/                 # POI 검색/매칭
│   │   ├── abusing/             # 어뷰징 탐지 (섀도우밴 공용)
│   │   ├── admin/                # 어드민 보조 인증
│   │   ├── activity-feed/       # 통합 피드
│   │   ├── engine-log/          # 엔진 판정 로그
│   │   ├── today/               # 홈 CMS (+__tests__)
│   │   ├── theme/, i18n/
│   │   └── utils.ts
│   └── types/
├── public/badges/, public/icons/
├── .env.local                   # 절대 GitHub에 올리지 마세요
├── .env.example
└── package.json
```

> 원안 대비 `combine/`, `missions/`, `points/`, `ambient-drop/`, `engine-log/`, `today/`, `abusing/`, `admin/` 등이 신규 도입됨. 이제 `badge-engine`(발급) + `drop-engine`(드랍) 2개 엔진뿐 아니라 조합·미션·포인트가 독립 도메인으로 존재.

---

## 어드민 인증 (이중 구조)

1. **`proxy.ts` 레벨**: `/admin/*` 요청 시 Supabase Auth 세션 확인 → `ADMIN_EMAILS`(쉼표 구분) 화이트리스트 대조 → 불일치 시 `/forbidden`
2. **보조 인증**: `ADMIN_SECRET` 비밀번호 기반 쿠키(`admin_token`) — `api/admin/auth`, `api/admin/test/simulate` 등 일부 API가 사용. 시뮬레이터처럼 세션 없이도 호출해야 하는 경로용.

코드 작성 시 어느 인증 경로를 쓰는지 명확히 구분할 것 — 새 어드민 API가 필요하면 기존 라우트가 둘 중 어느 방식을 쓰는지 먼저 확인.

---

## Vercel Cron 작업

| 경로 | 스케줄(UTC) | 역할 |
|------|------------|------|
| `/api/cron/poi-cleanup` | 매일 00:00 | 만료된 유저 드랍 소각(30일 만료) |
| `/api/cron/ambient-drop-monitor` | 매일 18:00 | 앰비언트 드랍 목표 수량 보충 배치 |

> **2026-08-10 제거**: `/api/cron/reconcile`(Strava 활동 소급 재점검, 매일 12:00)은 API 호출량 절감을 위해 완전히 삭제됐다. 이 크론이 완충하던 "동기화 실패 시 커서(`last_synced_at`)가 잘못 전진해 이후 재시도까지 과거 활동을 영영 놓치는" 문제는 근본 수정으로 대체했다 — `syncStravaActivities` 처리 중 예외 발생 시 `last_synced_at`을 롤백하고, OAuth 콜백의 즉시 동기화 호출도 fire-and-forget에서 `await`로 변경(서버리스 강제 종료로 처리가 끊기는 것 방지). 상세: [History/Migration/Ticket/20260810_002](../../History/Migration/Ticket/20260810_002_Service_reconcile-크론-제거-및-동기화-커서-롤백.md).

> **2026-08-24 제거**: `/api/cron/wandering`(신화 아이템 재배치, 매일 06:00)은 해당 기능 자체가 전면 제거되면서 함께 삭제됐다. 스키마·Cron만 있고 컨텐츠가 한 번도 붙지 않아 프로덕션 실사용이 0건이었다. 상세: [History/Migration/Ticket/20260824_017](../../History/Migration/Ticket/20260824_017_Infra_떠돌이신화-기능-전면제거.md).

모든 Cron 라우트는 `Authorization: Bearer {CRON_SECRET}` 검증. (Vercel Hobby 플랜은 일 1회 초과 빈도의 Cron을 배포 시점에 거부하므로 빈도 변경 시 주의 — [BadgeEngine 문서](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) §3.12 참고)

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- **자체 GPS 트래킹 UI 만들지 마** — "운동 시작" 버튼, 실시간 지도, 거리 카운터 전부 금지. JAM! 핵심 철학 위반 (드랍/픽업 지도는 위치 조회용이지 트래킹 UI가 아님 — 혼동 금지)
- **과거 데이터 소급 분석하지 마** — Strava 연동 시점 이후 활동만 처리 (단, 첫 싱크 자체는 연동 시점까지의 누적 이력을 최신 1건 기준으로 평가하는 것이 정책이므로 별개)
- **API 키나 비밀번호를 코드에 직접 쓰지 마** — 반드시 `.env.local` 환경변수 사용
- **Strava access_token을 평문으로 DB에 저장하지 마** — `ENCRYPTION_KEY`로 암호화 필수
- **기존 DB 스키마를 임의로 변경하지 마** — 마이그레이션 파일 작성 후 리뷰 요청 (현재 080까지 진행, 번호 이어서 작성 — 새로 시작하기 전 `ls supabase/migrations | tail`로 직접 확인할 것, 045가 두 파일에 중복 부여됐던 전례 있음)
- **테이블뿐 아니라 함수·트리거도 마이그레이션 파일 없이 운영 DB에서 직접(SQL 에디터·MCP execute_sql 등) 재정의하지 마** — 2026-08-11 `handle_new_user()` 트리거 함수가 마이그레이션 파일 없이 운영 DB에서만 재정의되면서 인벤토리 생성 구문이 누락된 채 방치돼, 신규 유저 3명의 아이템 배지가 조용히 미발급되는 인시던트가 있었음(원인 규명 불가 — 추적 기록 자체가 없었음). `execute_sql`은 조회·데이터 백필(별도 티켓 문서화 전제)에만 쓰고, 함수/트리거/컬럼 등 스키마·로직 정의 변경은 반드시 새 마이그레이션 파일 작성 → `apply_migration`으로 적용 → 커밋까지 한 번에 끝낼 것. 프로젝트 규모상 `supabase_migrations.schema_migrations`에 이력이 다 남지 않는 경우도 있으므로, 의심 시 [BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) 같은 핵심 로직 문서보다도 `pg_get_functiondef`로 운영 DB 실물을 먼저 확인할 것 (Service Plan/History/Migration/Ticket/20260811_001 참고)
- **목업/하드코딩 데이터로 완성이라고 하지 마** — 실제 Strava 계정 연동 테스트 필수
- **package.json 의존성 버전을 임의로 변경하지 마** — 보안 패치 외 버전 고정. 특히 Next.js는 16 메이저 버전 고정 — 임의 업/다운그레이드 금지
- **Strava rate limit 초과하지 마** — 200/15분, 2000/일 제한. 배치 처리 시 딜레이 추가
- **인벤토리 슬롯 체크 없이 아이템 추가하지 마** — 50슬롯 초과 방지 로직 항상 포함 (단, `slotted_in`으로 컬렉션에 장착된 아이템은 슬롯 차감에서 제외)
- **네이버 지역검색 API 캐시 없이 반복 호출하지 마** — `poi_search_cache` TTL 정책 우회 금지 (구 OSM 규칙 "브랜드 조건 AND 체이닝 금지"는 데이터소스 전환으로 더 이상 적용 대상 아님)
- **poi_drops 테이블에 ON CONFLICT (osm_id) 부분 인덱스로 upsert하지 마** — UNIQUE constraint만 ON CONFLICT 대상 가능 (osm_id는 레거시 컬럼, 신규 로직은 naver_id 기준)
- **point_wallets.balance를 직접 UPDATE하지 마** — 반드시 `award_points()` RPC 경유. 원장(point_transactions)과의 정합성이 깨지면 어드민 대사 화면에서 즉시 드러남
- **`inventory/flea-market` 화면에 실거래 로직을 임의로 연결하지 마** — 현재 "coming soon" placeholder 상태. 실제 P2P 거래는 `trades` 테이블 설계부터 재검토 필요

---

## 항상 해 (ALWAYS DO)

- **변경하기 전에 계획을 먼저 보여줘** — 특히 DB 스키마 변경 시
- **환경변수는 .env.local에 저장** — .env.example에 키 이름만 추가
- **에러가 발생하면 사용자에게 친절한 한국어 메시지 표시** — "오류가 발생했어요. 잠시 후 다시 시도해주세요."
- **모바일 우선 반응형 디자인** — 375px(iPhone SE) ~ 430px(iPhone Pro Max) 기준. 어드민은 예외(아래 참고)
- **Strava API 응답 타입 정의** — any 사용 금지. types/ 폴더에 타입 추가
- **배지 발급 로직은 서버 사이드에서만** — 클라이언트에서 배지 조건 직접 체크하면 어뷰징 가능
- **Supabase RLS(Row Level Security) 활성화** — 마이그레이션 전체에서 19건 확인됨. 신규 테이블 추가 시에도 반드시 적용 (누락 시 `engine_decision_log`처럼 사후에 별도 마이그레이션으로 추가해야 했던 사례 있음 — 처음부터 포함할 것)
- **어드민 화면은 데스크탑 우선(1024px+)** — 유저 화면과 반응형 기준이 다름
- **핵심 루프(위 DEV_PROCESS_GUARDRAILS.md 의존성 지도 대상)를 건드리는 작업은 시작 전에
  "어떤 테이블/파일에 영향 주는지"를 평문 한국어로 먼저 보고하고 진행 확인받기** — 비개발자인
  사용자도 코드를 안 읽고 범위만으로 판단할 수 있게 하기 위함
- **`users` 테이블 등 DB 컬럼을 참조하는 타입을 새로 쓰거나 의심될 땐 `npm run db:types`로
  `database.generated.ts`를 재생성해 `database.ts`와 대조** — 손으로 쓴 타입이 실제 스키마와
  어긋나 있어도 지금 구조에선 자동으로 안 걸러짐(2026-08-11 UserRow 5개 컬럼 누락 사례)

---

## 테스트 방법

```bash
# 로컬 실행
npm run dev

# TypeScript 타입 체크
npx tsc --noEmit

# 빌드 확인 (배포 전 필수)
npm run build

# 단위 테스트 (vitest)
npm test            # 전체 1회 실행
npm run test:watch  # 변경 감지 watch 모드

# node:assert 기반 파일 (today, missions __tests__) — vitest 제외, 직접 실행
npx tsx src/lib/today/__tests__/today-logic.test.ts
npx tsx src/lib/missions/__tests__/checker-logic.test.ts

# Supabase 로컬 개발 (선택)
npx supabase start
```

---

## 배포 방법

```bash
# Vercel CLI 설치 (최초 1회)
npm i -g vercel

# 프로덕션 배포
vercel --prod

# 환경변수는 Vercel 대시보드에서 설정
# vercel.com → 프로젝트 → Settings → Environment Variables
```

---

## 환경변수

| 변수명 | 설명 | 비고 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서버 전용 키 (클라이언트 노출 금지) | |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | Supabase 신규 키 체계 | `src/` 코드 미참조이나 **사용중** (Supabase 인프라/대시보드 레벨) — `.env.local`에 유지 |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | Strava 앱 OAuth 키 | |
| `ENCRYPTION_KEY` | Strava 토큰 암호화 키 (hex) | `openssl rand -hex 32` |
| `ADMIN_EMAILS` | `/admin/*` 접근 허용 이메일 화이트리스트 (쉼표 구분) | `proxy.ts` |
| `ADMIN_SECRET` | 어드민 보조 인증 비밀번호 (쿠키 토큰 발급용) | 시뮬레이터 등 |
| `CRON_SECRET` | Vercel Cron 요청 인증 | 4개 Cron 라우트 공통 |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 SDK 클라이언트 ID | |
| `NCP_MAP_CLIENT_SECRET` | 네이버 클라우드 플랫폼 지도 서버 인증 | |
| `NEXT_PUBLIC_NAVER_MAP_STYLE_ID` | 네이버 지도 커스텀 스타일 ID | |
| `NAVER_LOCAL_SEARCH_CLIENT_ID` / `NAVER_LOCAL_SEARCH_CLIENT_SECRET` | 네이버 지역검색 오픈API (T2 POI 소스) | |
| `NEXT_PUBLIC_BASE_URL` | 서비스 도메인 URL | **`https://j-a-m.app`** (2026-08-06부로 `jam-rose.app`에서 전환) |
| `FOREST_SERVICE_KEY` | 산림청 API 키 | `src/` 미참조이나 **사용중** (Edge Function 또는 외부 파이프라인) — `.env.local`에 유지 |

> ⚠️ **삭제된 변수**: `STRAVA_REDIRECT_URI`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — 각각 도메인 전환(2026-08-06), 지도 전환(2026-07-22)으로 더 이상 사용 안 함. 과거 문서에 남아있다면 착오.
>
> `.env.local` 파일에 저장. 절대 GitHub에 올리지 마세요. `.gitignore`에 `.env.local` 포함 여부 확인 필수.

---

## JAM! 핵심 비즈니스 규칙 (AI 코드 생성 시 준수)

1. **배지 발급은 서버 사이드에서만**: 클라이언트 단에서 badge 조건 체크 로직 구현 금지
2. **Strava 토큰은 암호화**: access_token, refresh_token은 반드시 암호화 후 DB 저장
3. **인벤토리 50슬롯 제한**: 아이템 추가 전 반드시 `used_slots < max_slots` 체크 (슬롯 장착 아이템 제외)
4. **어뷰징 방지 (섀도우밴)**: 의심 유저 플래그 시 UI는 정상이지만 고가치 드랍률 0% 처리
5. **배지 양도 불가**: UserActivityBadge는 생성/삭제만 가능, 소유자 변경 API 노출 금지
6. **실물 패치 구매 조건**: 해당 배지 보유 확인 후 D2C 스토어 URL 활성화 (미보유 시 잠금 상태)

> 드랍/픽업 트랜잭션 처리, 자기 드랍 픽업 허용, T2 POI 드랍 반경, 일련번호 형식 등 **배지·드랍 엔진의 판정 로직·정책**은 [Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md)로 이관됨 (2026-08-06, 4카테고리 문서 체계 재정리).

---

## 의사결정 기록 (2026-08-07 확정)

- [x] **`SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY`, `FOREST_SERVICE_KEY`** — **사용중 유지**. `src/` 코드에서 직접 참조하지 않지만 인프라/Edge Function 레벨에서 사용 중. `.env.local`·Vercel 환경변수에서 제거하지 말 것.
- [x] **테스트 러너** — **vitest 도입** (2026-08-07). `npm test` / `npm run test:watch` 사용. 8개 파일 103개 테스트 전부 통과 확인. `today`·`missions`의 `node:assert` 기반 파일은 vitest 제외, `npx tsx`로 직접 실행.
- [x] **`jam-rose.app` Auth redirect URL** — **당분간 유지**. `j-a-m.app`과 병존 상태 유지. 정리 시점은 별도 결정.
- [x] **PWA 설치 프롬프트** — **제거** (코드 자체가 미구현 상태였음 — 제거할 코드 없음 확인).
- [x] **공유 카드 이미지 (`@vercel/og`)** — **기능 제거, 관련 리소스 삭제** (2026-08-07). `src/` 코드에서 미사용 상태였으며 `package.json` 의존성(`@vercel/og`) 제거 완료. 기술 스택 항목 삭제 반영.

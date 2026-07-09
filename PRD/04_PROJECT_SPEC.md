# JAM! 유저 모바일 웹 — 프로젝트 스펙

> AI가 코드를 짤 때 지켜야 할 규칙과 절대 하면 안 되는 것.
> 이 문서를 AI에게 항상 함께 공유하세요.

---

## 기술 스택

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js 15 (App Router) | 한국 파트너사 + Claude AI 코딩 커버리지 1위. 모바일 웹 PWA 지원. SSR로 초기 로딩 빠름 |
| DB / 백엔드 | Supabase | PostgreSQL + 로그인 + 실시간 + 스토리지 한 번에. 무료 시작 가능. 자립 운영에 적합. 벤더 락인 낮음 |
| 배포 | Vercel | Next.js 공식 배포 플랫폼. 무료 티어로 시작 가능. CI/CD 자동화 |
| 인증 | Supabase Auth + Google OAuth | 비밀번호 관리 불필요. 카카오 추가 시 같은 패턴으로 확장 |
| 스타일링 | Tailwind CSS 4 | 모바일 우선 반응형 작성 빠름. Claude 코드 생성과 궁합 좋음 |
| 지도 (Phase 2) | Kakao Map API | 한국 POI 데이터 정확도 높음. 무료 한도 충분 (일 30만 요청) |
| 이미지 합성 | html2canvas 또는 Satori | 인스타 공유 카드 생성 (배지 + 고유 번호 합성) |
| Strava 연동 | Strava OAuth 2.0 + Activities API | 공개 API. rate limit: 200/15분, 2000/일 |

---

## 프로젝트 구조

```
jam-web/
├── src/
│   ├── app/                    # 페이지 (Next.js App Router)
│   │   ├── (auth)/             # 로그인/회원가입 페이지
│   │   ├── (main)/             # 메인 탭 (홈, 배지, 지도, 인벤토리, 프로필)
│   │   ├── api/                # API Routes (Strava webhook, 동기화 등)
│   │   └── layout.tsx          # 루트 레이아웃
│   ├── components/
│   │   ├── ui/                 # 기본 UI (버튼, 카드, 모달 등)
│   │   ├── badge/              # 배지 관련 컴포넌트
│   │   ├── feed/               # 피드 컴포넌트
│   │   └── share-card/         # 인스타 공유 카드 생성기
│   ├── lib/
│   │   ├── supabase/           # Supabase 클라이언트 (server/client 분리)
│   │   ├── strava/             # Strava API 래퍼
│   │   ├── badge-engine/       # 배지 발급 조건 매칭 로직
│   │   └── utils.ts            # 공통 유틸
│   └── types/                  # TypeScript 타입 정의 (DB 스키마 기반)
├── public/
│   ├── badges/                 # 배지 이미지 에셋
│   └── icons/                  # PWA 아이콘
├── .env.local                  # 환경변수 (절대 GitHub에 올리지 마세요)
├── .env.example                # 환경변수 예시 (값 없는 키만)
└── package.json
```

---

## 절대 하지 마 (DO NOT)

> AI에게 코드를 시킬 때 이 목록을 반드시 함께 공유하세요.

- **자체 GPS 트래킹 UI 만들지 마** — "운동 시작" 버튼, 실시간 지도, 거리 카운터 전부 금지. JAM! 핵심 철학 위반
- **과거 데이터 소급 분석하지 마** — Strava 연동 시점 이후 활동만 처리. 5년치 일괄 분석 로직 구현 금지
- **인앱 지도 화면 만들지 마** — POI 위치는 배지 상세에서 외부 지도앱 아웃링크(카카오맵/구글맵)로만 제공
- **API 키나 비밀번호를 코드에 직접 쓰지 마** — 반드시 .env.local 환경변수 사용
- **Strava access_token을 평문으로 DB에 저장하지 마** — 암호화 필수 (AES-256 또는 Supabase Vault)
- **기존 DB 스키마를 임의로 변경하지 마** — 마이그레이션 파일 작성 후 리뷰 요청
- **목업/하드코딩 데이터로 완성이라고 하지 마** — 실제 Strava 계정 연동 테스트 필수
- **package.json 의존성 버전을 임의로 변경하지 마** — 보안 패치 외 버전 고정
- **Strava rate limit 초과하지 마** — 200/15분, 2000/일 제한. 배치 처리 시 딜레이 추가
- **인벤토리 슬롯 체크 없이 아이템 추가하지 마** — 50슬롯 초과 방지 로직 항상 포함
- **Phase 범위 밖의 기능을 미리 구현하지 마** — 플리마켓 거래 로직은 Phase 4까지 금지

---

## 항상 해 (ALWAYS DO)

- **변경하기 전에 계획을 먼저 보여줘** — 특히 DB 스키마 변경 시
- **환경변수는 .env.local에 저장** — .env.example에 키 이름만 추가
- **에러가 발생하면 사용자에게 친절한 한국어 메시지 표시** — "오류가 발생했어요. 잠시 후 다시 시도해주세요."
- **모바일 우선 반응형 디자인** — 375px(iPhone SE) ~ 430px(iPhone Pro Max) 기준. 태블릿/데스크탑은 보너스
- **Strava API 응답 타입 정의** — any 사용 금지. types/ 폴더에 타입 추가
- **배지 발급 로직은 서버 사이드에서만** — 클라이언트에서 배지 조건 직접 체크하면 어뷰징 가능
- **Supabase RLS(Row Level Security) 활성화** — 각 테이블에 유저가 자신의 데이터만 접근하도록

---

## 테스트 방법

```bash
# 로컬 실행
npm run dev

# TypeScript 타입 체크
npx tsc --noEmit

# 빌드 확인 (배포 전 필수)
npm run build

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

| 변수명 | 설명 | 어디서 발급 |
|--------|------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | supabase.com → 프로젝트 → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 | 동일 위치 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서버 전용 키 (클라이언트 노출 금지) | 동일 위치 |
| `STRAVA_CLIENT_ID` | Strava 앱 Client ID | strava.com/settings/api |
| `STRAVA_CLIENT_SECRET` | Strava 앱 Client Secret | 동일 위치 |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Strava Webhook 검증 토큰 (임의 문자열) | 직접 생성 |
| `ENCRYPTION_KEY` | Strava 토큰 암호화 키 (32바이트 랜덤) | `openssl rand -hex 32` |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 지도 API 키 (Phase 2) | developers.kakao.com |

> .env.local 파일에 저장. 절대 GitHub에 올리지 마세요.
> .gitignore에 `.env.local` 포함 여부 확인 필수.

---

## JAM! 핵심 비즈니스 규칙 (AI 코드 생성 시 준수)

1. **배지 발급은 서버 사이드에서만**: 클라이언트 단에서 badge 조건 체크 로직 구현 금지
2. **Strava 토큰은 암호화**: access_token, refresh_token은 반드시 암호화 후 DB 저장
3. **인벤토리 50슬롯 제한**: 아이템 추가 전 반드시 `used_slots < max_slots` 체크
4. **어뷰징 방지 (섀도우밴)**: 의심 유저 플래그 시 UI는 정상이지만 고가치 드랍률 0% 처리 (Phase 3 이후)
5. **배지 양도 불가**: UserActivityBadge는 생성/삭제만 가능, 소유자 변경 API 노출 금지
6. **실물 패치 구매 조건**: 해당 배지 보유 확인 후 D2C 스토어 URL 활성화 (미보유 시 잠금 상태)

---

## [NEEDS CLARIFICATION]

- [ ] PWA 설치 프롬프트 노출 시점 — 첫 방문 즉시인지, 배지 1개 획득 후인지
- [ ] Strava Webhook 설정 방식 — Vercel serverless function 가능 여부 확인 필요 (cold start 이슈)
- [ ] 공유 카드 이미지 서버 사이드 렌더링 vs 클라이언트 사이드 합성 — Satori(서버) vs html2canvas(클라이언트) 결정 필요
- [ ] 배지 이미지 에셋 저장 위치 — Supabase Storage vs Vercel public 폴더

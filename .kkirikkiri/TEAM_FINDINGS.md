# 발견 사항 & 공유 자료

## 프로젝트 구조 요약 (팀원 필독)

**프로젝트 경로**: `/Users/sihyunhwang/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM!/jam-web/`

### 주요 파일 위치
| 파일 | 역할 |
|------|------|
| `src/lib/supabase/client.ts` | 브라우저 Supabase 클라이언트 (`createClient()`) |
| `src/lib/supabase/server.ts` | 서버 Supabase 클라이언트 (`createClient()`, `createServiceClient()`) |
| `src/types/database.ts` | 전체 DB 타입 (Database, UserRow, BadgeRow 등) |
| `src/types/strava.ts` | Strava API 타입 + `NormalizedActivity` |
| `src/lib/utils.ts` | encrypt/decrypt, KR_REGIONS, formatDate, cn() |
| `supabase/migrations/001_initial_schema.sql` | DB 스키마 + RLS + 트리거 |
| `.env.local` | 환경변수 (값은 비어있음 — 개발자가 직접 채워야) |

### 팀원별 담당 디렉토리
- **jam-auth**: `src/app/(auth)/`, `src/app/(main)/onboarding/`, `src/middleware.ts`
- **jam-strava**: `src/app/api/strava/`, `src/app/api/cron/`, `src/lib/strava/`, `src/lib/badge-engine/`
- **jam-ui**: `src/app/(main)/` (page.tsx, badges/, profile/), `src/components/`

### 핵심 규칙 (팀원 필수 준수)
1. **배지 발급은 반드시 서버 사이드** — `createServiceClient()` 사용
2. **Strava 토큰 암호화** — `encrypt()` / `decrypt()` in `src/lib/utils.ts`
3. **RLS 활성화** — 모든 테이블 RLS 켜져 있음, 유저는 자신 데이터만 접근 가능
4. **인벤토리 슬롯 체크** — 아이템 추가 전 `used_slots < max_slots` 반드시 확인
5. **any 타입 사용 금지** — `src/types/` 파일 활용

### Supabase 클라이언트 사용 패턴
```typescript
// 클라이언트 컴포넌트
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()

// 서버 컴포넌트 / API Route
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()

// 배지 발급 등 RLS 우회 (서버 전용)
import { createServiceClient } from '@/lib/supabase/server'
const supabase = createServiceClient()
```

---

# DEAD_ENDS (시도했으나 실패한 접근)

(실패한 접근을 여기에 기록합니다 — 다음 라운드/새 팀원이 같은 실수를 방지하기 위해)

### [jam-auth] supabase-js update() 파라미터 never 타입 오류
- **현상**: `supabase.from('users').update({ activity_types, region })` 호출 시 파라미터 타입이 `never`로 추론됨
- **원인**: `src/types/database.ts`의 수동 정의 `Database` 타입과 `@supabase/supabase-js` 제네릭 추론 불일치
- **회피책**: `// @ts-expect-error` 주석 + 단일 줄 체인으로 suppression (update + eq를 한 줄에)
- **근본 수정 제안 (jam-lead)**: `supabase gen types typescript` 자동 생성 타입으로 교체하거나, `Database['public']['Tables']['users']['Update']` 타입 구조를 supabase-js가 기대하는 형태로 조정 필요

---
id: 20260807_002
category: Infra
status: CLOSED
created: 2026-08-07
closed: 2026-08-07
---

# 레거시 드랍 테이블 및 Supabase 키 체계 조사

| 항목 | 내용 |
|------|------|
| **티켓 ID** | 20260807_002 |
| **카테고리** | Infra |
| **상태** | CLOSED |
| **생성일** | 2026-08-07 |
| **완료일** | 2026-08-07 |

---

## 개요

`02_DATA_MODEL.md` NEEDS CLARIFICATION 항목 중 코드 확인으로 판단 가능한 2건을 조사하여 결론 도출.

---

## 조사 결과

### 1. `drop_events`/`drop_claims`/`drop_probability` 레거시 여부

**결론: 레거시 확정.**

- `jam-web/src/lib/drop/pickup.ts` — `drop_events`/`drop_claims`를 사용하는 `processDropPickups()` 함수가 정의되어 있으나, `src/` 전체에서 이 함수를 호출하는 곳이 단 한 곳도 없음 (완전 데드코드)
- `drop_probability` — `src/types/database.ts` 타입 정의에만 존재, 실제 쿼리·로직 코드 없음
- 드랍엔진 v2(migration 034 이후)에서 `drop_policy`/`user_drop_state`/`poi_drops`(source=system)로 기능이 완전히 대체됨

**잔여 이슈**: 레거시 테이블 3종(`drop_events`, `drop_claims`, `drop_probability`)과 `lib/drop/pickup.ts` 파일의 실제 삭제는 별도 정리 작업 필요. 스키마 삭제 시 `database.ts` 타입도 함께 정리해야 함.

---

### 2. `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` 마이그레이션 계획

**결론: 마이그레이션 미착수, 당장 불필요.**

- `.env.local`에는 `SUPABASE_PUBLISHABLE_KEY`(`sb_publishable_*`)와 `SUPABASE_SECRET_KEY`(`sb_secret_*`)가 선언됨
- `jam-web/src/` 전체에서 두 키를 참조하는 코드 없음
- 현재 클라이언트 초기화:
  - `lib/supabase/client.ts` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (브라우저)
  - `lib/supabase/server.ts` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (SSR), `SUPABASE_SERVICE_ROLE_KEY` (service client)
- 새 키 체계(`sb_publishable_*`/`sb_secret_*`)는 Supabase SDK v3+ 신규 클라이언트에서 사용하는 방식이나, 현재 프로젝트는 `@supabase/ssr` 기반의 기존 방식으로 작동 중이며 서비스에 영향 없음
- `.env.local`의 미사용 키 2개는 정리 가능하나 우선순위 낮음

**향후 주의사항**: Supabase가 JWT 키 방식을 deprecated할 경우 클라이언트 라이브러리 업그레이드와 함께 마이그레이션 필요.

---

## 변경 파일

| 파일 | 변경 내용 |
|------|-----------|
| `Service Plan/Specs/PRD/02_DATA_MODEL.md` | NEEDS CLARIFICATION 1, 3번 조사 결과 반영 |

---

## 잔여 이슈

- 레거시 테이블 3종 삭제 작업 별도 티켓 생성 권장 (`drop_events`, `drop_claims`, `drop_probability` + `lib/drop/pickup.ts`)

---
id: 20260813_003
category: Infra
status: CLOSED
created: 2026-08-13
closed: 2026-08-13
---

# [Infra] 배지 등급 'Legendary' → 'Legend' 전면 변경

## 배경 / 문제 정의

현재 배지 희귀도 등급은 Common / Rare / Legendary / Mythic 4단계로 구성되어 있다.
'Legendary'는 한국어 맥락에서 '레전더리'로 읽혀 발음이 길고 어색하다.
'Legend'(레전드)로 줄이면 Common·Rare·Mythic처럼 짧고 임팩트 있는 단어로 통일된다.

현재 상태: DB enum `badge_rarity`에 `legendary` 값, 소스코드 30+ 파일, Service Plan 문서 전반에 'Legendary' 표기
기대 상태: 모든 레이어에서 `legendary` → `legend`, 'Legendary' → 'Legend'로 일관 변경

## 상세 요구사항

### 서비스/코드베이스 관점

1. **DB 마이그레이션**: `badge_rarity` enum 값 `legendary` → `legend` 변경
   - `ALTER TYPE badge_rarity RENAME VALUE 'legendary' TO 'legend'` (PostgreSQL 10+, 안전)
   - DB 데이터(activity_badges, item_badges, drops 등 badge_rarity 컬럼 사용 테이블)는 enum 변경과 동시에 반영됨 (데이터 UPDATE 불필요)
2. **TypeScript 타입 파일**: `database.ts`, `database.generated.ts`의 `BadgeRarity` 타입에서 `'legendary'` → `'legend'`
3. **소스코드 전수 치환**: `legendary` → `legend` (소문자), `Legendary` → `Legend` (대문자 첫글자), `LEGENDARY` → `LEGEND` (전체 대문자) — 각 컨텍스트에 맞게 치환
4. **테스트 파일 포함**: `__tests__/*.test.ts` 내 `legendary` 참조 모두 수정

### UI/UX 관점

- 어드민 UI: 드랍 정책 폼, 배지 폼, 시뮬레이터 등 select/option에서 'Legendary' → 'Legend'
- 유저 서비스 UI: 배지 카드, 드랍 상세, 피드 등 화면 표시 텍스트 'Legendary' → 'Legend'

### 컨텐츠 관점

- `Service Plan/Specs/Content/ACTIVITY_BADGES.md`: 'Legendary' 등급 표기 전수 변경
- `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`: 'Legendary' 참조 전수 변경
- `Service Plan/Specs/PRD/` 하위 문서: 'Legendary' 참조 전수 변경
- `Service Plan/History/Migration/Ticket/` 내 기존 티켓: 과거 기록이므로 변경 불필요 (역사적 사실 보존)
- `Service Plan/Business/서비스플랜/` 최신 파일: 'Legendary' → 'Legend' 변경

## 구현 계획

### 순서 (배포 원자성 보장)

1. DB 마이그레이션 SQL 파일 작성 (`083_rename_legendary_to_legend.sql`)
   - `ALTER TYPE badge_rarity RENAME VALUE 'legendary' TO 'legend'`
2. 소스코드 전수 치환 (TypeScript, TSX 파일)
3. Service Plan 문서 치환 (ACTIVITY_BADGES.md, BADGE_ENGINE_UNIFIED.md, PRD 문서들, 서비스플랜 최신본)
4. 빌드 확인 (`npm run build` 또는 `tsc --noEmit`)
5. 테스트 통과 확인
6. review 브랜치로 commit + push

### 영향 범위

- DB: `badge_rarity` enum (데이터 행 변경 불필요, enum rename으로 자동 반영)
- 코드: 30+ TypeScript/TSX 파일
- 문서: Service Plan 4개 카테고리
- 어드민: 드랍 정책, 배지 관리, 시뮬레이터, 앰비언트 드랍 정책
- 유저 서비스: 배지 목록, 드랍 상세, 피드, 인벤토리, 조합

### 주의사항

- `database.generated.ts`는 Supabase 타입 자동생성 파일이므로, SQL 마이그레이션 적용 후 `supabase gen types` 재실행 필요. 재실행 시 수동 패치 내용과 일치하는지 확인한다
- 과거 티켓 문서(`Ticket/` 폴더)는 역사적 기록이므로 변경하지 않는다
- 서비스플랜 v3.0~v3.2도 'Legendary' 표기가 잔존하나, **의도적으로 미변경** — 과거 버전 파일이므로 역사적 기록으로 보존. `grep`으로 전수 검색 시 발견되더라도 수정 불필요

---
## 완료 기록

### 구현 내용 요약

`badge_rarity` enum 값 `legendary` → `legend` 전면 변경. DB·소스코드·문서 전 레이어 일관 반영.

- DB: `ALTER TYPE badge_rarity RENAME VALUE 'legendary' TO 'legend'` — 기존 데이터 행 UPDATE 없이 자동 반영
- 소스코드 34개 파일: `legendary/Legendary/LEGENDARY` → `legend/Legend/LEGEND` 전수 치환
- Service Plan 문서 10개 + 서비스플랜 v3.4 신규 생성
- UX_WRITING_GUIDELINE.md 고정 용어 표에 배지 희귀도 등급명 항목 추가

### 변경된 파일
```
jam-web/supabase/migrations/083_rename_legendary_to_legend.sql (신규)
jam-web/src/types/database.ts
jam-web/src/types/database.generated.ts
jam-web/src/lib/drop-engine/constants.ts
jam-web/src/lib/drop-engine/layers.ts
jam-web/src/lib/drop-engine/policy.ts
jam-web/src/lib/drop-engine/__tests__/layers.test.ts
jam-web/src/lib/badge-engine/index.ts
jam-web/src/lib/badge-engine/__tests__/walking-badges-v4.test.ts
jam-web/src/lib/ambient-drop/index.ts
jam-web/src/lib/ambient-drop/policy.ts
jam-web/src/lib/abusing/policy.ts
jam-web/src/lib/i18n/ko.ts
jam-web/src/lib/utils.ts
jam-web/src/app/(main)/FeedSection.tsx
jam-web/src/app/(main)/badges/BadgesClient.tsx
jam-web/src/app/(main)/combine/CombineClient.tsx
jam-web/src/app/(main)/drops/BadgeDetailSheet.tsx
jam-web/src/app/admin/abusing/AbusingClient.tsx
jam-web/src/app/admin/ambient-drop-policy/AmbientDropPolicyForm.tsx
jam-web/src/app/admin/badges/BadgeForm.tsx
jam-web/src/app/admin/badges/BadgesFilterBar.tsx
jam-web/src/app/admin/drop-policy/DropPolicyForm.tsx
jam-web/src/app/admin/itembooks/ItemBookForm.tsx
jam-web/src/app/admin/simulator/page.tsx
jam-web/src/app/admin/users/[id]/page.tsx
jam-web/src/app/api/admin/ambient-drop-policy/route.ts
jam-web/src/app/api/admin/drop-policy/route.ts
jam-web/src/app/api/admin/simulate/route.ts
jam-web/src/app/api/drops/[dropId]/pickup/route.ts
jam-web/src/components/admin/badges/BadgeCard.tsx
jam-web/src/components/admin/badges/BadgeDetail.tsx
jam-web/src/components/admin/badges/BadgesTable.tsx
jam-web/src/components/inventory/InventoryGrid.tsx
jam-web/src/components/ui/Badge.tsx
Service Plan/Specs/Content/ACTIVITY_BADGES.md
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md
Service Plan/Specs/Content/COMBINE_RECIPES.md
Service Plan/Specs/Content/FACTIONS.md
Service Plan/Specs/PRD/02_DATA_MODEL.md
Service Plan/Specs/PRD/AdminUI/ADMIN_PRD.md
Service Plan/Specs/PRD/AdminUI/DATA_MODEL.md
Service Plan/Specs/PRD/AdminUI/PHASES.md
Service Plan/Specs/PRD/AdminUI/REDESIGN.md
Service Plan/Specs/UX_WRITING_GUIDELINE.md
Service Plan/Business/서비스플랜/02 JAM! 서비스 플랜 v3.4 (2026-08-13).md (신규)
```

### 테스트 결과
- [x] `npm test`: 10개 파일, 136개 테스트 전체 통과
- [x] `tsc --noEmit`: legend 관련 신규 타입 에러 없음
- [x] 소스 내 잔여 `legendary` 참조 0개 (`grep` 확인)
- [x] DB 검증: `SELECT enum_range(NULL::badge_rarity)` → `{common,rare,legend,mythic}` 확인

### UX Writing 검증
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 이번 변경으로 UX_WRITING_GUIDELINE.md에 `Common / Rare / Legend / Mythic` 고정 용어 등재 완료
- [x] 톤앤매너: 배지 등급명은 고유명사(브랜드 시스템 용어)로 해요체·마침표 규칙 적용 대상 아님
- [x] 에러 메시지: 해당 없음
- [x] 문장 규칙: 해당 없음
- [x] 표기 규칙: 해당 없음

### 배포 정보
- 배포일: 2026-08-13
- 환경: production
- 커밋(구현): c2f89dc
- 커밋(개선 제안 반영): 9c070b9
- merge 커밋: 9f958f0

### 주요 의사결정 / 핵심 메모

- **PostgreSQL enum rename 방식 채택**: `ALTER TYPE ... RENAME VALUE`(PostgreSQL 10+)로 기존 데이터 행 UPDATE 없이 안전하게 처리. 대안(새 enum 생성 후 컬럼 교체)은 불필요하게 복잡해 미채택
- **과거 서비스플랜(v3.0~v3.2) 미변경**: 역사적 기록 보존 목적. `grep`으로 잔존 Legendary 발견 시 수정 불필요 — 의도적 보존
- **database.generated.ts 수동 패치**: DB 마이그레이션 실행 후 `supabase gen types` 재실행 시 자동 동기화됨. 현재 수동 패치 내용과 일치하는지 재실행 후 확인 권장

### 잔여 이슈
- `database.generated.ts`: 향후 `supabase gen types` 재실행 시 자동 재생성됨 — 별도 조치 불필요, 자동 동기화로 해결

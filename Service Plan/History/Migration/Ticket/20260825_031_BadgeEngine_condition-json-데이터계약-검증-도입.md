---
id: 20260825_031
category: BadgeEngine
status: IN_PROGRESS
created: 2026-08-25
closed:
---

# [BadgeEngine] condition_json 데이터 계약 검증 도입

## 배경 / 문제 정의

티켓 [20260825_028](20260825_028_Feature_레벨업미션-노출규칙-정비-및-게이팅결함-수정.md)에서
발견·차단한 사고: 마이그레이션 [`084_badge_condition_cleanup.sql`](../../../../jam-web/supabase/migrations/084_badge_condition_cleanup.sql)이
배지 상세 화면 표시용으로 미션보상배지 15종에 `{"mission_reward": true}`를 UPDATE했는데,
`badge-engine`의 `evaluateConditionDetailed`가 "알려진 조건 필드 없음 → 검사 스킵 → `pass: true`"로
처리해 미션 완료 없이 미션보상배지가 발급되고 레벨업 게이팅이 12일간 무력화됐다.

028에서 증상은 3중 차단(발급 후보 제외 + `mission_reward` 방어 분기 + `MEASURABLE_CONDITION_KEYS`
방어 분기)했지만, **근본 원인인 "condition_json에 런타임 데이터 계약이 없다"는 그대로 남아 있다.**
지금도 마이그레이션이나 어드민으로 `condition_json`에 임의 필드를 넣을 수 있고, 그게 발급 판정에
어떤 영향을 주는지 아무도 검증하지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점

**1. 허용 필드 단일 소스 정의**
- `src/lib/badge-engine/condition-schema.ts`(신규)에 다음을 정의:
  - `CONDITION_FIELD_KEYS` — 발급 판정에 실제로 관여하는 "조건 필드" (기존 `MEASURABLE_CONDITION_KEYS` +
    필터 전용 필드 `activity_type`·`day_of_week`·`prerequisite_badge_names`·`route`·`poi_id`)
  - `CONDITION_META_KEYS` — 발급 판정에 관여하지 않는 "메타데이터" (`mission_reward`)
  - `ALL_CONDITION_KEYS` — 위 둘의 합집합. DB 제약·타입·API 검증이 공유하는 단일 출처
  - `BadgeCondition`(`src/types/database.ts`) 필드 목록과 어긋나면 **컴파일 타임에 잡히는**
    타입 체크(`Exclude<keyof BadgeCondition, typeof ALL_CONDITION_KEYS[number]>`류)를 추가
- `badge-engine/index.ts`의 `MEASURABLE_CONDITION_KEYS`는 이 파일에서 import (중복 정의 제거)

**2. DB 레벨 검증 — CHECK 제약 (최우선 방어선)**
- `badges.condition_json`에 CHECK 제약 추가: 키가 `ALL_CONDITION_KEYS`에 없으면 INSERT/UPDATE 자체를
  거부. `condition_json - ARRAY[...] = '{}'::jsonb` 형태로 서브쿼리 없이 구현(IMMUTABLE, CHECK 제약 가능).
- 트리거 대신 CHECK를 쓰는 이유: 더 단순하고, 마이그레이션·어드민·`service_role` 직접 조작 등
  **모든 쓰기 경로를 예외 없이 커버**한다. 084 같은 마이그레이션도 이 제약이 있었다면 그 자리에서
  실패해 사고가 배포 전에 드러났을 것.
- 먼저 기존 데이터 실측 완료(2026-08-25, `jam-prod` 프로젝트):
  `SELECT type, jsonb_object_keys(condition_json) AS key, count(*) FROM badges WHERE condition_json IS NOT NULL GROUP BY type, key`
  결과 미허용 키 0건 — 제약 추가 시 기존 데이터와 충돌 없음 확인.

**3. API 레벨 검증 (친절한 에러 메시지)**
- `src/lib/admin/badge-validation.ts`에 `findUnknownConditionKeyError` 신규 추가, `ALL_CONDITION_KEYS`
  기준으로 검사. `/api/admin/badges/route.ts`·`[id]/route.ts`에서 `findCumulativeConditionError`와
  나란히 호출.
- 이유: CHECK 제약 위반 시 raw Postgres 에러가 그대로 어드민 사용자에게 노출되면 불친절하다.
  API 사전 검증으로 한국어 에러 메시지를 먼저 준다. (CHECK는 최후 방어선으로 유지)

**4. 어드민 폼 회귀 버그 수정 (조사 중 발견 — 범위에 포함)**
- `BadgeForm.tsx`의 `buildConditionJson`이 빈 객체에서 시작해 하드코딩된 필드만 조립하는데
  `mission_reward`용 입력이 없다. **미션보상배지 15종 중 하나를 어드민에서 수정 저장하면
  `mission_reward` 플래그가 조용히 유실**되는 회귀가 실재한다(084와 같은 유형의 사고가 어드민
  경로로 재발 가능).
- 수정: `mission_reward` state 추가 + 체크박스 UI("미션 보상 배지 — 미션 완료 시에만 지급, 일반
  배지 엔진 평가 대상 아님" 설명 포함) + `buildConditionJson`에 포함.
- 조건 필드 UI와 시각적으로 구분되는 위치에 배치(메타데이터임을 UI에서도 드러낼 것).

**5. CI 마이그레이션 린트는 도입하지 않는다 (판단 근거)**
- CHECK 제약이 이미 마이그레이션 경로를 포함한 모든 쓰기를 막으므로, 별도 CI 린트는 한계효용이
  낮다. CHECK 위반 시 해당 마이그레이션 자체가 실행 실패하므로 "실행 전에 정적으로 잡아낸다"는
  이점이 CHECK 제약으로 이미 충족된다.

### 문서 관점 (④ 배지 드랍 로직)

- `Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md`:
  - "조건 필드"(§2, 발급 판정에 관여)와 "메타데이터 필드"(신규 절, 판정에 관여하지 않음 —
    `mission_reward`)를 명확히 분리
  - 단일 소스 파일(`condition-schema.ts`) 경로 명시, DB CHECK 제약 존재를 명시
- `BADGE_ENGINE_UNIFIED.md`: 필요 시 데이터 계약 검증 지점 참조 추가

## 구현 계획

1. `src/lib/badge-engine/condition-schema.ts` 신규 — 단일 소스 정의 + 타입 동기화 체크
2. `badge-engine/index.ts`의 `MEASURABLE_CONDITION_KEYS`를 신규 파일 참조로 교체
3. 마이그레이션 `102_condition_json_check_constraint.sql` — CHECK 제약 추가 (SQL 파일만 작성,
   실행은 사용자 승인 후 오케스트레이터가 처리)
4. `badge-validation.ts`에 `findUnknownConditionKeyError` 추가 + API 라우트 2곳에 연결
5. `BadgeForm.tsx` — `mission_reward` 필드 UI 추가 (회귀 버그 수정)
6. 문서 갱신 (`CONDITION_JSON_SPEC.md`)
7. 유닛테스트: CHECK 제약과 동일한 규칙을 검증하는 애플리케이션 레벨 테스트(`findUnknownConditionKeyError`),
   `mission_reward` 어드민 폼 라운드트립(저장 후 유실 없음)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
1. `src/lib/badge-engine/condition-schema.ts` 신규 — `MEASURABLE_CONDITION_KEYS`(기존 값과 동일,
   badge-engine의 "평가 가능한 조건 없음" 게이트 전용) / `CONDITION_FIELD_KEYS`(MEASURABLE +
   필터 전용 필드) / `CONDITION_META_KEYS`(`mission_reward`) / `ALL_CONDITION_KEYS`(합집합) 정의.
   `BadgeCondition`과 어긋나면 컴파일 에러가 나는 타입 체크(`AssertAllConditionKeysCovered`)
   포함. `badge-engine/index.ts`는 `MEASURABLE_CONDITION_KEYS`를 이 파일에서 import(리팩터만,
   동작 변경 없음 — 기존 79개 badge-engine 테스트 전부 통과로 확인).
   - 구현 중 발견: 티켓 원문의 필터 전용 필드 목록(activity_type·day_of_week·
     prerequisite_badge_names·route·poi_id)에 `season`이 빠져 있어 컴파일 타임 동기화 체크가
     실패했다. `season`은 `season_count`의 짝 필드로 단독 판정에 관여하지 않아 필터 전용으로
     분류해 추가(코드 주석에 사유 기록).
2. `supabase/migrations/102_condition_json_check_constraint.sql` 작성(실행하지 않음, SQL 파일만) —
   `badges.condition_json - ARRAY[...24개 허용 키...] = '{}'::jsonb` 형태 CHECK 제약. 서브쿼리
   없이 IMMUTABLE `jsonb - text[]` 연산자만 사용.
3. `src/lib/admin/badge-validation.ts`에 `findUnknownConditionKeyError` 추가(`ALL_CONDITION_KEYS`
   기준, 한국어 에러). `src/app/api/admin/badges/route.ts`·`[id]/route.ts`에서
   `findCumulativeConditionError`와 나란히 호출.
4. `BadgeForm.tsx` 회귀 수정 — `mission_reward` state·체크박스 UI(조건 필드와 시각적으로 구분되는
   amber 색상 박스) 추가. `buildConditionJson` 로직은 컴포넌트 렌더링 없이 유닛테스트하기 위해
   `src/app/admin/badges/conditionFormFields.ts`(신규, React 비의존 순수 함수)로 추출하고
   `BadgeForm.tsx`는 이를 import해서 사용(동작 변경 없는 리팩터).
5. CI 마이그레이션 린트는 티켓 판단 근거대로 도입하지 않음.
6. 문서 갱신 — `CONDITION_JSON_SPEC.md`: 상단에 데이터 계약 검증 안내 추가, 기존 §2를
   "조건 필드"로 명시, 신규 §3 "메타데이터 필드"(mission_reward) 추가, 이하 절 번호 갱신(§3→§4,
   §4→§5, §5→§6), 예시·미구현 표에도 mission_reward 반영. `BADGE_ENGINE_UNIFIED.md` §2.7에
   데이터 계약 검증 계층 요약 단락 추가.
7. 유닛테스트 2개 파일 신규:
   - `src/lib/admin/__tests__/badge-validation.test.ts` — `findUnknownConditionKeyError`
     (허용 필드 통과, `ALL_CONDITION_KEYS` 전체 순회 통과, 미허용 키 검출, 혼합 케이스 등 7개)
   - `src/app/admin/badges/__tests__/conditionFormFields.test.ts` — mission_reward 라운드트립
     (로드 후 그대로 저장 시 유실 없음, 해제 시 제외, 다른 조건과 공존) + 기존 조건 필드 조립
     회귀 방지 9개

### 변경 파일
```
jam-web/src/lib/badge-engine/condition-schema.ts                       (신규)
jam-web/src/lib/badge-engine/index.ts                                  (수정 — import로 교체)
jam-web/src/lib/admin/badge-validation.ts                              (수정 — 함수 추가)
jam-web/src/app/api/admin/badges/route.ts                              (수정 — 검증 호출 추가)
jam-web/src/app/api/admin/badges/[id]/route.ts                         (수정 — 검증 호출 추가)
jam-web/src/app/admin/badges/BadgeForm.tsx                             (수정 — mission_reward UI)
jam-web/src/app/admin/badges/conditionFormFields.ts                    (신규)
jam-web/supabase/migrations/102_condition_json_check_constraint.sql    (신규, 미실행)
jam-web/src/lib/admin/__tests__/badge-validation.test.ts               (신규)
jam-web/src/app/admin/badges/__tests__/conditionFormFields.test.ts     (신규)
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md                  (수정)
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md                 (수정)
```

### 테스트 결과
- [x] `npx tsc --noEmit` 전체 통과 (컴파일 타임 동기화 체크 포함)
- [x] `npx eslint <변경 파일>` — 신규/수정 파일 전부 클린. `BadgeForm.tsx`에 무관한 기존
      `react-hooks/set-state-in-effect` 에러 1건이 있으나 이번 변경 이전부터 있던 것(라인 위치만
      이동, `git stash` 대조로 확인) — 이번 작업 범위 밖
- [x] `npx vitest run src/lib/badge-engine/__tests__/ src/lib/admin/__tests__/ src/app/admin/badges/__tests__/`
      — 6개 파일, 97개 테스트 전부 통과(기존 79 + 신규 18)
- [x] `npx vitest run`(전체 스위트) — 531개 중 529 통과, 2개 실패는 `sync-drop-order.test.ts`의
      기존 결함(로컬에 `SUPABASE_SERVICE_ROLE_KEY` 미설정으로 인한 환경 문제, 이번 변경과 무관 —
      변경 전 상태에서도 동일하게 실패)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성
- [ ] 톤앤매너
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙
- [ ] 표기 규칙

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 트리거 대신 CHECK 제약 선택 — 서브쿼리 없이 `jsonb - text[]` 연산자만으로 구현 가능해 더 단순하고,
> 모든 쓰기 경로(마이그레이션·어드민·직접 SQL)를 예외 없이 커버함. CI 린트는 CHECK로 이미 충족되는
> 효과라 별도 도입하지 않음.

### 잔여 이슈
-

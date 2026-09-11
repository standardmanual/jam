---
id: 20260911_2304
category: BadgeEngine
priority: P2
status: CLOSED
created: 2026-09-11
closed: 2026-09-12
---

# [BadgeEngine] 어드민 배지 생성 — JAM! 종목 "연속 동기화 일수" 조건 추가

## 배경 / 문제 정의
어드민에서 `admin_category='jam'`("JAM! 종목") 배지를 생성할 때, 유저가 "동기화를 연속
며칠 했는지"를 조건으로 설정할 수 있게 해달라는 요청이다.

현재 JAM! 종목 배지는 `follower_count`·`following_count`·`daily_sync_count`(하루 동기화
누적 횟수, "연속"이 아님) 3종의 메타 조건만 지원하며, 이마저도 어드민 폼에 입력 UI가
없어 SQL로 직접 값을 넣어 만들었다(`156_badges_admin_category.sql:46-54`). "연속 N일
동기화"를 계산하는 로직 자체가 존재하지 않는다 — `user_daily_sync_counts` 테이블
(마이그레이션 154, PK `(user_id, sync_date)`)은 날짜별 동기화 여부만 기록할 뿐 연속일수를
집계하지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 신규 `condition_json` 키: **`daily_sync_streak_days`** (정수) — "현재 연속 동기화
  일수가 N일 이상이 되는 순간 달성"(사용자 확정). 하루라도 거르면 연속이 끊긴다.
  기존 활동배지의 `streak_days`(최장 연속, Strava 활동 기반)와는 별개 지표이므로
  `daily_sync_` 접두어로 `daily_sync_count`와 같은 지표군임을 명시한다.
- 연속일수 계산 로직 신규 구현: `user_daily_sync_counts`에서 유저별 동기화 발생일을
  모아 "오늘까지 끊기지 않은 연속일수"를 계산. 기존 활동배지 `calcMaxStreak`류 로직의
  날짜 순회 방식을 참고하되, "최장"이 아니라 "현재(오늘 기준) 연속"을 계산해야 한다
  (사용자 확정 판정 기준과 일치시킬 것).
- `jam-web/src/lib/badge-engine/usageBadges.ts`: `UsageMetric` 타입에
  `daily_sync_streak_days` 추가, `increment_daily_sync_count()` RPC 호출 직후(기존
  `daily_sync_count` 평가 진입점과 동일한 지점)에 연속일수 재계산·조건 평가 로직 추가.
- `jam-web/src/lib/badge-engine/conditionRegistry.ts:1611-1723` 부근에
  `daily_sync_streak_days` 메타 필드 등록 (`role: 'meta'`, `evaluation: 'external'`,
  기존 `daily_sync_count` 선언 패턴 그대로 따름).
- DB: `condition_json` 허용 키 화이트리스트 CHECK 제약(`badges_condition_json_known_keys`
  계열, 마이그레이션 155 참고)에 `daily_sync_streak_days` 추가하는 마이그레이션 작성.
  작성만 하고 실행은 사용자 승인 후 오케스트레이터가 처리한다.

### UI/UX 관점
- `jam-web/src/app/admin/badges/.../BadgeForm.tsx`: 현재 `conditionGroupsVisible =
  type !== 'checkin' && !isJamActivity`로 JAM! 카테고리 선택 시 조건 입력 섹션 전체가
  숨겨져 있다(`BadgeForm.tsx:356`). JAM! 카테고리 전용 조건 입력 섹션을 신설해
  "연속 동기화 일수" 숫자 입력 필드 하나를 추가한다.
  (기존 `follower_count`·`following_count`·`daily_sync_count`는 여전히 입력 UI가 없어도
  되며, 이번 티켓 범위 밖 — 필요해지면 별도 티켓으로 확장)
- `src/app/admin/`은 MODULAR 적용 제외 대상이다.
- 노출 문구는 `UX_WRITING_GUIDELINE.md` 기준을 따른다.

## 구현 계획
1. 연속일수 계산 함수 작성 및 유닛 테스트
2. `conditionRegistry.ts`에 메타 필드 등록
3. `usageBadges.ts`에 평가 진입점 연결 (동기화 발생 시점)
4. `BadgeForm.tsx`에 JAM! 전용 입력 필드 추가
5. CHECK 제약 화이트리스트 확장 마이그레이션 작성(실행은 오케스트레이터)
6. `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` 갱신

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `daily_sync_streak_days` 조건 키를 신설해 "오늘 기준 현재 연속 동기화 일수 ≥ N" 판정을
  추가했다. `conditionRegistry.ts`에 `role: 'meta'` + `evaluation: 'external'`로 등록(기존
  `daily_sync_count` 패턴 그대로).
- 연속일수 계산은 신규 파일 `dailySyncStreak.ts`에 순수 함수(`calcCurrentSyncStreakDays`) +
  DB 조회 함수(`fetchCurrentSyncStreakDays`)로 분리 구현. 오늘 날짜가 `user_daily_sync_counts`
  목록에 없으면 0(리셋), 있으면 오늘부터 거꾸로 하루씩 끊기지 않은 구간을 센다. 기존
  `calcMaxStreak`(활동배지, 역대 최장)는 재사용하지 않고 판정 기준이 다른 별개 로직으로
  새로 작성했다(요청 사항).
- `usageBadges.ts`의 `recordDailySyncAndEvaluate()`가 `increment_daily_sync_count()` RPC
  직후 `daily_sync_count` 평가에 이어 `fetchCurrentSyncStreakDays()` → `daily_sync_streak_days`
  평가를 추가로 수행하고, 두 지표의 발급 결과를 합쳐 반환한다.
- `badge-condition-guards.ts`의 `USAGE_METRIC_CONDITION_KEYS`에도 추가해 `repeat_count`와의
  조합을 저장 시점에 막는다(기존 3종과 같은 이유 — `usageBadges.ts`는 등급형·레벨형만 지원).
- **UI 변경은 하지 않았다** — 티켓 배경(§UI/UX 관점)이 "JAM! 선택 시 조건 입력 섹션 전체가
  숨겨져 있다"고 전제했으나, 실제 코드(현재 브랜치 기준)는 이미 `BadgeConditionSection.tsx`가
  JAM! 카테고리에서 `role: 'meta'` 필드 전용 "사용량 지표" 그룹을 자동으로 렌더링한다(선행
  티켓 20260911_0901에서 도입됨 — `follower_count`·`following_count`·`daily_sync_count` 입력
  필드가 이미 그 그룹에 떠 있다). 이 그룹은 `conditionRegistry.ts`의 `form` 선언에서 필드
  입력 UI를 자동 생성하는 구조라, `daily_sync_streak_days`에 `form: integerForm(...)`을
  선언한 것만으로 어드민 화면 "사용량 지표" 그룹에 "연속 동기화 일수" 입력 칸이 자동으로
  나타난다. `BadgeForm.tsx`를 별도로 손대지 않았다(자세한 내용은 `alerts` 참고).
- DB 마이그레이션(161)은 작성만 하고 실행하지 않았다 — 실행은 사용자 승인 후 오케스트레이터가
  처리한다.
- 관련 문서(`BADGE_ENGINE_UNIFIED.md`, `CONDITION_JSON_SPEC.md`) 갱신.

### 변경된 파일
```
jam-web/src/lib/badge-engine/dailySyncStreak.ts (신규)
jam-web/src/lib/badge-engine/__tests__/daily-sync-streak.test.ts (신규)
jam-web/src/lib/badge-engine/usageBadges.ts
jam-web/src/lib/badge-engine/conditionRegistry.ts
jam-web/src/lib/badge-engine/__tests__/usage-badges.test.ts
jam-web/src/lib/badge-engine/__tests__/condition-registry.test.ts
jam-web/src/lib/admin/badge-condition-guards.ts
jam-web/src/lib/admin/__tests__/badge-condition-guards.test.ts
jam-web/src/lib/admin/__tests__/badge-validation.test.ts
jam-web/src/app/admin/badges/conditionFormFields.ts
jam-web/src/app/admin/badges/__tests__/conditionFormFields.test.ts
jam-web/src/types/database.ts
jam-web/supabase/migrations/161_condition_json_sync_streak_key.sql (신규, 미실행)
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md
```

### 테스트 결과
- [x] `daily-sync-streak.test.ts`(신규) — 순수 함수 경계값 9건 + DB 조회 3건, 전부 통과
- [x] `usage-badges.test.ts` — 기존 케이스 + 신규 `daily_sync_streak_days` 평가 4건 추가, 전부 통과
- [x] `condition-registry.test.ts` — 필드 수·CHECK 제약 대조 갱신 후 전부 통과
- [x] `badge-condition-guards.test.ts`·`badge-validation.test.ts` — 신규 지표 + `repeat_count`
  충돌 케이스 추가, 전부 통과
- [x] `conditionFormFields.test.ts` — 라운드트립 표본·그룹 매핑표 갱신 후 전부 통과
- [x] `npm run lint` 전체 실행 — 0 errors, 13 warnings(전부 `design-system/`의 기존 경고,
  이번 변경과 무관)
- [x] `npx tsc --noEmit` — 오류 없음
- [x] **오케스트레이터 실렌더 검증(2026-09-12)**: staging 머지 후 마이그레이션 161 실행
  (`ALTER TABLE ... CHECK` 갱신, 기존 배지 639건 영향 없음 확인) → DO 블록 스모크 테스트로
  `daily_sync_streak_days` 키가 실제로 CHECK를 통과함을 확인(고의 RAISE EXCEPTION으로
  롤백, 잔존 행 0건 확인) → 로컬 `next dev`(`ADMIN_EMAILS=dev-tester@jam.local`)로
  `/admin/badges/new`에서 분류 "JAM!" 선택 → "획득 조건 > 사용량 지표" 그룹에 "연속 동기화
  일수" 입력 필드가 정상 노출됨을 확인 → 값 7 입력 시 우측 요약과 상세 미리보기 카드에
  "연속 동기화 7일↑" 조건 칩이 정확히 반영됨을 확인. (이미지 필수라 실제 등록까지는
  진행하지 않음 — DB 저장 가능 여부는 스모크 테스트로 이미 확인했으므로 충분하다고 판단)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 2026-09-12
- 환경: production (Supabase `jam-prod`, staging·프로덕션 공용 단일 DB — 마이그레이션 161 실행 완료)
- 커밋: staging에 머지 (review 브랜치 `claude/jamwork-20260911_2304-daily-sync-streak`)

### 주요 의사결정 / 핵심 메모
- "연속 N일" 판정 기준은 **현재(오늘 기준) 연속일수가 N일에 도달하는 순간 달성**으로
  확정(사용자 확정). 과거 한 번이라도 N일 연속을 달성한 이력이 있으면 계속 유지되는
  "역대 최장" 방식이 아니다 — 하루라도 거르면 카운트가 리셋된다.
- 신규 조건 키는 `daily_sync_streak_days`로 명명 — 기존 `daily_sync_count`(하루 누적
  횟수, 연속 아님)와 혼동하지 않도록 구분.

### 잔여 이슈
- 티켓 §UI/UX 관점의 전제("JAM! 선택 시 조건 입력 섹션 전체가 숨겨져 있다")가 선행 티켓
  20260911_0901로 이미 갱신돼 있었다 — 이번 구현에서는 `BadgeForm.tsx`를 손대지 않고
  레지스트리 `form` 선언만 추가했다. 오케스트레이터가 실렌더로 정상 노출을 확인 완료(위
  테스트 결과 참고).
- 개선 리뷰 제안(경미, 이번 범위에는 미반영): `UsageMetric` 타입을 `conditionRegistry.ts`에서
  export해 단일 소스화하는 방안(4번째 지표 추가 계기로 검토 가치 언급됨), PRD/컨텐츠
  문서에 신규 지표 반영 여부 검토.

---
id: 20260911_2304
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-11
closed:
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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- "연속 N일" 판정 기준은 **현재(오늘 기준) 연속일수가 N일에 도달하는 순간 달성**으로
  확정(사용자 확정). 과거 한 번이라도 N일 연속을 달성한 이력이 있으면 계속 유지되는
  "역대 최장" 방식이 아니다 — 하루라도 거르면 카운트가 리셋된다.
- 신규 조건 키는 `daily_sync_streak_days`로 명명 — 기존 `daily_sync_count`(하루 누적
  횟수, 연속 아님)와 혼동하지 않도록 구분.

### 잔여 이슈
-

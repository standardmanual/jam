# 배지 체계 v3 구현 — 팀장 최종 아키텍처 리포트

- 팀: kkirikkiri-dev-0720-badge-impl
- 작성: 팀장(lead), 2026-07-20
- 대상: `PRD/badge/액티비티배지 레시피.md` 신규 배지 15개 (카테고리 1 월간거리 · 2 복합속성 · 3 리텐션)
- 범위: 엔진·어드민·UI 코드. **배지 데이터 업로드/마이그레이션 제외.**

---

## 핵심 결론

**신규 배지 조건 대부분은 이미 서비스 코드가 지원한다.** 배지엔진·드랍엔진·타입 정의는 변경이 필요 없다. 실제 개발 작업은 어드민 폼과 유저 상세 문구, 그리고 테스트 3곳에 국한된다. 기존 TEAM_PLAN이 상정한 "엔진 신규 조건 지원 추가"와 "드랍엔진 skip 처리"는 실제로는 불필요한 작업이었다.

---

## 1. 변경 불필요 (검증만) — 이유

### 배지엔진 `jam-web/src/lib/badge-engine/index.ts`
`evaluateConditionDetailed`가 신규 조건 전부를 이미 구현:

| 조건 | 위치 | 상태 |
|------|------|------|
| monthly_km | L119-138 | ✓ 연-월 그룹 max |
| weekend_duration_hours | L95-105 | ✓ 토/일 필터 max |
| season + season_count | L140-157 | ✓ 계절 월 필터 count |
| time_range | L181-203 | ✓ 자정 넘김 포함 |
| temperature_max_c | L170-179 | ✓ 활동 최저기온 ≤ |
| min_speed / elevation / duration / weekly_count / streak | 각 블록 | ✓ |

- 카테고리 2 복합 AND(R7·C7·H7·T7): 각 조건이 독립 if 블록으로 `filtered` 전체에서 평가된다 → 레시피가 명시한 "이력 전반 독립 평가"와 정확히 일치. 세션 동시충족을 요구하지 않는 현행이 곧 스펙.

### 드랍엔진 `jam-web/src/lib/drop-engine/index.ts`
- item 배지에 한해 `checkCondition`(L113) 재사용 → 신규 조건도 공유 엔진으로 정상 평가. TEAM_PLAN의 "monthly_km 등 드랍엔진 skip 처리 필요" 전제는 근거 없음. 코드 변경 불필요.

### 타입 `jam-web/src/types/database.ts`
- `BadgeCondition`(L315-358)에 monthly_km·weekend_duration_hours·season·season_count·temperature_max_c·temperature_min_c·time_range·prerequisite_badge_names 전부 존재. 변경 불필요.

### 어드민 API `jam-web/src/app/api/admin/badges/route.ts`
- condition_json을 통째로 pass-through(필드 검증 없음) → 신규 필드 자동 수용. 변경 불필요.

---

## 2. 실제 작업 필요 — 파일별

### (A) 어드민 배지 폼 — dev-admin (T3/T4) · 최우선
- 파일: `jam-web/src/app/admin/badges/BadgeForm.tsx`
- 문제: `time_range`(start/end), `temperature_max_c`, `temperature_min_c` 입력 필드 부재. 이 때문에 W5·W7·W8·T8(시간대), H5·H7·T5·T7(온도) 배지를 어드민 UI로 생성·수정할 수 없음(현재는 SQL로만 가능).
- 조치:
  1. condition_json 빌더 영역에 time_range start/end 입력 2개 + temperature_max_c/min_c 입력 추가.
  2. `buildConditionJson()`(L69)에 세 필드 조립 로직 추가(빈 값이면 미포함, time_range는 start·end 둘 다 있을 때만).
  3. JSON 미리보기(L519)는 자동 반영됨.

### (B) 유저 배지 상세 문구 — dev-ui (T6)
- 파일: `jam-web/src/app/(main)/badges/[id]/page.tsx` `formatConditionText`(L33)
- 문제: time_range·temperature_max_c·temperature_min_c에 대한 한국어 문구 없음 → 온도-단일 배지(H5 등)는 parts가 비어 "관리자에 의해 특별 발급되는 배지입니다" 폴백으로 오표기. W5(야간+지속)는 "지속"만 노출되어 야간 맥락 누락.
- 조치: 세 조건의 사람이 읽는 문구 추가(예: 야간/새벽/점심 시간대, "N°C 이하 환경").

### (C) 신규 조건 단위 테스트 — tester (T7)
- 파일: `jam-web/src/lib/badge-engine/__tests__/conditions.test.ts`
- 기존 커버: temperature_min_c/max_c·time_range·poi_id·prerequisite
- 추가 대상: monthly_km, weekend_duration_hours, weekly_count, season+season_count, 복합 AND 독립평가(R7류), time_range+weekly_count 조합.

### 변경 불필요로 확정된 태스크
- T1(드랍엔진), T2(배지엔진 조건 지원): 코드 변경 없이 "검증 완료"로 종료.
- T5(어드민 목록/상세), 유저 목록(BadgesClient): 구조 변경 불필요. 신규 배지는 시드 시 자동 노출.

---

## 3. 제품 오너 판단 필요 (미결 설계)

- `time_range + weekly_count`(W7·W8·T8): 엔진은 time_range(범위 내 활동 존재)와 weekly_count(전체 활동 기준 주간 최대)를 **독립** 평가한다. 레시피의 "복합 AND, 이력 전반 독립 평가" 문구와는 부합하나, 배지 의도("새벽 5~8시 걷기 주 N회")보다 느슨하다(새벽 활동 1회 + 아무 시간대 주 N회면 충족). 엄격한 "시간대 윈도우 내 주 N회"를 원하면 엔진에서 weekly_count를 time_range로 필터링하도록 수정해야 한다. **현행 유지 여부는 제품 결정 사항.**

---

## 4. 남은 작업 (범위 밖)

- **배지 데이터 업로드**: 신규 15개 배지의 실제 시드(마이그레이션 `033_reseed_activity_badges_v3.sql` 반영, 이름·설명·condition_json·prerequisite). 태스크 범위에서 명시적으로 제외됨 — 별도 작업으로 진행. 이 작업 없이는 신규 배지가 실제로 발급되지 않는다.
- **(참고) API POST의 item_book_id 미수용**: `route.ts` L20 구조분해에 `item_book_id` 누락(폼은 전송). 기존 버그 가능성 — 신규 배지 체계와 무관하나 별도 확인 권장.

---

## 5. 테스트 방법

1. `cd jam-web && npx tsc --noEmit` — 타입 통과 확인(신규 폼 필드 반영 후).
2. `npx jest src/lib/badge-engine`(또는 vitest) — 조건 단위 테스트.
3. 어드민 `/admin/badges/new` — time_range·temperature 입력으로 W5/H5류 배지 생성 → JSON 미리보기에 필드 반영 확인.
4. 어드민 시뮬레이터(`/admin/simulator`) 또는 `evaluateBadgesDetailed({ dryRun: true })`로 신규 조건 배지가 샘플 활동에서 earned/missed로 올바르게 분류되는지 확인.
5. 유저 배지 상세 페이지에서 신규 배지의 조건 문구가 폴백 없이 표시되는지 확인.

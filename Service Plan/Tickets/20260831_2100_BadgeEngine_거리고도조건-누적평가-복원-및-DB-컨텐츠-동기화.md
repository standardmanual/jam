---
id: 20260831_2100
category: BadgeEngine
status: CLOSED
created: 2026-08-31
closed: 2026-08-31
---

> **후속 작업 완료(2026-08-31)**: 이 티켓의 A/B/C 스코프(T1 same_activity·걷기 32종·
> 21개 조건값)는 커밋 `3c75dda3`/`7166b39a`로 먼저 구현·마이그레이션 실행까지 완료됐다
> (아래 "완료 기록" 참고). 완료 시점에 잔여 이슈로 남겨뒀던 T23("그냥 나갔다 옴")의
> `same_activity` 미적용 건을 이어서 처리해 마이그레이션 120 실행까지 완료했다. T23 관련
> 변경은 A-3·상세 요구사항 A.2·A.5·구현 계획 3·4번에 반영했고, 구현 결과는 맨 아래
> "완료 기록 — T23 후속(2026-08-31)" 절에 별도로 기록한다.

# [BadgeEngine] distance_km/elevation_gain_m 누적 평가 복원 + 걷기배지 32종 반영 + 조건값 DB 동기화

## 배경 / 문제 정의

kangwonc 계정 배지 점검 중 발견해 `Specs/Content/ACTIVITY_BADGES.md`(액티비티 배지 조건의
단일 진실 원천, 사용자 확인 완료)를 기준으로 조사한 결과, 세 가지 독립된 "설계는 문서에서
끝났는데 구현에 반영이 안 된" 간극을 확인했다. 셋 다 문서가 옳고 구현(코드/DB)이 뒤처진
쪽이라고 판단해 문서 기준으로 맞춘다.

### 간극 A — 배지엔진이 누적 조건을 단일 활동 조건으로 잘못 평가

`ACTIVITY_BADGES.md` §"condition_json 패턴별 트랙 분류"(627~655행)와 §"카테고리 2 복합 배지
평가 주의"(731~742행)가 명시적으로 규정한 평가 방식과, 실제 `badge-engine/index.ts`의 동작이
다음 12개 배지군에서 어긋난다.

**A-1. 단독 distance_km/elevation_gain_m — 누적 합계여야 하는데 단일 활동 기준으로 평가됨 (8개군)**

| 배지 | 종목 | 조건 필드 |
|---|---|---|
| 동네 산책러(W1) | walking | distance_km |
| 첫 숨결(R1) | running | distance_km |
| 두 바퀴의 시작(C1) | cycling | distance_km |
| 언덕의 도전자(C4) | cycling | elevation_gain_m |
| 첫 고도(H1) | hiking | elevation_gain_m |
| 산자락의 첫발(H2) | hiking | distance_km |
| 수직의 도전(T2) | trail_running | elevation_gain_m |
| 야생의 주자(T3) | trail_running | distance_km |

**A-2. "복합 AND, 이력 전반 독립 평가" — 필드별 독립(역대 최고/누적)이어야 하는데 한 활동에서 동시 충족을 요구함 (4개군, 카테고리 2)**

| 배지 | 종목 | 필드 구성 | 문서가 규정한 평가 방식(739~742행) |
|---|---|---|---|
| 스피드 엔듀러(R7) | running | max_pace_sec_per_km + duration_minutes | 역대 최고 페이스 AND 역대 최장 시간 — 다른 세션 가능 |
| 산악 라이더(C7) | cycling | min_speed_kmh + elevation_gain_m | 역대 최고 속도 AND 누적 고도 — 독립 이력 |
| 혹한 장정(H7) | hiking | temperature_max_c + duration_minutes | 기록된 최저 기온 AND 역대 최장 시간 — 독립 이력 |
| 알파인 트레일러(T7) | trail_running | elevation_gain_m + temperature_max_c | 누적 고도 AND 기록된 최저 기온 — 독립 이력 |

**A-3. 예외 — 단일 활동 조건 (2개군, 2026-08-31 사용자 확인)**

- `야생의 첫발(T1)`: `distance_km` + `elevation_gain_m` "복합 AND"(이력전반 문구 없음, 521행)로,
  문서상 유일하게 진짜 "한 활동에서 동시 충족"이 맞다. 현재 코드 동작이 이미 맞으므로 회귀시키지
  않는다.
- `그냥 나갔다 옴(T23)`: 단독 `distance_km:0.6` 조건이지만 문서(193행)에 "(단일 활동)"으로
  명시돼 있다. A-1 목록(단독 distance_km/elevation_gain_m → 누적 합계)에서 T23만 빠진 이유가
  이 예외 때문이다 — **T23을 A-1 일괄 "누적 전환" 대상에 포함시키지 않는다.** 임계값(0.6km)이
  걷기 축1 게이트 최소거리(0.5km)에 근접해 단일/누적 간 실질 난이도 차이는 미미하지만, 문서
  표기와 구현을 일치시키기로 사용자가 확정했다(단일 필드 배지에 대한 `same_activity` 플래그
  적용 첫 사례 — T1과 달리 필드 조합만으로는 판별 불가하므로 명시적 플래그가 필수다).

**원인**: 커밋 `27163030`(2026-07-31, "배지·미션 누적 조건을 배치 단위가 아닌 전체 이력
기준으로 평가")이 "서로 다른 활동의 속도+시간을 조합해 잘못 통과되던 버그"(다중 필드 복합
조건에서만 실제로 발생하는 문제)를 고치면서, 단독 필드(A-1)와 "독립 이력" 카테고리(A-2)까지
전부 "한 활동 동시 충족"으로 과잉 일반화했다. 관련 티켓 없음.

**드랍엔진 영향 확인 필요**: `drop-engine/index.ts`의 `isDroppableForActivity()`가 배지엔진의
`checkCondition`(=`evaluateConditionDetailed`)을 그대로 재사용하고, 자체
`CUMULATIVE_CONDITION_FIELDS`(monthly_km/season_count/weekly_count/streak_days/total_count)로
누적조건 배지를 드랍 후보에서 제외한다. `distance_km`/`elevation_gain_m`을 누적으로 바꾸면
이 목록에도 반드시 추가해야 한다 — 현재는 아이템배지(`type='item'`) 3,600건(활성+소프트삭제
전체) 전부 `condition_json`이 비어 있어 즉시 영향은 없지만, 안 고치면 향후 누군가 아이템배지에
distance_km/elevation_gain_m 조건을 넣는 순간 "단일 활동 드랍 판정에 누적값이 새는" 회귀가
조용히 생긴다.

### 간극 B — 걷기 배지 32종이 프로덕션 DB에 아예 없음

`Specs/Content/ACTIVITY_BADGES.md`(146~194행)와 티켓 `20260808_001`(CLOSED)은 D01~D11(누적
활동일수 체크포인트 11종) + 트로피 매트릭스 21종(T01~T18·T20·T22·T23) = 32종이 마이그레이션
`076_walking_badges_v4.sql`로 2026-08-08 시딩 완료됐다고 기록하고 있다.

실측(2026-08-31, service_role):
```
badges WHERE type='activity' AND condition_json->>'activity_type'='walking' → 32건(W1~W8만)
D01~D11·T01~T18·T20·T22·T23 이름으로 조회 → 0건 (소프트삭제 포함해도 0건)
mcp__supabase__list_migrations 결과에도 이 마이그레이션 적용 이력 없음
```

마이그레이션 파일 자체(`076_walking_badges_v4.sql`)는 저장소에 존재하고 INSERT문도 정상
포함돼 있다 — **파일은 있는데 프로덕션에 한 번도 실행되지 않은 상태**로 보인다. 실행 전 파일
내용이 현재 스키마(특히 `badges_condition_json_known_keys` CHECK 제약 등 076 이후 추가된
제약)와 여전히 호환되는지 먼저 검증한다.

### 간극 C — 21개 배지의 등급별 조건값이 문서와 DB에서 다름

나머지 32개 배지군(속성: 속도·페이스·지속시간·빈도)을 전수 대조한 결과 21곳에서 Rare 이상
등급 조건값이 다르다(Common은 전원 일치). `033_reseed_activity_badges_v3.sql`(2026-07-20)
이후 이 배지들을 건드린 마이그레이션이 전혀 없다 — 문서(제목이 이미 "레시피 **v4**")가 나중에
밸런스 조정을 거쳤는데 그걸 반영하는 마이그레이션이 한 번도 안 나간 것으로 판단된다. (판단
근거: 문서 값들이 등차수열인 DB 원본과 달리 상위 등급으로 갈수록 증분이 커지는 형태로, `/gamification`
스킬의 "후반부일수록 의미있는 도약" 원칙에 부합 — 우연한 오타 21건보다는 의도된 리밸런싱
쪽이 훨씬 개연성 있음. 단, 이 판단에 100% 확신은 없으므로 **마이그레이션 작성 후 실행 전
사용자 최종 확인을 받는다**.)

| 배지 | 등급 | 현재 DB 값 | 문서(목표) 값 |
|---|---|---|---|
| 지구력의 전사(러닝) | Common | 30분 | 20분 |
| 지구력의 전사(러닝) | Rare | 60분 | 45분 |
| 지구력의 전사(러닝) | Epic | 90분 | 75분 |
| 산책의 명상가(걷기) | Epic | 90분 | 100분 |
| 산책의 명상가(걷기) | Mystic | 120분 | 150분 |
| 루틴의 수호자(걷기) | Rare | 주4회 | 주5회 |
| 루틴의 수호자(걷기) | Epic | 주5회 | 주6회 |
| 밤의 보행자(걷기) | Epic | 60분 | 75분 |
| 밤의 보행자(걷기) | Mystic | 90분 | 110분 |
| 달리기의 루틴(러닝) | Epic | 주4회 | 주5회 |
| 달리기의 루틴(러닝) | Mystic | 주5회 | 주6회 |
| 페달의 리듬(사이클) | Epic | 25km/h | 28km/h |
| 페달의 리듬(사이클) | Mystic | 30km/h | 35km/h |
| 장거리 항속(사이클) | Mystic | 240분 | 300분 |
| 사이클 루틴(사이클) | Epic | 주4회 | 주5회 |
| 사이클 루틴(사이클) | Mystic | 주5회 | 주6회 |
| 주말 등산가(등산) | Epic | 주3회 | 주4회 |
| 주말 등산가(등산) | Mystic | 주4회 | 주5회 |
| 산행의 깊이(등산) | Epic | 180분 | 200분 |
| 산행의 깊이(등산) | Mystic | 240분 | 300분 |
| 트레일 루틴(트레일) | Mystic | 주4회 | 주5회 |

`prerequisite_badge_names`는 32개군 전부 문서와 일치 — 손댈 필요 없음. 미션보상배지 15종·
미션게이팅 5개 대표배지 구조도 전부 일치 — 손댈 필요 없음.

## 상세 요구사항

### 서비스/코드베이스 관점

**A. `src/lib/badge-engine/index.ts` 조건 평가 로직 수정**

1. `distance_km`·`elevation_gain_m`을 `PER_ACTIVITY_KEYS`(100~103행)에서 제거하고 기본
   동작을 "누적 합계 ≥ 조건값"으로 되돌린다(2026-07-31 이전 방식). 단, 07-31 커밋이 고친
   진짜 버그(서로 다른 활동에서 필드를 각각 만족시켜 조합하는 문제)는 유지해야 하므로, 이건
   아래 2·3번의 복합조건 처리로 흡수한다.
2. 단일 활동 조건이 필요한 배지 — **T1(야생의 첫발, distance_km+elevation_gain_m 복합)**과
   **T23(그냥 나갔다 옴, distance_km 단독)** 2건 — 은 예외적으로 "한 활동에서 동시/단독 충족"을
   요구한다. T23은 필드가 하나뿐이라 필드 조합만으로는 판별할 수 없으므로(2026-08-31 사용자
   확인, A-3 참고), 판별 방식은 **`condition_json`에 명시적 플래그 `same_activity: true`를
   추가하는 쪽으로 확정**한다(구현자 재량 아님). T1·T23 두 배지의 `condition_json`에
   `same_activity: true`를 설정하고, `condition-schema.ts`의 `MEASURABLE_CONDITION_KEYS`·
   DB CHECK 제약(`badges_condition_json_known_keys`)에 `same_activity` 키를 추가한다.
3. 카테고리 2(R7/C7/H7/T7) 4개 배지군은 현재 `relevantPerActivityKeys`가 여러
   `PER_ACTIVITY_KEYS` 필드를 묶어 "한 활동에서 동시 충족"을 요구하는 경로를 타는데, 이걸
   각 필드를 독립적으로(역대 최고/최저 — 기존 개별 필드 평가 로직 재사용 가능, elevation_gain_m은
   위 1번 수정으로 누적 자동 적용) 평가해 AND로 묶는 방식으로 되돌린다.
4. **`drop-engine/index.ts`의 `CUMULATIVE_CONDITION_FIELDS`(77~83행)에 `distance_km`·
   `elevation_gain_m`을 추가**한다 — 위 1번 수정으로 이 두 필드가 배지엔진에서 누적이 되므로,
   드랍엔진의 `isDroppableForActivity`가 같은 `checkCondition`을 재사용하는 이상 이 둘도
   "단일 활동 시점 평가 불가 → 드랍 제외" 대상에 포함시켜야 일관성이 맞다.
5. 배지엔진 테스트(`src/lib/badge-engine/__tests__/`)에 다음 회귀 테스트를 추가한다:
   - 단독 distance_km 조건이 여러 활동 누적으로 통과되는 케이스
   - T1(야생의 첫발)이 여전히 단일 활동 동시 충족만 통과시키는 케이스 (회귀 방지)
   - **T23(그냥 나갔다 옴)이 `same_activity:true`로 단일 활동 0.6km 충족만 통과시키고, 여러
     활동에 걸친 누적 0.6km(예: 0.3km 두 번)로는 통과되지 않는 케이스**
   - R7 계열이 서로 다른 활동의 페이스·시간으로도 통과되는 케이스
   - 드랍엔진 `isDroppableForActivity`가 distance_km/elevation_gain_m 조건을 가진 가상
     아이템배지를 정상적으로 드랍 제외하는 케이스

**B. 걷기 배지 32종 DB 반영**

1. `076_walking_badges_v4.sql`이 현재 스키마(특히 076 이후 추가된 CHECK 제약)와 호환되는지
   검토
2. 문제없으면 그대로, 문제 있으면 수정한 재적용용 SQL 파일을 새 번호로 작성
   (`jam-web/supabase/migrations/0XX_reapply_walking_badges_v4.sql` — 번호는 push 직전
   원격 staging 기준 재확인)
3. **작성만 — 실행은 오케스트레이터가 4단계에서 사용자 승인 하에**

**C. 21개 조건값 DB 동기화**

1. 위 표대로 `UPDATE badges SET condition_json = jsonb_set(...) WHERE name = '...' AND
   rarity = '...'` 형태의 마이그레이션 파일 작성
   (`jam-web/supabase/migrations/0XX_sync_activity_badge_conditions_to_v4.sql`)
2. **작성만 — 실행은 오케스트레이터가 4단계에서 사용자 승인 하에.** 이 표는 문서 근거는
   있지만 "왜 바뀌었는지" 적힌 티켓이 없으므로, 실행 직전 사용자에게 표를 다시 보여주고
   최종 확인을 받는다.

### 컨텐츠 관점

간극 A·B는 문서(`ACTIVITY_BADGES.md`) 자체는 이미 정확하므로 문서 변경 불필요 — 코드/DB만
따라가면 된다. 간극 C도 문서가 목표값이므로 문서는 그대로 두고 DB만 맞춘다.

## 구현 계획

1. A(엔진 로직) 먼저 수정 + 회귀 테스트 통과 확인 (`npm test`, `tsc --noEmit`)
2. B·C SQL 파일 작성 (실행하지 않음)
3. `BADGE_ENGINE_UNIFIED.md` 갱신:
   - §2.3 조건 평가 필드 표: distance_km/elevation_gain_m "누적 합계" 서술은 유지(원래
     맞았음). `same_activity` 플래그와 그 적용 대상(T1·T23 2건 — A-3 확정)을 §2.3에 명시
   - §2.6 "홍수 방지 캡" — 이전 조사에서 코드 주석상 이미 삭제된 로직으로 확인됐다
     (`index.ts:692-697` 주석: "과거엔 30일 내 activity_type당 최대 3개 캡이 있었으나 ...
     제거함"). 재확인 후 문서를 현재 상태(캡 없음)에 맞게 정정
   - 카테고리 2(R7/C7/H7/T7) "이력 전반 독립 평가"가 실제로 그렇게 동작함을 명시
4. `CONDITION_JSON_SPEC.md` — `same_activity` 플래그 스펙 추가 (T1·T23 적용 사례 명시)
5. 잔재 검증: `distance_km`/`elevation_gain_m`을 조건으로 쓰는 다른 배지(예: 야생의 첫발
   외에 향후 추가될 복합조건 배지)가 이번 변경으로 의도치 않게 영향받지 않는지 전체 카탈로그
   재확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

**A. 배지엔진 조건 평가 복원**
- `PER_ACTIVITY_KEYS`에서 `distance_km`/`elevation_gain_m` 제거 → 기본이 "전체 이력 누적 합계"로
  복원(2026-07-31 이전 방식). 신규 `same_activity` 플래그(`BadgeCondition`·
  `condition-schema.ts`의 `FILTER_ONLY_CONDITION_KEYS`에 추가)가 `true`일 때만 예외적으로
  "한 활동 동시 충족"으로 평가 — 현재 T1 `야생의 첫발` 1건만 사용.
- 카테고리 2(R7/C7/H7/T7) 복합배지: `relevantPerActivityKeys`에 `time_range`가 없고
  `same_activity`도 아니면 필드별로 "이력 전반 독립 평가"(각자 최고 기록으로 AND)하도록 분리.
  `time_range`가 섞인 조합(W5·W7·W8·T8 등)은 계속 단일 활동 동시 충족 유지(회귀 없음).
- `drop-engine`의 `CUMULATIVE_CONDITION_FIELDS`에 `distance_km`/`elevation_gain_m` 추가 —
  배지엔진과 "단일 활동 평가 가능 여부" 판단을 일치시킴 (현재 `type='item'` 배지는 전부
  condition_json 비어 있어 즉시 영향 없음).
- 회귀 테스트 5종 추가(`cumulative-conditions.test.ts`) + 기존 `droppable.test.ts`의
  `distance_km`/`hasCumulativeCondition` 관련 테스트를 새 동작(누적 → 드랍 제외)에 맞게 갱신.

**B. 걷기 배지 32종 DB 미반영 재적용**
- `076_walking_badges_v4.sql`이 2026-08-08 작성 후 프로덕션에 한 번도 실행되지 않은 채
  방치돼 있었음을 확인(마이그레이션 이력에 없음, D01~D11·트로피 매트릭스 0건).
- 원인: 076이 당시 등급명(`legendary`/`mythic`)을 썼는데, 이후 두 차례 rename
  (083: legendary→legend, 115: legend→epic·mythic→mystic)으로 그 값 자체가 enum에서 사라져
  그대로 실행하면 즉시 실패하는 상태였다. `118_reapply_walking_badges_v4.sql`로 1:1 rename
  (legendary→epic, mythic→mystic) 적용해 재작성 — ACTIVITY_BADGES.md 목표 등급과 32건 전수
  대조해 정확히 일치함을 확인. 076 이후 추가된 NOT NULL 컬럼은 전부 DEFAULT 보유,
  `badges_condition_json_known_keys` 허용 키 전부 포함, `badges.name` UNIQUE 제약 없음 —
  호환성 문제 없음 확인.

**C. 21개 배지 조건값 DB 동기화**
- `119_sync_activity_badge_conditions_to_v4.sql` — 티켓 표의 21개 (배지명, 등급) 조합을
  `jsonb_set(..., create_missing=false)`로 문서(v4) 목표값에 맞춤. Common 등급은 전원
  일치해 손대지 않음. `prerequisite_badge_names`는 32개군 전부 문서와 일치해 미변경.

**문서 갱신**
- `BADGE_ENGINE_UNIFIED.md` §2.3에 `same_activity` 행 추가, 신규 §2.3-1(복합조건 배지
  "이력 전반 독립 평가" 기본 원칙 + T1 예외) 서술. §2.6 홍수 방지 캡을 "현재 없음"으로 정정
  (코드 주석상 이미 삭제된 로직, 문서만 뒤처져 있었음). §2.9 DB 시드 경로를 118로 갱신.
- `CONDITION_JSON_SPEC.md` §2.2에 same_activity 참조 추가, 신규 §2.2-1(플래그 스펙),
  §4 필드 조합 규칙에 카테고리 2 독립 평가 원칙 추가, §5 예시 갱신.

**B·C의 SQL도 사용자 승인 후 오케스트레이터가 실행 완료했다** (아래 배포 정보 참고). 마이그레이션
118 실행 결과, 걷기 활동배지가 32건(W1~W8)→64건(D01~D11·트로피 매트릭스 32종 추가)으로
정상 증가했음을 재조회로 확인. 마이그레이션 119 실행 결과, 21개 (배지명·등급) 조합의
`duration_minutes`/`weekly_count`/`min_speed_kmh` 값이 문서(v4) 목표값과 정확히 일치함을
전수 재조회로 확인.

### 변경된 파일
```
jam-web/src/lib/badge-engine/index.ts
jam-web/src/lib/badge-engine/condition-schema.ts
jam-web/src/lib/drop-engine/index.ts
jam-web/src/types/database.ts
jam-web/src/lib/badge-engine/__tests__/cumulative-conditions.test.ts (신규)
jam-web/src/lib/drop-engine/__tests__/droppable.test.ts
jam-web/src/app/admin/badges/__tests__/conditionFormFields.test.ts
jam-web/supabase/migrations/117_condition_json_same_activity_flag.sql (신규, 미실행)
jam-web/supabase/migrations/118_reapply_walking_badges_v4.sql (신규, 미실행)
jam-web/supabase/migrations/119_sync_activity_badge_conditions_to_v4.sql (신규, 미실행)
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md
```

### 테스트 결과
- [x] `npx vitest run src/lib/badge-engine src/lib/drop-engine src/app/admin/badges src/lib/admin` — 10 파일 155건 전부 통과
- [x] `npm test`(vitest 전체 + 미션 노드 테스트) — 646건 중 645건 통과, 1건 실패는 무관 사전 존재
      실패(`design-system/.../BadgeRevealCarousel.stories.tsx`, 마지막 수정 커밋이 티켓
      20260831_1115 — 등급명 rename. 이번 변경과 무관, git status로 미변경 확인)
- [x] `npx tsc --noEmit` — 에러 0건
- [x] `npm run lint`(전체) — 에러 0건, 경고 26건(전부 기존 파일, 이번 변경 파일 대상 경고 없음)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
사용자 노출 텍스트 변경 없음 — 해당 없음 (엔진 로직·DB 조건값만 변경)

### 배포 정보
- 배포일: 2026-08-31
- 환경: production (Supabase는 staging·프로덕션 공용 단일 DB — DB 변경은 즉시 반영)
- 커밋: `3c75dda3`(구현) → `54ad7faa`(origin/staging 병합 후 push, 격리 워크트리에서 처리)
- Vercel(jam-stage 프로젝트, staging 브랜치=Production 환경): 커밋 `54ad7faa` 배포 READY 확인
  (`dpl_3DqAjWFHTxqZMsDedwSxjgj2V98S`)
- 마이그레이션 실행: 117(`same_activity` 플래그+CHECK 제약) → 118(걷기 32종) → 119(21개
  조건값) 순서로 전부 실행 완료, 각각 실행 직후 재조회로 반영 확인

### 주요 의사결정 / 핵심 메모
- `same_activity` 플래그를 필드 조합 추론 대신 명시적 플래그로 도입(티켓이 제시한 두 선택지
  중 후자) — 향후 T1과 유사한 "진짜 동시 충족" 배지가 추가돼도 의도를 명시적으로 남길 수 있음.
- 카테고리 2 복합조건의 "독립 평가 vs 동시 충족" 분기 기준을 `time_range` 포함 여부로 삼음 —
  `time_range`는 "그 시간대에 일어난 활동"이라는 본질적 결합이 있어 항상 단일 활동 평가가
  맞고(W5 등, 이번 티켓 범위 밖), 나머지 조합은 문서상 전부 "독립 평가"로만 쓰이고 있어
  `same_activity` 없이도 안전하게 기본값을 뒤집을 수 있었음. 전체 카탈로그 재확인 결과 이
  분기로 영향받는 조합은 R7/C7/H7/T7(의도한 변경) 외에 없음.
- 마이그레이션 117(same_activity 스키마+T1 데이터)·118(걷기 32종)·119(21개 조건값)은 순서
  의존적이지 않으나, 117은 반드시 배지엔진 코드 배포와 같은 사이클에 실행해야 한다(코드가
  same_activity 플래그를 읽기 전에 실행되면 일시적으로 아무 영향 없고, 코드 배포 후 실행
  전에는 T1이 잠시 누적으로 오판정될 수 있음 — 마이그레이션 파일 상단에 명시).

### 잔여 이슈
- (WARN) 미션 엔진(`src/lib/missions/checker.ts`)이 `elevation_gain_m` 미션 타입 판정을
  배지엔진 `evaluateConditionDetailed`에 위임(`ENGINE_DELEGATED_MISSION_TYPES`)하는데, 이번
  변경으로 그 판정이 "단일 활동 최고값"에서 "참가 시점 이후 누적 합계"로 바뀐다. 반면
  진행바 표시용 `calculateProgress`의 elevation_gain_m 계산은 그대로 "단일 활동 최고값"이라
  표시값과 달성 기준이 어긋나게 된다. 실측(migrations 전수 grep) 결과 `mission_type=
  'elevation_gain_m'`로 실제 생성된 미션 행은 현재 없어 즉시 영향은 0건이나, 후속 티켓에서
  미션 엔진 쪽 의도(단일 활동 vs 누적)를 명시적으로 정리할 필요가 있음.
  → 후속 작업으로 분리(task_b32f3df2), 사용자가 별도 세션에서 진행 중.
- (해결됨, 2026-08-31) T23 "그냥 나갔다 옴"(걷기, `distance_km:0.6`, 마이그레이션 118로
  최초 시딩)이 `ACTIVITY_BADGES.md`에는 "(단일 활동)"으로 명시돼 있으나 `same_activity`
  플래그를 부여하지 않아 실제로는 누적 합계로 평가되던 문제. 마이그레이션 120으로 T23에도
  `same_activity: true`를 적용해 해결 — 상세는 아래 "완료 기록 — T23 후속(2026-08-31)" 참고.
- (INFO) 이번 티켓 스코프 밖 발견: 작업 시작 시점에 로컬 저장소가 다른 진행 중 티켓(2038)의
  리뷰 브랜치에 체크인된 상태였고, 동시에 또 다른 세션(2106, Footer/TopNav)이 같은 메인
  워크트리에서 실시간으로 파일을 수정 중이었다(`git worktree list`로 확인, 별도 워크트리
  슬롯이 있음에도 이번 실행은 메인 워크트리를 그대로 공유). 이 티켓의 변경사항은 안전을 위해
  별도 임시 워크트리(`origin/staging` 기준)를 만들어 파일을 옮긴 뒤 그 안에서 커밋·푸시했다 —
  메인 워크트리의 다른 세션 작업(Footer.tsx·TopNav.tsx·DropsClient.tsx·DESIGN_RENEWAL_SPEC.md
  미커밋 변경분)은 전혀 건드리지 않았다. 오케스트레이터가 jam-developer 실행 시 격리된
  워크트리를 배정하는 경로를 점검할 필요가 있어 보임.

---
## 완료 기록 — T23 후속(2026-08-31)

### 구현 내용 요약
- 배지엔진 코드(`src/lib/badge-engine/index.ts`)는 T1 적용 시점에 이미 `same_activity:true`를
  필드 개수와 무관하게 제네릭으로 읽도록 구현돼 있어(407·429~431·448~451행) **코드 변경 없이**
  T23에도 그대로 적용된다. 확인 절차: `git fetch origin staging` 후 origin/staging의
  `index.ts`·`117_condition_json_same_activity_flag.sql`·`BADGE_ENGINE_UNIFIED.md`·
  `CONDITION_JSON_SPEC.md`를 grep해 T23/"그냥 나갔다 옴" 관련 내용이 실제로 없음을 직접 확인한
  뒤 착수(오탐 방지 — "이미 CLOSED됐다"는 git 이력만으로 완료 여부를 판단하지 않음).
- `jam-web/supabase/migrations/120_same_activity_flag_t23.sql` 신규 작성 — T23(단일 등급
  Epic)의 `condition_json`에 `same_activity: true`를 추가하는 UPDATE문. CHECK 제약의
  `same_activity` 키는 117에서 이미 추가돼 있어 이번 마이그레이션은 스키마 변경 없이 데이터만
  갱신한다. **작성만 — 실행하지 않음(오케스트레이터가 사용자 승인 후 처리).**
- 회귀 테스트 3종 추가(`cumulative-conditions.test.ts`, T1 블록 다음에 신규 describe 블록):
  단일 활동 0.6km 충족 시 pass, 여러 활동에 걸친 누적 0.6km로는 fail, same_activity 없을 때는
  누적으로 pass(대조군). 테스트 활동값은 걷기 축1 게이트(distance≥0.5km, duration≥10분,
  speed 2~8km/h)를 통과하도록 조정 — 게이트 미만 값(예: 티켓 예시의 "0.3km 두 번")을 쓰면
  게이트에서 먼저 걸러져 same_activity 로직 자체를 검증하지 못하는 것을 실행 중 발견해 0.5km
  두 번(게이트는 통과, 개별로는 0.6km 미달)으로 대체.
- `BADGE_ENGINE_UNIFIED.md`·`CONDITION_JSON_SPEC.md`의 same_activity 적용 대상 서술을
  "T1 1건"에서 "T1·T23 2건"으로 갱신, CONDITION_JSON_SPEC.md §5 예시에 단독 필드 패턴
  (T23) 예시 추가.

### 변경된 파일
```
jam-web/supabase/migrations/120_same_activity_flag_t23.sql (신규, 미실행)
jam-web/src/lib/badge-engine/__tests__/cumulative-conditions.test.ts
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md
Service Plan/Tickets/20260831_2100_BadgeEngine_거리고도조건-누적평가-복원-및-DB-컨텐츠-동기화.md (본 파일 — A-3·요구사항·계획·잔여이슈 갱신)
```

### 테스트 결과
- [x] `npx vitest run src/lib/badge-engine src/lib/drop-engine` — 5 파일 92건 전부 통과
- [x] `npm test`(vitest 전체) — 649건 중 646건 통과, 3건 실패는 전부 이번 변경과 무관한
      사전 존재 실패: `src/lib/strava/__tests__/sync-drop-order.test.ts` 2건은 이 워크트리에
      `.env.local`(Supabase URL/Key) 심볼릭 링크가 없어 발생하는 환경 문제(코드 미변경, 이번
      브랜치 diff에 해당 파일 없음), `design-system/.../BadgeRevealCarousel.stories.tsx` 1건은
      이전 CLOSED 완료 기록에도 동일하게 기록된 기존 실패(티켓 20260831_1115 무관 이슈)
- [x] `npx tsc --noEmit` — 에러 0건
- [x] `npm run lint`(전체) — 에러 0건, 경고 26건(전부 기존 파일, 이번 변경 파일 대상 경고 없음 —
      이전 CLOSED 완료 기록과 동일한 경고 26건으로 baseline 일치 확인)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
사용자 노출 텍스트 변경 없음 — 해당 없음 (엔진 로직·DB 조건값·문서만 변경)

### 배포 정보
- 배포일: 2026-08-31
- 환경: production (Supabase는 staging·프로덕션 공용 단일 DB — DB 변경은 즉시 반영)
- 커밋: `7e95ce54`(구현) → `2fbf0238`(origin/staging 병합 후 push, 격리 워크트리에서 처리 —
  이 사이 원격에 병합된 티켓 20260831_2152와 무충돌 병합 확인)
- 마이그레이션 실행: 120(T23 `same_activity` 플래그) 실행 완료, 실행 직후 재조회로
  `condition_json`에 `"same_activity":true` 반영 확인
- 프로덕션 배포(Vercel)는 이 세션에서 별도로 검증하지 않음 — 필요 시 `/jam-ship`으로 진행

### 주요 의사결정 / 핵심 메모
- 배지엔진 코드는 T1 적용 시점에 이미 필드 개수와 무관한 제네릭 구현이라 T23 추가에 코드
  변경이 전혀 필요 없었다 — 순수 데이터(마이그레이션) + 테스트 + 문서 작업으로 스코프가
  좁혀졌다(선행 게이트 리뷰에서 확정된 범위).
- 회귀 테스트 작성 중 걷기 축1 게이트(0.5km/10분/2~8km/h)가 T23 임계값(0.6km)에 근접해
  있다는 티켓의 사전 경고가 실제로 테스트 값 선정에 영향을 줬다 — 티켓 예시 그대로("0.3km
  두 번")는 게이트에서 먼저 걸러지므로 same_activity 로직만 격리 검증하도록 값을 조정했다.

### 잔여 이슈
- 없음.

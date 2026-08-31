---
id: 20260831_2100
category: BadgeEngine
status: OPEN
created: 2026-08-31
closed:
---

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

**A-3. 예외 — 손대지 말 것 (1개군)**

`야생의 첫발(T1)`은 `distance_km` + `elevation_gain_m` "복합 AND"(이력전반 문구 없음, 521행)로,
문서상 유일하게 진짜 "한 활동에서 동시 충족"이 맞다. 현재 코드 동작이 이미 맞으므로 회귀시키지
않는다.

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
2. `distance_km`와 `elevation_gain_m`이 **같은 condition_json에 함께** 있는 경우(현재
   카탈로그엔 T1 야생의 첫발 1건뿐)만 예외적으로 "한 활동에서 동시 충족"을 요구한다. 이
   판별을 필드 조합만으로 할지, `condition_json`에 명시적 플래그(예: `same_activity: true`)를
   추가해 T1에만 설정할지는 구현자가 판단하되, 후자가 향후 확장성·의도 명시성 면에서 더
   안전하다면 그쪽을 택하고 `condition-schema.ts`의 `MEASURABLE_CONDITION_KEYS`·DB CHECK
   제약(`badges_condition_json_known_keys`)도 함께 갱신한다.
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
     맞았음). same_activity 플래그를 도입했다면 그 필드와 T1 예외를 §2.3에 명시
   - §2.6 "홍수 방지 캡" — 이전 조사에서 코드 주석상 이미 삭제된 로직으로 확인됐다
     (`index.ts:692-697` 주석: "과거엔 30일 내 activity_type당 최대 3개 캡이 있었으나 ...
     제거함"). 재확인 후 문서를 현재 상태(캡 없음)에 맞게 정정
   - 카테고리 2(R7/C7/H7/T7) "이력 전반 독립 평가"가 실제로 그렇게 동작함을 명시
4. `CONDITION_JSON_SPEC.md` — same_activity 플래그(도입 시) 스펙 추가
5. 잔재 검증: `distance_km`/`elevation_gain_m`을 조건으로 쓰는 다른 배지(예: 야생의 첫발
   외에 향후 추가될 복합조건 배지)가 이번 변경으로 의도치 않게 영향받지 않는지 전체 카탈로그
   재확인

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
사용자 노출 텍스트 변경 없음 — 해당 없음 (엔진 로직·DB 조건값만 변경)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

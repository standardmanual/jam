---
id: 20260910_1804
category: BadgeEngine
priority: P1
status: OPEN
created: 2026-09-10
closed:
---

# [BadgeEngine] POI·체크인 배지 발급 경로에도 섀도우밴 게이트가 없다 — GPS 스푸핑에 직접 노출

## 배경 / 문제 정의

티켓 [20260910_1719(액티비티 배지 섀도우밴 미적용)](20260910_1719_BadgeEngine_액티비티배지-섀도우밴-미적용.md)의 개선 리뷰(progressive)에서 발견한 범위 밖 이슈.

POI·체크인 배지 발급 경로(`jam-web/src/lib/strava/sync.ts`의 `processFetchedActivities` 내
POI 매칭 후 지급 블록 — `type='checkin'`은 `user_checkin_badge_earns` 반복 획득 경로,
레거시 `type='activity'`+`poi_id`는 `user_activity_badges` 직접 insert 경로)에도 섀도우밴
게이트(`getUserBanLevel`/`shouldAllowDrop`)가 전혀 연결돼 있지 않다. 해당 파일 전체와 관문
함수 `matchPoisForActivity`(`jam-web/src/lib/poi/matcher.ts`)를 grep해도 참조가 없다.

**이 경로는 다른 두 경로(아이템 드랍, 액티비티 배지)보다 오히려 위험도가 높다** — 섀도우밴이
막으려는 것이 "부정하게 조건을 채우는 것"인데, POI 체크인은 물리적 위치 조작(없는 장소를
"방문"한 것처럼 GPS 스푸핑)에 가장 직접 노출되는 배지 종류다. 어드민 시뮬레이터
(`jam-web/src/app/api/admin/simulate/route.ts:93`)도 POI 매칭을 `evaluateBadgesDetailed`와
완전히 별개로 호출해 20260910_1719가 새로 붙인 게이트를 거치지 않는다는 것도 확인됐다.
POI 연결 배지가 `rarity` 컬럼을 실제로 갖고 있다는 것도 같은 라우트에서 확인했다(
`select('id, name, rarity, type')`) — 즉 게이트를 붙이는 것 자체는 기술적으로 바로 가능하다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `processFetchedActivities`의 POI 매칭 후 지급 블록(`type='checkin'` 반복 획득 경로,
  레거시 `type='activity'`+`poi_id` 경로) 양쪽에 섀도우밴 게이트를 연결한다.
- 참고 패턴: 20260910_1719가 액티비티 배지 경로(`evaluateBadgesDetailed`)에 붙인 방식 —
  `getUserBanLevel` 조회 → `shouldAllowDrop`으로 rarity 있는 배지만 차단, 강등은 하지 않고
  미발급으로 처리.
- 어드민 시뮬레이터(`/api/admin/simulate`)가 POI 매칭을 별도 경로로 호출하는 구조도 함께
  게이트를 타도록 정리할지, 시뮬레이터는 "밴과 무관하게 조건 자체를 확인하는 도구"로 의도적으로
  분리 유지할지 결정이 필요하다(후자라면 그 판단 근거를 완료 기록에 남길 것).
- 반복 획득 경로(`user_checkin_badge_earns`)는 카운터 증가 방식이라, 액티비티 배지의 "반복형
  카운터 증가는 섀도우밴과 무관하게 정상 동작"(20260910_1719 완료 기록 참고) 원칙을 그대로
  따를지, 체크인 반복 획득 자체를 밴 대상으로 볼지도 함께 정한다.

## 구현 계획
> 조사 후 구체화 — 참고 티켓(20260910_1719)의 구현 패턴을 그대로 재사용 가능한지가 핵심 판단 포인트.

1. `processFetchedActivities`의 두 지급 블록 위치 확인, 섀도우밴 게이트 삽입
2. 시뮬레이터(`/api/admin/simulate`)의 POI 매칭 분리 호출을 게이트 대상에 포함할지 결정
3. 회귀 테스트: 밴 유저는 고가치 POI/체크인 배지를 못 받고, 정상 유저 흐름엔 영향 없는지

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
- [ ] 해당 없음 (사용자 노출 텍스트 변경 없음, 필요 시 갱신)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

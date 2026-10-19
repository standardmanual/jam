---
id: "20261019_1800"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-10-19
parent: "20261019_1310"
specs:
  - "docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md"
---

# [BadgeEngine] JAM2 체크인 배지 발급 계산의 방문 기록 조회에 페이징이 없어 응답 행 상한을 넘으면 장소 종류·지정 이름 배지가 덜 발급될 수 있다

## 핵심 요약

- 요구사항: `jam-web/src/lib/badge-engine/usageBadges.ts`의 `evaluateCheckinUsageBadges`(332~336줄 근처)는 `user_checkin_badge_earns`에서 `badge_id`를 조회할 때 페이징 없이 한 번에 읽는다. 한 유저의 체크인 배지 방문 기록이 응답 행 상한(공용 DB에서 `badges` 3,366행에 5,000행을 요청해도 1,000행만 돌아오는 것을 2026-10-20에 읽기 전용으로 확인했다. 응답 상한은 1,000행이다)을 넘으면 받은 배지 집합이 잘려서 «장소 종류를 채운 배지»와 «지정한 이름 목록의 배지»가 덜 발급될 수 있다.
- 확인한 사실(2026-10-19, 5-2b 2회 게이트와 아현이 같은 지적): 같은 이력을 읽는 미션 쪽 조회(`lib/badge-engine/jamActionCheckinMetrics.ts`)는 `selectAllPages`로 끝까지 읽는다. 발급 쪽만 페이징이 없다. 5-2b 2회는 이 조회의 계산만 순수 함수(`checkinHoldings.ts`)로 분리했고 읽기와 오류 처리는 그대로 두었다.
- 구현 계획: 시작 때 공용 DB에서 유저별 `user_checkin_badge_earns` 행 수의 최댓값을 읽기 전용으로 확인해 지금 영향이 있는지 기록한다. 영향이 없더라도 `selectAllPages`로 바꾸는 작은 수정이다(특성 시험 `usage-badges.test.ts`가 동작을 고정하고 있다).
- 관련 파일: `jam-web/src/lib/badge-engine/usageBadges.ts`, `jam-web/src/lib/badge-engine/jamActionCheckinMetrics.ts`(`selectAllPages` 사용 선례).

## 완료 조건

- 방문 기록이 응답 행 상한보다 많은 유저에게도 장소 종류·지정 이름 배지 판정이 전체 이력을 기준으로 이뤄진다(시험으로 확인).
- 공용 DB에서 유저별 방문 기록 행 수의 최댓값이 이 티켓에 기록되어 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈

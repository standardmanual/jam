---
id: 20260918_1554
category: Service
priority: P3
status: OPEN
created: 2026-09-18
closed:
---

# [Service] `lib/strava/sync.ts`(1,295줄) 역할별 분리

## 핵심 요약
- 요구사항: 동작을 바꾸지 않고 `sync.ts`를 역할별 모듈로 나눠, Strava 관련 작업마다 거대한 파일 하나를 통째로 읽는 비용을 없앤다.
- 구현 계획: 먼저 분리 계획(모듈 경계·공개 함수 유지 방식)만 세워 승인받은 뒤 진행한다. 외부에서 쓰는 export는 `sync.ts`에서 다시 내보내 호출부 6곳을 건드리지 않는 방식을 우선 검토한다.
- 관련 파일(지도): `jam-web/src/lib/strava/sync.ts`
  - 103 `fetchEarnedBadgeDetails` · 196 `buildEarnedBadgePayload` · 239 `notifyActivityBadgesEarned` (배지 알림·페이로드)
  - 284 `normalizeActivity` · 314 `getProcessedStravaIds` · 336 `recordProcessedActivities` (활동 정규화·처리 기록)
  - 400 `pickFamilyFrontier` · 447 `updateFamilyProgressSnapshots` (패밀리 진행도)
  - 624 `processFetchedActivities` (약 490줄, 가장 큼) · 1111 `syncStravaActivities` (진입점·실패 기록)
- 출처: 20260918_1553 분석 (1307에서 아현이 이 파일 통독)

## 배경 / 문제 정의
Strava·배지 드랍 관련 티켓마다 에이전트가 이 파일을 읽는다. 파일이 클수록 한 번 읽은 내용이 이후 모든 행동에 다시 실려 비용이 누적된다.
배지 발급 핵심 경로라 회귀 위험이 크므로 경미 처리 금지, 계획 승인 후 진행한다.

## 완료 조건
- 동작 불변: 기존 테스트 전부 통과, 호출부 import 변경 최소화
- 분리 후 단일 파일 400줄 이하 (`processFetchedActivities` 자체가 크면 내부 분해 여부는 계획 단계에서 판단)
- ④ 배지엔진 문서의 파일 경로 참조 갱신

---
## 완료 기록 *(작업 완료 후 작성)*

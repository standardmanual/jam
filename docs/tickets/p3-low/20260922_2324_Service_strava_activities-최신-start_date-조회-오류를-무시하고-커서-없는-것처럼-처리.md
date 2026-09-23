---
id: "20260922_2324"
category: Service
priority: P3
status: OPEN
created: 2026-09-22
closed:
parent: "20260922_2207"
---

# [Service] `strava_activities` 최신 `start_date` 조회 오류를 무시하고 커서 없는 것처럼 처리한다

## 핵심 요약

- 요구사항: `syncStravaActivities()`의 신규 커서 조회가 실패했을 때(네트워크·권한 오류 등)
  조용히 "활동 없음"으로 취급하지 말고 오류를 기록하거나 동기화를 중단한다.
- 관련 파일: `jam-web/src/lib/strava/sync.ts` 1204행 부근 (신규 `strava_activities` 최신
  `start_date` 조회, 티켓 20260922_2207)

## 배경 / 문제 정의

/jam-ship 5단계 병렬 점검(민지 모드 ③)에서 발견했다(`[정확성/주의]`).

`const { data: latestActivity } = await supabase...maybeSingle()`가 `error`를 버린다. 쿼리가
실패해도 `data`만 보고 "활동 없음"으로 취급해 `afterTimestamp`가 `undefined`가 되고, 커서
없이 최신 페이지를 다시 조회한다. 티켓 20260922_2207의 새 테스트 3건은 모두 `error: null`만
반환하는 페이크라 이 오류 경로가 테스트되지 않는다.

영향은 fail-safe 방향(과거 활동을 놓치지 않고 최신 1건만 재조회)이라 심각한 회귀는 아니지만,
조회 오류가 잦아지면 매번 "첫 싱크"처럼 동작해 배지 재평가 비용이 늘고 오류가 조용히 묻힌다.

## 완료 조건

**카리나 판단(2026-09-23)**: 기존 동작(커서 없이 최신 페이지 조회, fail-safe)을 유지하고 로그만
추가한다. 동기화 중단으로 바꾸면 일시적 오류(순간 네트워크 타임아웃 등)에도 전체 동기화가
막혀 배지 발급이 끊긴다 — 배경에 적힌 대로 이미 fail-safe 방향이라 심각한 회귀가 아니므로,
관찰 가능성만 높이는 쪽이 안전하다.

- 조회 `error`가 있으면 `console.error`로 로그를 남긴다(예:
  `[syncStravaActivities] 커서 조회 실패 — userId: ${userId}:`, `latestActivityError`).
  기존 동작(커서 없이 최신 페이지 조회)은 그대로 유지한다.
- 오류 케이스 회귀 테스트 1건 추가 — `latestActivity` 조회가 `{ data: null, error: <오류> }`를
  반환하면 로그가 남고 `afterTimestamp`가 `undefined`로 정상 진행되는지 확인
  (`jam-web/src/lib/strava/__tests__/sync-cursor-last-activity.test.ts`에 추가).

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
- 해당 없음

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

---
id: 20260810_002
category: Service
status: CLOSED
created: 2026-08-10
closed: 2026-08-10
---

# [Service] reconcile 크론 제거 + 동기화 커서(last_synced_at) 롤백 도입

## 배경 / 문제 정의
`/api/cron/reconcile`(매일 12:00 UTC, 전체 연동 유저 순회하며 최근 7일 재조회)이 Strava API 호출량을 늘리고 있어 제거를 원함. 다만 이 크론은 "동기화 실패로 놓친 활동"을 하루 한 번 자동 보정해주는 안전망 역할도 겸하고 있었어, 단순 제거 시 실제 인시던트를 재발시킬 수 있었다.

**실제 발생한 인시던트 (2026-08-09~10 관측)**: 신규 유저가 Strava 연동 후 동기화했는데, Strava에는 활동 데이터가 있음에도 배지가 발급되지 않음. 한참 후 계정을 삭제하고 재생성하니 정상 발급됨.

**근본 원인 조사 결과**: Strava 자체의 인덱싱 지연이 아니라 JAM! 내부 버그였다.
1. `strava/callback/route.ts`가 OAuth 연동 직후 `syncStravaActivities()`를 **`await` 없이 fire-and-forget**으로 호출하고 즉시 리다이렉트함. Vercel 서버리스 함수는 응답 반환 직후 인스턴스가 종료될 수 있어, 이 백그라운드 호출이 처리 도중 끊길 위험이 있었음.
2. `syncStravaActivities`의 동시 싱크 잠금 로직은 **처리 성공 여부와 무관하게** `last_synced_at`을 먼저 "지금 시각"으로 선점 갱신함. 위 1번처럼 처리가 중간에 끊기면, 커서만 앞으로 밀린 채 아무것도 처리되지 않은 상태가 됨.
3. 이후 유저가 직접 "동기화" 버튼을 눌러도, 커서가 이미 "방금"으로 밀려있어 가입 전부터 있던 과거 활동(신규 유저의 첫 활동 이력)은 조회 대상(`after` 파라미터)에서 영영 제외됨.
4. `reconcile` 크론은 `last_synced_at` 커서와 무관하게 매번 "최근 7일"을 독립적으로 재조회했기 때문에 이 버그를 어느 정도 가려주고 있었음(단, 활동이 7일 이내인 경우만). 계정 삭제·재생성이 실제로 문제를 해결한 이유는 `strava_connections.last_synced_at`이 다시 `null`로 리셋되어 조회 범위 제한이 풀렸기 때문.

## 상세 요구사항

### 서비스/코드베이스 관점
- `reconcile` 크론(라우트·로직·vercel.json 등록) 완전 삭제 — API 호출량 절감
- 위 근본 원인 1, 2, 3을 코드 레벨에서 수정해 크론 없이도 재발하지 않도록 함
- 이미 버그를 겪어 커서가 잘못 밀려있는 기존 유저는 자동 복구하지 않음 — 문의 오면 어드민의 기존 "유저 초기화" 기능(`/admin/users/[id]` → 초기화, `strava_connections.last_synced_at`을 `null`로 리셋)으로 수동 대응

## 구현 계획
1. `strava/callback/route.ts`: fire-and-forget(`.catch()`만) → `await` + `try/catch`로 변경. 동기화 자체가 실패해도 연동은 이미 완료된 상태이므로 리다이렉트는 그대로 진행.
2. `strava/sync.ts`: 잠금(`last_synced_at` 선점 갱신) 이후의 조회·처리 구간 전체를 `try/catch`로 감싸고, 예외 발생 시 `last_synced_at`을 잠금 이전 값으로 롤백(단, 그 사이 다른 요청이 갱신했다면 덮어쓰지 않도록 `eq('last_synced_at', lockNow)` 조건 추가) 후 예외를 다시 던짐.
3. `/api/cron/reconcile/route.ts`, `src/lib/strava/reconcile.ts` 삭제, `vercel.json`에서 크론 등록 제거.
4. 문서 갱신: `04_PROJECT_SPEC.md` Cron 표·"절대 하지 마" 목록에서 reconcile 관련 서술 정리.

---
## 완료 기록

### 구현 내용 요약
계획대로 전부 반영. reconcile 크론은 완전히 삭제됐고, 그 크론이 우연히 가려주던 커서 롤백 부재 버그는 근본 수정으로 대체됨.

### 변경된 파일
```
jam-web/src/app/api/strava/callback/route.ts   — 즉시 동기화 await + try/catch
jam-web/src/lib/strava/sync.ts                 — 처리 구간 try/catch + 실패 시 커서 롤백
jam-web/src/app/api/cron/reconcile/route.ts    — 삭제
jam-web/src/lib/strava/reconcile.ts            — 삭제
jam-web/vercel.json                            — reconcile 크론 등록 제거
jam-web/src/types/database.ts                  — processed_via 주석 갱신(reconcile은 과거 데이터 전용)
Service Plan/Specs/PRD/04_PROJECT_SPEC.md      — Cron 표·DO NOT 목록 갱신
```

### 테스트 결과
- [x] `npx tsc --noEmit` 전체 통과 (테스트 파일·자동생성 타입 제외)
- [ ] 실제 Strava 신규 연동 시나리오로 재현 테스트 — 실 계정 필요, 미실시

### 배포 정보
- 배포일: 2026-08-10
- 환경: production
- 커밋: (git push 시 기록)

### 주요 의사결정 / 핵심 메모
- **reconcile 삭제 범위**: 코드 완전 삭제로 결정(vercel.json만 비활성화하는 대안은 채택 안 함) — 근본 수정이 원인을 막으므로 안전망으로 남겨둘 실익이 적다고 판단.
- **기존 피해 유저 자동 복구**: 하지 않기로 결정 — `strava_activities`에 "badges=0인데 last_synced_at만 있는" 패턴을 찾아 일괄 리셋하는 마이그레이션도 검토했으나, 오탐 위험(정상적으로 배지가 0개인 유저와 구분 어려움) 대비 실익이 낮아 기각. 문의 시 어드민 유저 초기화 기능으로 개별 대응.
- 잠금 로직 자체(처리 시작 전 커서 선점)는 동시 싱크 중복 방지를 위해 필요해 유지 — 롤백을 실패 시에만 적용하는 방식으로 "중복 방지"와 "실패 시 커서 보존"을 동시에 만족시킴.

### 잔여 이슈
- 이미 버그로 커서가 밀려있는 기존 유저 규모 파악 안 됨 — 문의가 들어오면 개별 확인 필요

# JAM! 서비스 운영 문서 — 변경분 (2026-07-31 02:20)

> **이 버전의 변경 내용:** Strava 전체 유저 자동 동기화 크론(`/api/cron/sync`, 매일 21:00 KST) 폐지 — 이제 Strava 동기화는 유저가 `/api/strava/sync`(수동 버튼)로 직접 실행해야만 발생. 남은 크론 4종은 Vercel Hobby 플랜 제약(하루 1회 초과 시 배포 자체 거부) 하에서 부하가 몰리지 않도록 6시간 간격으로 재분산.
> 이전 버전: SERVICE_OPERATIONS_20260730_1444.md

---

## [정책 변경] Strava 동기화를 자동 크론 → 유저 수동 실행으로 전환

**배경**: 기존엔 `vercel.json`에 등록된 `/api/cron/sync`가 매일 21:00 KST(12:00 UTC)에 `strava_connections`에 연동된 전체 유저를 순차 동기화했음. 유저 수 증가에 따라 배치 처리 시간·Rate Limit 부담이 커지고, 유저가 원치 않는 시점에 자동으로 활동이 반영되는 것도 정책상 바람직하지 않다고 판단.

**변경**: 전체 유저 자동 동기화 크론을 완전히 제거. Strava 동기화는 이제 아래 두 경로로만 발생:
- 유저가 프로필 화면의 동기화 버튼(`SyncButton.tsx`)을 눌러 `POST /api/strava/sync` 호출
- Strava 최초 연동 시 OAuth 콜백(`/api/strava/callback`)에서의 첫 동기화

두 경로 모두 기존 `syncStravaActivities` 함수를 그대로 재사용하므로, 배지 평가·드랍 추첨·POI 매칭·미션 체크·아이템북 완성 체크 등 동기화 이후 파이프라인 로직은 변경 없음. 오직 "언제 동기화가 실행되는가"만 자동 → 수동으로 전환.

**제거된 것:**
- `vercel.json`의 `/api/cron/sync` 크론 등록 (`0 12 * * *`)
- `src/app/api/cron/sync/route.ts` (전체 유저 순차 동기화 엔드포인트, 더 이상 호출자 없어 삭제)

**관련 파일:** `vercel.json`, `src/app/api/cron/sync/route.ts`(삭제), `src/app/api/strava/sync/route.ts`(기존 유지), `src/app/(main)/SyncButton.tsx`(기존 유지)

## [운영 조정] 남은 Cron 4종을 6시간 간격으로 재분산

**배경**: sync 제거 후 남은 4개 크론(reconcile/wandering/poi-cleanup/ambient-drop-monitor)이 00~05시(UTC) 사이에 몰려 있었음. 각각은 이미 "하루 1회"라 Vercel Hobby 플랜의 배포 차단 조건(하루 1회 초과 시 배포 거부)에는 걸리지 않지만, 실행 시간대가 붙어 있어 서버 부하가 겹칠 여지가 있어 하루 24시간에 6시간 간격으로 고르게 분산.

**변경 후 스케줄** (`vercel.json` 기준):

| 크론 | 이전 | 변경 후 (UTC / KST) |
|---|---|---|
| `/api/cron/poi-cleanup` | `0 0 * * *` | `0 0 * * *` (00:00 UTC / 09:00 KST, 유지) |
| `/api/cron/wandering` | `0 3 * * *` | `0 6 * * *` (06:00 UTC / 15:00 KST) |
| `/api/cron/reconcile` | `0 4 * * *` | `0 12 * * *` (12:00 UTC / 21:00 KST) |
| `/api/cron/ambient-drop-monitor` | `0 5 * * *` | `0 18 * * *` (18:00 UTC / 03:00 KST 익일) |

각 라우트 파일(`route.ts`) 상단 주석의 스케줄 표기도 UTC 기준으로 맞춰 갱신.

**관련 파일:** `vercel.json`, `src/app/api/cron/reconcile/route.ts`, `src/app/api/cron/wandering/route.ts`, `src/app/api/cron/poi-cleanup/route.ts`, `src/app/api/cron/ambient-drop-monitor/route.ts`

---

기타 섹션은 이전 버전과 동일. 단, §1 핵심 루프의 "JAM! 자동 동기화(Strava API)" 표현과 §14/§15의 Cron 표에서 `/api/cron/sync` 항목은 위 변경으로 더 이상 유효하지 않음 — 차기 전체본 갱신 시 반영 필요.

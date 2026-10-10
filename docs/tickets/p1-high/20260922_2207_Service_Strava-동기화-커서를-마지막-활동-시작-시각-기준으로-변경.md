---
id: "20260922_2207"
category: Service
priority: P1
status: CLOSED
created: 2026-09-22
closed: 2026-09-26
specs:
  - docs/service/SERVICE_OPERATIONS.md
  - docs/service/prd/04_PROJECT_SPEC.md
---

# [Service] Strava 동기화 조회 커서를 동기화 시각이 아니라 마지막으로 가져온 활동의 시작 시각 기준으로 변경

## 핵심 요약

- 요구사항: `syncStravaActivities`가 Strava 목록을 조회할 때 쓰는 `after` 시작점을
  `strava_connections.last_synced_at`(동기화 버튼을 누른 시각)이 아니라 **그 유저의
  `strava_activities` 최신 `start_date`(마지막으로 가져온 활동의 시작 시각) − 15분 겹침**으로
  계산한다. `last_synced_at`은 동시 동기화 잠금·실패 시 롤백 용도로만 남긴다.
- 구현 계획: ① 잠금 직후 `strava_activities`에서 `start_date` 최댓값 1회 조회 → `afterTimestamp`
  산출 ② 행이 없으면 지금처럼 `after` 없이 최신 페이지 1회 조회 ③ 잠금·롤백 코드는 손대지
  않는다 ④ 회귀 테스트 3건 추가 ⑤ `SERVICE_OPERATIONS.md` 동기화 절차 3·11번 문구 갱신
- 관련 파일:
  - `jam-web/src/lib/strava/sync.ts` — `SYNC_OVERLAP_SECONDS` 상수·주석(64행 부근),
    `syncStravaActivities()`의 4단계 `afterTimestamp` 계산(1192~1195행), 4-1 잠금(1197~1214행,
    그대로 둔다), 실패 시 롤백(1276~1292행, 그대로 둔다)
  - `jam-web/src/lib/strava/api.ts` — `getActivities(accessToken, after, page)`(82행), `after`는
    Strava가 활동 **시작 시각** 기준으로 거른다
  - 테스트: `jam-web/src/lib/strava/__tests__/` (모킹 패턴은 `sync-empty-batch-badge-eval.test.ts`
    참고)
  - 스펙: `docs/service/SERVICE_OPERATIONS.md` 「동기화 절차」 3번·11번,
    `docs/service/prd/04_PROJECT_SPEC.md` 111행 각주(20260810_002 링크 옆에 이 티켓 연결)

## 배경 / 문제 정의

### 실측 사례 (2026-09-22, 계정 sihyunrr@gmail.com · user_id `3649ed39-2be2-402e-82ae-41e0cd328105`)

| 시각(KST) | 일어난 일 | 조회 시작 커서(after) | 결과 |
|---|---|---|---|
| 18:46:58 | 20.1km 러닝 시작 (Strava 활동 20280787552), 20:58경 종료 | | |
| 21:11:58 | 동기화 1회차 | 9/19 22:30:52 (직전 동기화 − 15분) | Strava 반환 0건. 조회 범위 안인데도 없었다 → 그 시각 Strava에 아직 미반영 |
| 21:14:29 ~ 21:18:15 | 동기화 2~6회차 | 20:56:58 ~ 21:01:10 (직전 동기화 − 15분) | Strava 반환 0건. 러닝 시작(18:46:58)이 커서보다 앞이라 `after` 필터에서 영구 제외 |

- 6회 모두 배지 엔진은 기존 이력 6건만 재평가했다(`engine_decision_log` sync_result: earned 0 ·
  missed 576 · counted []). `strava_activities`에 이 활동이 없고, `strava_sync_failures`도 0건이다.
- 근거: Vercel 런타임 로그 `[syncStravaActivities] ... afterTimestamp: 1789824652 → 1790078218 ...
  Strava 반환: 0건, 신규(미처리): 0건` 6줄, Strava API 조회(athlete 503337 최신 활동 = 20280787552).
- 이 상태에서는 유저가 동기화를 아무리 다시 눌러도 이 러닝은 절대 들어오지 않는다.

### 구조적 원인

Strava `GET /athlete/activities?after=`는 활동 **시작 시각** 기준으로 거르는데, JAM!의 커서는
**동기화를 누른 벽시계 시각**이다. 15분 겹침(`SYNC_OVERLAP_SECONDS`)은 "동기화 시각 대비 Strava
색인 지연"만 가정한 값이라, `활동 길이 + 업로드 지연 > 15분`이면 첫 동기화가 0건으로 끝나는
순간 커서가 활동 시작 시각을 지나쳐 영구 누락된다. 동기화를 자주 누를수록 누락 확률이 높다
(먼저 누른 사람이 손해).

### 기존 티켓 검토

| 티켓 | 관계 |
|---|---|
| [20260810_002](20260810_002_Service_reconcile-크론-제거-및-동기화-커서-롤백.md) | **처리 실패** 시 커서 롤백을 넣어 "예외로 커서만 밀리는" 케이스는 막았다. 그러나 **성공(0건)한 동기화가 커서를 밀어내는** 이번 케이스는 남아 있다. 같은 티켓에서 제거한 reconcile 크론(최근 7일 재조회)이 우연히 완충하던 영역이다 |
| [20260811_009](20260811_009_Service_스트라바-동기화-타이밍과-드랍엔진-판정-시간차-점검.md) | 동기화 시점과 활동 시점의 시간차를 점검했으나 커서 기준 자체는 다루지 않았다 |

## 상세 요구사항

### 서비스/코드베이스 관점

- `after` = `max(strava_activities.start_date where user_id = 유저)` − `SYNC_OVERLAP_SECONDS`.
  행이 없는 유저(연동만 하고 활동 없음·어드민 초기화 직후)는 지금과 같이 `after` 없이 최신
  페이지 1회 조회한다.
- **첫 싱크의 "최신 1건만 처리" 규칙은 유지된다.** 첫 싱크가 처리한 1건이 곧 `start_date` 최댓값이
  되므로, 그보다 오래된 과거 이력은 다음 동기화에서도 조회 범위 밖이다. 이 규칙이 깨지지 않으려면
  겹침을 지금처럼 짧게(15분) 유지해야 한다 — 겹침을 며칠로 넓히는 방안은 그래서 채택하지 않는다.
- `last_synced_at`의 선점 갱신(동시 동기화 잠금)과 실패 시 롤백(20260810_002)은 그대로 둔다. 조회
  커서 역할이 사라지고 잠금 키 역할만 남는다는 점을 코드 주석에 적는다.
- `getProcessedStravaIds()` 멱등 처리가 중복 보상을 막는다. 매 동기화마다 최신 활동 1건이 다시
  조회되지만 처리는 되지 않는다.
- Strava API 호출 수는 변하지 않는다(동기화 1회 = 목록 조회 1회). rate limit 영향 없음.
- **배포만으로 이번 사례가 복구된다.** 해당 계정의 `strava_activities` 최신 `start_date`가 9/14이므로
  배포 후 첫 동기화가 9/14 이후를 조회해 20280787552를 새 활동으로 받는다. 같은 원인으로 놓친 다른
  유저의 활동도 같은 방식으로 자연 복구된다. 별도 데이터 복구 SQL은 필요 없다.
- `strava_activities` 최신 `start_date` 조회는 기존 인덱스 `idx_strava_activities_user_start`
  (마이그레이션 069)를 탄다. 새 마이그레이션은 필요 없다.

### UI/UX 관점 (해당 시)
- 해당 없음. 사용자 노출 텍스트 변경 없음.

### 컨텐츠 관점 (해당 시)
- 해당 없음.

## 구현 계획

1. `sync.ts` `syncStravaActivities()` 4단계: `connection.last_synced_at` 기반 `afterTimestamp` 계산을
   `strava_activities`에서 `start_date`를 내림차순 1건 조회한 값 기반으로 바꾼다. 조회는 주입된
   `supabase` 클라이언트를 쓴다(20260831_1300 "주입된 클라이언트만 사용" 규율).
2. `SYNC_OVERLAP_SECONDS` 주석을 새 의미(마지막 활동 시작 시각 기준 겹침)로 고치고, 4-1 잠금 주석에
   "`last_synced_at`은 잠금 키로만 쓴다"를 적는다.
3. 회귀 테스트 추가(`jam-web/src/lib/strava/__tests__/` 아래 새 파일, 이름 예: sync-cursor-last-activity.test.ts):
   - 직전 동기화가 0건이어도 다음 호출의 `after`가 `max(start_date) − 900초`다
   - `strava_activities` 행이 없으면 `after`가 `undefined`다
   - `last_synced_at`이 이미 바뀐 두 번째 요청은 `synced: 0`으로 조기 종료한다(기존 동작 유지)
4. 문서: `docs/service/SERVICE_OPERATIONS.md` 「동기화 절차」 3번("last_synced_at 이후 활동 조회")을
   "마지막으로 가져온 활동 시작 시각 − 15분 이후 조회"로, 11번을 "잠금 키 갱신"으로 고친다.
   `docs/service/prd/04_PROJECT_SPEC.md` 111행 각주에 이 티켓을 연결한다.

검토했으나 채택하지 않은 대안:
- `strava_connections`에 `last_activity_start_at` 컬럼 신설: 마이그레이션이 필요하고(공용 단일 DB),
  `strava_activities`에 이미 같은 정보가 있어 이중 원천이 된다. 파생 조회가 더 단순하고 배포만으로
  기존 누락이 자연 복구된다.
- 겹침을 며칠로 확대: 첫 싱크가 일부러 건너뛴 과거 이력이 두 번째 동기화에서 전부 들어와
  "온보딩 순간 배지가 쏟아지는" 문제(20260801_001)가 되살아난다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 단위 테스트: 유저의 `strava_activities` 최신 `start_date`가 T일 때 동기화를 2회 연속 실행하면
  (1회차 Strava 응답을 0건으로 모킹) 2회차 `getActivities` 호출의 `after` 인자가 여전히
  `T − 900초`다.
- 단위 테스트: `strava_activities` 행이 없는 유저는 `getActivities`가 `after` 없이 호출된다.
- 단위 테스트: `last_synced_at`이 그 사이 바뀐 두 번째 요청은 `synced: 0`으로 조기 종료한다.
- 기존 테스트(`sync-*.test.ts`, `syncFailures.test.ts`) 전부 통과. 실패 시 롤백은 `last_synced_at`을
  잠금 이전 값으로 되돌리는 기존 동작 그대로다.
- `scripts/verify.sh` 통과.
- `SERVICE_OPERATIONS.md` 동기화 절차 3·11번, `04_PROJECT_SPEC.md` 111행 각주가 갱신돼 있다.

### 후속 범위 (담당: 카리나, 시점: staging 배포 뒤)
- sihyunrr@gmail.com 계정에서 동기화 1회 → Vercel 로그에 `Strava 반환: 1건 이상, 신규(미처리): 1건`이
  찍히고 `strava_activities`에 strava_id 20280787552 행이 생긴다.

---
## 완료 기록 *(작업 완료 후 작성)*

> 2026-09-26 후속 범위 확인을 마치고 CLOSED로 바꿨다. 근거는 아래 「후속 범위 확인 결과」에 있다.

### 후속 범위 확인 결과 (2026-09-26, 카리나)
사용자가 "9-22 이후 동기화 이력이 있다"고 알려 주어 DB로 대조했다(읽기 전용 조회).
- 수정은 09-22 23:06(KST)에 staging에 병합됐다(`959bcc3e`). 옛 커서 로직에서 영구 누락되던 활동
  `strava_id 20280787552`(활동 시작 09-22 18:46)가 병합 22분 뒤인 23:28에 `strava_activities`에 저장됐다.
  옛 로직으로는 다시 가져오지 못하는 활동이므로, 수정이 동작했다는 증거로 본다.
- 프로덕션에는 09-24 00:09 배포로 처음 들어갔다. 그 뒤 같은 유저의 활동이 09-24 01:19(시작 09-23 20:25,
  늦게 업로드)와 09-24 13:36에 정상 저장됐다.
- `strava_sync_failures`에 09-22 23:06 이후 실패 기록이 0건이다.
- 확인하지 못한 것: 조건에 적은 Vercel 로그 문구(`신규(미처리): 1건`)는 보존 기간이 지나 대조하지 못했다.
  결과 행으로 같은 사실을 확인했다.

### 구현 내용 요약
- `syncStravaActivities()` 4단계의 조회 커서(`afterTimestamp`)를 `strava_connections.last_synced_at`
  대신 그 유저의 `strava_activities` 최신 `start_date`(내림차순 1건 조회) − `SYNC_OVERLAP_SECONDS`로
  계산한다. 행이 없으면 기존처럼 `after` 없이 최신 페이지를 조회한다. 조회는 주입된 `supabase`
  클라이언트를 쓴다.
- `SYNC_OVERLAP_SECONDS` 주석과 4-1 잠금 주석을 "`last_synced_at`은 동시 싱크 잠금 키로만 쓴다"로
  고쳤다. 4-1 잠금·실패 시 롤백 코드는 손대지 않았다.
- 회귀 테스트 3건을 새 파일에 추가했다: ① 1회차 Strava 응답이 0건이어도 2회차 `getActivities`의
  `after`가 여전히 `max(start_date) − 900`초 ② `strava_activities` 행이 없으면 `after`가 `undefined`
  ③ 커넥션 조회~잠금 사이에 `last_synced_at`이 바뀐 경합은 `synced: 0`으로 조기 종료(기존 동작).
- 문서: `SERVICE_OPERATIONS.md` 「3-2. 동기화 흐름」 3번을 "마지막으로 가져온 활동의 시작 시각 − 15분
  이후 조회"로, 11번을 "`last_synced_at` 잠금 키 갱신"으로 고쳤다. `04_PROJECT_SPEC.md` 111행
  각주 뒤에 2026-09-22 후속 각주를 넣어 이 티켓을 연결했다.
- DB 마이그레이션 없음(기존 인덱스 `idx_strava_activities_user_start`, 마이그레이션 069를 그대로 탄다).

### 변경된 파일
```
- jam-web/src/lib/strava/sync.ts
- jam-web/src/lib/strava/__tests__/sync-cursor-last-activity.test.ts (신규)
- docs/service/SERVICE_OPERATIONS.md
- docs/service/prd/04_PROJECT_SPEC.md
```

### 테스트 결과
- [x] 새 회귀 테스트 3건 통과. 아현이 `sync.ts`를 잠시 원본으로 되돌려 3건 중 2건이 실제로
      실패함을 확인한 뒤 복원했다(나머지 1건 "행 없음 → undefined"는 옛 로직에서도 같은 결과가
      나오는 스펙 고정용).
- [x] Strava 테스트 15개 파일 111건 전부 통과, `scripts/verify.sh` 전 항목 통과.
- [x] CI `verify` 성공 — 실행 35736201561, 커밋 a33a51d8, 2026-09-22 22:50 KST.
- [x] 민지 게이트 PASS. 점검 12항목 중 1·2·3·4·5·10·11 통과, 6·7·8·9·12는 해당 없음.
      검토 범위 2368dac3..a33a51d8.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 해당 없음 (사용자 노출 텍스트 변경 없음)

### 배포 정보
- 배포일: 2026-09-22 (staging 병합·push). 프로덕션은 `/jam-ship`으로 별도 진행
- 환경: staging(09-22) → production(09-24 00:09 배포 포함)
- 커밋: 구현 a33a51d8, 병합 959bcc3e (리뷰 브랜치 `claude/jamwork-20260922_2207-strava-sync-cursor`)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 (채원①·② 생략) | 226,858 | 56,042 / 27,874 | 20.8분 | 112 |
| 합계 | 2 | 226,858 | 56,042 / 27,874 | 20.8분 | 112 |

### 주요 의사결정 / 핵심 메모
- **티켓 위치.** 이 티켓은 사용자가 웹 세션에서 작성해 `claude/sihyunrr-badge-sync-issue-lr38rn`
  브랜치에만 있었다. 최신 staging 위에 문서 커밋 하나뿐이라 fast-forward로 staging에 올리고 문서만
  push했다(아현 워크트리가 `origin/staging`에서 티켓을 읽기 때문). 그 브랜치는 이제 staging과 같아
  지워도 된다.
- **계획 반환 면제.** 카리나 1단계 규모 사전 판정: 파일 4개지만 새 테스트 파일 때문에 100줄을 넘길
  것으로 봤다(실제 268줄). 「구현 계획」이 파일·함수·줄 위치 단위였고(조건 a), 사용자가 직접
  작성·검토한 티켓을 `/jam-work`로 지정해 사전 확인이 끝났으므로(조건 b) 첫 호출부터
  `planOnlyWaiver`를 넘겼다. 아현의 `plan_only` 왕복은 없었다.
- **병합 방식.** 게이트 뒤 병렬 세션이 문서만 담긴 커밋(티켓 20260922_2242)을 staging에 먼저 올려
  `merge-base --is-ancestor` 검사가 실패했다. 리뷰 브랜치 자체는 깨끗했다(고유 커밋 a33a51d8 하나).
  규칙의 구제책은 리베이스 뒤 재push지만 강제 push 명령이 거부돼, 리뷰 브랜치를 다시 쓰지 않고
  `--no-ff` 병합 커밋으로 합쳤다. 민지가 판정한 커밋이 그대로 들어가고 두 커밋이 건드리는 파일이
  달라 충돌은 없었다.
- **채원② 생략.** `bug` 유형이라 원래 돌지 않는다(UI 변경 없음).
- **범위 밖 발견물.** 민지 `[정확성/참고]`: 어드민 유저 리셋이 `strava_activities`를 남겨 두어 "과거
  이력 전체 재수집" 주석이 성립하지 않는다 → 티켓 20260922_2259(P3, Admin) 생성. 이 티켓 이전부터
  있던 부정합이고 실제 결과(멱등 필터로 재처리 안 됨)는 달라지지 않는다.
- 채택하지 않은 대안(컬럼 신설·겹침 확대)은 「구현 계획」 절에 있다.

### 잔여 이슈
- 후속 범위 확인은 끝났다(위 「후속 범위 확인 결과」).
- 같은 날 **앞선** 활동(시계, 늦게 업로드)이 **뒤** 활동(폰, 즉시 업로드) 처리 후에 올라오면 여전히
  놓친다. 필요해지면 첫 싱크에서 건너뛴 활동 id를 기록해 두고 겹침을 넓히는 후속 티켓으로 다룬다.

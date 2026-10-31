---
id: "20261031_1525"
category: Feature
priority: P2
status: OPEN
created: 2026-10-31
parent: "20261028_1743"
specs:
  - "docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md"
---

# [Feature] 캡슐·소멸 운영 신호를 #jam-alert에 매일 한 번 요약한다

## 핵심 요약

- 요구사항: 오픈 뒤 운영자가 «잼 소멸, 한 번에 열린 캡슐, 보류 유저 비율»을 놓치지 않도록 `#jam-alert`에 하루 한 번 값을 요약해 올린다. 임계(주의·중단)는 정하지 않는다. 소멸이 한 명이라도 있으면 그 줄을 «참고»로 표시한다.
- 결정(사용자, 2026-10-31 «제안대로해»): 보는 자리는 `#jam-alert` 일일 요약, 임계 숫자는 오픈 4주 뒤에 관찰값으로 정한다(운영 로직 4.5절), 소멸은 한 명이라도 «참고»로 바로 알린다.
- 구현 계획: 새 크론 `GET /api/cron/capsule-signals`(매일 UTC 00:10 = KST 09:10)가 서비스 클라이언트로 아래 세 값을 읽어 `postOpsSlack('alert', 글)`로 한 건 올린다. 읽기 전용이고 DB를 쓰지 않는다. 슬랙을 못 올려도 던지지 않고 500과 로그만 남긴다.
- 관련 파일(지도):
  - 새 파일: `jam-web/src/app/api/cron/capsule-signals/route.ts`(`ops-stop-signals/route.ts`의 `CRON_SECRET` 검사와 응답 형식을 따른다), `jam-web/src/lib/capsule/dailySignals.ts`(읽기와 글 만들기), 시험 `jam-web/src/lib/capsule/__tests__/dailySignals.test.ts`와 `jam-web/src/app/api/cron/capsule-signals/__tests__/route.test.ts`.
  - 고칠 파일: `jam-web/vercel.json`의 `crons`에 한 줄 추가, `docs/agents/contract.json`(164~165행 근처에 크론 파일 목록이 있다. 검사가 요구하면 같이 맞춘다).
  - 재사용: `jam-web/src/lib/admin/opsInbox/slack.ts`의 `postOpsSlack`(385행)·`safeField`(34행), `jam-web/src/lib/notifications/kst.ts`의 `kstDateString`.

## 배경 / 문제 정의

오픈 전 점검(`20261028_1743`)에서 세 신호 모두 임계와 보는 자리가 없다는 것을 확인했다. `#jam-alert`가 지금 도는 것은 대량 잼 수령 경보(`massEarnAlert.ts`)뿐이고, 어드민 신호 목록(`lib/admin/opsSignals/catalog.ts` 13종)에도 캡슐·소멸 신호가 없다. 오픈 뒤 소멸이 쌓여도 알 수 없다.

## 상세 요구사항

### 서비스/코드베이스 관점

읽을 값(모두 «지난 24시간, KST 어제 하루» 또는 «지금 상태»로 정확히 적는다):

1. **소멸**: `jam_transactions`에서 `reason = 'capsule_forfeit'`인 어제(KST) 행의 유저 수와 잼 합(양수로). 이번 주(KST 월~일) 누적은 뷰 `jam_forfeit_weekly`(마이그레이션 302)에서 읽는다.
2. **한 번에 열린 캡슐**: `capsule_opens`(`user_id`, `opened_at`)에서 어제(KST) 열린 캡슐의 총수와 «한 유저가 하루에 연 캡슐 수의 최댓값»(동기화 한 번을 직접 재는 칸이 없어 하루 최댓값으로 대신한다. 글에 «하루 기준»이라고 적는다).
3. **보류 유저 비율**: `capsule_pending_rewards`에 행이 하나 이상인 유저 수 ÷ 전체 유저 수(지금 상태), 보류가 2개(= 잼을 받을 수 없는 상태)인 유저 수를 따로 적는다.

글 형식(한국어, 해요체, 엠대시 없음):

- 첫 줄: «캡슐 운영 신호 · 어제 요약» 한 줄. 세 값을 줄마다 적는다. 임계를 적지 않는다.
- 소멸 유저 수가 1 이상이면 그 줄 앞에 «참고»를 붙인다. 0이면 «없음».
- 유저가 0명이거나 값을 읽지 못한 항목은 «읽지 못했어요»로 적고 나머지는 올린다. 세 항목 모두 못 읽으면 글을 올리지 않고 500과 로그만 남긴다.
- 개인을 가리킬 수 있는 값(유저 ID, 이메일)은 글에 싣지 않는다. 개수와 합만 싣는다.

동작:

- `CRON_SECRET`이 비었거나 `Authorization`이 `Bearer <값>`과 다르면 401(`ops-stop-signals`와 같다).
- 슬랙 환경변수가 없으면(`not_configured`) 글을 올리지 못한 채 200과 `post: 'none'`을 돌려준다(로컬 개발).
- 응답 본문에는 개수만 싣는다.
- `maxDuration`은 60 이하.

### 문서

- 크론 목록이 적힌 `docs/service/prd/04_PROJECT_SPEC.md`(`api/cron/` 줄들)에 새 크론을 한 줄 더한다. 같은 사실을 여러 곳에 적지 않는다.
- `docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md` 4.5절에 «`#jam-alert` 일일 요약으로 본다(2026-10-31 결정). 임계는 오픈 4주 뒤 정한다»를 한 줄 더한다.

## 구현 계획

1. `dailySignals.ts`: `readCapsuleDailySignals(supabase, now)`(세 값을 각각 try/catch로 읽어 `{ forfeit, opens, pending }`을 돌려준다. 각 항목은 값 또는 `null`)와 `formatCapsuleDailySignals(signals, day)`(글 만들기)를 둔다. KST 어제 구간은 `kstDateString`으로 구한다.
2. `route.ts`: 인증 → 읽기 → 글 만들기 → `postOpsSlack('alert', 글)` → 응답.
3. `vercel.json`: `{ "path": "/api/cron/capsule-signals", "schedule": "10 0 * * *" }`.
4. 시험: 글 형식(소멸 0, 소멸 있음 «참고», 항목 읽기 실패, 유저 0명), 401, 슬랙 미설정, 슬랙 실패, 개인 값이 글에 없는지.

## 완료 조건

- 소멸·열린 캡슐·보류 유저 비율 세 값을 읽어 한 건의 글로 만드는 함수가 있고, 시험이 위 경우를 확인한다.
- 소멸 유저가 1명 이상이면 해당 줄이 «참고»로 시작하고, 0이면 «없음»이다. 임계 숫자는 글 어디에도 없다.
- `GET /api/cron/capsule-signals`가 `CRON_SECRET` 없이는 401을 돌려준다.
- `vercel.json`에 일일 크론이 등록되어 있고 `scripts/verify.sh`(계약 검사 포함)가 통과한다.
- 운영 로직 4.5절과 크론 목록 문서가 맞춰져 있다.

### 후속 범위 (담당: 카리나, 시점: 머지와 배포 뒤)

- 배포 뒤 크론을 수동으로 한 번 호출해(`CRON_SECRET` 필요, 사용자가 준비) `#jam-alert`에 글이 올라오는지 확인한다. 이 확인은 슬랙에 실제 글을 올리므로 사용자에게 알리고 한다.
- 오픈 4주 뒤 관찰값으로 주의·중단 임계를 정하는 티켓을 만든다.

---
## 완료 기록 *(작업 완료 후 작성)*

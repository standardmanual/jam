---
id: "20261001_0634"
category: BadgeEngine
priority: P1
status: CLOSED
created: 2026-10-01
closed: 2026-10-01
parent: "20260930_1456"
---

# [BadgeEngine] JAM! 행동 지표 ④ 기존 유저 재평가 배치

> 상위: 20260930_1456 · 하위 순서 ④ · 선행 ②·③(20261001_0632·0633)

## 핵심 요약

- 요구사항: Q1(기록이 있는 만큼 센다)에 따라, 새 JAM! 배지를 열 때 이미 조건을 채운 기존 유저에게 발급하는 재평가 경로를 만든다. 기본은 dry-run이고 받게 될 유저 수와 포인트 합계를 먼저 보여 준다.
- 구현 계획: 기존 재평가 배치(`jam-web/src/lib/badge-engine/reevaluateCatalog.ts:51,123`)는 JAM! 경로를 돌지 않는다. 이 배치를 JAM! 지표까지 넓히거나 JAM! 전용 경로를 둔다. 피드·알림 억제와 포인트 정상 지급은 메인 엔진 재평가 선례(`docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md:1166-1209`)를 따른다.
- 관련 파일: `jam-web/src/lib/badge-engine/reevaluateCatalog.ts`, `jam-web/src/lib/badge-engine/usageBadges.ts`, ①~③의 지표 계산 파일

## 시작 절차

상위 티켓 20260930_1456의 「주요 의사결정」(혜린 시작 검토, 사용자 결정 Q1~Q3, 가정 A1~A20, 포인트 추천표)이 이 티켓의 전제다. 혜린 검토는 1456에서 끝났으므로 다시 하지 않는다.
그 결정과 다르게 가야 하면 멈추고 사용자에게 확인한다. 마이그레이션은 사용자 승인 뒤 메인 세션이 실행한다.

## 완료 조건

- dry-run이 대상 유저 수와 포인트 합계를 보여 준다(테스트).
- 실제 실행은 조건을 채운 유저에게만 한 번씩 발급하고 다시 실행해도 중복 발급하지 않는다(테스트).

## 구현 계획 (파일 단위, 사용자 승인 2026-10-01 10:22 KST)

전용 경로를 새로 만들지 않고 기존 재평가 배치(`POST /api/admin/badges/reevaluate-all`)를 JAM! 지표까지 넓힌다.
엔진 문서 §2.17이 「배지를 시딩하면 반드시 이 배치를 돌린다」는 절차라, 절차를 하나로 유지해야 빠뜨리지 않는다.

1. `jam-web/src/lib/badge-engine/usageBadges.ts` — `issueQualifyingBadges`(118~247행)에 마지막 인자
   `options?: { dryRun?: boolean; silent?: boolean; triggeredByPrefix?: string }`를 더한다. 생략하면 지금과 똑같이 동작한다
   (기존 호출부 `evaluateUsageBadges`·`evaluateCheckinUsageBadges`·`evaluateJamActionBadges`는 바꾸지 않아도 된다).
   - `dryRun`: 섀도우밴 판정(205행 부근)까지는 그대로 하고, 통과한 배지를 `earned`에 담기만 한다. `user_activity_badges` insert·
     `awardPoints`·`recordFeedEvent`를 하나도 부르지 않는다. 메인 엔진도 섀도우밴 게이트(index.ts 2.9단계) 뒤에서 dryRun을 가르므로 같은 순서다.
   - `silent`: `recordFeedEvent`만 건너뛴다. insert와 `awardPoints`는 그대로 한다.
   - `triggeredByPrefix`: insert하는 `triggered_by`를 `${prefix}:${triggeredByOf(badge)}`로 만든다
     (예: `catalog_reevaluation:jam_action:combine_success_count`).
2. `jam-web/src/lib/badge-engine/jamActionBadges.ts` — `evaluateJamActionBadges`(146~248행)에 네 번째 인자 `options?`(위와 같은 형태)를
   더하고, 안에서 부르는 `issueQualifyingBadges` 세 곳(수치형·`days_since_signup`·`recipe_first_success`)에 그대로 넘긴다. 파일 머리 주석
   「지표를 더하는 법」 5번에 재평가 배치도 호출 지점이라는 줄을 더한다. 이 파일의 import 금지 규칙(`sync.ts`·`jamActionRoute.ts`)은 그대로다.
3. `jam-web/src/lib/badge-engine/reevaluateCatalog.ts` — `reevaluateUsersForCatalog`(93~166행)의 유저 루프에서 `evaluateBadgesDetailed` 다음에
   `evaluateJamActionBadges(userId, JAM_ACTION_CONDITION_KEYS, supabase, { dryRun, silent: true, triggeredByPrefix: CATALOG_REEVALUATION_TRIGGER })`를
   부른다. 순서는 동기화(`sync.ts`)와 같게 메인 엔진 → JAM!이다.
   - JAM! 호출은 **별도 `try/catch`**로 감싼다. 실패하면 메인 엔진 결과는 유지하고 `error`에 `JAM! 지표: <메시지>`를 남긴다.
   - JAM! 획득 배지는 `earnedBadgeIds`·`earnedCount`·`pointsAwarded`에 합치고(포인트는 기존 `pointRewardById`로 계산), 유저별
     `jamActionEarnedCount`·`jamActionPointsAwarded`와 합계 `jamActionAffectedUserCount`·`totalJamActionBadgesIssued`·
     `totalJamActionPointsAwarded`를 따로 둔다. 운영자가 새 JAM! 배지의 몫만 따로 볼 수 있게 하기 위해서다.
   - 알림은 만들지 않는다(JAM! 알림은 호출부 `jamActionRoute.ts`·`sync.ts`가 만들므로 이 배치는 부르지 않기만 하면 된다).
   - 파일 머리 주석의 「부수효과 정책」에 JAM! 지표 포함 사실을 더한다.
4. `jam-web/src/app/api/admin/badges/reevaluate-all/route.ts` — 대상 0명 조기 반환(53~62행)에 새 합계 필드 3개를 0으로 더한다. 라우트 머리 주석에 JAM! 포함을 한 줄 적는다.
5. 테스트 `jam-web/src/lib/badge-engine/__tests__/reevaluate-catalog-jam.test.ts`(신규) — 기존 `jam-action-badges.test.ts`의 supabase·
   `awardPoints`·`recordFeedEvent` 모킹 방식을 따른다.
   - dry-run: 대상 유저 수·JAM! 영향 유저 수·JAM! 포인트 합계를 돌려주고, insert·`awardPoints`·`recordFeedEvent`를 한 번도 부르지 않는다.
   - 실제 실행: 조건을 채운 유저에게만 발급하고 포인트는 지급하며 `recordFeedEvent`는 부르지 않는다. `triggered_by`에 `catalog_reevaluation:` 접두가 붙는다.
   - 다시 실행: 이미 보유한 배지는 다시 발급하지 않는다(발급 0건, 포인트 0).
   - JAM! 판정이 던져도 메인 엔진 결과는 남고 `error`에 `JAM! 지표:`가 남는다.
   - `issueQualifyingBadges`를 옵션 없이 부르면 지금처럼 insert·포인트·피드를 모두 한다(기존 동작 고정). 기존 테스트 파일에 더해도 된다.
6. `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md` — §2.17(1335행~)에 JAM! 지표 포함·응답 새 필드·`triggered_by` 접두·섀도우밴 dry-run 반영을 적고,
   알려진 한계 두 가지를 더한다: (가) 사용량 지표 6종(팔로워·팔로잉·동기화 횟수·연속 동기화·체크인 카테고리·체크인 목록)은 이 배치에 들어가지 않는다,
   (나) `evaluateJamActionBadges`는 지표 계산 오류를 지표 단위로 삼키므로 그 지표는 dry-run 숫자에서 조용히 빠질 수 있다(로그로만 보인다).
   312행의 「`0634`(재평가 배치)는 … 넘기면 된다」를 실제 호출 지점 설명으로 바꾸고, 호출 지점 표에 재평가 배치 행을 더한다.
   파일 목록(2061행 부근)의 `reevaluateCatalog.ts` 설명에 JAM! 포함을 적는다.

**하지 않는 것**: 아직 열리지 않은(`valid_from`이 미래인) 배지를 dry-run에 넣는 옵션, 사용량 지표 6종 재평가, 라이브 DB에서 배치 실제 실행,
DB 마이그레이션(없음 — `triggered_by`는 CHECK 없는 자유 텍스트다).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

- 기존 재평가 배치(`POST /api/admin/badges/reevaluate-all`)를 JAM! 행동 지표 13종까지 넓혔다. 전용 경로는 만들지 않았다(착수 가정 1).
- `issueQualifyingBadges`(`usageBadges.ts`)에 마지막 인자 `options?: { dryRun, silent, triggeredByPrefix }`(`IssueBadgeOptions`)를 더했다. 생략하면 기존과 같다.
  `dryRun`은 섀도우밴 판정 뒤에서 갈라 insert·`awardPoints`·`recordFeedEvent`를 부르지 않고, `silent`는 피드만 건너뛴다.
- `evaluateJamActionBadges`의 네 번째 인자 `options`를 세 발급 경로(수치형·`days_since_signup`·`recipe_first_success`)에 넘긴다.
- `reevaluateUsersForCatalog`는 유저마다 메인 엔진 다음에 `JAM_ACTION_CONDITION_KEYS` 전체를 `{ dryRun, silent: true, triggeredByPrefix: 'catalog_reevaluation' }`로
  별도 `try/catch` 안에서 판정한다. JAM! 몫은 기존 합계에 합치고 유저별 `jamActionEarnedCount`·`jamActionPointsAwarded`와 합계 3종을 따로 둔다. 알림은 만들지 않는다.
- 계획에 없던 보완(아현 신고, 민지 확인): dry-run에서 JAM! 키를 둘 이상 가진 배지가 두 번 집계되지 않도록 배지 id 기준으로 한 번만 센다. 실제 실행과 숫자를 맞추기 위해서다.
- 엔진 문서 §2.17에 JAM! 재평가 절과 알려진 한계 3가지(사용량 지표 6종 제외, 지표 계산 오류가 dry-run에서 조용히 빠짐, 미래 `valid_from` 배지 제외)를 아현이 적었다.
  호출 지점 표에 재평가 배치 행, 312행 문장, 파일 목록 설명도 고쳤다.
- 게이트: 민지 1차 PASS(CI 36801468389). 머지 `763377e4`(리뷰 브랜치 `claude/jamwork-20261001_0634-jam-reevaluate-batch`, 범위 `dfa3d4d1..c65339c8`).

### 변경된 파일
```
jam-web/src/lib/badge-engine/{usageBadges,jamActionBadges,reevaluateCatalog}.ts
jam-web/src/app/api/admin/badges/reevaluate-all/route.ts
jam-web/src/lib/badge-engine/__tests__/reevaluate-catalog-jam.test.ts (신규, 11건)
docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md
```

### 테스트 결과
- [x] CI verify 36801468389 성공(검토 커밋 `c65339c8`와 같은 SHA). `scripts/verify.sh` 전 항목 통과(아현).
- [x] 완료 조건 1: dry-run이 대상 유저 3명·JAM! 영향 유저 1명·JAM! 포인트 50·전체 포인트 60을 돌려주고 insert·`awardPoints`·`recordFeedEvent`를 부르지 않는다. 섀도우밴 차단도 반영된다.
- [x] 완료 조건 2: 실제 실행은 조건을 채운 유저에게만 1건 발급(`catalog_reevaluation:jam_action:combine_success_count`)하고 포인트를 지급하며 피드는 남기지 않는다.
  다시 실행하면 발급 0건·포인트 0이다.
- [x] 민지 재현: 새 테스트와 인접 테스트(`usage-badges`·`jam-action-badges`) 79건 통과. id 한 번만 세기를 빼거나 `silent`를 무시하도록 바꾸면 해당 테스트가 실패하는 것을 확인했다.
- [ ] 라이브 데이터 대조: 이 티켓 범위 밖(착수 가정 6). 0633이 넘긴 「실데이터에서 코드 계산을 돌린 대조」는 첫 JAM! 배지를 열 때 이 배치의 dry-run으로 한다(잔여 이슈).

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 해당 없음: 사용자 노출 문구가 없다(어드민 API 응답 필드와 서버 로그만 바뀌었다).

### 배포 정보
- 배포일: (프로덕션 미배포, staging 반영 2026-10-01)
- 환경: staging
- 커밋: 763377e4

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 2 | 207,789 | 37,935 / 18,132 | 13분 25초 | 76 |
| 합계 | 2 | 207,789 | 37,935 / 18,132 | 13분 25초 | 76 |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

**착수 가정 (사용자 승인, 2026-10-01 10:22 KST).**

1. 전용 경로를 만들지 않고 기존 재평가 배치를 넓힌다. dry-run 응답에 JAM! 몫(영향 유저 수·배지 수·포인트 합계)을 따로 보여 준다.
2. 부수효과는 메인 선례(§2.17)를 따른다. 피드·알림 없음, 포인트 정상 지급, dry-run은 아무것도 쓰지 않음, 섀도우밴 차단은 dry-run에도 반영.
3. 발급 기록 `triggered_by`에 `catalog_reevaluation:` 접두를 붙여 자연 발급과 구분한다(되돌릴 때 골라내는 근거).
4. 배지를 여는 순서는 「카탈로그에 넣기 → 바로 dry-run → 숫자 확인 → 실제 실행」이다. 그 사이 자연 발급은 정상 발급으로 본다(유저 8명).
   열기 전 dry-run(`valid_from`이 미래인 배지 포함 옵션)은 이번에 넣지 않는다.
5. 사용량 지표 6종은 Q1 범위 밖이라 이 배치에서 계속 빠진다. 별도 P3 티켓으로 남긴다.
6. 라이브 DB에서의 실제 실행은 이 티켓 범위가 아니다. 새 JAM! 배지를 열 때 운영 절차로 하고 그때 사용자 승인을 받는다.

**규모 사전 판정.** 바뀌는 파일 7개(코드 4·테스트 1·문서 1·티켓), 테스트 포함 약 300줄로 `plan_only` 기준(파일 5개 초과 또는 100줄 이상)을 넘는다.
기능 하나(재평가 배치 확장)라 쪼개면 옵션 추가와 그 사용이 갈라져 각 티켓이 혼자 검증되지 않는다. 그래서 쪼개지 않고 위 「구현 계획」을 파일 단위로 적은 뒤
사용자 승인을 받아 첫 호출부터 계획 반환 면제를 넣는다.

**라이브 조회 생략.** JAM! 지표 배지가 라이브에 이미 있는지 보려 했으나 프로젝트 ID 탐색이 자동 권한 판정에서 막혔다. 계획 수립에는 필요하지 않아 생략했다.

**결과 (2026-10-01).** 게이트 1차 PASS, 재작업 없음. 규모 사전 판정이 맞아 아현이 `plan_only` 없이 한 번에 구현했다(코드 약 190줄, 테스트 약 380줄).
범위 밖 발견물: 민지 [성능/주의] → P2 20261001_1036(재평가 소요 시간 실측과 500명 상한 조정). 착수 가정 5번 → P3 20261001_1022(사용량 배지 6종 재평가).

### 잔여 이슈
- 라이브 실행과 실데이터 대조: 첫 JAM! 배지를 열 때 「카탈로그에 넣기 → dry-run → 숫자 확인(사용자 승인) → 실제 실행」으로 한다. 0633이 넘긴 코드 계산의 실데이터 대조도 이 dry-run이 맡는다.
  처음에는 `userIds` 1~2명으로 소요 시간부터 잰다(20261001_1036).

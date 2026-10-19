---
type: prd
status: active
description: "홈피드(홈 「투데이」) 화면 구성·카드 노출 규칙·노출 태그·템플릿·카드 모양·레이아웃·이동 목적지·기사 상세·계측을 코드 기준으로 정의하는 정본이다."
tags: [피드, 배지, 미션, 컬렉션, 랭킹]
related:
  - "20260927_2033"
code:
  - "jam-web/src/app/(main)/page.tsx"
  - "jam-web/src/app/(main)/TodayCardStack.tsx"
  - "jam-web/src/app/(main)/TodayStatusStrip.tsx"
  - "jam-web/src/components/capsule"
  - "jam-web/src/lib/capsule/capsule-client.ts"
  - "jam-web/src/components/today"
  - "jam-web/src/app/(main)/OnboardingQuestCard.tsx"
  - "jam-web/src/lib/onboarding-quest/status.ts"
  - "jam-web/src/lib/onboarding-quest/screen-gate.ts"
  - "jam-web/src/app/(main)/today"
  - "jam-web/src/lib/today"
  - "jam-web/src/lib/admin/today-sections.ts"
  - "jam-web/src/app/api/today"
  - "jam-web/src/lib/inputs"
  - "jam-web/src/app/api/cron/external-inputs"
---

# 홈피드 기능 정의

> **이 문서는 홈피드의 서비스 동작(유저에게 무엇이 어떻게 보이는가)의 정본이다.** 운영 규칙(편성·승인·등록·
> 유형 카탈로그·전략 변경)은 [content-automation/PRD.md](../content-automation/PRD.md)가 정본이고 여기서는 §11에서
> 위치만 가리킨다. 표 가운데 `<!-- BEGIN generated -->` 구간은 코드에서 생성되므로 손으로 고치지 않는다(§12).
> 서술은 모두 코드에서 확인한 사실이며, 각 절 끝에 근거 파일을 적는다.
>
> **변경 예정(2026-09-30, 07 라이브 운영 블루프린트 승인).** 카드 표현 형식을 리뉴얼한다(07 5.3). 상세는 티켓 20260930_1453이 정하고, 구현될
> 때까지 이 문서는 지금 코드의 사실만 적는다. 편성·승인·등록 규칙은 티켓 20260930_1504가 운영툴로 전환한 뒤
> [ops-tool/PRD.md](../ops-tool/PRD.md)가 정본이 되고, 그 전까지는 아래 §11의 문서가 정본이다.

## 1. 한 줄 정의

로그인한 유저의 홈(`/`) 상단에 「오늘의 현황」 두 칸과, 어드민이 등록한 투데이 카드(`today_cards`) 중 **지금 노출 기간 안이고 유저의 현재 상태 태그와 맞는 카드**를 정렬해 보여 주는 화면이다. 카드는 템플릿(무엇을 소개하나)과 모양(어떻게 그리나, `shape`가 없는 옛 카드는 레이아웃이 모양을 정한다) 두 축으로 정해지며, 누르면 템플릿·대상 필드로 정해진 화면으로 이동한다.

## 2. 홈 화면 구성

위에서부터 다음 순서다. 이 밖의 영역(최근 획득 배지·바로가기 묶음 등)은 홈에 없다.

| 순서 | 영역 | 내용 |
|---|---|---|
| 1 | 상단 바 | 공통 `TopNav`(로고) |
| 2 | 이용 정지 배너 | 이용 정지 중인 유저에게만(전체 폭). 정지가 아니거나 조회가 실패하면 DOM에 없다. 아래 설명 |
| 3 | 인사말 + 검색 | 「{이름}」 인사 한 줄과 검색 아이콘(→ `/search`) |
| 4 | 온보딩 퀘스트 카드 | `user_onboarding_quests` 행이 있고 `completed_at`이 비어 있는 유저에게만. 아래 표 |
| 5 | Strava 동기화 끊김 카드 | 토큰 갱신 실패·Strava 철회로 끊긴 유저에게만(전체 폭). 정상 연결·미연동·유저가 직접 끊은 경우·조회 실패에는 DOM에 없다. 아래 표 |
| 6 | 오늘의 현황 스트립 | 2칸. 왼쪽 「내 진행도」, 오른쪽 「친구 활동」(아래 표) |
| 7 | 캡슐 | 가로 알약 한 개. 누르면 시트가 떠서 그 안에서 채우기·열기를 한다. 아래 설명 |
| 8 | 투데이 카드 스택 | 제목 「투데이」·부제 「오늘의 소식」. 노출할 카드가 0장이면 영역 전체를 그리지 않는다 |

**이용 정지 배너**(티켓 20261017_1426)는 `user_suspensions`에 진행 중인 정지(`lifted_at` 없음)가 있는 유저의 홈 맨 위(상단 바 바로 아래, 인사말 줄 위)에 그린다.
흰 카드에 칩 「이용 정지」, 제목 「이용이 정지된 계정이에요」, 정지 사유(운영자가 쓴 전문), 정지일, 정지 중 일어나는 일과 해제 방법 안내, 검정 알약 「문의하기」(→ `/voc`) 순이다.
면 색·아이콘·애니메이션을 쓰지 않고, 정지 해제는 다음 홈 진입 때 반영된다. 정지 중에도 로그인, 프로필·배지·인벤토리·컬렉션 보기, 문의는 막지 않는다.
정지 조회가 실패하면 홈은 그대로 열고 배너만 뺀다. 동기화와 보류 받기가 막혔을 때는 일반 실패가 아니라 «정지 중이라 안 된다»는 안내 토스트가 뜬다.

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/SuspensionBanner.tsx`, `jam-web/src/lib/suspension/home-banner.ts`, `jam-web/src/lib/strava/sync-flow.ts`(`suspended`), 문구 `jam-web/src/lib/i18n/ko.ts`(`suspension`)

**온보딩 퀘스트 카드**(티켓 20260927_2133, 상위 20260927_2123)는 신규 유저가 온보딩 2단계를
마친 뒤 서비스 기능을 순서대로 직접 해 보는 7단계 「퀘스트」의 진행도를 보여 준다. 조건이
안 맞으면(스위치 꺼짐·행 없음·조회 실패·`completed_at` 있음) 자리 자체가 없다.

카드 첫 줄은 왼쪽 칩(「첫 퀘스트」)·오른쪽 진행도(n/7)이고(첫 활동 대기 카드는 진행 바가 없어
n/7도 없다), 보상 안내 문구는 어느 상태에도 없다(2026-09-28 사용자 요청, 티켓 20260928_1537).
CTA는 카드 왼쪽 하단 버튼이다(`variant="primary" surface="sub" size="xs"`로 네 상태 통일,
2026-09-28 사용자 요청).

「지금 눌러야 할 곳」 펄스(티켓 20260928_1752, 상위 20260927_2123 Q1): 진행 중인 두 행(sync
차례·그 외 차례)의 CTA pill 둘레에만 `--color-primary` 기반 box-shadow가 0 → 10px로 번지며
사라지는 반복 애니메이션(1.6초, `cubic-bezier(.2,0,0,1)`, `prefers-reduced-motion: reduce`에서는
정지)을 준다. 단일 원천은 `jam-web/src/components/transitions.css`의 `.jam-quest-pulse`.
Strava 미동기화·첫 활동 대기 카드와 `TopNav` 동기화 버튼·하단 탭 아이콘에는 붙이지 않는다.

| 상태 | 조건 | 표시·이동 |
|---|---|---|
| 진행 중 · sync 차례 | `skipped_at` 없음, 다음 단계가 `sync` | 진행도(n/7)·단계 타이틀/설명·[동기화] 버튼(상단 바 연출 동기화 버튼과 동일 동작 — 스피너 → 연출 배지 1장 → `sync` 단계 기록), CTA에 펄스 강조(퀘스트 진행 중에만). 상단 바(`TopNav`) 중앙 슬롯은 Strava 연동 여부와 무관하게 연출 동기화 버튼으로 고정되고(연동 유도 버튼은 가림), 두 버튼은 같은 컴포넌트(`OnboardingSyncButton`)이고 모양도 같다(accent 알약, 놓인 자리로 갈리지 않는다) |
| 진행 중 · 그 외 차례 | `skipped_at` 없음, 다음 단계가 `bag`\|`pickup`\|`drop`\|`mix_fail`\|`mix_success`\|`browse` | 진행도(n/7)·다음 단계 타이틀/설명·[시작하기/다음 단계] 버튼 → 그 단계가 속한 실제 화면(`/inventory`·`/drops`·`/combine`·`/missions`, `STEP_SCREEN_MAP` 기준), CTA에 펄스 강조(퀘스트 진행 중에만). 카드 전체는 더 이상 링크가 아니다 — 버튼만 인터랙티브하다(중첩 인터랙티브 요소 회피) |
| Strava 미동기화 | 7단계 완료 또는 건너뜀, Strava 미연동 | 7/7·마지막 단계 안내·[Strava 동기화하기] 버튼 → `/api/strava/auth`. 카드 전체는 더 이상 링크가 아니다 |
| 첫 활동 대기 | 7단계 완료 또는 건너뜀, Strava 연동됐지만 활동 0건 | 칩만(진행 바·n/7 없음)·안내 문구(건너뛴 유저에게는 완료 배지를 언급하지 않는 문구)·[동기화] 버튼(실제 `SyncButton` — `POST /api/strava/sync` + 배지 연출/완료 토스트, TopNav 실 동기화 버튼과 동일 동작) |

**건너뛰기**(티켓 20260927_2131, 상위 20260927_2123 T8): "진행 중" 두 행(sync 포함) 모두
카드 아래에 좌측 정렬 텍스트 진입점 「건너뛰기」가 있다. 누르면 시트(`detent="compact"`)로
[계속하기]/[건너뛰기]를 확인받는다. [건너뛰기] → `POST /api/onboarding-quest/skip`이
`skipped_at`을 기록하고(이미 7단계를 마쳤으면 서버가 거부) 완료 판정을 다시 확인한다 → 카드가
"Strava 미동기화"/"첫 활동 대기" 행으로 전환된다. "Strava 미동기화"·"첫 활동 대기" 행에는
진입점이 없다.

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/OnboardingQuestCard.tsx`, `jam-web/src/app/(main)/OnboardingQuestSkipSheet.tsx`, `jam-web/src/app/(main)/OnboardingSyncButton.tsx`, `jam-web/src/components/SyncButton.tsx`, `jam-web/src/components/ui/TopNav.tsx`(`centerSlotOverride`), `jam-web/src/lib/onboarding-quest/status.ts`, `jam-web/src/lib/onboarding-quest/config.ts`, `jam-web/src/lib/onboarding-quest/screen-gate.ts`(`STEP_SCREEN_MAP`), `jam-web/src/lib/onboarding-quest/progress.ts`(`validateSkip`), `jam-web/src/app/api/onboarding-quest/skip/route.ts`, 펄스 `jam-web/src/components/transitions.css`(`.jam-quest-pulse`), `jam-web/design-system/tokens/motion.css`(`--duration-quest-pulse`·`--ease-quest-pulse`), 문구 `jam-web/src/lib/i18n/ko.ts`(`onboardingQuest`)

**Strava 동기화 끊김 카드**(티켓 20261017_1422)는 `strava_connections`의 연결 상태 판정(`resolveStravaUiState`) 결과로 그린다.
흰 카드에 칩 「Strava 동기화」, 제목(「Strava 동기화가 끊겼어요」), 원인과 해결을 알리는 본문, 검정 알약 버튼
「Strava 다시 동기화하기」(→ `/api/strava/auth`) 순이다. 심각도는 면 색이 아니라 문구가 전달한다.

| 연결 상태 | 끊김 카드 | 진행도 칸의 「Strava 동기화하면 시작해요」 | 상단 메뉴 가운데 버튼 |
|---|---|---|---|
| 연결 중 | 없음 | 없음(진행도·안내를 그린다) | 동기화 버튼(`SyncButton`) |
| 오류로 끊김(`token_refresh_failed`·`token_revoked`) | 그린다 | 없음 — 카드가 이미 안내한다. 남은 기록으로 계산한 진행도는 그대로 | 「다시 동기화」 |
| 유저가 직접 끊음(`user_disconnected`) | 없음 — 알람을 반복하지 않는다 | 그린다(미연동과 같다) | 「동기화」 |
| 연결 없음 | 없음 | 그린다 | 「동기화」 |
| 조회 실패 | 없음 — 어느 쪽도 단정하지 않고 로그만 남긴다 | 없음 | 「동기화」 |

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/components/strava/StravaDisconnectedCard.tsx`, `jam-web/src/lib/strava/connection-state.ts`(`resolveStravaUiState`·`showsStravaDisconnectedCard`·`showsStravaSyncCta`), `jam-web/src/components/ui/TopNav.tsx`, `jam-web/src/lib/topNavData.tsx`, 문구 `jam-web/src/lib/i18n/ko.ts`(`stravaConnection`)

**오늘의 현황 스트립**은 큐레이션을 하지 않는다(카드 CMS와 역할이 겹치지 않게). 

| 칸 | 상태 | 표시·이동 |
|---|---|---|
| 내 진행도 | Strava 미연동 또는 유저가 직접 끊음 | 「Strava 동기화하면 시작해요」 → `/api/strava/auth`. 오류로 끊긴 경우는 이 문구 대신 위 끊김 카드가 안내하고, 진행도는 남은 기록으로 그린다 |
| | 진행 중 컬렉션·미션 있음 | 완성도가 가장 높은 1건(동률이면 최근 활동순)의 이름·진행 수 → 그 상세 |
| | 둘 다 없음 | 코드에 고정된 안내 후보 중 요청마다 무작위 1개(드랍·미션) |
| 친구 활동 | 팔로잉 없음 | 검색 유도 → `/search` |
| | 팔로잉은 있으나 오늘 배지 획득 없음 | 칸을 그리지 않는다 |
| | 오늘 배지를 얻은 팔로잉 있음 | 인원 수. 정확히 1명이고 username을 알면 그 프로필, 그 외 `/feed` |

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/TodayStatusStrip.tsx`, `jam-web/src/lib/today/status.ts`, `jam-web/src/app/(main)/TodayCardStack.tsx`, 문구 `jam-web/src/lib/i18n/ko.ts`(`today.cardStackTitle`·`cardStackSubtitle`)

**캡슐 위젯**(티켓 20261018_0054 1회, 운영 로직 5.2절)은 오늘의 현황 스트립 아래에 둔다. 내 프로필에도 같은 위젯이 헤더와 통계 탭 사이에 한 번 놓이고,
**타인이 보는 프로필에는 서버가 값을 내려주지 않아** DOM과 RSC 페이로드에 캡슐이 없다(클라이언트에서 숨기지 않는다).
알약 모양은 임시 디자인이라 `CapsulePill.tsx` 한 파일만 모양을 안다.

| 상태 | 알약(1행 오른쪽 문구) | 시트 |
|---|---|---|
| 채우는 중 | 「채우기 ›」 | 외곽선 게이지, 「가진 잼 {n}」, 주 버튼 「채우기」. 가진 잼이 0이면 버튼이 비활성이고 이유 문구가 아래에 있다 |
| 열 수 있음 | 「열 수 있어요 ›」(점·펄스·색 강조 없음) | 「열기」 버튼. 누르면 시트가 닫히고 닫힘이 끝난 뒤 획득 연출 오버레이가 열린다 |
| 인벤토리 빈칸 모자람 | 「빈칸이 모자라요 ›」 | 열기 버튼 대신 안내(지금 빈칸 수·열려면 필요한 빈칸 수·채운 잼은 그대로)와 「인벤토리 보기」 링크 |
| 로딩 | 같은 높이의 Skeleton 알약 | — |
| 조회 실패 | 같은 알약 안에서 「캡슐을 불러오지 못했어요 · 다시 시도」(누르면 다시 조회) | — |

- 게이지는 외곽선 있는 `ProgressBar`(`outlined`, `track-gradient`)이고 숫자·퍼센트가 어디에도 없다(운영 로직 4.3절). 가진 잼 숫자는 시트와 채우기 입력 단계에만 보이고 위젯에는 없다.
- 채우기 단계는 시트 안에서 본문과 갈아 끼운다(제목 「잼 채우기」, 「취소」). 숫자 입력창의 기본값은 `min(남은 양, 가진 잼)`이고 줄일 수 있으며, 그 상한을 넘기면 상한으로 맞춘다. 입력이 비었거나 0이면 버튼이 막힌다.
- 열기 결과 오버레이는 카드 위에 한 줄 「캡슐을 열었어요. 아이템 배지 {n}개를 얻었어요.」가 나오고, 잠긴 채 나온 개체는 잠금 타일 카드로 보인다. 높은 등급 축하 연출은 없다. 오버레이를 닫으면 게이지가 다음 캡슐의 값으로 옮겨 간다.
- 이용 정지 중 채우기·열기가 403(`user_suspended`)을 받으면 일반 실패가 아니라 안내(info) 토스트다. 버튼을 미리 막지 않고 서버 응답으로 판단한다.
- 서버 조회가 실패하면 투데이는 위젯을 그대로 그리고(초기값 없음), 위젯이 클라이언트에서 `GET /api/capsule`로 다시 가져온다.

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/[username]/page.tsx`, `jam-web/src/app/(main)/profile/ProfileClient.tsx`(`capsuleInitial`), `jam-web/src/components/capsule/`(`CapsulePill`·`CapsuleWidget`·`CapsuleSheet`), `jam-web/src/components/jam/JamFillPanel.tsx`, `jam-web/src/lib/capsule/capsule-client.ts`·`capsule-flow.ts`·`capsule-view.ts`, `jam-web/src/components/BadgeRevealOverlay.tsx`(`resultMessage`·`locked`), 문구 `jam-web/src/lib/i18n/ko.ts`(`capsule`·`suspension`)

## 3. 카드 노출 규칙

요청마다 서버가 다음 순서로 카드를 고른다(`getTodayCards`).

1. 유저의 현재 태그를 계산한다(§4).
2. `today_cards`에서 `is_active = true`이고 `starts_at ≤ 지금 ≤ ends_at`이며 `exposure_tags`가 유저 태그와 **하나라도 겹치는**(OR) 카드를 읽는다. `all`은 모든 유저가 가지므로 `all`이 붙은 카드는 기간 안이면 모두에게 보인다.
3. 정렬은 `sort_order` 오름차순, 같으면 `starts_at` 내림차순이다.
4. `mission_spotlight` 카드 중 가리키는 미션이 이 유저에게 공개 상태가 아닌 것(어드민 수동 비노출, 이미 완료, 잠김·숨김)을 뺀다. 판정은 미션 목록·상세·참가 API와 같은 `isMissionExposed`·`resolveMissionVisibility`이며 `open`인 미션만 남는다. `mission_id`가 없는 미션 카드는 그대로 둔다. 같은 단계에서, 참가할 수 있는 트라이브가 정해진 미션을 가리키는 `ranking_board` 카드는 보는 유저가 대상 트라이브가 아니면 뺀다(`filterRankingBoardCardsByTribe`, 미션 목록에서 숨기는 규칙과 같다. 카드를 눌러 미션으로 가면 404가 나는 상황을 없앤다). 트라이브 접근을 읽지 못하면 미션 참가자 대상 랭킹 보드 카드를 내린다. 수동 지정 유저 대상과 허용 트라이브가 없는 공통 미션 카드는 그대로 둔다(티켓 20261019_1400).
5. 카드의 `badge_ids`를 배지 정보로 바꾸고, 유저가 그 배지를 **이미 가졌는지**(활동·미션·컬렉션 보상, 체크인, 인벤토리 세 곳)를 함께 붙인다. 삭제된 배지는 빠진다. 보유 조회가 실패해도 카드는 노출되고 그 배지가 미보유로 그려진다.
6. `ranking_board` 카드는 랭킹모드 순위를 미리 계산해 붙인다. 미션 참가자 대상 순위에서는 이용 정지 중인 유저를 뺀다(보는 유저 본인은 정지 중이어도 자기 화면에는 남고, 정지가 풀리면 다시 포함된다. 읽지 못하면 그 보드는 빈 순위다). 조건에 «기간 동안 모은 잼»이 든 미션은 모은 양이 홈 방문자 전원에게 드러나지 않도록 순위를 빈 결과로 돌려주고, 화면은 「아직 랭킹이 없어요」를 그린다(티켓 20261019_1400, 20261019_1445). 랭킹모드 행(`ranking_modes`)은 위 4번의 트라이브 거름과 이 순위 계산이 한 번만 읽어 나눠 쓴다. 읽지 못하면 카드는 그대로 두고 순위는 붙이지 않는다(티켓 20261019_1445 4회).
7. 카드마다 이동 경로를 계산한다(§7).

- 노출 수 상한은 없다. 조건에 맞는 카드는 모두 쌓인다.
- 조회가 실패하면 카드 0장(영역 숨김)으로 처리한다.

근거: `jam-web/src/lib/today/cards.ts`(`getTodayCards`·`filterMissionSpotlightCards`·`filterRankingBoardCardsByTribe`·`fetchBadgesById`·`fetchRankingBoardData`), `jam-web/src/lib/ranking/rankingDataSource.ts`(`computeMissionParticipantsResult`)

## 4. 노출 태그

요청 시점에 유저마다 계산한다(`computeUserExposureTags`). `all`과 시간대 태그 1개는 **항상** 붙고, 나머지는 조건을 만족할 때만 붙는다.

| 태그 | 판정 |
|---|---|
| `time_*` | KST 시각 기준. 05~08 `dawn`, 08~11 `morning`, 11~17 `afternoon`, 17~22 `evening`, 22~05 `night`(자정을 넘는 구간) |
| `has_participating_mission` | 참가했지만 완료하지 않은 미션이 1개 이상 |
| `has_ending_soon_mission` | 그중 `ends_at`이 지금부터 3일 안인 미션이 있음 |
| `has_incomplete_itembook` | 슬롯을 채우기 시작했지만 완성하지 않은 컬렉션이 있음(분모는 소프트 삭제·드랍 제외 배지를 뺀 아이템·체크인 배지이고, 분자는 컬렉션별로 센다. 판정은 `lib/itembook/completion-basis.ts` 하나다) |
| `itembook_remaining_le3` | 그 미완성 컬렉션들의 남은 슬롯 최솟값이 3 이하(`ITEMBOOK_REMAINING_MAX`) |
| `strava_stale_14d` | Strava 연결이 있고 마지막 동기화에서 14일 이상 지남(`STRAVA_STALE_DAYS`). 한 번도 동기화하지 않았으면 해당, 연결이 없거나 유저가 직접 끊은 경우(`user_disconnected`)에는 붙지 않는다. 오류로 끊긴 연결은 그대로 센다(다시 동기화하라는 카드가 도움이 된다) |
| `new_user` | 가입 7일 이내 |
| `weather_*` | 그날 저장된 날씨 값(아래) |
| `holiday_today`·`seasonal_today`·`anniversary_today` | 그날 저장된 특일 목록을 **이름**으로 판정(대상 목록 정본 `docs/service/content/SPECIAL_DAYS.md`). 한 날에 여러 개가 켜질 수 있다 |

**날씨·특일 입력**: 요청 때 외부 API를 부르지 않는다. Vercel 크론 `/api/cron/external-inputs`가 매일 06:00 KST(`jam-web/vercel.json`의 `0 21 * * *` UTC)에 기상청 단기예보(서울 격자 60·127)와 특일정보를 받아 `external_input_daily`에 저장하고, 홈은 그 저장값만 읽는다. 날씨 구분은 오늘 예보에 강수가 있으면 `rain`, 없고 최고 33°C 이상 또는 최저 -12°C 이하면 `extreme`, 하늘 맑음이면 `clear`, 그 밖은 `mild`다. **저장값이 없거나 읽기에 실패하면 해당 태그만 조용히 빠진다**(홈이 깨지지는 않는다). 그래서 날씨·특일 태그만 단 카드는 저장이 실패한 날 아무에게도 보이지 않는다 — 요일마다 `all` 카드를 두는 운영 규칙의 이유다(content-automation PRD §8).

근거: `jam-web/src/lib/today/exposure.ts`, `jam-web/src/lib/inputs/weather.ts`·`holidays.ts`·`special-days-config.ts`·`daily-store.ts`, `jam-web/src/app/api/cron/external-inputs/route.ts`

노출 태그 값·라벨(`TODAY_EXPOSURE_TAG_OPTIONS`):

<!-- BEGIN generated: exposure-tags -->
| 값 | 라벨 |
|---|---|
| `all` | all (항상 노출) |
| `time_dawn` | time_dawn (05~08) |
| `time_morning` | time_morning (08~11) |
| `time_afternoon` | time_afternoon (11~17) |
| `time_evening` | time_evening (17~22) |
| `time_night` | time_night (22~05) |
| `has_participating_mission` | has_participating_mission |
| `has_ending_soon_mission` | has_ending_soon_mission |
| `has_incomplete_itembook` | has_incomplete_itembook |
| `itembook_remaining_le3` | itembook_remaining_le3 (컬렉션 잔여 3개 이하) |
| `strava_stale_14d` | strava_stale_14d (Strava 동기화 경과 14일 이상) |
| `new_user` | new_user (가입 7일 이내) |
| `weather_clear` | weather_clear (오늘 날씨: 맑음) |
| `weather_mild` | weather_mild (오늘 날씨: 구름많음·흐림) |
| `weather_rain` | weather_rain (오늘 날씨: 비/눈) |
| `weather_extreme` | weather_extreme (오늘 날씨: 폭염·한파) |
| `holiday_today` | holiday_today (오늘 쉬는 공휴일) |
| `seasonal_today` | seasonal_today (오늘 절기·잡절: 입춘·동지·말복 등) |
| `anniversary_today` | anniversary_today (오늘 기념일: 식목일·어버이날 등) |
<!-- END generated: exposure-tags -->

## 5. 템플릿

템플릿은 카드가 **무엇을** 소개하는지(대상 필드와 이동 경로)를 정한다. 어드민 폼은 템플릿을 고르면 아래 「추천 레이아웃」을 미리 선택하지만 바꿀 수 있다. 템플릿이 쓰지 않는 참조 필드는 폼이 저장할 때 비운다. 카드의 유형 ID(`content_type_id`, T01~T17)는 템플릿과 무관하게 붙는 운영 분류이며 화면 동작에는 쓰이지 않는다(계측 집계용, §9).

근거: `jam-web/src/lib/admin/today-sections.ts`

템플릿 값·라벨·추천 레이아웃·참조 필드(`TODAY_TEMPLATE_OPTIONS`·`SUGGESTED_LAYOUT_FOR`·`TODAY_FIELDS_FOR`):

<!-- BEGIN generated: templates -->
| 값 | 라벨 | 추천 레이아웃 | 입력 필드 |
|---|---|---|---|
| `badge_spotlight` | 배지 소개 (badge_spotlight) | 큰 썸네일형 — 커버 이미지 크게 | 설명문·배지·이동경로(target_href) |
| `progress_nudge` | 진행 알림 (progress_nudge) | 바로가기형 — 이미지 없는 짧은 CTA | 설명문·배지·미션·이동경로(target_href) |
| `mission_spotlight` | 미션 소개 (mission_spotlight) | 큰 썸네일형 — 커버 이미지 크게 | 설명문·미션·이동경로(target_href) |
| `itembook_milestone` | 컬렉션 소식 (itembook_milestone) | 배너형 — 가로 띠 배너 | 설명문·컬렉션·이동경로(target_href) |
| `location_trend` | 지역 트렌드 (location_trend) | 배지목록형 — 배지 갤러리/리스트 | 설명문·배지·지역·이동경로(target_href) |
| `drop_alert` | 드랍 유도 (drop_alert) | 바로가기형 — 이미지 없는 짧은 CTA | 설명문 |
| `editorial_article` | 에디토리얼 기사 (editorial_article) | 큰 썸네일형 — 커버 이미지 크게 | 본문·미션·컬렉션·이동경로(target_href) |
| `ranking_board` | 랭킹보드 (ranking_board) | 순위 리스트형 — 랭킹보드 목록(포디엄 없음) | 설명문·랭킹모드·이동경로(target_href) |
| `recipe_reveal` | 레시피 공개 (recipe_reveal) | 배지목록형 — 배지 갤러리/리스트 | 설명문·레시피·이동경로(target_href) |
<!-- END generated: templates -->

컨텐츠 유형 카탈로그(`TODAY_CONTENT_TYPE_OPTIONS`, PRD `content-automation/PRD.md` §6과 같은 값):

<!-- BEGIN generated: content-types -->
| 값 | 라벨 |
|---|---|
| `T01` | T01 · 트라이브×날씨/시간/장소/사회이슈 컬렉션 소개 |
| `T02` | T02 · 컬렉션 완성 독려(잔여 N개 이하) |
| `T03` | T03 · 액티비티 동기화 오래됨 독려 |
| `T04` | T04 · 시즌 이슈×트라이브 연결 |
| `T05` | T05 · 사회 이슈×체크인 장소·지역 소개 |
| `T06` | T06 · 트라이브 교차 믹스 추천 |
| `T07` | T07 · 진행 넛지(다음 배지까지 한 걸음) |
| `T08` | T08 · 날씨 기반 즉시 활동 추천 |
| `T09` | T09 · 시간대별 활동 추천 |
| `T10` | T10 · 픽업 후 미믹스 유도 |
| `T11` | T11 · 트라이브 미선택 유저 적성 매칭 |
| `T12` | T12 · 주간 활동 리캡 |
| `T13` | T13 · 신규 지역 진입 장소·체크인 소개 |
| `T14` | T14 · 연속 기록(스트릭) 독려 |
| `T15` | T15 · 함께하기(그룹 활동) 제안 |
| `T16` | T16 · 여행·지역 이동 감지 |
| `T17` | T17 · 계절 전환 예고 |
<!-- END generated: content-types -->

## 6. 카드 모양과 이미지

카드는 **모양(`shape`)** 다섯 개 중 하나로 그린다. 모양은 카드마다 정하는 값(`today_cards.shape`)이고, 값이 없는 옛 카드의 모양은 옛 레이아웃(`layout_type`)이 정한다. 레이아웃은 화면을 직접 정하지 않고 **`shape`가 없는 카드의 모양을 정하는 입력값**일 뿐이다(템플릿과 별개 축, DB 컬럼은 NOT NULL이고 기본값은 `large_thumbnail`이며, 목록에 없는 값은 큰 썸네일형으로 본다). 모양은 자원마다 고정하지 않고 컨텐츠의 특성(이미지 비율, 정보량)에 따라 카드마다 고른다. 예외는 기사로, 기사 화면과 커버 한 장을 함께 쓰므로 `hero`로 고정한다(티켓 [20260930_1453](../../../tickets/p2-normal/20260930_1453_UI_홈피드-카드-표현-형식-리뉴얼.md)).

### 모양 목록

모양 값은 `CARD_SHAPES`(마이그레이션 206의 `today_cards_shape_check`와 같은 목록)이고 「이미지 있음」은 `isImageShape`다. 이미지 제작이 필요한 카드인지 가리는 신호의 단일 원천이 이 판정이다.

<!-- BEGIN generated: card-shapes -->
| 값 | 이미지 |
|---|---|
| `hero` | 있음 (이미지 제작 필요) |
| `poster` | 있음 (이미지 제작 필요) |
| `square` | 있음 (이미지 제작 필요) |
| `brief` | 없음 |
| `list` | 없음 |
<!-- END generated: card-shapes -->

| 모양 | 이름 | 이미지 | 모습 |
|---|---|---|---|
| `hero` | 큰 이미지 | 16:9, 새로 제작(1280×720) | 이미지가 위, 흰 본문이 아래. 기사 카드도 이 모양이다(끝 줄 「기사 읽기 →」, 칩 줄 끝에 게재일) |
| `poster` | 포스터 | 4:5, 새로 제작(1024×1280) | 이미지가 카드 전체이고 아래쪽 어두운 막 위에 `--snow` 글자. 막은 글자 블록 첫 줄에서도 진하기 60% 이상이다 |
| `square` | 정사각 큰 카드 | 1:1, 새로 만들지 않는다(미션·배지 이미지 그대로) | 이미지를 자르지 않고 카드 폭 가득 보인다. 이미지 위에는 아무것도 얹지 않는다. 다섯 모양 중 가장 높다 |
| `brief` | 짧은 소식 | 64px 정사각 썸네일 또는 자원 아이콘(커버가 아니다) | 한눈에 읽는 작은 카드, 최소 높이 88px |
| `list` | 목록 | 64px 타일(커버가 아니다) | 배지·재료 가로 타일형, 또는 랭킹 행형(행마다 프로필 링크, 카드 전체 링크 없음). 타일이 0개면 `brief`로 그린다 |

### 자원별 기본 추천 모양과 필수 정보

아래 모양은 기본 추천이고 카드마다 바꿀 수 있다(기사만 `hero` 고정). 필수 정보는 아이콘 없이 글자로, 한 줄에 하나씩 최대 2줄이다(예: 「기간 10월 12일~11월 8일」, 「보상 300 포인트 · 배지 1개」). 값이 없으면 그 줄만 생략한다. 남은 시간은 종료 7일 이내에만 「N일 남음」·「N시간 남음」으로 보이고 초·분 단위와 카운트다운은 쓰지 않는다. 표시 데이터가 이 줄을 만드는 규칙은 아래 「표시 데이터」 항목이다.

| 자원 | 기본 추천 모양 | 필수 정보 | 값의 출처와 부족한 값 |
|---|---|---|---|
| 미션 | `square` | 기간·보상 | 미션 행. 상시 미션은 「상시」 |
| 드랍 | `brief` | 지역·시각 | 지역은 `region_label`이고 화면 문구는 「지역 ○○」이다(실제 지점 값이 생기면 「지점」으로 다시 정한다). 시각 값이 없다 |
| 레시피(`recipe_reveal`) | 공개 전 `brief`(운영자가 고르면 공개 예고 `poster`), 공개 뒤 `list`(재료 타일) | 공개 전 재료 수·공개일, 공개 뒤 재료 수·보상 | 레시피 행과 슬롯. 카드의 레시피 칸(`recipe_id`, 마이그레이션 217, 티켓 20261006_1218)이 가리키는 레시피를 읽는다 — 칸이 비어 있으면 레시피 줄 없이 그려진다. 공개 전에는 재료 수(슬롯 수)와 공개일(`valid_from`)만 싣는다(아래 「레시피 공개 카드」) |
| JAM! 배지 | 1개는 `brief`, 여러 개는 `list`, 커버 없는 배지 카드는 `square` | 이름·희귀도 | `ResolvedBadge`에 있다 |
| 연재(별도 자원 아님) | 이어지는 자원의 모양(기사면 `hero`) | 몇 막·남은 시간 | 「몇 막」 값이 없다(표시값 직접 입력). 남은 시간은 자원의 종료 시각에서 계산한다(카드 `ends_at`은 대부분 그날 23:59라 쓰지 않는다) |
| 기사 | `hero` 고정 | 게재일, 연재면 연재 정보 | `starts_at` |
| 랭킹보드 | `list` 행형 | 없음 | `resolved_ranking` |
| 컬렉션 소식 | 이미지가 있으면 `poster`, 없으면 `brief` | 이름·아이템 수 | 컬렉션 대표 이미지의 비율은 확인하지 않았다. 1:1이면 `square` 후보다 |
| 자동 카드(`progress_nudge`·`location_trend`) | `brief` | 미션을 가리키면 기간 | — |

### 글자 배치 상한

360 기기 카드 폭 328px 기준이다. 줄 수와 말줄임은 코드가 정하고(`line-clamp`), 글자 수는 운영자가 카드 문구를 쓸 때 지킬 상한이다. 제목 상한은 코드 상수 `CARD_TITLE_MAX_LENGTH`(`jam-web/src/lib/today/shape.ts`)로 두고, 운영툴 예약 등록이 넘으면 경고만 한다([ops-tool/PRD.md](../ops-tool/PRD.md) §8.4). 이 표는 폭 계산으로 정한 설계 상한이고, 실측으로 확인한 것은 `brief`다 — 328px에서 제목 28자는 2줄에 들어가고, 필수 정보는 15자가 1줄·20자가 2줄로 줄바꿈된다. 각 모양의 글자 크기·줄 수·간격·실측 높이는 아래 「카드 모양 판정」의 모양별 항목이 정본이다.

| 요소 | `hero` | `poster` | `square` | `brief` | `list` |
|---|---|---|---|---|---|
| 칩 줄(라벨 6자·지역 핀 10자 이하) | 이미지 아래 첫 줄 | 어두운 막 맨 위 | 이미지 아래 첫 줄(배지는 희귀도 색 칩 추가) | 첫 줄 | 첫 줄 |
| 제목 | 24px, 22자, 2줄 | 24px 흰색, 18자, 2줄 | 24px, 22자, 2줄 | 16px, 28자, 2줄 | 24px, 22자, 2줄 |
| 요약 | 16px `text-muted`, 30자, 2줄 | 없음 | 16px, 선택 | 없음 | 16px `text-muted`, 30자, 2줄 |
| 필수 정보 | 14px 굵게, 줄당 22자, 2줄 | 14px 흰색, 줄당 20자, 2줄 | 14px 굵게, 줄당 22자, 2줄 | 14px, 줄당 15자, 2줄 | 14px 굵게, 줄당 22자, 2줄 |
| 설명문(40자) | 14px `text-muted`, 2줄 | 없음 | 없음 | 없음 | 14px `text-muted`, 2줄 |
| 끝 줄 | 「자세히 보기 →」(기사는 「기사 읽기 →」) 12px `text-muted` | 없음 | 없음 | `›` | 「전체 보기 →」(타일형만) |

- 이미지가 제목을 말하는 카드(`title_in_image`)는 화면 글자에서 제목·요약을 빼고 필수 정보를 놓는다. 제목은 스크린리더용으로 남기고 이미지 로드에 실패하면 제목을 보인다.
- 카드 면은 `--surface`(흰) + 1px `--border` 테두리이고 그림자가 없다. 크림 바탕(`--background`)과 흰 면의 대비가 1.05:1이라 테두리가 경계를 맡는다. 카드 높이는 테두리 위·아래 2px만큼 늘어난다(티켓 20261015_2133).
- 옅은 글자는 `text-muted`(`--muted`, 흰 면 위 5.74:1) 한 단계다. 불투명도로 글자색을 만들지 않는다(흰 카드에서 `/40`은 약 2.85:1이라 AA 4.5:1에 못 미친다).
- 희귀도는 배지 목록과 같은 색 칩이고 Common은 칩이 없으며 등급이 없는 무한레벨형은 이름만 보인다. 미보유 배지는 흑백, 유저 정보가 없는 미리보기는 컬러다.
- 이미지 `alt`는 제목이 화면 글자로 보이면 빈 값, 이미지에만 있으면 제목이다.
- 큰 카드(`hero`·`poster`·`square`) 사이에 작은 카드를 최소 1장 끼우는 것이 편성 원칙이다(신호는 [ops-tool/PRD.md](../ops-tool/PRD.md)의 「겹침」).

### 이미지 규칙

- 새로 만드는 이미지는 `hero`가 16:9(1280×720), `poster`가 4:5(1024×1280)이고 에셋 생성기가 두 비율을 지원한다([asset-generator/PRD.md](../asset-generator/PRD.md)). 미션 이미지(1:1)는 `hero`·`poster`에 넣지 않는다 — 16:9로 자르면 위아래의 미션 이름·로고가, 4:5로 자르면 좌우 첫 글자가 잘린다. `square`나 `brief`로 쓴다.
- `poster`는 이미지 아래 45%에 이미지 속 글자를 두지 않는다(2026-10-01 사용자 결정, 40%에서 바꿨다).
- 옛 1:1 홈피드 커버는 옛 카드에서만 16:9·4:5로 잘려 보이는 것을 허용하고 같은 방식으로 새로 만들지 않는다.
- 이미지 칸은 이미지와 무관하게 늘 그려서 카드 높이가 변하지 않는다(모양별 상태는 아래 「카드 모양 판정」). 이미지가 필요한 모양인데 이미지가 없는 카드는 운영툴이 「이미지 제작 필요」로 알리기만 하고 승인을 막거나 모양을 바꾸지 않는다.

**커버 결정**: 이미지가 있는 모양(`hero`·`poster`·`square`)의 이미지 칸은 `cover_image_url`이 있으면 그 이미지를 그대로 쓴다. 없으면 첫 번째 배지 이미지를 올리고(커버가 없고 배지가 걸린 옛 큰 카드는 `square`), 유저가 그 배지를 아직 갖지 않았으면 흑백으로 그린다. 둘 다 없거나 이미지를 불러오지 못하면 **이미지 칸을 유지**하고 어두운 판 위에 자원 아이콘을 그린다(대체 이미지 없음). `mission_spotlight`는 배지를 쓰지 않으므로 커버를 넣지 않으면 판과 아이콘뿐인 카드가 된다 — 그래서 운영 규칙은 미션 대표 이미지(`missions.image_url`)를 커버로 넣는다(content-automation PRD §8). 커버 주소는 어드민 자유 입력이라 호스트를 알 수 없으므로 `SafeImage`로 그려 잘못된 주소가 홈 전체를 깨뜨리지 않게 한다.

### 레이아웃(운영 입력값)

레이아웃 값·라벨(`TODAY_LAYOUT_OPTIONS`)이다. 어드민 폼과 주간 편성 시드가 지금도 이 값을 입력하고, 화면은 옛 값 → 새 모양 대응표(아래 「카드 모양 판정」)로 모양을 정한다.

<!-- BEGIN generated: layouts -->
| 값 | 라벨 |
|---|---|
| `large_thumbnail` | 큰 썸네일형 — 커버 이미지 크게 |
| `badge_gallery` | 배지목록형 — 배지 갤러리/리스트 |
| `shortcut` | 바로가기형 — 이미지 없는 짧은 CTA |
| `banner` | 배너형 — 가로 띠 배너 |
| `other` | 기타 — 기본형 |
| `ranking_list` | 순위 리스트형 — 랭킹보드 목록(포디엄 없음) |
<!-- END generated: layouts -->

**게재용 설명문(`description`)**: 한 덩어리 문단으로 보이는 짧은 글이다(공백 포함 40자 이하, 줄바꿈 없음, 14px, 넘치면 2줄에서 말줄임). `hero`와 `list`(타일형·행형 모두)에서만 보이고 `brief`·`poster`·`square`는 설명문을 그리지 않는다 — 그래서 `brief`로 그려지는 옛 `shortcut`·`other` 카드, `poster`가 되는 옛 `banner` 카드, `square`가 되는 카드의 설명문은 화면에 나오지 않는다. 값이 없거나 공백뿐이면 그 그룹만 사라진다. `editorial_article`은 본문(`body_markdown`)이 있어 쓰지 않는다: 어드민 폼은 이 템플릿에서 칸을 숨기고 저장할 때 비운다. 길이 상한은 어드민 폼과 등록 묶음이 같은 상수(`TODAY_DESCRIPTION_MAX_LENGTH`)를 쓴다(티켓 [20260929_1335](../../../tickets/p2-normal/20260929_1335_Feature_홈피드-카드에-게재용-설명문-칸-추가.md)).

**눌림과 칩**: 카드를 누르는 동안의 반응은 공용 클래스 `.jam-press`(누르면 0.98배, 80ms)다. 동작 줄이기 설정에서는 눌림이 없다. 홈에서는 링크로 감싸는 카드(카드 틀 `CardFrame`의 링크)·랭킹 행형의 제목 링크와 순위 행·현황 스트립 셀에 붙고, 홈 밖의 눌림 가능한 카드(미션 랭킹 화면 행, 컬렉션 카드, 미션 상세의 상황 보기 버튼 등)도 같은 클래스를 쓴다. 링크도 버튼도 아니거나 비활성인 요소에는 붙이지 않는다. 카드 좌상단 템플릿 칩은 MODULAR `LabelChip`이 그린다(티켓 [20261001_1458](../../../tickets/p2-normal/20261001_1458_UI_투데이-카드-틀과-짧은-소식-모양을-만든다.md), [20261001_2244](../../../tickets/p2-normal/20261001_2244_UI_투데이-옛-카드를-새-모양으로-전환하고-옛-렌더러를-지운다.md)).

근거: `jam-web/src/lib/today/shape.ts`·`cardView.ts`(커버 결정은 `toCardView`), `jam-web/src/components/today/CardImageSlot.tsx`, `jam-web/src/components/SafeImage.tsx`, `jam-web/src/components/transitions.css`(`.jam-press`), `jam-web/supabase/migrations/049_today_cards_layout_type.sql`, `jam-web/supabase/migrations/206_today_cards_shape_and_events_card_shape.sql`

### 카드 모양 판정 (모든 카드를 새 틀로 그린다)

모든 카드는 표시 데이터(`toCardView`)를 거쳐 새 틀(`components/today`)이 그린다. 새 틀이 그리는 모양은 `brief`(짧은 소식)·`hero`(큰 이미지)·`poster`(포스터)·`square`(정사각 큰 카드)·`list`(목록) 다섯 개 전부다. 옛 값을 새 모양으로 바꾸는 대응표는 `resolveShape`에 대표 입력을 넣어 돌린 결과이고 아래 생성 구간이 정본이다(입력 조건은 `scripts/gen-home-feed-doc.mjs`가 정하고, 결과 칸은 코드가 채운다). 같은 사실을 사람이 따로 적지 않는다.

<!-- BEGIN generated: legacy-shape-map -->
| 옛 레이아웃 | 조건 | 새 모양 |
|---|---|---|
| `large_thumbnail` (큰 썸네일형) | 커버 있음 | `hero` |
| `large_thumbnail` (큰 썸네일형) | 미션 소개 카드(`mission_spotlight`) | `square` |
| `large_thumbnail` (큰 썸네일형) | 커버 없음 · 배지가 걸려 있음(배지 그림이 있는지는 보지 않는다) | `square` |
| `large_thumbnail` (큰 썸네일형) | 커버 없음 · 배지 없음 | `hero` |
| `badge_gallery` (배지목록형) | 배지가 1개 이상 | `list` 타일형 |
| `badge_gallery` (배지목록형) | 배지가 0개(타일이 없다) | `brief` |
| `shortcut` (바로가기형) | 입력과 무관 | `brief` |
| `banner` (배너형) | 커버 있음 | `poster` |
| `banner` (배너형) | 커버 없음 | `brief` |
| `other` (기타) | 입력과 무관 | `brief` |
| `ranking_list` (순위 리스트형) | 랭킹보드(`ranking_board`) | `list` 행형 |
| 모든 레이아웃 | 기사(`editorial_article`)는 레이아웃과 상관없이 | `hero` |
| 모든 레이아웃 | 저장된 `shape`가 모양 값이면 옛 값과 상관없이 그 값(예: `poster`) | `poster` |
| 모든 레이아웃 | 목록에 없는 레이아웃 값은 큰 썸네일형으로 본다 | `hero` |
<!-- END generated: legacy-shape-map -->

- **모양 상수**: `CARD_SHAPES`(5개)·`IMAGE_CARD_SHAPES`(이미지가 있는 모양 `hero`·`poster`·`square`)와 술어 `isCardShape`·`isImageShape`다. `CARD_SHAPES`는 마이그레이션 206의 `today_cards_shape_check`와 같은 목록이다.
- **판정 순서(`resolveShape`)**: ① 저장된 `today_cards.shape`가 모양 값이면 그대로 → ② `editorial_article`은 레이아웃과 상관없이 `hero` → ③ 옛 `layout_type` 대응표(알 수 없는 값은 큰 썸네일형으로 본다). 커버 없이 배지가 걸린 옛 큰 카드를 `square`로 보내는 판정은 **`badge_ids`가 있는지**만 본다 — 배지 그림이 있는지는 보지 않는다(그림 없는 배지·삭제된 배지가 걸려 있어도 `square`이고 이미지 칸에 자리 표시를 그린다). 화면·계측·신호 엔진이 같은 카드 행을 같은 입력으로 판정해야 기록 모양과 화면 모양이 같기 때문이다(§9). `list`의 타일형·행형 구분(랭킹 카드는 행형, 판정 함수 `isRankingRows` 하나)과 「타일이 0개인 타일형은 `brief`」(`fallbackEmptyTileShape`)는 표시 데이터가 정한다. 이 판정 함수와 자원 대응(`resourceOfTemplate`·`CARD_RESOURCES`)은 한국어 사전을 가져오지 않는 순수 파일 `shape.ts`에 있어서 계측(`events.ts`)이 화면 모듈(`cardView.ts`)을 가져오지 않는다(`cardView.ts`가 같은 이름으로 다시 내보낸다).
- **전환 상수(`LEGACY_SHAPE_CUTOVER`)**: `true`다(조각 b7, 티켓 20261001_2244). `shape`가 없는 옛 카드도 `resolveShape` 대응표대로 새 모양으로 그린다고 보고 `drawnShape`가 그 모양을 돌려준다(계측이 `card_shape`로 기록하는 모양). 옛 렌더러는 지웠으므로 홈 화면(`TodayCardStack`)과 어드민 미리보기는 이 상수와 무관하게 늘 `resolveShape`(`toCardView`)로 모양을 정한다. 상수를 `false`로 끄면 옛 카드의 기록 모양만 NULL이 되어 화면과 어긋나므로 화면을 되돌리는 수단이 아니다 — 분기만 남겨 둔 것이다.
- **새 틀로 그리는 조건**: 홈의 모든 카드가 새 틀이다. `TodayCardStack`은 카드마다 표시 데이터(`toCardView`, 계측 정보 `tracking` 포함)를 만들어 새 틀(`TodayCard`)로 그린다(옛 렌더러와 어드민 미리보기용 `preview` prop은 지웠다). `TodayCard`는 새 틀이 그리는 모양 목록(`RENDERED_SHAPES`, 다섯 모양 전부)에 없는 값이면 아무것도 그리지 않는다. 카드가 0장이면 투데이 영역 전체를 그리지 않는다. `TodayCardStack`의 `currentUserId`(홈에서 보는 사람)는 `TodayCard`를 거쳐 랭킹 행형 `list`에만 전달된다. 표시 데이터(`CardView`)에는 유저 정보가 없다.
- **새 틀의 계측 규칙**: 카드 틀(`CardFrame`)은 모양을 모르고 표시 데이터만 읽는다. 계측 정보(`tracking`)가 있으면 `TodayCardTracker`로 감싸고, `tracking`과 `href`가 모두 있으면 그 안에 블록 링크를 둔다(눌림 `.jam-press`와 키보드 포커스 윤곽선 2px·오프셋 2px·`--color-primary`는 이 링크에만 붙는다). `tracking`이 없으면(어드민 미리보기는 표시 데이터에 싣지 않는다) 트래커·링크·눌림이 없고, `href`가 있으면 끝 `›`만 보인다. 카드 전체 링크를 걸지 않는 모양을 위해 틀에는 링크 범위 옵션(`link`, 기본 true)이 있다: `link={false}`면 `tracking`이 있어도 링크와 눌림을 걸지 않고 트래커만 클릭 기록 없이(`trackClick={false}`) 감싸 노출만 기록한다. 어느 모양이 `link={false}`인지는 틀이 아니라 `TodayCard`가 정한다(랭킹 행형 `list`). 틀 안쪽에서 일부 영역만 같은 링크(윤곽선·눌림)로 감쌀 때는 `CardLink`를 쓴다.
- **`brief` 모양**: 흰 카드(최소 높이 88px)에 왼쪽 64px 칸(배지 썸네일, 없거나 로드에 실패하면 자원 아이콘 — `list` 타일과 공용 컴포넌트 `CardThumb`)·칩 줄(라벨 칩 → 지역 핀 → 희귀도 칩)·제목 16px(2줄 말줄임)·필수 정보 14px(최대 2줄, 말줄임 없이 줄바꿈)·끝 `›`(`href`가 있을 때만)가 있다. 자원은 아이콘 모양으로만 구분한다(미션 과녁·드랍 상자·레시피 플라스크·JAM! 배지 메달·기사 신문·랭킹 막대·컬렉션 책, 자동 카드는 진행 알림이면 모래시계·지역 트렌드면 핀 — 표시 데이터의 템플릿 구분 값 `template`으로 정하고 지역 값과는 무관하다, 홈과 어드민 미리보기가 같은 아이콘을 그린다). 칩 줄(`CardChipRow`)과 자원 아이콘 선택(`resourceIconOf`)은 `hero`와 공용이다. 지역 핀은 드랍 카드에서 칩 줄에 그리지 않는다(필수 정보 「지역」 줄이 같은 값을 낸다). 희귀도는 JAM! 배지 1개 카드에서 Rare·Epic·Mystic만 칩으로 보이고 Common·등급 없음은 칩이 없다. 미보유 배지 썸네일은 흑백, 유저 정보가 없는 미리보기는 컬러다. 칩 줄은 흰 면 위(`on="white"`, 기본)와 `poster`의 어두운 막 위(`on="scrim"`)에서 글자색만 다르다: 라벨 칩은 두 바탕 모두 같은 기본 색조(`--background-secondary` 알약 + `--foreground` 글자)이고, 지역 핀·게재일 글자는 흰 면 위 `text-muted`, 막 위 `text-snow`다. 줄바꿈하지 않고 좁아지면 줄어드는 것은 지역 핀 글자뿐이며 드랍은 핀이 없는 규칙은 두 바탕이 같다.
- **`hero` 모양**: 흰 카드의 위쪽에 16:9 이미지 칸, 아래쪽에 왼쪽 정렬 본문(안쪽 여백 24px)이다. 본문은 칩 줄(라벨 칩 → 지역 핀 → 희귀도 칩, 기사는 줄 끝에 게재일 「10월 5일」 — KST, 연도 없음) → 제목 24px(2줄 말줄임) → 요약(`subtitle`) 16px(2줄 말줄임) → 필수 정보 14px 굵게(최대 2줄, 한 줄에 하나, 말줄임 없이 줄바꿈) → 설명문(`description`) 14px(2줄 말줄임) → 끝 줄 12px 순서다. 끝 줄은 `href`가 있을 때만 「자세히 보기 →」(기사는 「기사 읽기 →」)로 보인다. 옅은 글자(요약·설명문·게재일·끝 줄)는 모두 `text-muted`이고 불투명도 글자색(`/40` 등)은 쓰지 않는다. 값이 없는 그룹(요약·필수 정보·설명문·지역 핀·희귀도·게재일)은 그 그룹만 사라진다. 이미지 위에는 아무것도 얹지 않는다. `imageDimmed`면 이미지만 흑백이고 `object-cover`로 자른다(1:1 배지 그림을 승격하면 위아래가 잘린다 — 승격 카드는 `resolveShape`가 `square`로 보내므로 운영자가 `hero`를 직접 지정했을 때만 생긴다).
  - **이미지 칸 상태**: 칸·자리 표시는 비율을 받는 공용 컴포넌트 `CardImageSlot` 한 곳이 그린다(`alt` 규칙과 `sizes`도 여기 한 곳이다). 칸(`aspect-video`)은 이미지와 무관하게 늘 그려서 높이가 변하지 않는다. 로딩 중에는 `--color-surface` 단색 판(스켈레톤·모션 없음)이고, 주소가 없거나 로드에 실패하면 같은 칸·같은 색 판 위에 자원 아이콘(`resourceIconOf`)만 둔다. 이미지에 제목이 들어 있는 카드(`titleInImage`)에서만 판 위에 제목(16px 굵게, 3줄 말줄임)을 함께 그린다 — 일반 카드는 바로 아래 본문이 같은 제목을 보여 주므로 한 카드에 제목이 두 번 보이지 않게 아이콘만 둔다.
  - **`titleInImage`**: 화면 글자에서 제목·요약을 빼고 필수 정보가 칩 줄 바로 다음에 온다. 제목은 이미지 alt가 맡는다(`alt` = 제목, 그 밖의 카드는 빈 값). 이미지 로드에 실패하면 판 위 제목 글자가 링크 이름이 된다.
  - **계측·링크**: `brief`와 같다 — 링크·트래커·눌림·포커스 윤곽선은 카드 틀(`CardFrame`)이 맡고, 표시 데이터에 `tracking`이 없으면(미리보기) 출력에 링크·트래커·눌림이 없다.
- **`poster` 모양**: 4:5 이미지가 카드 전체이고 아래쪽에만 검정 막이 올라온다. 막 위에 왼쪽 정렬로 칩 줄(라벨 칩은 밝은 알약, 지역 핀 글자는 `--snow`, 희귀도 칩 — `CardChipRow`의 `on="scrim"`) → 제목 24px `--snow`(2줄 말줄임) → 필수 정보 14px `--snow`(보통 굵기, 최대 2줄, 한 줄에 하나, 말줄임 없이 줄바꿈) 순서다. 요약·설명문·끝 줄·게재일은 없다. 막 위 글자는 전부 `text-snow`이고 옅은 단계(`/80`·`/60`)를 쓰지 않는다. 이미지 칸은 `hero`와 같은 `CardImageSlot`(4:5, `object-cover`)이 그린다.
  - **막 규칙**: 막은 글자 블록 높이에 위 32px 램프를 더한 만큼만 덮고(`absolute`라 글자 수가 카드 높이를 바꾸지 않고 막이 위로만 자란다) 단일 선형 그라디언트 `transparent → color-mix(--base-black 60%)`를 쓴다. 정지점은 퍼센트가 아니라 고정 길이 `var(--spacing-32)`이고 글자 블록의 위 여백도 32px라서, 첫 줄인 칩 줄의 윗변은 늘 램프가 끝난 뒤 — 막 진하기가 `--base-black` 60% 그대로인 자리 — 에서 시작한다. 60%는 확정 설계 「글자 블록 첫 줄에서도 진하기 60% 이상」의 하한이고 순백 이미지 위에서도 `--snow` 글자 대비가 5.60:1(AA 4.5)이다. `--backdrop`은 모달·시트 배경 전용이고 값이 60%보다 옅어 막은 쓰지 않는다. 막은 `--base-black`을 60%로 직접 섞고(새 토큰은 만들지 않는다, 디자인 시스템 문서 11 5.7절) 테스트가 이 클래스 문자열과 `--backdrop` 부재를 단언한다. 옛 `BannerCard`의 `from-black/70 via-black/30`은 퍼센트 정지점이라 첫 줄 진하기가 글자 수에 따라 변해서 쓰지 않는다. 328px 폭(카드 높이 410px)에서 막 높이는 제목 1줄·필수 정보 0줄 123px, 제목 1줄·필수 정보 2줄 175px, 제목 2줄·필수 정보 2줄 206px(카드의 50%)이다. 포스터 이미지는 아래 45%에 이미지 속 글자를 두지 않는다(2026-10-01 사용자 결정, 40%에서 바꿈). 328px 폭 최악 조합에서 램프를 뺀 글자 블록(174px)이 45%(184.5px) 안에 든다. 288px 폭(320 기기)의 최악 조합은 필수 정보가 줄바꿈해 막이 카드의 약 63%까지 올라오며, 이 경우는 예외로 둔다.
  - **이미지 칸 상태**: 4:5 칸은 이미지와 무관하게 늘 그려서 카드 높이가 변하지 않는다. 로딩 중에는 단색 판 위에 막과 글자가 그대로 보인다. 주소가 없거나 로드에 실패하면 같은 판의 **위쪽 60%** 가운데에 자원 아이콘만 둔다(아래에서 올라오는 막과 겹치지 않게). `imageDimmed`면 이미지만 흑백이고 막·글자·희귀도 칩은 컬러다.
  - **`titleInImage`**: 막에서 제목을 빼고 필수 정보가 칩 줄 바로 다음에 온다. 이미지 `alt`가 제목이고, 이미지가 없거나 실패하면 판 위쪽 60% 가운데에 아이콘과 제목(16px 굵게, 3줄 말줄임)을 그린다.
  - **계측·링크**: `brief`·`hero`와 같다 — 카드 틀(`CardFrame`)이 맡고, `tracking`이 없으면 출력에 링크·트래커·눌림이 없다.
- **`square` 모양**: 흰 카드의 위쪽에 카드 폭 가득한 1:1 이미지 칸, 아래쪽에 왼쪽 정렬 본문(안쪽 여백 24px)이다. 본문은 칩 줄(라벨 칩 → 지역 핀 → 희귀도 칩) → 제목 24px(2줄 말줄임) → 요약(`subtitle`) 16px(2줄 말줄임, 선택) → 필수 정보 14px 굵게(최대 2줄, 한 줄에 하나, 말줄임 없이 줄바꿈) 순서다. 설명문·끝 줄·게재일은 없다. 이미지 위에는 아무것도 얹지 않는다. 미션 소개 카드와 커버 없는 JAM! 배지 카드가 쓴다. 본문 칸·제목 그룹·필수 정보는 `hero`·`list`와 공용 조각(`CardBody.tsx`)이다.
  - **이미지 칸 상태**: `CardImageSlot`이 1:1(`aspect-square`) 칸을 늘 그리고 이미지는 자르지 않는다(`object-contain`). 1:1이 아닌 이미지는 어두운 판(`--color-surface`) 위에 레터박스가 되고, 투명 PNG 배지 그림도 어두운 판 위에 얹힌다. 로딩·주소 없음·로드 실패는 `hero`와 같다(판 + 자원 아이콘만, `titleInImage`만 판 위에 제목). `imageDimmed`면 이미지만 흑백이고 희귀도 칩은 컬러다. 카드 높이는 328px 폭에서 값이 가득 찬 미션 카드 523px·`titleInImage` 카드 452px, 398px 폭에서 값이 가득 찬 미션 카드 593px이다(실측, 확정 설계의 450~570px는 추정치였다).
  - **`titleInImage`**: 제목·요약을 빼고 필수 정보가 칩 줄 바로 다음에 온다. 이미지 `alt`가 제목이고(옛 미션 소개 카드 포함), 이미지가 없거나 실패하면 판 위에 아이콘과 제목(16px 굵게, 3줄 말줄임)을 그린다.
  - **계측·링크**: `brief`·`hero`와 같다 — 카드 틀(`CardFrame`)이 맡고, `tracking`이 없으면 출력에 링크·트래커·눌림이 없다.
- **`list` 모양**: 흰 카드에 왼쪽 정렬 본문(안쪽 여백 24px)이다. 본문은 칩 줄(라벨 칩 → 지역 핀 → 희귀도 칩) → 제목 24px(2줄 말줄임) → 요약 16px(2줄 말줄임, 선택) → 필수 정보 14px 굵게(최대 2줄, 한 줄에 하나, 말줄임 없이 줄바꿈) → 설명문 14px(2줄 말줄임)까지가 두 갈래 모두 같고, 그 아래가 갈린다. `resource`가 `ranking`이면 행형(`ranking`만 읽는다), 아니면 타일형(`tiles`만 읽는다). `titleInImage`는 읽지 않는다(이미지 칸이 없어 제목은 늘 보인다). 값이 없는 그룹은 그 그룹만 사라진다. 본문 칸·제목 그룹·필수 정보·설명문·끝 줄은 `hero`·`square`와 공용 조각(`CardBody.tsx`)이라 필수 정보는 세 모양이 같은 규칙(굵게)이다. 옅은 글자는 모두 `text-muted`이다.
  - **타일형**: 타일은 64px 정사각 그림 칸(`CardThumb`, `brief`의 64px 칸과 같은 컴포넌트) 아래에 이름(12px 옅은 글자, 가운데, 2줄 말줄임, 칸 폭 그대로)이고, 한 줄 가로 스크롤이다(줄바꿈 없음). 스크롤 칸이 카드 좌우 끝까지 번지고(`-mx`·`px` 24px) 타일 간격은 8px라서, 360(카드 328px)·430(398px)·320(288px) 기기 폭에서 다음 타일이 가장자리에서 잘려 보인다 — 더 있다는 단서는 이것뿐이다(화살표·점·「+N」·페이드·스냅 없음). 타일 줄은 328px 폭에서 5개째부터 잘려 보이고 4개는 딱 맞는다(타일 4개 + 간격 3개 = 280px). 끝까지 밀면 마지막 타일 오른쪽에 24px이 남는다 — 안쪽 목록이 `w-max`여야 칸의 오른쪽 여백이 스크롤 영역에 들어간다(Chromium 실측: 없으면 0px, 마지막 타일의 오른쪽 `margin`으로도 0px). 카드 높이는 타일 수와 무관하다. 희귀도는 타일에 그리지 않는다(`CardViewTile.rarity`는 표시 데이터에 두되 쓰지 않는다 — 단일 배지 카드의 칩 줄 희귀도는 그대로다). 미보유(`earned: false`) 그림만 흑백이고 이름은 컬러다. `earned`가 없으면(미리보기) 전부 컬러다. 그림 `alt`는 빈 값이고(이름이 바로 아래 글자다), 그림이 없거나 로드에 실패하면 같은 64px 칸에 카드의 자원 아이콘을 그린다(재료 타일은 플라스크). 끝 줄 「전체 보기 →」는 `href`가 있을 때만 보이고 미리보기도 `href`가 있으면 보인다(링크만 없다). 타일이 0개인 타일형은 `brief`로 그려져 이 모양까지 오지 않고, 직접 만든 표시 데이터가 0개로 오면 타일 줄만 그리지 않는다.
  - **재료 타일(레시피 공개 카드)**: 공개 뒤 레시피 공개 카드는 타일형이다. 타일은 슬롯마다 하나이고(후보를 펼치지 않는다) `slot_order` 오름차순이며, 대표 후보는 유저가 가진 후보가 있으면 그 후보(컬러)·없으면 `allowed_badge_ids` 순서의 첫 번째로 삭제되지 않은 후보(흑백)다. 이름은 대표 후보의 배지 이름이고 「외 N개」·「+N」·겹침 표시는 없다. 타일을 자르지 않는다(슬롯은 2~10개) — 328px 폭에서 4개는 딱 맞고 5개부터 잘려 보인다. 공개 전·레시피 줄 없음은 타일이 0개라 `brief`다(「레시피 공개 카드」 항목).
  - **행형(랭킹 보드)**: 본문 아래에 순위 행(`RankingListRow`)이 8px 간격으로 쌓인다(포디엄·메달·1~3위 색 강조 없음). 값 포맷은 `formatRankingMetricValue`다. 순위 행은 각자 유저 프로필 링크라(링크인 행은 `ListRowCard`의 `.jam-press`로 눌린다 — 눌림은 링크마다 하나다) 카드 전체 링크가 없다(앵커 안에 앵커가 없다): `TodayCard`가 틀에 `link={false}`를 알려 트래커는 노출만 기록한다. 「랭킹이면 행형」 판정은 함수 `isRankingRows` 하나이고 `TodayCard`(카드 전체 링크를 걸지 말지)와 `ListCard`(어느 갈래를 그릴지)가 같은 함수를 쓴다 — 한쪽만 바뀌어 앵커가 겹치거나 카드 전체 링크가 빠지지 않게 테스트가 고정한다. 제목 영역(칩 줄·제목·요약·필수 정보·설명문)은 홈(`tracking` 있음)에서 미션 대상 랭킹(`ranking.metricType === 'mission_progress'`)이고 `href`가 있을 때만 링크(`CardLink`, 눌림 포함)다. 유저 직접 지정 랭킹은 제목에 링크가 없다. 끝 줄은 없다(행마다 다른 곳으로 가서 「이 카드 전체가 눌린다」는 신호가 거짓이 된다). 순위가 비면(`ranking`이 null이거나 행이 0개) 행 자리에 「아직 랭킹이 없어요」를 16px 옅은 왼쪽 정렬 글자로 보인다(순위를 못 읽은 경우와 아직 없는 경우를 구분하지 않고, 이때도 노출은 기록한다). 카드 높이는 328px 폭에서 값이 가득 찬 타일형 370.8px, 행형 순위 3행 407.2px(행 하나당 76px)이다(실측).
  - **내 순위 강조**: `TodayCard`의 선택 prop `currentUserId`로 받는다(표시 데이터에는 넣지 않는다 — 유저 정보 없이 그려져야 한다). 홈에서 `ranking.entries[].userId`가 `currentUserId`와 같은 행만 순위·값이 `--color-primary`(레드)·24px로 강조된다. 목록에 내가 없으면 강조가 없다.
  - **미리보기(`tracking` 없음)**: 두 갈래 모두 링크·트래커·눌림이 없다. 행형은 순위 행의 `username`을 비워 행 링크도 없애고 내 순위 강조도 없다(`currentUserId`를 넘겨도 마찬가지다).
  - **서버·클라이언트 경계**: `ListCard`는 서버에서 도는 컴포넌트라 `RankingListRow`에 `formatValue` 함수를 넘긴다. `RankingListRow`에 클라이언트 지시어(`'use client'`)가 있으면 서버가 클라이언트 컴포넌트에 함수를 넘기게 되어 홈 렌더가 실패하므로 지시어가 없다(안쪽 `ListRowCard`가 클라이언트다).
  - **옛 렌더러였을 때와 다른 값**(옛 렌더러는 조각 b7이 지웠다, 모두 되돌리기 쉽다): 타일 사이 8px(옛 16px), 타일 줄이 카드 가장자리까지 번짐, 타일에 희귀도 칩 없음(옛 갤러리도 보이지 않았다), 필수 정보 굵게, 순위 행 사이 8px(옛 0px), 타일 이름·끝 줄 옅은 글자를 `text-muted`로 통일(옛 `/70`·`/40`).
- **이미지에 제목 있음(`resolveTitleInImage`)**: 저장된 `title_in_image`가 `true`/`false`면 그 값이다. NULL(옛 카드)이면 미션 소개 카드이고 커버 주소가 연결 미션의 `image_url`과 같을 때만 `true`, 그 밖은 `false`다.
- **표시 데이터(`toCardView`)**: 카드 행(서버 조회 결과)을 화면용 값 묶음으로 바꾼다. 카드 ID·활성 여부·노출 기간·정렬 순서·유저별 보유 여부 없이도 만들 수 있어서 홈 그리기와 어드민 미리보기가 같은 값으로 같은 카드를 그린다. 필수 값은 `shape`·`resource`(미션·드랍·레시피·배지·기사·랭킹·컬렉션·자동)·`title`이다. 템플릿 구분 값(`template`)은 `toCardView`가 계측 정보와 별개로 늘 싣는 선택 값이며, 자원 `auto`에서 진행 알림과 지역 트렌드를 가른다(아이콘 선택). 계측 정보(카드 ID·유형 ID·템플릿·그려진 모양)는 `tracking` 하나에 묶고, 이 값이 없으면 그리는 쪽이 트래커와 링크를 그리지 않는다. 필수 정보 줄(`buildFacts`)은 자원별로 최대 2줄이고 값이 없는 줄은 생략한다. 자원의 종료가 7일 이내면 「N일 남음」(내림), 24시간 이내면 「N시간 남음」(올림)이 기간 줄을 대신한다. 날짜는 KST 기준이다. `list`는 타일형이면 `tiles`(이름·그림 주소·보유 여부), 랭킹 행형이면 `ranking`(순위 조회 결과)을 싣는다. `brief`에는 64px 칸에 그릴 배지 그림이 선택 값(`thumbnailUrl`)으로 있다 — JAM! 배지 카드에서 배지가 정확히 1개이고 그림이 있을 때만 싣고, 보유 여부(`earned`)가 `false`일 때만 `thumbnailDimmed`(흑백)가 함께 있다. 커버와 미션 이미지는 싣지 않는다(`imageUrl`은 「이미지가 있는 모양」 전용이다). **유저 정보가 없으면 컬러다**: 배지 그림(`brief` 썸네일·커버로 승격한 이미지·`list` 타일)은 보유 여부(`earned`)가 `false`일 때만 흑백이고 값이 없으면 컬러다. 홈 조회는 늘 `true`/`false`를 싣고 어드민 날짜 미리보기는 싣지 않는다.
- **조회**: `getTodayCards`가 표시 데이터에 필요한 값을 카드에 함께 싣는다 — `resolved_mission`(미션 소개 카드와 미션을 가리키는 자동 카드의 기간·보상·이미지), `resolved_collection`(컬렉션 소식 카드의 이름·아이템 수). 미션 행은 노출 판정과 같은 읽기를 쓰고 컬렉션은 카드 수와 상관없이 한 번에 읽는다. 미션의 보상 배지 개수(`reward_badge_count`)에는 숨김 배지(`badges.is_hidden`)를 넣지 않는다 — 숨김 배지는 받기 전에 존재와 개수를 알리지 않는다(운영 로직 10.3절, 티켓 20261019_1313 2회). 보상 배지가 있는 미션이 있을 때만 배지를 한 번 더 읽고, 숨김 여부를 읽지 못하면 개수를 싣지 않는다. 컬렉션은 공개된 것(활성이고 공개 시각이 비었거나 지금 이전)만 싣는다 — 컬렉션 화면·목록 API와 같은 판정(`applyLaunchedItemBookFilter`)이라, 비활성이거나 공개 전인 컬렉션은 카드는 남고 `resolved_collection`이 NULL이라 이름·아이템 수가 보이지 않는다(종료 시각은 보지 않는다). 기존 반환 필드는 그대로다. 어드민 날짜 미리보기 조회(`getAdminTodayPreviewCards`)도 같은 판정 함수로 두 값을 싣는다(노출 개인화와 미션 참가 필터는 하지 않는다). 컬렉션 공개 판정과 「N일 남음」 계산의 기준 시각(`previewBaseTime`)은 선택한 날짜가 오늘(KST)이면 지금, 아니면 그 날짜의 00:00(KST)이다.
- **레시피 공개 카드(`recipe_reveal`)**: 믹스 레시피가 공개되는 것을 홈에서 알린다. 자원은 `recipe`(아이콘 플라스크)이고 칩 줄 라벨은 「레시피 공개」, 누르면 공개 전·뒤 모두 `/combine`이다(운영자가 지정한 이동 경로(`target_href`)가 있으면 그쪽이 우선이다. 어드민 폼과 운영툴 카드 변환이 이 칸을 받는다, 티켓 20261006_1218). `getTodayCards`가 `recipe_id`로 레시피와 슬롯을 한 번에 읽어 `resolved_recipe`를 싣는다(레시피 공개 카드가 없으면 읽지 않는다). 공개 상태는 믹스 화면과 같은 판정 하나(`recipeReleaseState`)로 가른다.
  - **공개 전**(`valid_from`이 아직 오지 않았거나 해석할 수 없는 값): 카드 뷰에는 **재료 수(슬롯 수)와 공개일 두 값뿐**이다 — 필수 정보는 「재료 4개」·「공개 10월 12일」(KST)이고, 레시피 이름·슬롯 후보·보상은 서버가 읽고도 싣지 않는다(공개 전 레시피는 일반 유저에게 없는 레시피와 같다). 타일이 0개라 `list`로 저장된 카드도 `brief`로 그려진다(64px 칸에 플라스크). 운영자가 `poster`를 골라 커버를 올리면 같은 두 줄이 막 위 `--snow` 글자다(예고용 커버는 운영자가 만든다). 공개일을 읽을 수 없으면 공개일 줄만 생략한다. 「곧 공개」 표식·카운트다운·자물쇠·흐린 타일은 없다.
  - **공개 뒤**(`valid_from`이 지났고 `valid_until`이 비었거나 아직): `list`는 위 「재료 타일」을 그리고 필수 정보는 「재료 4개」·「보상 300 포인트 · 배지 1개」다(공개일은 이미 지나 정보가 되지 않아 보상 줄로 바뀐다, 보상이 0이면 그 줄만 생략). 보유 판정은 배지 소개 카드와 같은 3원 판정(`fetchBadgesById`: 활동·체크인·인벤토리 아이템)이고, 후보 배지는 공개된 레시피 것만 같은 조회에 합친다. `poster`·`hero`·`square`를 고른 카드는 타일 줄 없이 같은 정보 줄만 보인다 — 공개 예고 `poster`를 공개 뒤에도 두면 타일이 나오지 않으므로 운영 패턴은 「예고 `poster` 카드 → 공개 시각에 시작하는 `list` 카드」 두 장이다.
  - **레시피 줄 없음**: `recipe_id`가 비었거나 레시피가 없거나 끝났거나(`valid_until` 이후) 조회가 실패하면 정보 줄·타일 없이 `brief`로 그린다. 조회 실패는 `console.error` 뒤 이렇게 그리고 홈을 막지 않는다. 공개 시각이 지나도 실시간으로 바뀌지 않는다 — 페이지를 새로 불러올 때 `brief`가 `list`로 바뀐다.
  - **처음 보는 템플릿 값**: 이 코드가 모르는 템플릿 값이 DB에 먼저 들어와도 홈은 오류 화면이 되지 않는다. 그 카드는 자원 아이콘·칩 라벨·필수 정보 줄 없이 제목만 그려지고(64px 칸은 빈 채 남아 높이를 지킨다, 칩이 하나도 없으면 칩 줄 자리 여백도 없다), 어드민 상세·폼은 빈 입력 칸 목록으로 열린다.
- **어드민 미리보기**: 날짜 미리보기 모달과 카드 폼의 「홈 화면 미리보기」는 `TodayCardStack`이 아니라 표시 데이터(`toCardView`, `tracking` 없음)와 새 틀(`TodayCard`)로 그린다. 전환 상수와 무관하게 늘 새 모양이라 `shape`가 NULL인 옛 카드도 `resolveShape` 대응표대로 새 모양으로 보인다. 공용 목록 컴포넌트 `TodayCardPreview`가 표시 데이터 배열만 받아 홈 캔버스와 같은 `bg-surface` 판 위에 카드 사이 16px 간격으로 쌓는다(카드 행·DB를 모른다).
  - **기기 폭 전환**: 「360」·「430」 두 값이고 기본은 360이다. 카드 폭은 기기 폭에서 홈 본문의 좌우 여백(16px씩)을 뺀 328px(360)·398px(430)이다. 판이 카드 폭보다 좁으면 카드를 줄이지 않고 판이 가로로 스크롤된다.
  - **기준 시각**: 위 조회 항목의 `previewBaseTime`이다. 모달이 표시 데이터를 만들 때(`toCardView`의 `now`)와 서버가 컬렉션 공개를 판정할 때 같은 규칙을 쓴다.
  - **날짜 미리보기의 값**: 미션 기간·보상과 컬렉션 이름·아이템 수를 싣는다. 배지는 보유 여부를 싣지 않아 그림이 컬러다. 활성 상태와 노출 기간만 반영하고 노출 개인화는 하지 않는 단순화는 그대로다.
  - **카드 폼 미리보기의 한계**: 폼은 미션·컬렉션 값을 따로 읽지 않는다(조회 없음). 그래서 미션 기간·보상, 컬렉션 이름·아이템 수 줄은 생략되고 폼이 가진 값(드랍 지역, 배지가 1개일 때 그 이름)만 필수 정보로 보인다. 이 두 값은 저장 뒤 날짜 미리보기에서 확인한다.

근거: `jam-web/src/lib/today/shape.ts`, `jam-web/src/lib/today/cardView.ts`, `jam-web/src/lib/today/cards.ts`, `jam-web/src/components/today/`(`TodayCard.tsx`·`CardFrame.tsx`·`BriefCard.tsx`·`HeroCard.tsx`·`PosterCard.tsx`·`SquareCard.tsx`·`ListCard.tsx`·`CardBody.tsx`·`CardThumb.tsx`·`CardImageSlot.tsx`·`CardChipRow.tsx`·`resourceIcon.ts`), `jam-web/src/components/ranking/RankingListRow.tsx`, `jam-web/src/app/(main)/TodayCardStack.tsx`, `jam-web/src/lib/itembook/visibility.ts`, `jam-web/src/app/admin/today/TodayCardPreview.tsx`, `jam-web/src/lib/admin/todayPreview.ts`, `jam-web/src/lib/admin/today-calendar.ts`, `jam-web/supabase/migrations/206_today_cards_shape_and_events_card_shape.sql`, 티켓 20261001_1357·20261001_1458·20261001_1737·20261001_2013·20261001_2104·20261001_2208

## 7. 이동 목적지

카드를 누르면 가는 곳은 **유형 ID가 아니라 템플릿과 대상 필드**로 정해진다. 기사(`editorial_article`)는 항상 기사 상세로 가고, 그 밖의 템플릿은 `target_href`가 있으면 그 값, 없으면 템플릿 규칙을 따른다. 트라이브를 보여 주는 화면은 없다.

근거: `jam-web/src/lib/today/targetHref.ts`(`resolveTargetHref`·`resolveArticleCtaTarget`)

<!-- BEGIN generated: destinations -->
카드 자신의 이동 경로(피드에서 카드를 눌렀을 때 이동하는 곳, `resolveTargetHref`) — 템플릿별 대표 입력:

| 템플릿 | 입력 | 결과 href |
|---|---|---|
| `badge_spotlight` | 배지 0개 | `/badges` |
| `badge_spotlight` | 배지 1개 | `/badges/{id}` |
| `badge_spotlight` | 배지 여러 개 | `/badges` |
| `badge_spotlight` | target_href 명시 | `{target_href}` |
| `location_trend` | 배지 0개 | `/badges` |
| `location_trend` | 배지 1개 | `/badges/{id}` |
| `location_trend` | 배지 여러 개 | `/badges` |
| `location_trend` | target_href 명시 | `{target_href}` |
| `progress_nudge` | 배지 0개 · 미션 없음 | `/badges` |
| `progress_nudge` | 배지 0개 · 미션 있음 | `/missions/{id}` |
| `progress_nudge` | 배지 1개 이상(미션 유무와 무관, 배지 우선) | `/badges/{id}` |
| `progress_nudge` | target_href 명시 | `{target_href}` |
| `mission_spotlight` | 미션 없음 | `/missions` |
| `mission_spotlight` | 미션 있음 | `/missions/{id}` |
| `mission_spotlight` | target_href 명시 | `{target_href}` |
| `itembook_milestone` | 컬렉션 없음 | `/collections` |
| `itembook_milestone` | 컬렉션 있음 | `/collections/{id}` |
| `itembook_milestone` | target_href 명시 | `{target_href}` |
| `drop_alert` | 입력과 무관(고정) | `/drops` |
| `recipe_reveal` | 레시피 유무와 무관(공개 전·후 같다, 레시피별 주소는 없다) | `/combine` |
| `recipe_reveal` | target_href 명시 | `{target_href}` |
| `ranking_board` | 미션 참가자 대상 맥락 있음 | `/missions/{id}/status` |
| `ranking_board` | 미션 참가자 대상 맥락 없음(수동 지정 유저 대상) | `/missions` |
| `ranking_board` | target_href 명시 | `{target_href}` |
| `editorial_article` | 입력과 무관(카드 자신의 id로 고정, target_href·미션·컬렉션 입력은 무시) | `/today/{id}` |

기사 본문 CTA 버튼의 목적지(`editorial_article` 전용, `resolveArticleCtaTarget`) — 우선순위:

| 조건 | href | kind |
|---|---|---|
| target_href 명시 | `{target_href}` | `direct` |
| target_href 없음 · 컬렉션 있음 | `/collections/{id}` | `collection` |
| target_href·컬렉션 없음 · 미션 있음 | `/missions/{id}` | `mission` |
| 셋 다 없음 | (CTA 없음) | - |
<!-- END generated: destinations -->

## 8. 기사 상세

`/today/[cardId]`는 `editorial_article` 카드만 연다. 카드가 활성이고 지금이 노출 기간 안일 때만 보이며, 그 밖(예약 발행 전·종료 뒤·비활성·다른 템플릿)은 404다.

- 상단에 서비스 TopNav(제목 「투데이」, 뒤로 `/`, 동기화·알림·아바타)가 있고, 그 바로 아래에 `cover_image_url` 커버를 16:9로 그린다(우선 로드, `alt`는 빈 값 — 바로 아래 제목이 글자로 보인다). 비어 있으면 16:9 칸 없이 본문부터 보인다. 커버 주소가 있는데 로드에 실패하면 칸이 사라진다. 「← 투데이로」 링크는 없다(TopNav의 뒤로가기가 대신한다).
- 칩은 MODULAR `LabelChip`의 반전 색조(`tone="inverse"`, 크림 바탕 위 어두운 칩)이고 칩·제목·부제·게재일·본문·CTA 순서로 보인다. 게재일은 「2026년 10월 5일」(연도 유지)이고, 게재일·부제·「본문이 없어요」의 옅은 글자는 `text-muted`(크림 바탕 위 5.47:1)이고, CTA 알약은 어두운 반전 면(`--background-inverse`) 위 `--snow` 글자다.
- **본문(`body_markdown`)은 마크다운으로 렌더되지 않는다.** 빈 줄로 문단을 나누고 문단 안 줄바꿈은 그대로 보인다. `**`·`#`·`-` 같은 문법은 글자 그대로 나온다.
- 본문 끝 CTA 버튼은 1개이며 우선순위는 §7의 두 번째 표다. 라벨은 직접 링크 「자세히 보기」, 컬렉션 「컬렉션 보기」, 미션 「미션 보기」다. 대상이 모두 없으면 버튼을 그리지 않는다.
- 기사 화면과 CTA 버튼에는 계측이 없다(§9).
- **표시 데이터**: 본문(커버~CTA, TopNav 제외)은 표시 데이터(`ArticleView`: 제목·라벨·부제·커버 주소·게재일·문단 배열·CTA)만 받는 컴포넌트가 그리고, 카드 행을 그 값으로 바꾸는 일은 순수 함수 `toArticleView`가 한다(문단 나누기와 CTA 우선순위·라벨이 이 함수 안에 있다). 운영툴 미리보기(티켓 20261001_1501)가 같은 함수로 같은 화면을 그린다. 미리보기용 옵션(`linkless`)을 주면 CTA의 링크만 빠지고, 이때 CTA는 링크가 아닌 같은 모양의 정적 필로 그려진다(대상이 없어 CTA 자체가 없는 것과는 다른 상태다).

근거: `jam-web/src/app/(main)/today/[cardId]/page.tsx`, `jam-web/src/components/today/ArticleView.tsx`, `jam-web/src/lib/today/articleView.ts`(`toArticleView`), `jam-web/src/lib/today/cards.ts`(`getPublishedArticleCard`), `jam-web/src/components/ui/TopNav.tsx`, 문구 `jam-web/src/lib/i18n/ko.ts`(`todayCard.ctaView*`), 티켓 20261001_1737

## 9. 계측

| 이벤트 | 언제 | 어디로 |
|---|---|---|
| `impression` | 카드가 화면에 50% 이상 보였을 때. 같은 브라우저 세션에서 카드당 1회(`sessionStorage`) | `POST /api/today/events` |
| `click` | 카드를 눌렀을 때. `ranking_list`와 랭킹 행형 `list`는 세지 않는다(노출만) | `POST /api/today/events` + GA 이벤트 `today_card_click`(`card_id`·`content_type_id`·`template_type`·`shape`) |

- 전송은 `navigator.sendBeacon`을 먼저 쓰고, 안 되면 `fetch(keepalive)`로 보낸다. 실패는 조용히 무시한다.
- 서버는 로그인 세션이 있어야 받고, 유저별 분당 60건을 넘으면 429다. 카드가 존재하고 활성이며 노출 기간 안일 때만 기록한다(아니면 400). `followup` 이벤트는 400으로 거부한다.
- 저장(`today_card_events`)에는 카드 ID·기록 시점 유형 ID·기록 시점에 그려진 모양(`card_shape`)·기록 시점 카드의 패턴 번호(`pattern_no`)·이벤트 종류만 남고 **유저 식별자는 없다.** 패턴 번호는 노출 검증이 카드를 조회할 때 함께 읽은 카드의 `pattern_no`를 그대로 복사한 값이다(카드를 다시 조회하지 않고, 형식을 다시 검사하지 않는다). 패턴이 없는 카드(어드민에서 직접 만든 카드)와 패턴 열 도입 전 기록은 NULL이다(옛 기록을 채우지 않는다, 티켓 20261008_1059). 유저 ID는 빈도 제한 판정에만 인스턴스 메모리에서 쓴다.
- 그려진 모양은 노출 검증이 카드를 조회할 때 함께 읽은 값(`shape`·`template_type`·`layout_type`·`cover_image_url`·`badge_ids`)으로 정한다(카드는 한 번만 조회). 저장된 `shape`가 있으면 그 모양이고, 배지가 없는 타일형 `list`는 화면처럼 `brief`로 기록한다. `shape`가 없는 옛 카드는 전환 상수(`LEGACY_SHAPE_CUTOVER`)가 켜져 있어 옛 값 대응표(`resolveShape`)의 모양으로 기록한다 — 전환 전에 쌓인 기록의 `card_shape`는 NULL로 남는다.
- **기록 모양 = 화면 모양**: 같은 카드 행이면 기록 모양(`events.ts`)과 홈이 그리는 모양(`toCardView`)이 같다. 두 경로가 같은 입력(`badge_ids` 유무)으로 판정하기 때문이다(옛 레이아웃 6종 × 커버 유무 × 배지 0개·그림 있는 배지·그림 없는 배지를 테스트가 전부 맞춘다). **허용 차이 하나**: `badge_ids`가 있지만 그 배지가 전부 삭제된 타일형 `list`는 화면이 조회된 배지가 없어 `brief`로 그리고 기록은 `badge_ids`가 있어 `list`다 — 이벤트 경로에 배지 조회를 더하지 않으려는 대가이고 어드민이 삭제된 배지를 카드에 남겨 둔 드문 경우에만 생긴다. 레시피 공개 카드(`recipe_reveal`)는 타일이 카드의 배지가 아니라 레시피 슬롯에서 나오므로 계측이 카드의 `recipe_id`로 레시피 행(`valid_from`·`valid_until`)을 한 번 더 읽어 공개 상태로 타일 수를 정한다(모양을 먼저 정하고 타일 수가 판정에 쓰이는 `list`일 때만 읽는다 — 모양이 NULL이거나 `list`가 아니면 읽지 않는다, 티켓 20261006_1344) — 공개 중이면 `list`(타일 있음), 공개 전·끝남·레시피 없음·`recipe_id` 비어 있음·읽기 실패는 `brief`이고 화면과 같다(티켓 20261006_1218). 같은 허용 차이가 여기에도 하나 있다: 공개 뒤 레시피의 후보 배지가 전부 삭제돼 타일이 0개면 화면은 `brief`, 기록은 `list`다(`shapeParity.test.ts`가 명시 케이스로 고정한다). 전환 상수 `LEGACY_SHAPE_CUTOVER`는 기록 모양에만 작용한다. 상수를 끄면 `shape`가 없는 옛 카드의 기록 모양이 NULL이 되어 화면 모양(늘 `resolveShape`)과 어긋난다(상수 제거는 티켓 20261001_2325).
- GA `today_card_click`의 `shape`는 그 카드가 화면에 그려진 모양이다. 카드 틀(`CardFrame`)이 표시 데이터의 `tracking.shape`를 넘긴다. 기존 세 파라미터의 이름과 값은 그대로다. `/api/today/events`는 모양을 받지 않고 서버가 카드를 조회해 정한다.
- 집계: `GET /api/admin/today/metrics?from=&to=`(기본 최근 7일, 어드민 읽기 토큰 허용)가 유형 ID별 노출·열람 수와 열람률(`types`)을 돌려주고, 그려진 모양별 노출·열람·후속 건수와 열람률(`byShape`)을 함께 돌려준다. `card_shape`가 NULL인 기록(모양 도입 전 기록, 전환 전 옛 카드)은 `byShape`에서 `unknown`으로 묶는다. 패턴 번호별 노출·열람·후속 건수와 열람률(`byPattern`)도 함께 돌려준다 — 패턴 번호 숫자 순이고, `pattern_no`가 NULL인 기록은 `patternNo: null` 한 줄로 묶어 맨 끝에 둔다(`unknown` 문자열을 쓰지 않는다. 결정 기록 API의 `byPattern`과 같은 모양). `range`·`types`·`byShape`의 이름·값·순서는 그대로다.
- 기사 상세 화면·CTA 버튼·오늘의 현황 스트립은 이 계측 대상이 아니다.
- 어드민 투데이의 미리보기(날짜 미리보기 모달, 카드 폼의 「홈 화면 미리보기」)는 계측 대상이 아니다. 미리보기는 표시 데이터에 계측 정보(`tracking`)를 싣지 않고 새 틀(`TodayCard`)로 그려서 `TodayCardTracker`와 카드 링크(랭킹 카드는 순위 행 링크 포함)가 없고, 노출·클릭 요청과 GA 이벤트가 나가지 않으며 눌러도 이동하지 않는다. 홈은 `tracking`을 싣고 그려 계측이 그대로 동작한다. 예전에 어드민이 쓰던 `TodayCardStack`의 `preview` prop은 조각 b7(티켓 20261001_2244)이 지웠다.

근거: `jam-web/src/components/today/TodayCardTracker.tsx`, `jam-web/src/lib/today/cardEventClient.ts`(`todayCardClickParams`)·`events.ts`, `jam-web/src/app/api/today/events/route.ts`, `jam-web/src/app/api/admin/today/metrics/route.ts`

## 10. 데이터

| 테이블 | 쓰임 |
|---|---|
| `today_cards` | 카드 한 장 = 한 행. 제목·부제·게재용 설명문(`description`)·템플릿·레이아웃·노출 태그·노출 기간·활성 여부·정렬·대상 필드(`badge_ids`·`mission_id`·`item_book_id`·`ranking_mode_id`·`region_label`·`target_href`)·기사 본문·커버·유형 ID·이미지 제작 경로(`image_source`)·카드 모양(`shape`)·이미지 안 제목 여부(`title_in_image`). 두 칸은 NULL 허용이고 NULL이면 옛 카드라 규칙으로 판정한다(판정 규칙은 §6의 「카드 모양 판정」) |
| `today_card_events` | 노출·열람 기록(§9). 기록 시점에 그려진 모양을 `card_shape`로 복사한다(NULL 허용 — 모양 도입 전 기록과 전환 전에 기록된 옛 카드만 NULL이고, 전환 뒤에는 옛 카드도 옛 값 대응표의 모양으로 기록한다). 유저 식별자 없음 |
| `external_input_daily` | 날씨·특일 하루 값(§4) |

컬럼의 정확한 정의는 [02_DATA_MODEL.md](../02_DATA_MODEL.md)와 `jam-web/src/types/database.generated.ts`가 정본이다. 카드는 어드민 `/admin/today` 화면, 주간 편성 시드 SQL, 에셋 제너레이터 등록 스크립트 세 경로로 만들어지며 `image_source`로 구분된다(§11).

## 11. 운영 규칙 위치

이 문서는 화면 동작만 정의한다. 아래 규칙은 해당 문서가 정본이다. 편성·승인·등록은 1504 전환 뒤 [ops-tool/PRD.md](../ops-tool/PRD.md)로 옮겨 간다.

| 주제 | 정본 |
|---|---|
| 유형 카탈로그 17종·편성 규칙(요일별 전원 큰 카드, 미션 카드는 미션 대표 이미지)·주간 주기·승인·등록·전략 변경안·유형 리뷰 | [content-automation/PRD.md](../content-automation/PRD.md) §6·§8·§8-1·§8-2·§10·§11 |
| 코퍼스(세계관·컬렉션·배지 원문) 조회 API와 자동 선택 | [content-automation/PRD.md](../content-automation/PRD.md) §4 |
| 이미지가 필요한 카드의 등록 묶음·검사(미션 카드 레이아웃, 이미지 글자 수) | [asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md](../asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md) |
| 어드민 주간 달력의 카드 편성 표시 | [admin-ui/ADMIN_PRD.md](../admin-ui/ADMIN_PRD.md) |
| 윤진의 주간 편성 루틴 | `.claude/skills/jam-story/references/marketer-home-feed.md`·`marketer-assets.md`(윤진 ⑥·⑧), `.claude/skills/jam-work/references/scheduled-jobs.md` 「주간」 |

## 12. 이 문서를 최신으로 유지하는 방법

- **생성 구간**(§4~§7의 표): `node scripts/gen-home-feed-doc.mjs`가 `today-sections.ts`·`targetHref.ts`·`shape.ts`에서 다시 만든다(§6의 모양 목록과 옛 값 → 새 모양 대응표는 `shape.ts`의 `CARD_SHAPES`·`resolveShape`를 돌린 결과다). `--check`는 `scripts/verify.sh`와 pre-commit에서 돌며, 코드와 다르면 실패한다.
- **동기화 검사**: frontmatter `code:`의 경로 아래 파일을 바꾸는 커밋은 이 문서도 함께 스테이지해야 pre-commit을 통과한다(`gen-home-feed-doc.mjs --staged`). 테스트 파일(`__tests__/`·`*.test.*`)만 바뀐 커밋은 제외다. 동작이 바뀌지 않은 변경(리팩터링 등)은 `JAM_SKIP_DOCLINT=1`로 우회하고 사유를 커밋 메시지에 남긴다.
- 머지 커밋은 pre-commit을 거치지 않는다. 브랜치를 합친 뒤에는 `--check`를 한 번 돌린다.
- 서술(생성 구간 밖)은 사람이 고친다. 서술에 새 사실을 적을 때는 근거 파일을 절 끝에 함께 적는다.

근거: `scripts/gen-home-feed-doc.mjs`, `.githooks/pre-commit`, `scripts/verify.sh`, 티켓 20260927_2036

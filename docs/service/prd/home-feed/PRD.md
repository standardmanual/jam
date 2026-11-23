---
type: prd
status: active
description: "홈피드(홈 「투데이」) 화면 구성·카드 노출 규칙·노출 태그·템플릿·카드 유형·이동 목적지·기사 상세·계측을 코드 기준으로 정의하는 정본이다."
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
| 1 | 상단 바 | 공통 `TopNav`(로고). 홈만 «동기화» 글자 알약을 가운데 슬롯에 둔다(`syncStyle="pill"`). 홈 밖 화면은 같은 동작을 알림 종 왼쪽의 아이콘 서클로 보인다(사용자 지시 2026-11-14, 티켓 20261114_1349) |
| 2 | 이용 정지 배너 | 이용 정지 중인 유저에게만(전체 폭). 정지가 아니거나 조회가 실패하면 DOM에 없다. 아래 설명 |
| 2-1 | 캡슐 막힘 카드 | 캡슐이 가득 차고 인벤토리 빈칸이 필요 칸수보다 적은 유저에게만(인사말 줄 아래 캡슐 위젯 자리에서 일반 게이지를 대신한다). 막히지 않았거나 이용 정지 중이거나 조회가 실패하면 카드가 없고 일반 게이지(숫자)만 보인다. 아래 설명 |
| 3 | 인사말 + 검색 | 「{이름}」 인사 한 줄과 검색 아이콘(→ `/search`) |
| 4 | 캡슐 | 어두운 트랙·오렌지 채움 게이지 한 줄과 조건부 안내 영역. 챕터 번호는 홈에 없다(2026-10-31). 인사말 바로 아래다(2026-11-04). 시트는 없다. 아래 설명 |
| 5 | Strava 동기화 끊김 카드 | 토큰 갱신 실패·Strava 철회로 끊긴 유저에게만(전체 폭). 정상 연결·미연동·유저가 직접 끊은 경우·조회 실패에는 DOM에 없다. 아래 표 |
| 6 | 오늘의 현황 스트립 | 2칸. 왼쪽 「진행」, 오른쪽 「팔로잉」(아래 표) |
| 7 | 투데이 카드 스택 | 제목·부제 없이 카드만 쌓는다(제목 「투데이」·부제 「오늘의 소식」은 2026-11-04에 뺐다). 노출할 카드가 0장이면 영역 전체를 그리지 않는다 |

**이용 정지 배너**(티켓 20261017_1426)는 `user_suspensions`에 진행 중인 정지(`lifted_at` 없음)가 있는 유저의 홈 맨 위(상단 바 바로 아래, 인사말 줄 위)에 그린다.
흰 카드에 칩 「이용 정지」와 제목 「이용이 정지되었습니다.」를 한 줄로, 사유(운영자가 쓴 전문)·정지일을 «라벨 왼쪽 / 값 오른쪽» 두 줄로(사유가 비면 사유 줄만 뺀다), 정지 중 일어나는 일 안내 두 줄과 «정지를 풀고 싶다면 문의로 알려 주세요.» 한 줄(2026-11-09, 티켓 20261109_1450. `d.suspension` 403 안내 12곳의 «해제 방법은 문의로 알려 드려요»와 같은 뜻), 작은(`size="xs"`, 온보딩 「건너뛰기」와 같은 크기) 검정 알약 「문의」(→ `/voc`, 가로 꽉 참) 순이다.
제목의 합쇼체·마침표는 해요체 규칙과 다르지만 사용자가 승인한 값이다(2026-11-09). 문의 버튼 문구는 서비스 전체가 쓰는 「문의하기」(`d.voc.inquireCta`)가 아니라 배너 전용 키(`d.suspension.bannerInquireCta`)다.
면 색·아이콘·애니메이션을 쓰지 않고, 정지 해제는 다음 홈 진입 때 반영된다. 정지 중에도 로그인, 프로필·배지·인벤토리·컬렉션 보기, 문의는 막지 않는다.
정지 조회가 실패하면 홈은 그대로 열고 배너만 뺀다. 동기화가 막혔을 때는 일반 실패가 아니라 «정지 중이라 안 된다»는 안내 토스트가 뜬다.

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/SuspensionBanner.tsx`, `jam-web/src/lib/suspension/home-banner.ts`, `jam-web/src/lib/strava/sync-flow.ts`(`suspended`), 문구 `jam-web/src/lib/i18n/ko.ts`(`suspension`)

**캡슐 막힘 카드**(티켓 20261105_1912, 사용자 시안 2026-11-05. 이전의 막힘 배너 티켓 20261105_0104·1439를 대체)는 `capsule_receive_blocked`가 막힘(캡슐 가득 + 인벤토리 빈칸 < 필요 칸수)으로 판정해 서버가 캡슐 상태에 `notice: 'blocked'`를 실은 유저의 홈 캡슐 위젯 자리(인사말 줄 아래)에 그린다. 별도 막힘 조회·배너는 없고 판정은 그 `notice` 하나다. 이용 정지 중에는 서버가 `notice: 'none'`을 주므로 카드가 아니라 일반 게이지만 보여 상시 배너는 최대 1개다.
위에는 원래 가로 폭 그대로인 오렌지로 가득 찬 캡슐 게이지(왼쪽 안쪽 「캡슐이 가득 찼어요」)가 있고, 그 바로 아래에 같은 폭의 어두운 반전 카드(`Card tone="inverse"`) 하나가 붙는다. 카드 윗부분은 게이지 높이의 절반만큼 게이지 뒤에 깔려 둘이 한 덩어리로 보이고, 게이지 곡선 아래 틈이 보이지 않도록 카드의 위 두 모서리는 각지다(radius 0, 아래 두 모서리는 둥글다). 카드 안 내용은 좌우로 카드 가장자리에서 14px, 위로 게이지 아래에서 7px, 아래로 카드 아래 가장자리에서 12px 떨어져 놓인다(2026-11-05 사용자 지정, 위아래가 넓어 보인다는 지적에 따라 이전 14px·25px의 절반으로 줄였다)(게이지는 카드 안에 들어가지 않는다, 2026-11-05 사용자 결정). 카드 안에는 두 줄 안내 「인벤토리가 가득 찼어요.」 / 「아이템 배지 n개를 받으려면 인벤토리를 비워주세요.」(왼쪽, n은 받지 못한 아이템 배지 수 = 캡슐 상태의 `pendingItemCount`, 0 이하이면 숫자 없이 「아이템 배지를 받으려면 인벤토리를 비워주세요.」, 2026-11-06 사용자 지정)와 홈 상단 「동기화」 버튼과 같은 가장 작은 크기(`xs`)의 밝은 알약 「인벤토리 가기」(오른쪽, → `/inventory`)가 한 줄로 놓인다. 버튼은 좁은 폭에서도 문구 오른쪽에 두고(2026-11-05 사용자 결정), 폭이 모자라면 안내 문구가 버튼 옆에서 줄을 꺾는다. 제목·경고 아이콘·칸수(k칸)는 없고 숫자는 둘째 줄의 배지 수 하나뿐이다. 면·테두리·글자에 붉은색을 쓰지 않고 닫기 버튼·카드 등장 애니메이션이 없다.
막힘이 있는 동안 게이지는 채운 양과 상관없이 가득 차고 문구가 채움 안쪽 왼쪽에 보인다(트랙 색 글자, 진입 모션을 기다리지 않고 바로 보임). 대기 보상이 모두 지급되면(어느 화면을 보고 있든 다음 읽기에서) 카드가 사라지고 게이지가 남은 잼 값으로 줄며 숫자가 보이고 문구는 사라진다. 스크린리더 이름은 「캡슐, 얻은 아이템 배지를 넣지 못해 잼을 얻을 수 없어요」다. 내 프로필의 위젯은 카드 없이 같은 규칙(가득 + 문구)의 게이지 아래에 빈칸 줄과 「인벤토리 보기」가 남는다.

근거: `jam-web/src/components/capsule/CapsuleBlockedCard.tsx`(카드), `jam-web/src/components/capsule/CapsuleWidget.tsx`(`blockedCard` 옵션), `jam-web/src/components/capsule/CapsuleGauge.tsx`(`message`가 있으면 가득), 문구 `jam-web/src/lib/i18n/ko.ts`(`capsule.blockedBanner`)

**Strava 동기화 끊김 카드**(티켓 20261017_1422)는 `strava_connections`의 연결 상태 판정(`resolveStravaUiState`) 결과로 그린다.
흰 카드에 칩 「Strava 동기화」와 제목(「동기화가 끊겼어요」)을 한 줄(가로)로 놓고, 그 아래 원인과 해결을 알리는 본문, 전체 폭의
작은(`size="xs"`) 검정 알약 버튼 「Strava 다시 동기화하기」(→ `/api/strava/auth`) 순이다. 작은 버튼은 사용자 결정이다(티켓 20261109_1419). 심각도는 면 색이 아니라 문구가 전달한다.

| 연결 상태 | 끊김 카드 | 진행도 칸의 「Strava 동기화하면 시작해요」 | 상단 메뉴 가운데 버튼(홈 밖에서는 같은 동작의 아이콘 서클, 글자는 접근성 이름으로만 남는다) |
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
| 진행 | Strava 미연동 또는 유저가 직접 끊음 | 「Strava 동기화하면 시작해요」 → `/api/strava/auth`. 오류로 끊긴 경우는 이 문구 대신 위 끊김 카드가 안내하고, 진행도는 남은 기록으로 그린다 |
| | 진행 중 컬렉션·미션 있음 | 완성도가 가장 높은 1건(동률이면 최근 활동순)의 이름과 진행 바. 진행 수(n/n)는 바 오른쪽에 작게 → 그 상세 |
| | 둘 다 없음 | 코드에 고정된 안내 후보 중 요청마다 무작위 1개(드랍·미션). 아이콘 없이 문구만 |
| 팔로잉 | 팔로잉 없음 | 검색 유도(아이콘 없이 문구만) → `/search` |
| | 팔로잉은 있으나 오늘 배지 획득 없음 | 칸을 그리지 않는다 |
| | 오늘 배지를 얻은 팔로잉 있음 | 인원 수. 정확히 1명이고 username을 알면 그 프로필, 그 외 `/feed` |

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/TodayStatusStrip.tsx`, `jam-web/src/lib/today/status.ts`, `jam-web/src/app/(main)/TodayCardStack.tsx`, 문구 `jam-web/src/lib/i18n/ko.ts`(`today.cardStackTitle`은 기사 상세 화면의 상단 바 제목에만 쓰고, 부제 `cardStackSubtitle`은 지웠다)

**캡슐 위젯**(티켓 20261018_0054, 20261028_1739 2회, 운영 로직 5.2절)은 인사말 줄 바로 아래에 `[게이지][안내 영역(조건부)]` 순서로 둔다(티켓 20261104_1710, 이전에는 오늘의 현황 스트립 아래였다). 챕터 글자는 두지 않고 홈은 `getMyChapter`를 부르지 않는다(티켓 20261031_1806). 게이지 바 안쪽 시작 부분에는 «캡슐» 이름표(12px 굵은 글자, 왼쪽 안쪽 12px)가 얹힌다 — 트랙 위에서는 밝은 글자, 채움 안쪽에서는 어두운 글자로 두 겹이고, 채운 비율이 50% 이상이면 숫자 앞에 같은 줄로 놓이며, 막힘 문구가 있으면 그리지 않는다(2026-11-13 사용자 지시, 티켓 20261113_1521). 채움이 시작하기 전(2% 원일 때)에는 이름표를 숨기고, 채움이 움직이기 시작하는 순간 숫자와 같이 240ms로 나타난다. 원 지름(28px)보다 이름표가 길어 원 밖으로 흰 글자 일부가 비치던 현상을 막는다(2026-11-15 사용자 지시, 티켓 20261115_1929). 게이지의 진입 모션(2%에서 지금 값까지 1.5초)은 트랙이 탭바 위쪽에서 절반 이상 보일 때 0.26초 쉬고 시작하며 한 방문에 한 번이다. 모션 줄이기에서는 바로 끝 값이다.
내 프로필에도 같은 위젯이 헤더 아래(숫자 줄 다음)에 한 번 놓이고(막힘이면 홈과 같은 막힘 카드가 게이지에 붙는다, 2026-11-05 사용자 요청), **타인이 보는 프로필에는 서버가 값을 내려주지 않아** DOM과 RSC 페이로드에 캡슐이 없다(클라이언트에서 숨기지 않는다).
내 프로필의 «가진 잼 {n}» 줄(티켓 20261026_1030)은 없어졌다(티켓 20261028_1739 3회). 프로필은 헤더의 표시 이름 위에 작은 글씨 «챕터 N»(`text-xs text-muted`, 챕터가 있을 때만)을 두고 챕터 막대는 없다. 헤더 아래 `[캡슐 게이지][안내 영역(조건부)]`는 바깥 간격 24로 이어진다(티켓 20261031_1806). 투데이에는 가진 잼을 두지 않는다.

게이지(`CapsuleGauge.tsx`)는 높이 36의 어두운 트랙(`--capsule-track`)과 오렌지 채움(`--capsule-fill`), 채움 끝에는 아무것도 얹지 않는다(알약 아이콘과 회전·갈라짐 모션은 2026-11-12 사용자 지시로 뺐다, 티켓 20261112_1944. 이전에는 번개 아이콘에서 알약 아이콘으로 바뀌어 있었다). 트랙 위에 있던 회색 점 4개(20·40·60·80%)는 2026-11-19 사용자 지시로 뺐다(티켓 20261119_1431). **눌러도 아무 일도 없고**(`role="img"`, 숫자 없는 aria-label) 퍼센트는 화면에 쓰지 않는다. 채운 양(`filled`)의 숫자 하나는 그린다(티켓 20261104_1640, 이전에는 숫자를 쓰지 않았다). 채운 비율(채운 양 ÷ 필요량)이 50% 미만이면 트랙 안쪽 오른쪽 끝에 오렌지(`--capsule-fill`) 글자, 50% 이상(50% 포함)이면 채움 안쪽 왼쪽에 트랙 색(`--capsule-track`) 글자로 둔다. 글자는 20px 굵은 숫자이고 가장자리와 14px 떨어지며, 트랙 가운데에 맞추려고 두 자리 모두 1px 위로 올린다(2026-11-04). 숫자는 채움이 움직이기 시작하는 순간 같이 나타나고(두 모션이 동시에 시작한다, 2026-11-04), 그때 transitions.dev Number pop-in(공유 `PopInNumber`: 각 자리가 블러와 함께 8px 아래에서 500ms 동안 들어오고 끝 두 자리가 70ms씩 뒤따른다)으로 한 번 나타난다(2026-11-04). 같은 화면에서 값이 바뀌면 새 값으로 옮겨 가기 시작할 때 다시 팝인하고, 모션 줄이기에서는 전환 없이 바로 보인다. 안쪽 숫자는 채움 끝 원 자리를 뺀 너비 안에서만 보인다. 홈과 내 프로필이 같은 컴포넌트를 쓰므로 두 화면이 함께 바뀐다.
화면에 들어올 때마다 한 번, 2%에서 시작해 260ms 쉰 뒤 1,500ms 동안 `filled / required`까지 차오른다(값이 0이면 모션 없음, 모션 줄이기를 켜면 즉시). 같은 화면에서 값이 바뀌면 지금 값에서 새 값으로 700~1500ms 동안 옮겨 간다.

| 상태 | 게이지 아래 안내 영역 |
|---|---|
| 채우는 중 | 없음 |
| 보류 있음(막히지 않음) | 안내 없음. 「받기」 버튼은 없다(대기 보상은 빈칸이 생기면 서버가 자동으로 지급한다, 티켓 20261105_0105) |
| 막힘(얻은 아이템 배지를 못 넣음) | 게이지는 가득 차고 채움 안쪽 왼쪽에 「캡슐이 가득 찼어요」. 홈과 내 프로필은 이 게이지에 막힘 카드(두 줄 안내 + 「인벤토리 가기」)를 붙이고 빈칸 줄은 그리지 않는다 |
| 이용 정지 | 없음(일반 게이지. 홈은 이용 정지 배너가 알린다) |
| 로딩 | 높이 36의 Skeleton |
| 조회 실패 | 상자 자체가 「다시 시도」 버튼 |

- 안내 문구는 서버가 정한 `notice` 값(`none`·`blocked`)으로 고른다. 막힘 판정은 DB 함수 `capsule_receive_blocked` 하나가 정하고 화면은 다시 따지지 않는다. 옛 안내 4종(보류·거의 참·잼 받을 수 없음·가득 찬 채 남음)은 막힘 하나로 합쳤다(티켓 20261105_0104).
- 「받기」 버튼과 `POST /api/capsule/claim`은 없다(티켓 20261105_0105 T5). 대기 보상은 인벤토리에 빈칸이 생기면 서버가 자동으로 지급하고(`settleAfterSlotsFreed`), 위젯은 지급 결과를 따로 연출하지 않는다. 막힘 안내는 홈의 막힘 카드와 프로필의 「인벤토리 보기」만 남는다.
- 보지 않은 결과(`capsule_unseen_results`)는 이 위젯도 레이아웃도 읽지 않는다. 합친 연출(전체 화면 오렌지 퍼짐, 문구 화면, 배지 보상 화면)은 티켓 20261106_1028에서 걷었다(사용자 결정 2026-11-06). 캡슐이 열려도 연출 없이 게이지가 지금 값까지 일반 채움 모션으로 차오르고, 열린 배지는 인벤토리에서 확인한다. 챕터가 올라도 전체 화면 카드는 뜨지 않는다(티켓 20261106_1104). 오름은 소식 화면의 «챕터 오름» 행과 프로필의 챕터 줄로만 보인다.
- 게이지의 원형이던 프로토타입(`app/spike/capsule-fill`)과 옛 채우기 패널(`JamFillPanel`)은 지웠다(티켓 20261028_1740 4회차). 서비스 화면에는 쓰이지 않던 파일이라 동작은 바뀌지 않는다.
- 서버 조회가 실패하면 투데이는 위젯을 그대로 그리고(초기값 없음), 위젯이 클라이언트에서 `GET /api/capsule`로 다시 가져온다.

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/[username]/page.tsx`, `jam-web/src/app/(main)/profile/ProfileClient.tsx`(`capsuleInitial`), `jam-web/src/components/capsule/`(`CapsuleGauge`·`CapsuleWidget`), `jam-web/src/app/(main)/layout.tsx`, `jam-web/src/lib/capsule/capsule-client.ts`·`capsule-flow.ts`·`capsule-gauge.ts`, `jam-web/src/components/BadgeRevealOverlay.tsx`(`resultMessage`·`locked`), 문구 `jam-web/src/lib/i18n/ko.ts`(`capsule`·`suspension`)

## 3. 카드 노출 규칙

요청마다 서버가 다음 순서로 카드를 고른다(`getTodayCards`).

1. 유저의 현재 태그를 계산한다(§4).
2. `today_cards`에서 `is_active = true`이고 `starts_at ≤ 지금 ≤ ends_at`이며 `exposure_tags`가 유저 태그와 **하나라도 겹치는**(OR) 카드를 읽는다. `all`은 모든 유저가 가지므로 `all`이 붙은 카드는 기간 안이면 모두에게 보인다.
3. 정렬은 두 묶음이다(티켓 20261102_1720). ① **새 카드**: 노출이 시작된 지 24시간이 안 된 카드(`지금 − starts_at < 24시간`)가 맨 앞에 오고 `starts_at` 내림차순이고, 같은 시각에 시작한 카드끼리는 아래 ②와 같은 씨앗 순서로 섞는다. ② **나머지**: 유저와 KST 날짜를 씨앗(`${유저ID}:${KST 날짜}`)으로 한 하루 단위 결정적 섞기다(`씨앗 + 카드 ID`의 FNV-1a 32비트 해시 순). 같은 유저는 하루 안에 새로고침해도 순서가 같고, 날짜가 바뀌거나 다른 유저가 보면 순서가 바뀐다. `sort_order`는 순서에 쓰지 않는다(같은 카드가 매일 맨 위에 고정되는 것을 없애기 위해). 키가 같을 때만 `sort_order` 오름차순, 그다음 카드 ID 순이라 입력 순서와 무관하게 결과가 같다.
4. `mission_spotlight` 카드 중 가리키는 미션이 이 유저에게 공개 상태가 아닌 것(어드민 수동 비노출, 이미 완료, 잠김·숨김)을 뺀다. 판정은 미션 목록·상세·참가 API와 같은 `isMissionExposed`·`resolveMissionVisibility`이며 `open`인 미션만 남는다. `mission_id`가 없는 미션 카드는 그대로 둔다. 같은 단계에서, 참가할 수 있는 트라이브가 정해진 미션을 가리키는 `ranking_board` 카드는 보는 유저가 대상 트라이브가 아니면 뺀다(`filterRankingBoardCardsByTribe`, 미션 목록에서 숨기는 규칙과 같다. 카드를 눌러 미션으로 가면 404가 나는 상황을 없앤다). 트라이브 접근을 읽지 못하면 미션 참가자 대상 랭킹 보드 카드를 내린다. 수동 지정 유저 대상과 허용 트라이브가 없는 공통 미션 카드는 그대로 둔다(티켓 20261019_1400).
5. 카드의 `badge_ids`를 배지 정보로 바꾸고, 유저가 그 배지를 **이미 가졌는지**(활동·미션·컬렉션 보상, 체크인, 인벤토리 세 곳)를 함께 붙인다. 삭제된 배지는 빠진다. 보유 조회가 실패해도 카드는 노출되고 그 배지가 미보유로 그려진다.
6. `ranking_board` 카드는 랭킹모드 순위를 미리 계산해 붙인다. 미션 참가자 대상 순위에서는 이용 정지 중인 유저를 뺀다(보는 유저 본인은 정지 중이어도 자기 화면에는 남고, 정지가 풀리면 다시 포함된다. 읽지 못하면 그 보드는 빈 순위다). 조건에 «기간 동안 모은 잼»이 든 미션은 모은 양이 홈 방문자 전원에게 드러나지 않도록 순위를 빈 결과로 돌려주고, 화면은 「아직 랭킹이 없어요」를 그린다(티켓 20261019_1400, 20261019_1445). 랭킹모드 행(`ranking_modes`)은 위 4번의 트라이브 거름과 이 순위 계산이 한 번만 읽어 나눠 쓴다. 읽지 못하면 카드는 그대로 두고 순위는 붙이지 않는다(티켓 20261019_1445 4회).
7. 카드마다 이동 경로를 계산한다(§7).

- 노출 수 상한은 없다. 조건에 맞는 카드는 모두 쌓인다.
- 조회가 실패하면 카드 0장(영역 숨김)으로 처리한다.
- 어드민 미리보기는 같은 규칙(`lib/today/cardSelection.ts`의 기간·태그 겹침·정렬 함수)을 쓴다. 2번과 3번을 바꾸면 이 파일도 함께 바꾼다. 미리보기의 섞기 씨앗은 가상 유저에 ID가 없어 `preview:{고른 날짜}`이고 «지금»은 그날의 기준 시각이라, 순서는 날짜마다 달라지고 실제 유저 한 명의 홈 순서와 같지는 않다. 미리보기의 날씨·특일 태그는 «오늘» 값이 아니라 고른 날짜에 저장된 값(`external_input_daily`)을 읽고, 저장된 값이 없는 날은 그 태그를 넣지 않는다(`lib/admin/homePreview/dayInputs.ts`, 티켓 20261026_2025). 승인 전 카드(묶음 항목)도 같은 함수와 같은 씨앗으로 정렬한다(승인하면 그대로 홈에 오르기 때문이다).

근거: `jam-web/src/lib/today/cardSelection.ts`(`cardIsLiveDuring`·`cardMatchesTags`·`sortHomeCards`), `jam-web/src/lib/today/cards.ts`(`getTodayCards`·`filterMissionSpotlightCards`·`filterRankingBoardCardsByTribe`·`fetchBadgesById`·`fetchRankingBoardData`), `jam-web/src/lib/ranking/rankingDataSource.ts`(`computeMissionParticipantsResult`)

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
| `chapter_1_3`·`chapter_4_6`·`chapter_7_9`·`chapter_10` | `user_chapters.chapter_no`가 그 구간(1~3·4~6·7~9·10, `CHAPTER_BANDS`). 챕터 행이 없거나 1~10 밖이면 붙지 않는다 |
| `capsule_full` | 캡슐 `filled >= required`(`required > 0`) — 열 수 있는 상태 |
| `capsule_nearly_full` | `filled / required >= 0.8`(`CAPSULE_NEARLY_FULL_RATIO`)이고 아직 안 참. 캡슐 행이 없으면 캡슐·잼 태그 모두 없다 |
| `jam_plenty` | 잼 잔액이 캡슐 필요량의 2배 이상(`JAM_PLENTY_MULTIPLE`). 지갑 행이 없는데 캡슐 행이 있으면 잔액 0으로 본다 |
| `jam_low` | 잼 잔액이 캡슐 필요량의 3분의 1 미만(`JAM_LOW_FRACTION`) |
| `inventory_full` | 남은 칸(`max_slots - used_slots`)이 0 이하 |
| `inventory_nearly_full` | 남은 칸이 1~3(`INVENTORY_LOW_FREE_SLOTS`, 밸런스 대시보드와 같은 값) |
| `tribe_<트라이브 ID>` | 유저의 소속 트라이브(`users.tribe_id`)가 있으면 그 ID로 만든 태그 1개(소문자 UUID, `tribe_` + ID). 온보딩 전이라 트라이브가 없으면 붙지 않는다. 값은 UUID라 읽기 어려워 운영 화면(카드 폼·표·상세)이 트라이브 이름으로 보인다. 홈피드 미리보기의 가상 유저도 고른 트라이브로 이 태그를 가진다. 허용 목록에 없고 **형식으로 검증**한다(`tribe_` + 소문자 UUID 전체 일치, `isTribeTag`) |

**JAM 2.0 태그(티켓 20261026_2030 1회차)**: 챕터·캡슐·잼·인벤토리 태그는 요청마다 4개 표를 읽어 계산한다. 한 유저는 챕터 구간 1개, 캡슐·잼·인벤토리 태그 각 0~1개를 가지고, 읽기 하나가 실패하면 로그만 남기고 그 태그만 빠진다. 경계값은 가정 값이며 `jam-web/src/lib/today/exposureThresholds.ts` 한 곳에 있다(오픈 뒤 실제 데이터로 맞춘다). 홈피드 미리보기의 가상 유저(`virtualViewer.ts`)는 개인 상태 태그를 넣지 않는 규칙이라 이 열 가지 태그(챕터·캡슐·잼·인벤토리)는 넣지 않는다. 소속 트라이브 태그만 가상 유저가 알 수 있는 조건이라 넣는다(아래 2회차 단락). 

**소속 트라이브 태그(티켓 20261026_2030 2회차)**: 트라이브 행은 JAM 2.0 오픈 때 운영 화면에서 새로 등록하고 켜기 때문에, 코드에 트라이브 목록이나 슬러그를 두지 않고 태그를 트라이브 ID에서 바로 만든다(`jam-web/src/lib/today/exposureTribe.ts`의 `tribeTagOf`·`isTribeTag`·`tribeIdOfTag`). 허용 태그 검증(운영 묶음 `opsInbox/validate.ts`, 등록 묶음 `registerChecks/homeFeedFields.ts`)은 선택지 목록의 값 **또는** 이 형식을 받는다. 홈 조회는 호출부가 `users.tribe_id`를 넘기면 다시 읽지 않고, 넘기지 않으면 한 번 읽는다. 읽기가 실패하면 그 태그만 빠진다. 가상 유저는 트라이브를 알 수 있는 조건이라 `virtualExposureTags`가 이 태그를 넣는다(개인 상태 태그와 다르다). 카드의 `tribe_id` 칸은 색 쌍을 고르는 용도 그대로이며 노출을 거르지 않는다.

**날씨·특일 입력**: 요청 때 외부 API를 부르지 않는다. Vercel 크론 `/api/cron/external-inputs`가 매일 06:00 KST(`jam-web/vercel.json`의 `0 21 * * *` UTC)에 기상청 단기예보(서울 격자 60·127)와 특일정보를 받아 `external_input_daily`에 저장하고, 홈은 그 저장값만 읽는다. 날씨 구분은 오늘 예보에 강수가 있으면 `rain`, 없고 최고 33°C 이상 또는 최저 -12°C 이하면 `extreme`, 하늘 맑음이면 `clear`, 그 밖은 `mild`다. **저장값이 없거나 읽기에 실패하면 해당 태그만 조용히 빠진다**(홈이 깨지지는 않는다). 그래서 날씨·특일 태그만 단 카드는 저장이 실패한 날 아무에게도 보이지 않는다 — 요일마다 `all` 카드를 두는 운영 규칙의 이유다(content-automation PRD §8).

근거: `jam-web/src/lib/today/exposure.ts`, `jam-web/src/lib/today/exposureThresholds.ts`, `jam-web/src/lib/today/exposureTribe.ts`, `jam-web/src/lib/inputs/weather.ts`·`holidays.ts`·`special-days-config.ts`·`daily-store.ts`, `jam-web/src/app/api/cron/external-inputs/route.ts`

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
| `chapter_1_3` | chapter_1_3 (챕터 1~3) |
| `chapter_4_6` | chapter_4_6 (챕터 4~6) |
| `chapter_7_9` | chapter_7_9 (챕터 7~9) |
| `chapter_10` | chapter_10 (챕터 10) |
| `capsule_full` | capsule_full (캡슐이 가득 참) |
| `capsule_nearly_full` | capsule_nearly_full (캡슐 80% 이상 참) |
| `jam_plenty` | jam_plenty (잼이 캡슐 필요량의 2배 이상) |
| `jam_low` | jam_low (잼이 캡슐 필요량의 3분의 1 미만) |
| `inventory_full` | inventory_full (인벤토리 가득 참) |
| `inventory_nearly_full` | inventory_nearly_full (인벤토리 남은 칸 1~3) |
<!-- END generated: exposure-tags -->

## 5. 템플릿

템플릿은 카드가 **무엇을** 소개하는지(대상 필드와 이동 경로)를 정한다. 템플릿이 쓰지 않는 참조 필드는 폼이 저장할 때 비운다. 카드의 유형 ID(`content_type_id`, T01~T17)는 템플릿과 무관하게 붙는 운영 분류이며 화면 동작에는 쓰이지 않는다(계측 집계용, §9).

근거: `jam-web/src/lib/admin/today-sections.ts`

템플릿 값·라벨·참조 필드(`TODAY_TEMPLATE_OPTIONS`·`TODAY_FIELDS_FOR`):

<!-- BEGIN generated: templates -->
| 값 | 라벨 | 입력 필드 |
|---|---|---|
| `badge_spotlight` | 배지 소개 (badge_spotlight) | 설명문·배지·이동경로(target_href) |
| `progress_nudge` | 진행 알림 (progress_nudge) | 배지·미션·이동경로(target_href) |
| `mission_spotlight` | 미션 소개 (mission_spotlight) | 미션·이동경로(target_href) |
| `itembook_milestone` | 컬렉션 소식 (itembook_milestone) | 컬렉션·이동경로(target_href) |
| `location_trend` | 지역 트렌드 (location_trend) | 배지·지역·이동경로(target_href) |
| `drop_alert` | 드랍 유도 (drop_alert) | 없음 |
| `editorial_article` | 에디토리얼 기사 (editorial_article) | 본문·미션·컬렉션·이동경로(target_href) |
| `ranking_board` | 랭킹보드 (ranking_board) | 랭킹모드·이동경로(target_href) |
| `recipe_reveal` | 레시피 공개 (recipe_reveal) | 레시피·이동경로(target_href) |
| `content_intro` | 컨텐츠 소개 (content_intro) | 설명문·이동경로(target_href) |
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

> **옛 7모양(`hero`·`poster`·`square`·`brief`·`list`·`dome`·`ticket`)은 삭제됐다**(티켓 20261122_1100, 서비스 홈 8회차-1, 어드민 8-2, 운영툴 8-3, 코드 상수·집계·문서 8-4 티켓 20261122_1328). 모양 목록·카드 모양 판정·글자 배치 상한·모양별 렌더 설명과 옛 값 → 새 모양 대응표는 git 이력을 본다. 서비스 홈은 새 유형 8가지(아래 「개편 규격」)만 그리고, `feed_type`이 비었거나 모르는 값이면 텍스트 박스로 그린다. 이 절의 새 규격은 「개편 규격」이 정본이다.

### 카드 유형 목록

유형 값은 `FEED_TYPES`(`jam-web/src/lib/today/feedChipSlots.ts`, `today_cards.feed_type`이 받는 값), 이름은 운영자가 보는 `FEED_TYPE_LABELS`(`jam-web/src/lib/admin/feedTypeLabels.ts`)다. 유형마다 쓰는 칸과 규격은 「개편 규격」의 「카드 유형 8가지」다.

<!-- BEGIN generated: feed-types -->
| 값 | 이름 |
|---|---|
| `hero_box` | 히어로 |
| `full_image` | 전체 배경 이미지 |
| `badge_intro` | 배지 소개 |
| `badge_only` | 배지만 |
| `collection_intro` | 컬렉션 소개 |
| `drop_pickup` | 드랍·픽업 |
| `text_box` | 텍스트 |
| `gallery_list` | 목록형 |
<!-- END generated: feed-types -->

### 옛 칸의 상태

- `today_cards.shape`·`today_cards.layout_type`과 `today_card_events.card_shape`는 DB에 남아 있다. 서비스 홈과 어드민은 두 카드 칸을 읽지도 쓰지도 않는다(새 카드는 `layout_type`이 DB 기본값 `large_thumbnail`, `shape`는 NULL). 옛 카드의 값은 보관한다. 계측의 `card_shape`는 값이 새 유형 이름으로 바뀌었다(§9).
- 운영 패턴의 «쓰는 카드 모양»(`card_shapes`)은 옛 모양 이름을 그대로 보관한다. 새 유형으로 옮길지는 사용자와 정한다([ops-tool/PRD.md](../ops-tool/PRD.md)).

### 표시 데이터와 조회

- **표시 데이터(`toCardView`)**: 카드 행(서버 조회 결과)을 화면용 값 묶음(`FeedCardView`) 하나로 바꾼다. 카드 ID·활성 여부·노출 기간·정렬 순서·유저별 보유 여부 없이도 만들 수 있어서 홈 그리기와 어드민 미리보기가 같은 값으로 같은 카드를 그린다. 자원은 템플릿에서 정한다(`resourceOfTemplate`, 자원은 미션·드랍·레시피·배지·기사·랭킹·컬렉션·자동 8개이고 템플릿을 모르면 `undefined`다). 계측 정보(카드 ID·유형 ID·템플릿·그려진 유형)는 `tracking` 하나에 묶고, 이 값이 없으면 그리는 쪽이 트래커와 링크를 그리지 않는다. 설명문(`description`)은 배지 소개·컨텐츠 소개 템플릿일 때만 싣는다(`showsDescription`). 날짜는 KST 기준이다.
- **이미지에 제목 있음(`resolveTitleInImage`)**: 저장된 `title_in_image`가 `true`/`false`면 그 값이다. NULL(옛 카드)이면 항상 `false`다 — 제목을 글자로 그린다(티켓 20261121_1726). 함수는 카드 행의 `title_in_image`만 받는다.
- **조회**(8회차-1부터 `getTodayCards`는 랭킹 순위와 레시피를 해석하지 않는다 — `resolved_ranking`은 null, `resolved_recipe`는 싣지 않는다): `getTodayCards`가 표시 데이터에 필요한 값을 카드에 함께 싣는다 — `resolved_mission`(미션 소개 카드와 미션을 가리키는 자동 카드의 기간·보상·이미지), `resolved_collection`(컬렉션 소식 카드의 이름·아이템 수). 미션 행은 노출 판정과 같은 읽기를 쓰고 컬렉션은 카드 수와 상관없이 한 번에 읽는다. 미션의 보상 배지 개수(`reward_badge_count`)에는 숨김 배지(`badges.is_hidden`)를 넣지 않는다 — 숨김 배지는 받기 전에 존재와 개수를 알리지 않는다(운영 로직 10.3절, 티켓 20261019_1313 2회). 보상 배지가 있는 미션이 있을 때만 배지를 한 번 더 읽고, 숨김 여부를 읽지 못하면 개수를 싣지 않는다. 컬렉션은 공개된 것(활성이고 공개 시각이 비었거나 지금 이전)만 싣는다 — 컬렉션 화면·목록 API와 같은 판정(`applyLaunchedItemBookFilter`)이라, 비활성이거나 공개 전인 컬렉션은 카드는 남고 `resolved_collection`이 NULL이라 이름·아이템 수가 보이지 않는다(종료 시각은 보지 않는다). 기존 반환 필드는 그대로다. 어드민 날짜 미리보기 조회(`getAdminTodayPreviewCards`)도 같은 판정 함수로 두 값을 싣는다(노출 개인화와 미션 참가 필터는 하지 않는다). 컬렉션 공개 판정과 「N일 남음」 계산의 기준 시각(`previewBaseTime`)은 선택한 날짜가 오늘(KST)이면 지금, 아니면 그 날짜의 00:00(KST)이다.
- **컨텐츠 소개 카드(`content_intro`, 티켓 20261101_2054)**: 미션·배지·컬렉션에 연결하지 않고 서비스 컨텐츠(이야기·안내·기능 소개)를 알린다. 이동 경로(`target_href`)가 필수이고(등록 검사가 비어 있으면 막는다. 코드의 기본값 `/`는 안전망일 뿐이다) 입력 칸은 설명문과 이동 경로뿐이다. 자원은 `auto`로 두고 필수 정보 줄은 없다. 옛 코드가 이 값을 만나면 `resourceOfTemplate` 안전망으로 아이콘·자원 줄·칩 라벨 없이 그린다(마이그레이션 310 머리 주석).
- **레시피 공개 카드(`recipe_reveal`)**: 홈 조회는 레시피를 읽지 않고 이 카드를 텍스트 박스로 그린다(8회차-1). 어드민 날짜 미리보기만 레시피 값을 읽는다. 공개 상태는 믹스 화면과 같은 판정 하나(`recipeReleaseState`)로 가른다.
- **처음 보는 템플릿 값**: 이 코드가 모르는 템플릿 값이 DB에 먼저 들어와도 홈은 오류 화면이 되지 않는다. 그 카드는 자원 줄 없이 그려지고, 어드민 상세·폼은 빈 입력 칸 목록으로 열린다.
- **어드민 미리보기**: 날짜 미리보기 모달과 카드 폼의 「홈 화면 미리보기」는 `TodayCardStack`이 아니라 표시 데이터(`toCardView`, `tracking` 없음)와 새 틀(`TodayCard`)로 그린다. `feed_type`이 비어 있는 옛 카드는 텍스트 박스로 보인다. 공용 목록 컴포넌트 `TodayCardPreview`가 표시 데이터 배열만 받아 홈 캔버스와 같은 `bg-surface` 판 위에 카드 사이 16px 간격으로 쌓는다(카드 행·DB를 모른다).
  - **기기 폭 전환**: 「360」·「430」 두 값이고 기본은 360이다. 카드 폭은 기기 폭에서 홈 본문의 좌우 여백(16px씩)을 뺀 328px(360)·398px(430)이다. 판이 카드 폭보다 좁으면 카드를 줄이지 않고 판이 가로로 스크롤된다.
  - **기준 시각**: 위 조회 항목의 `previewBaseTime`이다. 모달이 표시 데이터를 만들 때(`toCardView`의 `now`)와 서버가 컬렉션 공개를 판정할 때 같은 규칙을 쓴다.
  - **날짜 미리보기의 값**: 미션 기간·보상과 컬렉션 이름·아이템 수를 싣는다. 배지는 보유 여부를 싣지 않아 그림이 컬러다. 활성 상태와 노출 기간만 반영하고 노출 개인화는 하지 않는 단순화는 그대로다.
  - **카드 폼 미리보기의 한계**: 폼은 미션·컬렉션 값을 따로 읽지 않는다(조회 없음). 그래서 미션 기간·보상, 컬렉션 이름·아이템 수 줄은 생략되고 폼이 가진 값(드랍 지역, 배지가 1개일 때 그 이름)만 필수 정보로 보인다. 이 두 값은 저장 뒤 날짜 미리보기에서 확인한다.

근거: `jam-web/src/lib/today/shape.ts`(자원 대응·설명·제목 판정), `jam-web/src/lib/today/cardView.ts`, `jam-web/src/lib/today/cards.ts`, `jam-web/src/lib/today/feedChipSlots.ts`, `jam-web/src/lib/admin/feedTypeLabels.ts`, `jam-web/src/components/today/`(`TodayCard.tsx`·`CardFrame.tsx`), `jam-web/src/app/(main)/TodayCardStack.tsx`, `jam-web/src/lib/itembook/visibility.ts`, `jam-web/src/app/admin/today/TodayCardPreview.tsx`, `jam-web/src/lib/admin/todayPreview.ts`, `jam-web/src/lib/admin/today-calendar.ts`, `jam-web/supabase/migrations/206_today_cards_shape_and_events_card_shape.sql`

### 개편 규격: 새 카드 유형·박스·색·칩 (1~7회차 구현)

> **상태: 1~7회차 구현 완료, 후속은 컬러셋 교체(서비스 쪽과 어드민 화면 모두 구현 완료)와 체크인 지점 이미지 선택 후속이다**(티켓 20261120_2026). 이 절은 사용자가 샘플 아티팩트로 확정한 개편 내용이고, 화면(4회차)·어드민 수동 작성(5회차)·에이전트 묶음과 등록·운영툴 미리보기(6회차)·이미지(글자·로고 없는 프리셋, 대표 색 저장과 색 규칙, 7회차)가 이 규격대로 구현됐다. 위 절들은 옛 7모양 코드의 사실로 남아 있다. 채원의 사전 판정과 사용자 승인(2026-11-20, 추천안대로: 새 색 10개, 강조색 사용처 규칙 개정, 새 칩, 새 컴포넌트 묶음, 서비스 전용 상수, 홈피드 외형 전면 변경과 옛 모양 공존, 수동 지정 경고만·문구 칩 12자, 모션 반복 재생)을 받았다. 게시 중인 카드는 고려하지 않는다(새 디자인의 카드는 새로 만든다). 옛 모양 7가지는 기존 카드가 모두 끝날 때까지 지금 모습 그대로 그리고, 그 뒤 별도 티켓으로 걷어 낸다.

**치수 원칙**: 모서리(radius), 안쪽 여백(padding), 간격(space), 글자 크기(text size)는 기존 디자인 시스템 값을 쓰고, 색만 새 값을 쓴다. 디자인 시스템에 맞는 값이 없는 것(기울기, 박스 홈의 크기, 도장 크기, 물결 높낮이, 칩 자리의 오프셋)만 새 값으로 두고 채원의 판정을 받는다.

#### 카드 유형 8가지

| 유형 | 구성 | 설명 문장 | 칩 자리 묶음 |
|---|---|---|---|
| 히어로 | 위에 이미지 박스(마스크 모양 5가지 중 하나), 아래에 제목과 설명 | 보임 | 이미지 모서리에 걸침 |
| 전체 배경 이미지 | 이미지가 카드 전체이고 그 위에 제목을 왼쪽 아래에 얹는다 | 숨김 | 이미지 위 모서리 |
| 배지 소개 | 배지 그림을 박스 없이 가운데에 두고 아래에 제목과 설명 | 보임 | 배지 둘레 |
| 배지만 | 위에 제목, 아래에 배지 그림. 칩이 없고 제목 속 칩만 선택으로 쓴다 | 숨김 | 없음 |
| 컬렉션 소개 | 컬렉션 대표 그림을 가운데에 두고 속한 아이템 배지 4개가 둘레로 퍼진다(아래 「컬렉션 모션」) | 보임 | 그림 모서리 |
| 드랍·픽업 | 아이템 배지 3개를 박스에 담아 한 줄로 두고 칩 «드랍»·«픽업» | 보임 | 박스 줄 모서리(대각선 두 개) |
| 텍스트 | 박스(색 면 또는 이미지 마스크) 안에 큰 글자만 둔다 | 숨김 | 박스 모서리에 걸침 |
| 목록형 | 제목과 설명 아래에 갤러리 4칸(항목 3개와 화살표 칸) | 보임 | 제목 위 칩 줄의 오른쪽 끝 |

- 설명 문장을 보이는 유형도 카드마다 끌 수 있다. 숨기는 유형은 카드를 기획할 때 설명을 쓰지 않는다. 유형별 노출 여부는 2026-11-20 사용자가 샘플로 확정했다(목록형은 보임으로 바뀌었다).
- 모든 카드에 CTA 버튼을 넣지 않는다.
- 카드를 누르면 가는 곳(`target_href`)은 이 개편에서 바뀌지 않는다. 목록형만 항목마다 따로 링크를 건다.

**구현 위치**(4회차-2, 컬렉션 소개·드랍·픽업·목록형은 4-3): 히어로·텍스트·배지 소개·배지만·전체 배경 이미지 다섯 유형의 컴포넌트와 조립 `jam-web/src/components/today/feed/`(`FeedCard.tsx`), 행의 새 칸과 자동 계산을 합친 «그릴 값» 해석 `jam-web/src/lib/today/feedLook.ts`의 `resolveFeedLook`, 칩 자리 이름→화면 위치 `jam-web/src/lib/today/feedChipLayout.ts`. `feed_type`이 NULL인 카드·모르는 값은 텍스트 박스로 그린다(4-3의 세 유형도 그릴 값이 없는 행은 같다, 아래 4회차-3·8회차-1 줄. 8회차-1 전에는 옛 7모양 경로가 그렸다). **전체 배경 이미지(`full_image`)는 꺼져 있다**(`FEED_FULL_IMAGE_ENABLED = false`, `feedConstants.ts`): 이미지 위 제목의 대비 기준이 없어 홈에서는 옛 모양으로 그리고, 컴포넌트와 Story만 있다. 컴포넌트의 제목 글자는 `--foreground`이고 제목 뒤 막의 기본 농도는 0(`FEED_FULL_IMAGE_SCRIM`)이다. 켤 때 채원이 글자색·막을 함께 정한다. 대비 기준은 이미지 규칙(8회차)에서 정한다.

**구현 위치**(4회차-3, 티켓 20261121_0115): 컬렉션 소개 `jam-web/src/components/today/feed/FeedCollectionCard.tsx`(모션 래퍼만 `'use client'`인 `FeedCollectionBurst.tsx`), 드랍·픽업 `FeedDropPickupCard.tsx`, 목록형 `FeedGalleryListCard.tsx`, 같은 `feed/` 폴더의 조립 `FeedCard.tsx`가 세 유형을 더해 여덟 유형이 된다. 컬렉션 배지 배치(`look.burst`, 저장된 `collection_burst` 또는 카드 시드)는 `jam-web/src/lib/today/feedLook.ts`의 `resolveCollectionBurst`, 세 유형의 치수·모션 상수는 `feedConstants.ts`(`FEED_BURST`·`FEED_DROP_PICKUP`·`FEED_GALLERY`)다. 그릴 값이 없는 행(컬렉션 대표 그림=카드 `cover_image_url` 없음, 드랍·픽업 배지 0개, 목록 항목 0개)은 `toCardView`가 옛 경로로 보낸다. 컬렉션의 아이템 배지 그림은 컬렉션 조회(`fetchCollectionsById`)가 이미 읽는 컬렉션 아이템 배지 조회에서 최대 4개(이름순, 같은 이름은 하나)를 가져오고, 드랍·픽업은 카드가 가리키는 배지의 앞 3개다. 목록형은 카드 전체 링크 없이 항목·화살표 링크만 건다. 칩은 자리표(`feedChipSlots.ts`)를 따라 드랍·픽업이 박스 줄 네 모서리(`box-row-*`) 중 대각선 두 개(큰 칩 «드랍»·«픽업», 4-3 재작업에서 4-1 자리표를 넓혔다), 목록형이 칩 줄(제목 위, 오른쪽 끝) 한 개다. 목록형의 항목 주소와 대표 페이지 주소는 내부 경로 또는 `https://`로 시작하는 값만 링크로 그린다(`isSafeListHref`). 컬렉션 소개의 모션은 모션 래퍼가 카드 루트 요소(`FeedCardShell`의 `markRoot` 표식)를 관찰한다.

**구현 위치**(4회차-4, 티켓 20261121_0155): 개발용 미리보기 페이지 `jam-web/src/app/(main)/dev-sample/home-feed-cards/new/page.tsx`(주소 `/dev-sample/home-feed-cards/new`, `noindex`, 옛 7모양 샘플 `/dev-sample/home-feed-cards`는 8회차-1에서 지웠다)와 가짜 데이터·요약 계산 순수 함수 `jam-web/src/lib/today/feedPreviewData.ts`. 페이지는 서비스 데이터·세션·계측 없이 가짜 데이터를 실제 해석 함수와 카드 컴포넌트에 넣어 유형 8개·박스 5종·칩·도장·설명 숨김·폭 320·자동 배정 120장(규칙 위반·제외 조합 겹침·되돌림 수 요약)·컬렉션 모션을 한 열로 보인다. 값 칩의 미션 조건 값(`resolved_mission.condition_json`)과 배지 달성 기준·레벨(`resolved_badges[].condition_json`·`level`)은 `jam-web/src/lib/today/cards.ts`가 기존 미션·배지 조회에서 선택 칸으로 싣고(새 조회 없음, 값이 없으면 칸이 없다), `cardView.ts`가 새 카드 갈래의 값 칩 입력에 연결한다. 저장된 값 칩은 `mission.condition`·`activity_badge.criteria`·`activity_badge.level` 출처도 읽는다. 해석 함수 `resolveFeedLook`의 선택 입력 `excludedColorPairs`는 미리보기가 검수표 제외 조합 예시를 넣는 자리이고 서비스 홈은 주지 않는다.

**구현 위치**(5회차-2, 티켓 20261121_1316): 어드민 카드 작성·수정 화면의 새 섹션 「카드 모양」은 `jam-web/src/app/admin/today/FeedCardSection.tsx`다(섹션 id `feed`는 `jam-web/src/lib/admin/today-sections.ts`, 폼 상태는 `TodayCardForm.tsx`가 5-1의 `FeedCardFormValues`로 들고 저장 때 `buildFeedCardColumns`의 결과를 보낸다). 유형·박스 모양·박스 용도·배경/칩/박스 색·설명 문장 노출·도장과 자리·제목 속 칩 낱말을 칸마다 «자동»을 기본으로 고른다. **유형을 «옛 모양 그대로»로 비우면 옛 7모양 카드다**: 폼 안의 새 칸 값은 남아 있어 유형을 다시 고르면 살아나지만 저장할 때는 새 칸을 모두 NULL로 보낸다. 규칙에 걸리는 색 조합은 경고만 보이고 저장을 막지 않으며, 제목에 그대로 들어 있지 않은 제목 속 칩 낱말은 저장을 막는다.

**구현 위치**(5회차-3, 티켓 20261121_1317): 「카드 모양」 섹션 아래의 칩·목록 항목·컬렉션 모션 입력 칸이다. 칩 `jam-web/src/app/admin/today/FeedChipsEditor.tsx`(모드 «자동»·«칩 없음»·«직접», 칩 종류 문구·값·구분, 자리, 기울기, 칩이 2개면 두 번째 자리는 첫 칩의 대각선 짝으로 고정, 문구 12자 경고, 값 칩 출처는 카드 템플릿에 맞는 것만), 목록 항목 `FeedListItemsEditor.tsx`(목록형 전용, 항목 1~3개의 이름·링크·이미지 주소와 대표 페이지 주소, 이름 20자 경고), 컬렉션 모션 `FeedBurstEditor.tsx`(컬렉션 소개 전용, «자동»·«직접», 배지 4개의 위치·크기·기울기·지연 숫자 칸과 «자동 값 불러오기»)다. 섹션 `FeedCardSection.tsx`가 유형에 맞는 편집기만 그린다(칩은 칩을 둘 수 있는 유형, 목록은 목록형, 모션은 컬렉션 소개). 칸마다 5-1의 `validateFeedCardColumns`를 칸만 넣어 호출해 저장이 막는 값을 같은 문구로 먼저 보인다. 유형을 바꾸면 새 유형이 못 쓰는 칩 자리는 «자동»으로 되돌리고 한도를 넘는 칩·그 유형만 쓰는 목록 항목·모션 값은 비운다. 모든 칸이 «자동»이면 저장 칸은 NULL이다.

**구현 위치**(5회차-4, 티켓 20261121_1318, 어드민 수동 작성의 마무리): 카드 작성 화면의 「홈 화면 미리보기」는 입력하는 즉시(저장 전) 개편 칸을 반영한다. 폼 값→미리보기 행 변환은 `jam-web/src/app/admin/today/TodayCardForm.tsx`의 `feedPreviewFields`이고, 유형이 «옛 모양 그대로»(빈 값)이면 새 칸을 싣지 않아 옛 7모양 미리보기 그대로이며 «자동»인 칸은 `NULL`로 싣는다. 시드는 저장된 `feed_seed`(수정 화면)를 쓰고, 없으면 미리보기 전용 고정 시드(`FEED_PREVIEW_SEED`)를 쓴다. 그림은 홈과 같은 `toCardView`·`TodayCard`다(수정 없음). 미리보기가 홈과 다를 수 있는 것(자동 배경색의 사용 빈도 반영, 미션·배지 값 칩의 DB 값, 컬렉션 소개의 배지 그림)은 미리보기 아래 «미리보기와 홈이 다를 수 있는 것» 접이식에 적었다. 수정 화면(`/admin/today/[id]/edit`)은 `select('*')`로 읽은 저장 칸을 `feedCardFormValuesFromRow`로 폼에 채우고, 새 유형 카드에는 «저장할 때 자동으로 정해진 값은 그대로 보여요» 안내가 붙는다. 카드 목록 표(`TodayCardTable.tsx`)에는 「유형」 열이 있어 새 유형이면 유형 이름을, 아니면 «옛 모양 (레이아웃 이름)»을 보인다(조회 칸 `feed_type`은 `jam-web/src/lib/admin/today-list-query.ts`). 날짜 미리보기 모달은 `select('*')`로 읽은 행을 `toCardView`로 그려 새 칸이 이미 반영되므로 바꾸지 않았다. **어드민 수동 작성(5회차)은 여기까지다. 아직 남은 것(에이전트 묶음 작성·이미지 규칙·컬러셋 교체)은 6~7회차·후속이다.**

**구현 위치**(6회차-1, 티켓 20261121_1530, 에이전트 묶음의 새 칸 읽기): 운영 묶음의 `home_feed_card` 항목은 `resource`에 DB 칸과 같은 이름의 평평한 키(`feed_type`·`box_shape`·`box_kind`·색 키 3개·`chips`·`title_chip_words`·`show_description`·`stamp_enabled`·`stamp_slot`·`list_items`·`list_more_href`·`collection_burst`)로 새 칸을 선택 칸으로 싣는다(`feed_seed`는 에이전트가 정하지 않는다). 검증 `jam-web/src/lib/admin/opsInbox/validate.ts`의 `validateOpsCardFields`와 변환 `registerInput.ts`의 `toTodayCardRegisterInput`이 5-1의 `validateFeedCardColumns`로 값을 보고(허용 값 밖은 형식 오류, 12자 초과·색 규칙·목록형 항목 0개 등은 경고), 승인된 항목의 insert 페이로드(`homeFeedFields.ts`의 `buildTodayCardInsertPayload`, 선택 인자 `feedColumns`)에 새 칸이 실린다. 칸을 안 적은 항목은 이전과 같다. **`resource.feed_type`이 있으면 옛 `shape`는 선택이다**(없으면 NULL로 등록, 둘 다 없으면 필수 오류). 묶음 검증이 요약창(클라이언트 번들)에서도 돌 수 있도록 주소 안전 규칙 `isSafeListHref`는 카드 컴포넌트에서 순수 파일 `jam-web/src/lib/today/listHref.ts`로 옮겼다(컴포넌트는 같은 이름으로 다시 내보낸다). 등록 때 비어 있는 시드·색을 정해 고정하는 일은 6회차-2(아래)다.

**구현 위치**(6회차-2, 티켓 20261121_1531, 에이전트 카드의 시드·색 고정): 승인된 `home_feed_card` 항목이 `today_cards`로 등록되는 순간(`jam-web/src/lib/admin/opsInbox/execute/homeFeedCard.ts`의 `create`) `feed_type`이 있으면 비어 있는 `feed_seed`와 세 색 키를 정해 insert 행에 합친다(에이전트가 적은 값은 보존, `feed_type`이 없는 옛 모양 항목은 이전과 똑같다). 어드민 저장 라우트 두 개와 같은 코드를 쓰도록 서버 보조를 공용 모듈 `jam-web/src/lib/admin/feedCardServer.ts`(`serverRandomUint32`·`fetchOverlappingBgUsage`·`completeFeedCardValues`)로 모았고, 두 라우트의 중복 보조 함수는 이 모듈로 바뀌었다(동작 불변). 배경색 빈도는 같은 시기(게시 기간이 겹침)에 노출되는 다른 카드를 DB에서 읽어 세므로 같은 실행에서 앞 항목이 먼저 등록되면 뒤 항목의 빈도에 반영된다. 빈도 조회가 실패해도 등록은 막지 않고(빈 빈도로 정함), 통과하는 색 조합이 없어 기본 조합으로 되돌린 경우는 서버 로그에만 남긴다. 제외 조합 목록은 운영 코드에 연결되지 않아 어드민과 같이 빈 목록이다. 핸들러는 요약창이 끌어오는 순수 모듈 계약에 따라 Supabase 클라이언트를 값으로 가져오지 않고 `create`가 받은 `service`를 넘긴다.

**구현 위치**(6회차-3, 티켓 20261121_1532, 운영툴 기획 미리보기): 운영 항목 미리보기(요약창·운영 묶음 화면·묶음의 홈 미리보기)가 `resource`의 새 칸을 읽어 홈과 같은 새 카드 모습으로 그린다. 행 변환 `jam-web/src/lib/admin/opsInbox/cardPreview.ts`의 `itemToPreviewCard`가 6회차-1의 정규화(`checkFeedCardBundleColumns`·`buildFeedCardBundleColumns`)로 허용 값인 칸만 카드 행에 싣고(`feed_type`이 없거나 모르는 값이면 모두 제외해 옛 7모양 그대로), 시드는 폼 미리보기와 같은 고정 상수 1121(`PREVIEW_FEED_SEED`)이다. `jam-web/src/components/admin/ops/OpsCardPreview.tsx`는 새 유형 미리보기 아래에 5회차-2의 값 안내(`FEED_TYPE_VALUE_NOTES`)와 «색과 칩 자리는 등록할 때 정해져서 홈과 조금 다를 수 있어요» 안내를 보인다. 서비스 홈 컴포넌트·`toCardView`는 바뀌지 않았다.

**구현 위치**(7회차-1, 티켓 20261121_1722, 카드 이미지에 글자·로고를 넣지 않는 준비): 사용자가 «배지 이미지를 뺀 카드 이미지(썸네일·카드 커버)에는 텍스트도 로고도 넣지 않는다»고 확정했고, 홈피드 이미지 프리셋의 글자·로고 층은 7회차-2가 데이터에서 뺀다. 이 조각은 코드가 층이 없는 프리셋도 받아들이게 한다(서비스 홈 컴포넌트·`toCardView`·어드민 저장 API·DB는 바뀌지 않았다). 커버 이미지를 쓰는 유형 판정은 순수 함수 `jam-web/src/lib/today/feedConstants.ts`의 `feedTypeUsesCoverImage(feedType, boxKind)`다: `hero_box`·`collection_intro`는 항상, `text_box`는 박스 용도가 `image_mask`일 때만 참이고 `full_image`(홈에서 꺼짐)와 나머지 네 유형·모르는 값은 거짓이다. 운영 항목의 «이미지 제작 필요» 표시(`jam-web/src/lib/admin/opsSignals/composition.ts`의 `needsImageProduction`)는 옛 모양(`shape`)에 더해 `resource.feed_type`이 이 판정을 통과하고 `resource.cover_image_url`이 비어 있으면 참이다. 승인 전 미리보기(`OpsCardPreview.tsx`·`preview/HomePreviewPanel.tsx`)의 «저장된 이미지 없음 → 미리 그리기» 분기도 같은 판정으로 새 유형 항목을 포함한다. 카드 이미지 제작은 프리셋이 홈피드 프리셋(`target_type = home_feed`)일 때만 «없는 층 번호 무시» 모드로 적용한다: 운영툴 브라우저 제작 `jam-web/src/lib/admin/opsInbox/imageRender.client.ts`의 `renderPresetToPngBlob`과 CLI `jam-web/scripts/asset-generator/renderCard.mjs`의 `renderCardPng`가 프리셋 종류로 정하고, 모드의 본체는 레이어 값 적용 `applyLayerValues`의 선택 인자 `ignoreMissingKeys`(TS `jam-web/src/lib/asset-generator/renderPreset.ts`·CLI `jam-web/scripts/asset-generator/applyLayerValues.mjs`, 두 구현이 같은 규칙)다. 배지·컬렉션 프리셋은 기본 그대로 엄격하다(미션 프리셋은 7회차-5가 같은 모드로 넓혔다, 아래). 카드 항목의 `image_spec.values`에는 «쓰지 않아요» 경고를 더한다(`imageSpec.ts`의 `imageSpecWarnings`). 홈피드 원샷(`make-home-feed-card.mjs`)은 무시한 글자를 묶음 `image.text`·`image.subtext`에 적지 않고 `warnings`로 알리며, 등록(`register-home-feed-card.mjs`)은 글자 층이 없는 프리셋의 두 값을 글자 수 검사에서 뺀다. 흰 글자 대비(`contrast.mjs`)는 `--no-text`로 건너뛴다.

**구현 위치**(7회차-5, 티켓 20261121_1726, 미션 이미지에서 글자를 빼는 것에 맞춘 코드): 사용자가 «미션 이미지 글자 제거»를 결정했고(2026-11-21), 미션 프리셋의 로고·글자 층을 비우는 데이터 변경은 7회차-2가 한다. 이 조각은 코드가 글자 없는 미션 이미지를 받아들이고 옛 모양 카드가 제목을 숨기지 않게 한다(DB·`src/types/`·어드민 저장 API는 바뀌지 않았다). ① **옛 모양 제목 판정**: `jam-web/src/lib/today/shape.ts`의 `resolveTitleInImage`는 저장된 `title_in_image` 불리언이 있으면 그 값이고, NULL이면 항상 `false`다(함수는 카드 행의 `title_in_image`만 받는다). `jam-web/src/lib/today/cardView.ts`의 `toCardView`는 커버가 없는 미션 소개 카드가 미션 대표 이미지(`missions.image_url`)를 커버로 써도 `titleInImage`를 `true`로 강제하지 않는다(저장된 불리언이 있으면 그 값, 없으면 `false`라 제목을 글자로 그린다). 이미 구워진 글자 있는 미션 이미지를 커버로 쓰는 옛 카드는 제목이 이미지 글자와 함께 한 번 더 보이는데 «게시 중인 카드는 고려하지 않는다»는 결정에 따라 허용한다. 새 유형 8종은 `titleInImage`를 읽지 않아 영향이 없다. ② **미션 이미지 제작 경로의 값 무시**: 운영툴 브라우저 제작(`jam-web/src/lib/admin/opsInbox/imageRender.client.ts`의 `renderPresetToPngBlob`)과 CLI `renderCardPng`(`jam-web/scripts/asset-generator/renderCard.mjs`)는 프리셋이 홈피드 프리셋 또는 미션 프리셋(`target_type = mission`)이면 «없는 층 번호 무시» 모드(`ignoreMissingKeys`)로 적용한다. 배지·컬렉션 프리셋은 계속 엄격하다. 운영툴 `kind = mission` 항목의 `image_spec.values`에도 «쓰지 않아요» 경고를 낸다(`imageSpec.ts`의 `imageSpecWarnings`, `kind === 'mission'`). 기존 미션 이미지 일괄 적용(`apply-mission-images.mjs`·`applyMissionImagesFlow.mjs`)은 프리셋에 글자 층이 하나도 없으면 없는 번호를 오류로 보지 않고 글자 대비·넘침 검사(`textOverflow.mjs`)를 건너뛰며 «알아둘 점»으로 알린다. 미션 등록(`register-mission.mjs`·`registerMissionBundle.mjs`)은 글자 층이 없는 프리셋의 `image.text`를 막지 않고 알림만 남긴다. 글자 층이 있는 프리셋이면 모두 이전과 똑같이 동작한다. 「이미지 제작 필요」 표시와 미리보기 판정은 `mission` 항목이 이미 이미지 칸(`image_url`)을 가진 종류라 바뀌지 않았다.

**구현 위치**(7회차-2, 티켓 20261121_1723, 데이터 변경, 2026-11-21 실행): 카드 이미지 프리셋 4개(홈피드 1:1·16:9·4:5, 미션)의 로고 이미지 층과 글자 층을 빼서 `asset_presets.layers`가 빈 배열이 됐다(마이그레이션 `jam-web/supabase/migrations/350_asset_presets_text_logo_free.sql`, 되돌림 `_down.sql`, 변경 전 층은 백업 표 `asset_presets_layers_backup_20261121`). 롤백되는 드라이런으로 백업 4행·변경 4행·건너뜀 0행을 확인한 뒤 실행했고 실행 직후 읽기 전용 조회로 4개 모두 층 0개·백업 4행을 확인했다. 리본과 «J» 스탬프는 남고 이미 구워진 이미지는 그대로다. 배지·컬렉션 프리셋은 바꾸지 않았다.

**구현 위치**(7회차-4, 티켓 20261121_1725, 문서): 윤진 정의(`.claude/agents/jam-marketer.md` ⑨ 행)와 `.claude/skills/jam-story/references/marketer-assets.md`의 이미지 안내(홈피드·미션 프리셋은 글자 층이 없어 `image_spec`에 `preset_id`·`bg`·`end`만 내고 `values`는 쓰지 않는다)와 `docs/service/prd/content-automation/PRD.md` §6 편성 규칙 4번(카드 이미지에는 글자·로고 없음, 체크인 지점 이미지는 수동)을 이 규칙에 맞췄다. 실제 클라우드 루틴 프롬프트는 바꾸지 않았다.

**구현 위치**(7회차-3, 티켓 20261121_1724, 카드 커버 이미지의 대표 색 저장): 카드 커버(`cover_image_url`)의 대표 색(원색 최대 3개, 밝기 높은 순 hex)을 새 칸 `today_cards.cover_colors`에 저장한다(마이그레이션 `jam-web/supabase/migrations/351_today_cards_cover_colors.sql`, 되돌림 `_down.sql`). **이 회차는 값을 저장하는 데까지다 — 홈 컴포넌트·`toCardView`는 이 값을 읽지 않는다. 저장한 색으로 색 배정을 거르는 규칙은 7회차-6이 정했다(아래).** 뽑는 코드는 배지 대표 색과 같은 추출기(`jam-web/src/lib/badgeColorExtract.ts`)이고, 쓰기 헬퍼 `jam-web/src/lib/admin/coverColors.ts`(`coverColorsFields`·`coverColorsFieldsIfChanged`)가 우리 저장소 공개 주소(Supabase Storage)와 `/`로 시작하는 정적 주소만 통과시키고 동영상(MP4·WebM 등)은 건너뛴다(추출기가 http(s) 주소를 가리지 않고 fetch하므로 외부 주소 fetch를 막는 장치). 추출이 실패해도 저장은 성공한다. 커버 주소를 쓰는 네 경로가 같은 쓰기에 색을 담는다: 어드민 카드 생성·수정 라우트(`jam-web/src/app/api/admin/today/route.ts`·`[id]/route.ts`, 수정은 커버 주소가 바뀔 때만), 에셋 제너레이터 적용 라우트의 홈피드(`jam-web/src/app/api/admin/asset-generator/apply/route.ts`), 운영툴 이미지 저장 뒤 예약된 카드의 갱신(`jam-web/src/lib/admin/opsInbox/image.ts`의 `applyItemImage`), 예약 등록 때 새 행 생성(`jam-web/src/lib/admin/opsInbox/execute/homeFeedCard.ts`의 `create`). 마지막 경로의 핸들러 파일은 순수 모듈 계약(서버 모듈을 값으로 가져오지 않는다)이 있어 추출 함수를 직접 가져오지 않고, 실행 뼈대(`run.ts`)가 `create`의 context(`coverColorsFields`)로 넘겨 준다. 주소만 바뀌고 색이 같은 UPDATE에 오지 않으면 DB 트리거(`today_cards_cover_colors_stale_guard`)가 색을 NULL로 비워 낡은 색이 남지 않는다. 기존 카드는 채우지 않았다(NULL은 «아직 안 뽑음»). 에이전트용 등록 스크립트(`register-home-feed-card.mjs`)는 색을 싣지 않아 NULL로 남는다.

#### 박스 모양 5가지

박스 모양은 고르는 옵션이다. 같은 모양을 텍스트 박스(세로로 긴 쪽)와 이미지 마스크(가로로 긴 쪽, 이미지를 이 모양으로 잘라 보임)에 모두 쓸 수 있고, 아이템 배지 박스(작은 칸)에도 쓴다. 박스에는 외곽선을 두지 않는다. 박스 경로는 비율에 맞게 변환해 그린다(SVG 경로).

| 모양 | 구조 | 샘플의 치수 |
|---|---|---|
| 라운드 | 네 모서리가 둥근 사각형 | 모서리 12px(`rounded-xl`) |
| 티켓 | 마주 보는 두 변에 반원 홈이 2개씩 | 텍스트 박스는 양쪽 변, 이미지 마스크는 위·아래 변. 홈 지름은 텍스트 56px·이미지 40px |
| 우표 | 마주 보는 두 변에 작은 반원 홈이 줄지어 있다 | 텍스트 박스는 위·아래 변에 지름 24px 홈, 이미지 마스크는 양쪽 변에 지름 20px 홈 5개 |
| 물결 | 둘레 전체가 불규칙한 물결이다 | 물결 22개, 높낮이 12~22px, 마디마다 깊이·간격을 조금씩 다르게 한다 |
| 반원 돌출 | 마주 보는 두 변 가운데에서 반원이 튀어나온다 | 아이템 배지 박스는 위·아래로 반지름 28px, 이미지 마스크는 양쪽으로 반지름 52px |

**구현 위치**(3회차-2, 화면 연결은 4회차): 박스 부품 `jam-web/src/components/today/FeedBox.tsx`, 모양·방향별 마스크와 시드 물결 계산 `jam-web/src/lib/today/boxShape.ts`.

#### 색

색은 15개를 목록으로 두고, 카드마다 자동으로 짝을 짓는다(조합을 정해진 개수로 고정하지 않는다). 한 카드에 쓰는 색은 세 가지다: 배경, 칩, 박스.

| 묶음 | 색 |
|---|---|
| 액센트 원색 | 레드 `#FF1D1D`, 옐로 `#F9FD69`, 그린 `#59C02B`, 퍼플 `#BA8AF7`, 블루 `#0695EC` |
| 액센트 연한 색(초안) | 연한 레드 `#FF9A9A`, 연한 옐로 `#FFDD73`, 연한 그린 `#9AF7AD`, 연한 퍼플 `#D6B9FA`, 연한 블루 `#8FCFF6` |
| 참조 그림에서 뽑은 색 | 참조 레드 `#F5442C`, 참조 블루 `#95C1F7`, 참조 라임 `#C0DC66`, 참조 핑크 `#E57FBB`, 참조 옐로 `#F2EC6A` |

참조 그림의 색은 Display P3 프로파일을 화면에 보이는 sRGB 값으로 바꿔 뽑았다. 연한 색 다섯 개는 카리나가 계산한 초안이라 값을 사용자가 다듬는다.

**통합 팔레트 새 키 4개와 쓰임 표**(티켓 20261122_2224 회차 2·3, 상위 20261122_2217 결정 §1·§2·§5): 색 키에 짙은 그린 `green-deep`(`#3D851E`, `--jam-green-deep`), 핑크 `pink`(`#F372C1`, `--jam-pink`), 스카이 `sky`(`#51CDF5`, `--jam-sky`), 화이트 `white`(`#FFFFFF`, `--jam-chip-white`)를 더해 19키가 됐다(DB 제약은 마이그레이션 357). 옛 15키는 12회차(축소)까지 읽기 전용으로 남고, 새 키 4개는 자동 배정이 쓰지 않는다(4·5회차가 켠다). 쓰임 표(`feedConstants.ts`의 `FEED_COLOR_USAGE`)는 다음과 같다. 바탕·박스는 노랑·초록·짙은 초록·분홍·하늘, 값 칩은 노랑·초록·분홍·하늘·빨강·보라·흰색, 스티커는 노랑·초록·분홍·하늘·빨강·보라·파랑이다. 일반 카드의 바탕+박스 조합은 9개이고(노랑+초록, 초록+노랑, 노랑+짙은 초록은 가중치 2, 초록+분홍·하늘+노랑·노랑+하늘·분홍+노랑·분홍+초록·하늘+분홍은 가중치 1) 짙은 초록 바탕 카드는 따로 두 조합(짙은 초록+노랑, 짙은 초록+분홍)이 다섯~여섯 장에 한 장꼴로 나온다. 짙은 초록 바탕 위 제목·설명은 흰색(`--snow`, `feedTextOnBg`), 나머지 바탕 위는 검정이고, 짙은 초록 박스는 글자가 들어가는 박스(텍스트형·드랍 픽업 배지 상자·목록형 타일)에 쓰지 않는다(검정 글자 대비 3.9, `boxAllowedFor`). 칩 색의 배제 표(`feedColorRules.ts`의 `chipExclusionRule`, 초안)는 같은 색끼리, 빨강과 초록·짙은 초록, 노랑 위 흰 칩, 분홍 위 보라 칩이다. 이 표와 조합은 회차 3에서 만들기만 했고 아직 배정·화면은 읽지 않는다. 옛 대비·키즈·명도 규칙과 배지 그림 색 규칙은 그대로다.

**자동으로 거르는 규칙**(2026-11-20 샘플 계산, 기준값은 카리나의 초안이고 사용자가 검수표에서 다듬는다). 아래 순서로 걸러 낸 뒤 남은 조합만 쓴다.

1. 같은 색끼리는 쓰지 않는다.
2. 대비 규칙: 밝기 대비(상대 휘도 비)가 1.15 미만이면 제외한다. 색상 차이가 30도 미만이면서 밝기(HSL 명도) 차이가 0.09 미만이면 제외한다. 채도가 높은 원색(채도 0.85 초과, 명도 0.4~0.62) 둘이 색상 차이 90도를 넘으면 제외한다.
3. 키즈 규칙: 채도가 높은 원색 둘의 조합과, 밝은 색(명도 0.7 초과) 둘이 색상 차이 40도를 넘는 조합을 제외한다. 유아용품처럼 보이는 조합을 막는다.
4. 명도 규칙: 칩과 칩이 아닌 것(배경, 박스)은 눈에 보이는 밝기(L*) 차이가 15 이상이거나 색상 차이가 150도 이상(보색)이어야 한다.

15색의 210가지 조합 중 대비 규칙 40가지, 키즈 규칙 42가지, 명도 규칙 42가지가 빠지고 86가지가 남는다. 사용자가 검수 화면에서 직접 고른 제외 조합은 저장해 두고 자동 배정이 피한다.

**자동 배정**: 카드마다 배경색 하나를 이웃 카드와 다르게 고르고, 그 배경과 규칙을 통과하는 색에서 칩 색과 박스 색을 고른다. 칩 색과 박스 색도 서로 규칙을 통과해야 한다. 배정한 값은 카드에 저장해 화면을 열 때마다 바뀌지 않게 하고, 서버와 브라우저가 같은 결과를 그린다. 흰색은 자동 배정에 쓰지 않는다(최대한 지양하고, 사용자가 직접 지정할 때만 쓴다).

**이미지 대표 색 규칙(⑤ 그림과 배경 · ⑥ 그림과 칩)**(7회차-6, 티켓 20261121_1828, 사용자 결정 2026-11-21 «제안대로 함»): 저장한 이미지 대표 색(카드 커버 `today_cards.cover_colors`, 배지 `badges.bg_colors`)으로 **자동 배정**을 보완한다. 새 임계값을 만들지 않고 위 규칙 ④의 척도(색상 차이 30°, 밝기 L* 차이 15)를 그대로 쓴다.

- **적용 대상**: 이미지가 색 면 위에 놓이거나 색 면을 채우는 유형만이다.
  - 커버 이미지 → 카드의 `cover_colors`: 히어로(`hero_box`), 텍스트 박스의 이미지 마스크(`text_box`이고 `box_kind = image_mask`), 컬렉션 소개(`collection_intro`).
  - 배지 그림이 배경 위에 놓이는 유형: 배지 소개(`badge_intro`)·배지만(`badge_only`)은 카드가 가리키는 첫 배지(삭제된 배지는 건너뛴다)의 `bg_colors`, 드랍·픽업(`drop_pickup`)은 배지 최대 3개의 `bg_colors` 전부.
  - 그 밖(글자만 있는 텍스트 박스, 목록형, 꺼진 전체 배경 이미지)은 적용하지 않는다.
- **규칙 ⑤ 그림과 배경**: 카드 배경색이 해당 이미지 대표 색(저장된 최대 3개 중 하나라도)과 «색상 차이 30° 미만이고 밝기(L*) 차이 15 미만»이면 그 배경은 자동 배정에서 제외한다.
- **규칙 ⑥ 그림과 칩**: 이미지 위에 걸치는 칩(`hero_box`·이미지 마스크 `text_box`·`collection_intro`)의 색도 같은 조건이면 제외한다. 배지 유형의 칩은 이미지 위에 걸치지 않아 ⑥을 쓰지 않는다.
- **안전장치**: 이미지 규칙까지 통과하는 조합이 하나도 없으면 이미지 규칙을 건너뛰고 기존 규칙(①~④)만으로 고른다(결과의 `imageRuleSkipped = true`, 서버 로그에만 남기고 사용자 문구는 없다. 기본 조합 되돌림 `usedFallback`과 구분하며, 건너뛴 뒤에도 조합이 없으면 둘 다 참이다). 대표 색이 `NULL`(아직 안 뽑음)이거나 `[]`(색 없음)이면 이미지 규칙을 쓰지 않는다. 읽을 수 없는 hex는 없는 것으로 본다.
- **수동 지정**: 사용자가 지정한 색은 덮어쓰지 않고 걸러 내지도 않는다. 규칙에 걸리는 경고는 7-7이 어드민 화면에 보인다(아래 구현 위치 7회차-7).
- **한계**: 저장된 색은 밝기 높은 순이라 면적 비중을 모른다. 3개를 모두 검사한다(보수적).
- **홈이 그릴 때는 바뀌지 않는다**: 이 규칙은 등록·저장 때 색을 고정하는 경로만 쓴다. 저장된 색 키가 없는 카드를 홈이 그릴 때 정하는 자동 배정(`resolveFeedLook`)은 이미지 대표 색을 읽지 않는다(홈은 카드 행만 보고 배지 대표 색을 알 수 없다).

**수동 지정**: 어드민에서 유형에 맞는 색을 직접 고른다. 규칙에 걸리는 조합을 고르면 경고만 보이고 막지 않는다(카리나 제안, 사용자 확인 대기). 이미지 위에 놓이는 칩과 이미지를 채운 박스의 경고는 위 이미지 대표 색 규칙을 쓴다(경고 화면은 7-7, 아래 구현 위치 7회차-7).

**구현 위치**(4회차-1, 화면 연결은 4-2 이후): 규칙 판정(hex 입력) `jam-web/src/lib/today/feedColorRules.ts`, 자동 배정(색·사용 빈도·제외 조합·기본 조합 되돌림) `jam-web/src/lib/today/feedAssign.ts`의 `assignFeedColors`.

**구현 위치**(7회차-6, 티켓 20261121_1828, 이미지 대표 색을 자동 색 배정에 쓴다): 규칙 함수 `jam-web/src/lib/today/feedColorRules.ts`의 `violatesImageColorRule(candidateHex, imageHexes)`(기존 임계값 `COLOR_RULE_THRESHOLDS`의 두 값을 읽는다, `ColorRuleName`에 `'image'`)와 `isHexColor`, 자동 배정 `feedAssign.ts`의 `assignFeedColors`가 선택 입력 `imageHexes`·`chipOnImage`를 받고 결과에 `imageRuleSkipped`를 담는다(입력을 안 주면 결과가 이전과 같고 그 칸도 없다). 유형 → 이미지 색 선택은 순수 함수 `jam-web/src/lib/today/feedImageColors.ts`의 `imageColorsForCard`다. 서버 읽기는 `jam-web/src/lib/admin/feedCardServer.ts`의 `fetchBadgeBgColors`(`badges`에서 삭제되지 않은 행을 `id in (…)`·칸 `bg_colors`만 한 번 조회, 실패하면 `null`과 서버 로그)·`fetchFeedCardImageColors`(배지 유형일 때만 조회)와 `completeFeedCardValues`의 선택 인자 `imageSource`다. 세 저장 경로가 같은 코드를 쓴다: 어드민 생성 라우트(`app/api/admin/today/route.ts`, 커버 색을 배정보다 먼저 뽑고 검증이 실패하면 뽑지 않는다), 수정 라우트(`[id]/route.ts`, 커버가 바뀌었으면 새로 뽑은 색 — 추출이 실패했으면 낡은 저장 색을 쓰지 않는다 — 안 바뀌었으면 저장된 `cover_colors`), 운영 등록(`lib/admin/opsInbox/execute/homeFeedCard.ts`의 `create`가 커버 색을 먼저 뽑아 배정에 넘긴다). 정책 대시보드(`policiesData.ts`)는 이 임계값이 화면 표시 규칙이지 운영 정책·밸런스 수치가 아니라서 갱신하지 않는다(4회차-4와 같은 판단).

**구현 위치**(7회차-7, 티켓 20261121_1829, 직접 고른 색이 이미지 대표 색과 겹치면 경고한다): `jam-web/src/app/admin/today/FeedCardSection.tsx`의 `feedColorWarnings`가 선택 인자 `imageColors`(`imageColorsForCard`의 결과)를 받아 직접 고른 배경색(규칙 ⑤)·칩 색(규칙 ⑥, `chipOnImage`일 때만)을 `violatesImageColorRule`로 검사하고 이유 문구는 `COLOR_RULE_REASON.image`(`lib/admin/feedCardFields.ts`)를 쓴다. 섹션의 선택 props `coverColors`·`badgeColors`·`coverColorsPending`으로 대표 색을 받는다 — `TodayCardForm.tsx`가 수정 화면의 저장된 `cover_colors`(새 카드이거나 커버 이미지를 바꿨으면 모르는 값이라 넘기지 않고 `coverColorsPending`으로 안내 한 줄만 보인다)와 연결 배지의 `bg_colors`(`badge_ids` 순서)를 넘긴다. 배지 대표 색은 어드민 배지 검색 라우트(`app/api/admin/badges/search/route.ts`)의 `select`와 수정 화면(`today/[id]/edit/page.tsx`)의 배지 조회에 `bg_colors` 한 칸을 더해 얻는다(`BadgeSearchResult.bg_colors`). 경고만 하고 저장은 막지 않으며 «자동»으로 둔 칸과 대표 색을 모르는 경우는 검사하지 않는다. 규칙·수치는 바뀌지 않아 정책 대시보드(`policiesData.ts`)는 갱신하지 않는다. 한계: 수정 화면의 배지 조회는 삭제된 배지를 거르지 않아 첫 배지가 삭제된 카드는 홈이 보는 «첫 배지»와 다를 수 있다.

**구현 위치**(5~7회차 코드 정리, 티켓 20261121_2113, 동작 불변): 박스 칸을 보이는 유형 목록(`BOX_FEED_TYPES`·`BOX_KIND_FEED_TYPES`)은 `FeedCardSection.tsx`에서 `jam-web/src/lib/today/feedChipSlots.ts`의 공용 상수로 옮겼고, 홈 컴포넌트가 `FeedBox`를 그리는 유형과 같은지는 시험(`components/today/__tests__/FeedCard.boxTypes.test.tsx`)이 유형 8개를 그려 지킨다. `FeedCardSection.tsx`와 `FeedChipsEditor.tsx`의 순환 가져오기는 공용 조각(`ChoiceField`·`ChoiceOption`·`stampSlotLabel`)을 `jam-web/src/app/admin/today/FeedFieldParts.tsx`로 옮겨 끊었고 `FeedCardSection.tsx`가 같은 이름을 다시 내보낸다. 미리보기 고정 시드는 `jam-web/src/lib/today/feedPreviewSeed.ts`의 `FEED_PREVIEW_SEED` 하나이고 폼(`TodayCardForm.tsx`)과 운영 항목 미리보기(`cardPreview.ts`의 `PREVIEW_FEED_SEED`)가 이것을 가져온다. 등록 때 `feed_seed`가 이미 있는 카드는 그 값이 색 계산 시드이자 저장 시드이고(`completeFeedCardValues`가 난수를 뽑지 않는다), 없을 때만 서버 난수를 뽑는다.

**컬러셋 교체**(후속 1, 티켓 20261121_2145, 서비스 쪽 구현. 어드민에서 색을 바꾸는 화면은 후속 2, 티켓 20261121_2146, 구현 완료): 사용자 결정(2026-11-21 «설계대로 진행»)으로 색이 마음에 들지 않으면 어드민에서 바꿀 수 있다. 색 키 15개는 그대로 두고 **키가 가리키는 hex만 덮어쓴다**.

- **덮어쓰는 범위는 홈피드 카드만이다.** 원색 5개(`--jam-red` 등)는 디자인 시스템 전체가 쓰는 토큰이라 건드리지 않는다. 카드 전용 변수 `--feed-color-<키>`를 앞에 두고 기본값으로 기존 변수를 가리킨다(`var(--feed-color-<키>, var(<기존 변수>))`). 덮어쓴 키만 `:root`에 내려가므로 덮어쓰지 않은 키와 디자인 시스템의 다른 곳은 그대로다.
- **저장**: 표 `feed_color_overrides(color_key, hex, updated_at, updated_by)`(마이그레이션 352). 행이 없으면 기본값이고, 기본값 복원은 행 삭제다. 읽기는 누구나(홈 화면), 쓰기는 `service_role`만이다. 키는 15개 안, 값은 `#rrggbb`만 받는다.
- **카드의 색 키는 바뀌지 않는다.** 이미 저장된 카드는 키를 그대로 갖고 보이는 색만 바뀐다. 색이 비어 있는 카드(자동)는 홈이 그릴 때 덮어쓴 hex로 규칙을 다시 판정해 색을 정한다(저장된 시드 그대로, 같은 입력은 같은 값).
- **계산도 같은 팔레트**: 자동 색 배정·색 규칙 경고·이미지 색 경고는 hex를 입력으로 받는다. 덮어쓴 값을 합친 팔레트(`FeedPalette`)를 만들어 넘기고, 규칙 결과는 hex가 바뀌면 다시 계산된다. 팔레트를 안 주면 기본 15색이라 결과는 이전과 같다.
- **실패해도 기본값**: 표가 없거나 읽기가 실패하면 빈 덮어쓰기(기본값)로 그리고 서버 로그에만 남긴다. 홈 화면이 깨지지 않는다.
- **바꾸는 시점**: 서버가 표를 짧게 캐시하고(태그 `feed-colors`, 재검증 60초) 어드민이 적용·복원하면 태그를 무효화한다(`PUT /api/admin/feed-colors`가 부른다). 바꾸기 전 미리보기·규칙 재계산·영향받는 카드·«적용» 확인은 어드민 화면 「홈피드 컬러셋」(후속 2)이 한다.
- **정책 대시보드**: 색 값은 표시 설정이지 운영 정책·밸런스 수치가 아니어서 `policiesData.ts`는 갱신하지 않는다.

**구현 위치**(후속 1, 티켓 20261121_2145): 순수 함수(정리·팔레트 합치기·CSS 변수 문자열) `jam-web/src/lib/today/feedColorOverrides.ts`, 표 읽기(실패 시 기본값) `feedColorOverridesRead.ts`, 캐시된 서버 읽기와 무효화 `feedColorOverridesServer.ts`(서버 전용), 변수 `<style>`을 내리는 서버 컴포넌트 `jam-web/src/components/today/FeedColorStyle.tsx`(`(main)/layout.tsx`와 `admin/layout.tsx`에 끼워 홈 카드·개발용 미리보기·어드민 미리보기에 적용). 카드 색 변수는 `feedConstants.ts`의 `feedColorVar`. 팔레트 연결: `resolveFeedLook`·`toCardView`의 `palette` 선택 입력(홈 `page.tsx`가 읽어 `TodayCardStack`에 넘긴다), `completeFeedCardValues`·`decideFeedCardValues`(저장 때 색 고정)와 `validateFeedCardColumns`(저장 라우트 두 개가 읽어 넘긴다), 어드민 폼의 `feedColorWarnings`(수정·등록 페이지가 `TodayCardForm`의 `feedPalette`로 내려준다).

**구현 위치**(후속 2, 티켓 20261121_2146, 어드민에서 색을 바꾼다): 화면 `jam-web/src/app/admin/feed-colors/`(서버 `page.tsx`가 덮어쓰기와 노출이 끝나지 않은 카드의 색 키 조합을 읽어 클라이언트 `FeedColorsEditor.tsx`에 넘긴다), 영향 계산(순수) `jam-web/src/lib/admin/feedColorImpact.ts`(통과 조합 수 비교와 «지금은 통과하는데 편집하면 새로 걸리는 카드»), 저장 API `jam-web/src/app/api/admin/feed-colors/route.ts`(`GET`·`PUT`). 화면 동작·API 규칙은 [어드민 PRD](../admin-ui/ADMIN_PRD.md) 5-12가 정본이다. DB·서비스 홈 컴포넌트는 바꾸지 않았고 표 읽기·쓰기만 한다.


**구현 위치**(8회차-1, 티켓 20261122_1101, 서비스 홈의 옛 7모양 제거): 홈이 새 유형만 그린다. `jam-web/src/components/today/TodayCard.tsx`는 `FeedCard`만 부른다(옛 분기·`RENDERED_SHAPES`·`isRenderedShape`와 `currentUserId` 인자 삭제). 옛 7모양 컴포넌트 7개와 그 부품(`CardBody`·`CardThumb`·`CardImageSlot`·`CardChipRow`·`resourceIcon`, 가져오는 곳이 이 옛 컴포넌트들뿐이라 함께 삭제), 옛 모양 Story(`ImageShapes.stories.tsx` 포함)·시험, 옛 샘플 페이지 `(main)/dev-sample/home-feed-cards/page.tsx`를 지웠다. `ArticleView`·`RankingListRow`(미션 현황이 쓴다)·`CardFrame`은 그대로다. 유형 판정은 순수 파일 `jam-web/src/lib/today/feedType.ts`의 `resolveFeedType` 하나다: `feed_type`이 비었거나 모르는 값(꺼진 `full_image` 포함)이면 `text_box`, 컬렉션 소개는 커버가 없을 때·드랍·픽업은 배지가 0개일 때·목록형은 그릴 수 있는 항목이 0개일 때도 `text_box`다. `toCardView`(`cardView.ts`)는 옛 갈래(모양별 필드·타일·랭킹 행·레시피 타일)를 지우고 `FeedCardView` 하나만 만들며 계측 정보에는 `feedType`이 늘 실린다(`tracking.shape`는 없다). 홈 조회 `getTodayCards`(`cards.ts`)는 랭킹 순위(`resolved_ranking`은 null)와 레시피(`resolved_recipe`는 싣지 않는다)를 해석하지 않는다 — 어드민 날짜 미리보기(`lib/admin/todayPreview.ts`)가 같은 함수(`fetchRankingBoardData`·`fetchRecipesById` 등)를 쓰므로 함수와 타입은 남겼고 8-2~8-3이 정리한다. 계측 `today_card_events.card_shape`는 같은 판정 함수로 정한 새 유형 이름을 기록하고(`events.ts`, 카드 조회에 `feed_type`·`list_items`를 더하고 `shape`·`template_type`·`layout_type`·`recipe_id`·레시피 읽기를 뺐다), 이전 기록의 옛 모양 이름은 그대로 남는다. 기록 유형 = 화면 유형 시험은 `shapeParity.test.ts`다. 한 칸의 허용 차이: `badge_ids`가 전부 삭제된 배지인 드랍·픽업 카드는 화면이 `text_box`, 기록은 `drop_pickup`이다(§9). 이 조각은 `shape.ts`의 상수·판정(`CARD_SHAPES`·`resolveShape`·`drawnShape`·`LEGACY_SHAPE_CUTOVER`)과 어드민·운영툴·DB·`src/types/`를 건드리지 않는다.

**구현 위치**(8회차-2, 티켓 20261122_1153, 어드민의 옛 모양·레이아웃 선택 제거): 어드민 카드 폼(`TodayCardForm.tsx`)에서 「노출 형태」 선택(`layoutType`)과 템플릿별 추천 연동을 지웠고, 카드 유형 선택(`FeedCardSection.tsx`)에서 «옛 모양 그대로»(빈 값)를 없앴다. 유형은 필수이고 새 카드의 기본은 `text_box`(`feedCardFields.ts`의 `DEFAULT_FEED_TYPE`·`withDefaultFeedType`)이며, 유형이 비어 있던 옛 카드는 수정 화면에서 `text_box`로 보이고 저장하면 채워진다. 저장 본문(`buildTodayCardSavePayload`)은 `layout_type`·`shape`를 싣지 않는다(새 카드는 DB 기본값 `large_thumbnail`·NULL). 목록 표는 「노출형태」 열이 없고 「유형」 열은 유형이 비어 있으면 «텍스트 박스(기본)»을 보이며, 상세는 「카드 유형」, 내보내기는 `카드유형`(`feed_type`) 열이다. 운영 묶음은 `resource.feed_type`이 필수이고 옛 `shape`·`layout_type`은 «이제 쓰지 않아요» 경고만 붙으며 등록 값에 싣지 않는다(`validate.ts`·`registerInput.ts`·`homeFeedFields.ts`). 제목 글자 수 경고(모양별 상한)는 걷었다. `TODAY_LAYOUT_OPTIONS`·`SUGGESTED_LAYOUT_FOR`는 8-4(티켓 20261122_1328)가 지웠다. 운영 패턴의 `card_shapes`와 신호 엔진·운영 미리보기는 8-3이다.

**구현 위치**(8회차-3, 티켓 20261122_1239, 운영툴의 옛 모양 제거): 운영툴이 카드를 옛 모양이 아니라 새 카드 유형(`feed_type`)으로 분류한다. 상세와 계산 규칙은 [ops-tool/PRD.md](../ops-tool/PRD.md) §5·§13이다. 운영 신호는 실제 카드의 `feed_type`·`box_kind`를 읽고, «이미지가 있어야 하는 카드»를 `feedTypeUsesCoverImage`(히어로·컬렉션 소개·이미지 마스크 텍스트 박스)로 정한다. 운영 항목·서랍·미리보기는 `resource.feed_type`만 읽고(`readOpsItemFeedType`) 옛 `shape`·`resource.layout_type`은 읽지 않는다. 홈 미리보기 패널의 유형별 개수 막대는 홈이 그리는 규칙(`resolveFeedType`)으로 세고 표(`SHAPE_STYLES`)는 새 8유형 키다. 운영 패턴의 «카드 모양» 입력은 «카드 유형»(새 8유형)이 되어 옛 모양 이름은 저장·묶음 제안에서 허용값 오류다. DB 칸 이름 `card_shapes`와 저장된 패턴 값은 그대로다. 남은 옛 이름은 `shape.ts` 상수·집계 API(`metrics/route.ts`)·`TODAY_LAYOUT_OPTIONS`로 8회차-4가 정리한다.

#### 칩

- **모양**: 검정 2px 외곽선, 완전한 알약 모양(`rounded-full`). 크기는 두 가지다: 큰 칩은 높이 40px·글자 18px(`text-lg`)·안쪽 가로 여백 16px, 작은 칩은 높이 32px·글자 14px(`text-sm`)·여백 12px. 글자는 굵게, 한 줄이다. 글자 색은 `--foreground`(검정)로 고정하고, 검정 칩만 `--snow` 글자다(15색 위에서 `--foreground`는 모두 AA를 넘고 가장 낮은 레드도 4.65:1이지만 `--snow`는 가장 높아도 3.76:1이라 AA에 못 미친다, 채원 판정).
- **외곽선 규칙**: 외곽선은 칩과 꾸미는 요소(도장)에만 쓴다. 텍스트 박스, 이미지 박스, 카드 면에는 쓰지 않는다.
- **종류**: 값 칩(DB 값을 그대로 보인다), 문구 칩(기획자나 에이전트가 적는다), 제목 속 칩(제목의 낱말을 칩으로 감싼다), 구분 칩(검정 바탕, «아이템 배지»·«컬렉션»처럼 무엇인지 알린다).
- **개수**: 카드당 칩은 최대 2개이고 제목 속 칩은 따로 최대 2개다.
- **자리와 기울기**: 유형마다 허용하는 자리 목록(위 표의 칩 자리 묶음)을 정해 두고, 칩이 2개면 서로 대각선 자리에 둔다. 자리가 하나뿐인 유형(목록형의 칩 줄)만 칩을 1개 둔다. 드랍·픽업은 박스 줄의 네 모서리 중 대각선 두 자리에 큰 칩(40px) «드랍»(색 칩)·«픽업»(검정 칩, 글자 `--snow`)을 둔다(위쪽 두 자리는 위로, 아래쪽 두 자리는 아래로 걸친다. 칩이 저장되지 않은 카드의 자동 칩이고, 저장된 칩이 있으면 그것을 따른다). 칩은 박스를 자르는 마스크 밖의 형제 층에 두고, 폭 320px에서 좌우 16px 바깥으로 나가지 않게 한도를 정한다. 기울기는 −8°, −6°, −4°, 4°, 6°, 8° 여섯 값 중 하나다. 자리와 기울기는 정해 둔 값 안에서 무작위로 고르되 카드마다 한 번 정해 저장한다.
- **제목 속 칩**: 쓸지 말지는 카드마다 에이전트 또는 사용자가 정한다. 제목 문자열은 그대로 두고, 칩으로 만들 낱말 목록(최대 2개)을 따로 저장한다. 낱말은 제목에 그대로 들어 있어야 하고, 목록이 비어 있으면 칩을 만들지 않는다. 제목 줄 높이가 칩만큼 커진다.
- **문구 칩**: 글자 수 상한은 12자로 제안한다(샘플의 가장 긴 칩이 13자다). 확정은 1회차 후속 결정이다.
- **구현 위치**(3회차-2, 화면 연결은 4회차): 칩 `jam-web/src/components/today/FeedChip.tsx`, 제목 속 칩 `jam-web/src/components/today/ChipTitle.tsx`(낱말 쪼개기 `jam-web/src/lib/today/titleChips.ts`), 색 키→CSS 변수·칩 치수·자리 오프셋 `jam-web/src/lib/today/feedConstants.ts`.

**DB 값 칩의 규칙표(초안)**: 어떤 값을 칩으로 낼지의 기본이다. 정확한 칸 이름은 자동 규칙 회차에서 코드와 대조해 확정하고, 지금의 「필수 정보 줄」(기간·보상)과 겹치는 값은 칩이 가져가고 정보 줄에서는 뺀다.

| 자원 | 값 칩 | 구분 칩 |
|---|---|---|
| 미션 | 남은 기간(종료 7일 이내 «N일 남음»), 보상 포인트, 조건 값(«걷기 8km», «상승고도 400m») | «미션» |
| 액티비티 배지 | 달성 기준 값(«10회», «700m», «14일 만에»), 레벨(«Lv.1») | «액티비티 배지» |
| 컬렉션 | 속한 아이템 수 | «컬렉션» |
| 체크인·장소 | 필요한 배지 수(«배지 3종류»), 장소 이름 | «체크인» |
| 드랍·픽업 | 없음(문구 칩 «드랍»·«픽업») | «아이템 배지»(다른 유형에 이 자원의 값이 붙을 때. 드랍·픽업 카드의 자동 칩은 «드랍»(색 칩)·«픽업»(검정 칩) 두 개다) |

**구현 위치**(4회차-1, 화면 연결은 4-2 이후): 유형별 칩 자리·개수 한도 `jam-web/src/lib/today/feedChipSlots.ts`, 자리·기울기 배정 `jam-web/src/lib/today/feedAssign.ts`의 `assignChipPlacement`, DB 값 칩 규칙표와 값→문구 변환·12자 경고 `jam-web/src/lib/today/feedValueChips.ts`.

#### 도장

문구는 `JOIN AND MOVE`만 쓴다(JAM은 쓰지 않는다). 색 면 위에 반전 글자(네거티브)를 얹은 도넛 모양이고, 가운데 작은 원은 투명한 구멍이어서 뒤의 이미지가 보인다. 글자는 안쪽 원과 바깥 원 사이 띠의 한가운데를 따라 돈다. 크기는 60px이고 검정 외곽선이 있다. 도장 색은 카드의 색 중 하나이고 글자 색은 검정이다(장식이어서 `aria-hidden`이다. `--snow` 글자는 대비가 모자라 쓰지 않는다). 카드마다 쓸지 말지와 자리(이미지 모서리나 박스 모서리)를 고르고, 한 카드에 하나만 둔다.

**구현 위치**(3회차-2, 화면 연결은 4회차): `jam-web/src/components/today/FeedStamp.tsx`.

#### 목록형

제목, 설명 아래에 4칸 한 줄 갤러리를 둔다. 앞의 세 칸은 항목(정사각 그림, 모서리 12px, 아래에 이름 12px 굵게 두 줄까지)이고 항목마다 따로 링크를 건다. 마지막 칸은 검정 바탕의 «→» 화살표이고 그 목록을 대표하는 페이지로 간다(대표 페이지 주소를 카드가 갖는다). 항목이 3개보다 적으면 빈 칸 없이 화살표 칸을 앞으로 당긴다. 카드 전체에는 링크를 걸지 않는다(카드 전체 링크를 끄면 클릭 계측도 꺼지므로 링크와 계측을 분리한다). 화살표 칸의 접근성 이름은 «{제목} 전체 보기»다. 대표 페이지 주소가 없으면 화살표 칸을 그리지 않고, 항목이 0개면 카드를 그리지 않는다. 칸 하나의 폭은 폭 358 카드에서 약 75px, 폭 320 화면(카드 288)에서 약 58px라 터치 영역 44px을 채운다. 항목 주소와 대표 페이지 주소는 내부 경로(`/`로 시작하고 `//`로 시작하지 않는 값) 또는 `https://`로 시작하는 값만 링크로 그린다. 그 밖의 값이면 항목은 링크 없이 그림·이름만 그리고 화살표 칸은 그리지 않는다. 칩은 제목 위에 따로 둔 칩 줄의 오른쪽 끝에 놓는다(샘플에는 목록형 칩이 그려진 적이 없고, 제목에 겹쳐 얹으면 두 줄 제목의 글자를 가려서 4회차 화면 실측 뒤 줄을 따로 두기로 했다). 칩이 있을 때만 줄이 생기고 카드가 칩 높이만큼 높아진다.

#### 컬렉션 모션

컬렉션 소개 카드(카드 전체 요소, 대표 그림 영역이 아니다)가 스크롤되어 화면에 55% 넘게 들어오면, 대표 그림 뒤 가운데에 있던 아이템 배지 4개가 방사형으로 불규칙하게 퍼진다. 배지마다 시작 시각을 70~210ms씩 다르게 하고, 0.72초 동안 살짝 지나쳤다가 제자리로 돌아오는 탄성 곡선(`cubic-bezier(0.2, 1.5, 0.4, 1)`)으로 움직인다. 카드가 화면 밖으로 완전히 나가면 다시 모이고, 다시 들어오면 재생된다. 기기에서 «동작 줄이기»를 켠 사용자에게는 모션 없이 퍼진 모습만 보인다. 기본 HTML은 퍼진 모습이고 스크립트가 모으는 상태를 건다(스크립트가 늦어도 배지가 사라지지 않는다). 모션을 지켜보는 관찰자(55%)는 노출 계측의 관찰자(50%)와 분리한다. 배지 4개의 도착 위치와 기울기, 크기(68~84px)는 카드마다 정해 저장한다.

#### 이미지 규칙

- 배지 이미지를 제외하고 카드에 쓰는 이미지(썸네일, 카드 커버, 미션 대표 이미지 등)에는 텍스트도 로고도 넣지 않는다. 배지 이미지는 지금처럼 이름·값·로고가 들어간다. **구현 상태(7회차, 2026-11-21)**: 카드·미션 이미지 프리셋 4개(홈피드 1:1·16:9·4:5, 미션)의 로고·글자 층을 데이터로 뺐고(마이그레이션 350), 코드는 층이 없는 프리셋을 받아들이며(7-1·7-5), 카드 커버의 대표 색을 저장하고(`cover_colors`, 7-3) 색 규칙 ⑤·⑥으로 자동 배정과 어드민 경고에 쓴다(7-6·7-7). 리본의 «J» 무늬는 남는다(사용자 결정). 윤진 정의와 컨텐츠 자동화 PRD는 7-4가 맞췄다.
- 카드 안 이미지 박스에는 외곽선을 두지 않는다.
- 체크인 지점을 보이는 자리에는 아이콘 대신 그 지점의 이미지를 쓴다. **이미지는 사용자가 수동으로 넣는다**(결정 2026-11-21, 티켓 20261121_1727). 에이전트가 웹에서 찾지 않고 구글 맵·장소 API도 쓰지 않는다(약관상 저장이 안 되고 키·요금이 필요해서 쓰지 않기로 했다). 지금은 목록형 카드 항목의 이미지 칸(`list_items[].image_url`)에 직접 넣으면 되고, 선택 후속(항목 이미지 업로드 버튼, 지점별 이미지 칸 `poi.image_url`)은 사용자가 원할 때 정한다.

#### 구현 때 지킬 점 (채원 판정, 2026-11-20)

- **무작위 값**: 색·칩 자리·기울기·물결 모양·컬렉션 배지 위치는 카드 id를 시드로 정해 DB에 저장한다. `Math.random`은 서버와 브라우저의 결과가 어긋난다. 배정 시점은 2회차에서 정했다: 등록(승인·저장) 때 이웃을 보지 않고 정하고, 배경색은 같은 시기 노출 카드의 사용 빈도가 고르게 퍼지게 고른다(홈 순서가 유저·날짜마다 섞여 이웃이 고정되지 않는다, §10 「값을 정하는 시점」).
- **새 유형 키**: 옛 모양 `ticket`·`hero`·`list`와 새 유형·박스 모양 «티켓»이 같은 말이어서 `shape` 열, `card_shape`, 계측 집계가 섞인다. 새 유형은 따로 키를 둔다: `today_cards.feed_type`(2회차, 마이그레이션 349).
- **이미지 위 제목**: 전체 배경 이미지 유형은 이미지 위 제목의 대비 기준이 없다. 어두운 막이 필요하며 이미지 규칙(8회차) 전에는 켜지 않는다.
- **박스 구현**: 티켓·우표·반원은 CSS 마스크(radial-gradient), 물결만 시드 SVG 경로로 그리는 것을 권한다. 픽셀 고정 치수는 비율 변환과 충돌하므로 구현 때 맞춘다.
- **새 색 이름**: 원색 5개는 기존 `--jam-*`를 쓴다. 연한 색은 `--jam-*-soft`, 참조 색은 `--feed-ref-red·blue·lime·pink·yellow`로 `colors.css`에 둔다. 카드에는 hex가 아니라 색 키를 저장한다. 계산용 hex가 코드에도 필요하므로 두 정의가 같은지 대조하는 시험을 둔다. 구현 위치: `jam-web/design-system/tokens/colors.css`, `jam-web/src/lib/today/feedConstants.ts`.
- **서비스 전용 상수**: 디자인 시스템에 없는 값(칩 높이 32·40, 외곽선 2px, 홈 지름 28·52·56, 도장 60px, 기울기 여섯 값, 물결 12~22px, 모션 0.72초·70~210ms·탄성 곡선)은 `lib/today`의 한 파일에 근거 주석과 함께 둔다. 구현 위치: `jam-web/src/lib/today/feedConstants.ts`.
- **기존 컴포넌트**: `CardFrame`·`CardBody`의 제목·필수 정보·설명 조각, `CardThumb`, `SafeImage`는 그대로 쓴다. 칩·박스 모양 5종·도장·갤러리 4칸·컬렉션 모션·색 배정 함수는 새로 만든다. `LabelChip`은 12px 대문자에 외곽선이 없어 확장하지 않고, `CardChipRow`와 `CardImageSlot`은 옛 7모양 전용으로 둔다.
- **함께 고칠 곳**: 강조색 사용처 규칙(`colors.css` 주석, 디자인 시스템 문서 11 §5.3, `_adherence.oxlintrc.json` 두 곳, `_ds_manifest.json`).

#### 아직 정하지 않은 것

1. 설명 문장 노출은 샘플대로 확정했다. 1회차 후속으로 남은 것: 수동 지정 시 규칙에 걸리는 색의 처리(경고만 할지), 문구 칩 글자 수(12자 제안).
2. ~~체크인 지점 이미지의 출처·저장·승인.~~ 해결(2026-11-21): 사용자가 수동으로 넣는다(위 이미지 규칙). 선택 후속만 남았다.
3. 채도를 높일 색(사용자 댓글 대기).
4. ~~이미지 위 칩과 이미지를 채운 박스의 색 규칙.~~ 해결(7회차-6): 이미지 대표 색은 저장하고(`cover_colors`, 7회차-3) 규칙 ⑤·⑥으로 자동 배정에 쓴다(위 «이미지 대표 색 규칙»). 수동 지정 경고 화면은 7-7이다.
5. 랭킹·배지 목록의 `list` 모양을 새 목록형으로 대신할지.

**분류 스티커 부품**(통합 팔레트 5, 티켓 20261122_2227, 부품만 만들었고 호출부는 없다 — 어느 카드에 어느 자리로 붙일지는 6번 티켓 20261122_2228이 정한다): MODULAR `jam-web/design-system/components/cards/CategorySticker.jsx`(Story `MODULAR/Cards/CategorySticker`, 규칙 `CategorySticker.prompt.md`). 모양은 조약돌 116×84와 물결 덩어리 112×92이고 `shape`·`seed`로 정하며 같은 (shape, seed)는 늘 같은 윤곽이다. 조약돌은 호의 굽기가 시드마다 다르다. 물결은 혹 7~9개·높이 4~8.5px이고 크기·간격이 불규칙하다. 테두리는 `--foreground` 2px이다. 둘레 글자는 분류 문구(ACTIVITY·ITEM·MISSION·CHECK IN·COLLECTION·DROP·PICKUP)를 «문구 · » 단위로 최소 두 번 되풀이해 한 바퀴를 채운다. 굵기 900, 조약돌 11px·물결 10px이 기준이고 길면 글자를 줄이며(하한 7px) 압축하지 않는다. 글자 선은 조약돌 가장자리에서 17px 안쪽, 물결은 혹을 뺀 바탕 모양에서 15px 안쪽이다. 가운데에는 로고 원본 `design-system/assets/logo/jam-logo.svg`의 J·a·m 한 글자를 벡터로 그리고 색 채움에 `--foreground` 외곽선 약 1.6px를 두른다. 색은 보색 짝 8개(노랑+보라, 보라+노랑, 초록+분홍, 분홍+초록, 하늘+빨강, 빨강+하늘, 파랑+노랑, 노랑+파랑 — 앞이 바탕, 뒤가 로고 글자)이고 `var(--jam-*)`로만 참조한다. 시험은 `jam-web/src/components/CategorySticker.test.tsx`다.

## 7. 이동 목적지

카드를 누르면 가는 곳은 **유형 ID가 아니라 템플릿과 대상 필드**로 정해진다. 기사(`editorial_article`)는 항상 기사 상세로 가고, 그 밖의 템플릿은 `target_href`가 있으면 그 값, 없으면 템플릿 규칙을 따른다. 트라이브를 보여 주는 화면은 없다.

**에이전트가 기획하는 카드는 소개한 컨텐츠 하나의 상세 화면으로 보낸다(사용자 결정 2026-11-06, 티켓 20261106_1658).** 아래 표의 «배지 0개»·«배지 여러 개»·«컬렉션 없음»·«미션 없음» 행처럼 목록 화면(`/badges`·`/missions`·`/collections`)으로 해석되는 입력은 코드의 안전망일 뿐이고, 에이전트 등록 경로(운영툴 묶음·등록 스크립트)는 이런 카드를 오류로 거절한다(`registerChecks/homeFeedFields.ts`). 어드민 폼으로 사람이 직접 만드는 카드는 이 검사를 받지 않는다.

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
| `content_intro` | target_href 명시(등록 검사가 필수로 요구한다) | `{target_href}` |
| `content_intro` | target_href 없음(안전망) | `/` |
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

- 상단에 서비스 TopNav(제목 「투데이」, 뒤로 `/`, 동기화·알림·아바타)가 있고, 그 바로 아래에 `cover_image_url` 커버를 16:9로 그린다(동영상은 `<video>`로 무음 루프 재생, 이미지는 우선 로드·`alt`는 빈 값 — 바로 아래 제목이 글자로 보인다). 비어 있으면 16:9 칸 없이 본문부터 보인다. 커버 주소가 있는데 로드에 실패하면 칸이 사라진다. 「← 투데이로」 링크는 없다(TopNav의 뒤로가기가 대신한다).
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
| `click` | 카드를 눌렀을 때. 목록형(`gallery_list`)은 카드 전체 링크가 없어 항목·화살표 링크 클릭만 센다(아래). 옛 랭킹 행형 `list`는 8회차-1에서 지웠다 | `POST /api/today/events` + GA 이벤트 `today_card_click`(`card_id`·`content_type_id`·`template_type`·`shape`) |

- 전송은 `navigator.sendBeacon`을 먼저 쓰고, 안 되면 `fetch(keepalive)`로 보낸다. 실패는 조용히 무시한다.
- **목록형(`gallery_list`)의 클릭**: 카드 전체 링크가 없어 틀(`CardFrame`)에 `link={false}`와 `trackLinkClicks`를 함께 주고, 트래커(`TodayCardTracker`)가 `clickOnLinksOnly`로 카드 안의 링크(항목·화살표) 클릭만 카드 클릭으로 기록한다(제목·빈 곳의 클릭은 세지 않는다). 전송 경로·GA 파라미터는 그대로다. 컬렉션 소개 모션의 관찰자(임계값 55%, `FeedCollectionBurst`)는 노출 계측의 관찰자(50%)와 따로 만들고 계측을 보내지 않는다(티켓 20261121_0115).
- 서버는 로그인 세션이 있어야 받고, 유저별 분당 60건을 넘으면 429다. 카드가 존재하고 활성이며 노출 기간 안일 때만 기록한다(아니면 400). `followup` 이벤트는 400으로 거부한다.
- 저장(`today_card_events`)에는 카드 ID·기록 시점 유형 ID·기록 시점에 그려진 모양(`card_shape`)·기록 시점 카드의 패턴 번호(`pattern_no`)·이벤트 종류만 남고 **유저 식별자는 없다.** 패턴 번호는 노출 검증이 카드를 조회할 때 함께 읽은 카드의 `pattern_no`를 그대로 복사한 값이다(카드를 다시 조회하지 않고, 형식을 다시 검사하지 않는다). 패턴이 없는 카드(어드민에서 직접 만든 카드)와 패턴 열 도입 전 기록은 NULL이다(옛 기록을 채우지 않는다, 티켓 20261008_1059). 유저 ID는 빈도 제한 판정에만 인스턴스 메모리에서 쓴다.
- 그려진 모양(`card_shape`)은 새 유형 이름(`hero_box`·`text_box`·`badge_intro`·`badge_only`·`collection_intro`·`drop_pickup`·`gallery_list`)이다(티켓 20261122_1101). 노출 검증이 카드를 조회할 때 함께 읽은 값(`feed_type`·`cover_image_url`·`badge_ids`·`list_items`)을 화면(`toCardView`)과 같은 판정 함수(`feedType.ts`의 `resolveFeedType`)에 넣어 정한다(카드는 한 번만 조회, 레시피·옛 모양 칸은 읽지 않는다). `feed_type`이 비었거나 모르는 값이면 `text_box`이고, 그릴 값이 없는 컬렉션 소개(커버 없음)·드랍·픽업(배지 0개)·목록형(그릴 수 있는 항목 0개)도 화면처럼 `text_box`로 기록한다. 이전에 쌓인 기록의 `card_shape`는 옛 모양 이름(`hero`·`poster`·`list` 등)이거나 NULL로 그대로 남는다 — 옛 기록을 새 이름으로 바꾸지 않는다.
- **기록 유형 = 화면 유형**: 같은 카드 행이면 기록 유형(`events.ts`)과 홈이 그리는 유형(`toCardView`의 `feedType`)이 같다. 두 경로가 같은 판정 함수에 같은 입력(`feed_type`·커버 유무·`badge_ids` 개수·`list_items`)을 넣기 때문이다(`feed_type` 8가지와 비었거나 모르는 값 × 커버 유무 × 배지 0개·그림 있는 배지·그림 없는 배지 × 목록 4종을 `shapeParity.test.ts`가 전부 맞춘다). **허용 차이 하나**: `badge_ids`가 있지만 그 배지가 전부 삭제된 드랍·픽업 카드는 화면이 조회된 배지가 없어 `text_box`로 그리고 기록은 `badge_ids`가 있어 `drop_pickup`이다 — 이벤트 경로에 배지 조회를 더하지 않으려는 대가이고 어드민이 삭제된 배지를 카드에 남겨 둔 드문 경우에만 생긴다(같은 테스트가 명시 케이스로 고정한다). 옛 7모양 시절의 허용 차이(전부 삭제된 배지의 타일형 `list`, 후보가 전부 삭제된 레시피 공개 카드)와 전환 상수 `LEGACY_SHAPE_CUTOVER` 기반 기록은 사라졌다.
- GA `today_card_click`의 `shape`는 그 카드가 화면에 그려진 유형이다. 카드 틀(`CardFrame`)이 표시 데이터의 `tracking.feedType`을 넘긴다. 파라미터 이름(`card_id`·`content_type_id`·`template_type`·`shape`)은 그대로이고 `shape`의 값이 옛 모양 이름에서 새 유형 이름으로 바뀐다(티켓 20261122_1101). `/api/today/events`는 유형을 받지 않고 서버가 카드를 조회해 정한다.
- 집계: `GET /api/admin/today/metrics?from=&to=`(기본 최근 7일, 어드민 읽기 토큰 허용)가 유형 ID별 노출·열람 수와 열람률(`types`)을 돌려주고, 그려진 모양별 노출·열람·후속 건수와 열람률(`byShape`)을 함께 돌려준다. `card_shape`가 NULL인 기록(모양 도입 전 기록, 전환 전 옛 카드)은 `byShape`에서 `unknown`으로 묶는다. 8회차-1 이후 기록은 새 유형 이름이라 `byShape`에 옛 모양 이름(이전 기록)과 새 유형 이름(이후 기록)이 함께 나온다. 패턴 번호별 노출·열람·후속 건수와 열람률(`byPattern`)도 함께 돌려준다 — 패턴 번호 숫자 순이고, `pattern_no`가 NULL인 기록은 `patternNo: null` 한 줄로 묶어 맨 끝에 둔다(`unknown` 문자열을 쓰지 않는다. 결정 기록 API의 `byPattern`과 같은 모양). `range`·`types`·`byShape`의 이름·값·순서는 그대로다.
- **`byShape` 행의 `kind`**(티켓 20261122_1328): 응답 키 `byShape`·`shape`는 소비 코드 호환 때문에 그대로 두고, 행마다 `kind`를 더한다. `shape`가 새 유형 8가지 이름이면 `feed_type`, `unknown`이면 `unknown`, 그 밖(옛 7모양 이름, 8회차-1 이전 기록)이면 `legacy`다. 형식은 `{ shape, kind, impression, click, followup, clickThroughRate }`이고 정렬·값 계산은 그대로다.
- 기사 상세 화면·CTA 버튼·오늘의 현황 스트립은 이 계측 대상이 아니다.
- 어드민 투데이의 미리보기(날짜 미리보기 모달, 카드 폼의 「홈 화면 미리보기」)는 계측 대상이 아니다. 미리보기는 표시 데이터에 계측 정보(`tracking`)를 싣지 않고 새 틀(`TodayCard`)로 그려서 `TodayCardTracker`와 카드 링크(랭킹 카드는 순위 행 링크 포함)가 없고, 노출·클릭 요청과 GA 이벤트가 나가지 않으며 눌러도 이동하지 않는다. 홈은 `tracking`을 싣고 그려 계측이 그대로 동작한다. 예전에 어드민이 쓰던 `TodayCardStack`의 `preview` prop은 조각 b7(티켓 20261001_2244)이 지웠다.

근거: `jam-web/src/components/today/TodayCardTracker.tsx`, `jam-web/src/lib/today/cardEventClient.ts`(`todayCardClickParams`)·`events.ts`, `jam-web/src/app/api/today/events/route.ts`, `jam-web/src/app/api/admin/today/metrics/route.ts`

## 10. 데이터

| 테이블 | 쓰임 |
|---|---|
| `today_cards` | 카드 한 장 = 한 행. 제목·부제·게재용 설명문(`description`)·템플릿·옛 레이아웃(`layout_type`)·노출 태그·노출 기간·활성 여부·정렬·대상 필드(`badge_ids`·`mission_id`·`item_book_id`·`ranking_mode_id`·`region_label`·`target_href`)·기사 본문·커버·유형 ID·이미지 제작 경로(`image_source`)·이미지 안 제목 여부(`title_in_image`)·옛 카드 모양(`shape`, 쓰지 않는 칸). `layout_type`(옛 레이아웃)과 `shape`는 «옛 칸, 쓰지 않음(2026-11-22), 값은 보관»이다(§6 「옛 칸의 상태」). `title_in_image`는 NULL 허용이고 NULL이면 «이미지에 제목 없음»이다 
| `today_cards`의 개편 구성 칸 15개 | 마이그레이션 349(티켓 20261120_2149, 구현 전 규격 §6 「개편 규격」의 저장 자리). 전부 NULL 허용이고, NULL은 «자동 규칙이 정한다»(제목 칩 낱말·도장은 «없음»)는 뜻이다. 옛 `shape`는 옛 7모양 카드를 위해 그대로 둔다. 아래 「개편 구성 칸」 표 참고 |
| `today_card_events` | 노출·열람 기록(§9). 기록 시점에 그려진 유형을 `card_shape` 칸에 복사한다(칸 이름은 옛 이름 그대로, NULL 허용 — 모양 도입 전 기록만 NULL이다. 8회차-1 이후 기록은 새 유형 이름이고 이전 기록은 옛 모양 이름이다). 유저 식별자 없음 |
| `external_input_daily` | 날씨·특일 하루 값(§4) |

**개편 구성 칸** (마이그레이션 349. 허용 값은 DB CHECK가 지키고, 아래 값 목록의 정본은 이 표다)

| 칸 | 값 | 뜻 |
|---|---|---|
| `feed_type` | `hero_box`·`full_image`·`badge_intro`·`badge_only`·`collection_intro`·`drop_pickup`·`text_box`·`gallery_list` | 새 카드 유형 8가지. 옛 모양 `shape`와 이름이 겹치지 않도록 별도 칸이다 |
| `box_shape` | `round`·`ticket`·`stamp`(우표)·`wave`(물결)·`bump`(반원 돌출) | 박스 모양 5가지. 텍스트 박스와 이미지 마스크 양쪽에 쓴다 |
| `box_kind` | `text`·`image_mask` | 박스 용도(글자를 담는 박스 / 이미지를 박스 모양으로 자른 마스크) |
| `bg_color_key`·`chip_color_key`·`box_color_key` | 색 키 19개(마이그레이션 357로 새 키 4개 추가): `red`·`yellow`·`green`·`purple`·`blue`, `red-soft`·`yellow-soft`·`green-soft`·`purple-soft`·`blue-soft`, `ref-red`·`ref-blue`·`ref-lime`·`ref-pink`·`ref-yellow`, `green-deep`·`pink`·`sky`·`white` | 배경·칩·박스 색. hex가 아니라 키를 저장한다 |
| `chips` | JSONB 배열 최대 2개. 원소 `{kind: value\|phrase\|label, source?, text?, slot?, tilt?}` | 칩 목록. `value`는 `source`(값의 출처 키), `phrase`는 `text`가 필수이고 `label`은 구분 칩이다. `tilt`는 −8·−6·−4·4·6·8. `slot`은 유형마다 다른 자리 이름(코드 상수가 정본, DB는 소문자·숫자·하이픈 24자 이하만 본다). NULL은 자동, `[]`는 칩 없음 |
| `title_chip_words` | 텍스트 배열 최대 2개 | 제목 속 칩으로 만들 낱말. 제목에 그대로 들어 있어야 하는 검사는 저장하는 코드가 한다(제목을 고칠 때 DB 오류가 나지 않게 DB는 개수와 공백만 본다). NULL과 `[]`는 같은 뜻(칩 없음) |
| `show_description` | 불리언 | 설명 문장 노출 여부. NULL이면 유형 기본값 |
| `stamp_enabled`·`stamp_slot` | 불리언·자리 이름 | 도장 사용 여부와 자리. NULL이면 자동(쓰지 않음) |
| `list_items`·`list_more_href` | JSONB 배열 최대 3개 `{name, href, image_url?}`·텍스트 | 목록형 카드의 항목(항목마다 링크)과 «→» 칸의 대표 페이지 주소 |
| `collection_burst` | JSONB 배열 최대 4개 `{x, y, tilt?, size?, delay_ms?}` | 컬렉션 소개 카드의 아이템 배지 도착 위치. `x`·`y`는 가운데에서 카드 가장자리까지를 1로 본 −1~1, `size` 68~84px, `delay_ms` 70~210 |
| `feed_seed` | 0 이상 2^32 미만 정수 | 무작위 값(색·칩 자리·기울기·물결 모양·배지 위치)을 고정하는 시드. 한 번 정하면 바꾸지 않는다 |
| `cover_colors` | JSONB 배열 최대 3개 `#rrggbb` 문자열 | 커버 이미지의 대표 색(마이그레이션 351, 티켓 20261121_1724). 원색(보정 전), 밝기 높은 순. NULL=아직 안 뽑음, `[]`=색 없음. 커버 주소가 바뀌면 같은 쓰기에서 새로 뽑고, 뽑지 못하면 DB 트리거가 NULL로 비운다. 저장만 하며 색 배정은 읽지 않는다 |

**값을 정하는 시점**(구현: 어드민은 5회차, 에이전트는 6회차): 에이전트가 낸 카드는 운영 항목이 승인되어 `today_cards`에 들어갈 때, 어드민에서 만드는 카드는 저장할 때 정하고 이후에는 바꾸지 않는다. 홈 피드는 유저·날짜마다 순서가 섞여(`sortHomeCards`) 카드의 실제 이웃이 유저마다 달라서, 이웃 카드와 겹치지 않는 배정은 저장된 순서로 보장할 수 없다. 그래서 배경색은 같은 시기에 노출되는 카드들의 사용 빈도가 고르게 퍼지도록 정한다(이웃이 아니라 «같은 기간에 겹치는 카드 집합»을 본다). 사용자가 지정한 값은 자동 배정이 덮어쓰지 않는다.

**구현 위치(5회차-1, 티켓 20261121_1315)**: 어드민에서 만드는 카드의 저장 경로는 순수 함수 `jam-web/src/lib/admin/feedCardFields.ts`(폼 값 변환·검증·`decideFeedCardValues`)와 두 라우트(`POST /api/admin/today`, `PATCH /api/admin/today/[id]`)다. 유형(`feed_type`)이 비어 있으면 옛 7모양 카드라 새 칸을 검증만 하고(채워져 있으면 경고) 시드·색을 정하지 않는다. `PATCH`는 이미 저장된 값을 다시 정하지 않는다(예외: 기존 카드에 처음 유형을 지정하며 시드가 없으면 한 번 정하고, 색을 «자동»으로 되돌려 보내면 저장된 시드로 그 색만 다시 정한다).

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

- **생성 구간**(§4~§7의 표): `node scripts/gen-home-feed-doc.mjs`가 `today-sections.ts`·`targetHref.ts`·`feedChipSlots.ts`·`feedTypeLabels.ts`에서 다시 만든다(§6의 카드 유형 목록은 `FEED_TYPES`와 `FEED_TYPE_LABELS`를 읽은 결과다. 옛 7모양 표는 8-4에서 걷었다). `--check`는 `scripts/verify.sh`와 pre-commit에서 돌며, 코드와 다르면 실패한다.
- **동기화 검사**: frontmatter `code:`의 경로 아래 파일을 바꾸는 커밋은 이 문서도 함께 스테이지해야 pre-commit을 통과한다(`gen-home-feed-doc.mjs --staged`). 테스트 파일(`__tests__/`·`*.test.*`)만 바뀐 커밋은 제외다. 동작이 바뀌지 않은 변경(리팩터링 등)은 `JAM_SKIP_DOCLINT=1`로 우회하고 사유를 커밋 메시지에 남긴다.
- 머지 커밋은 pre-commit을 거치지 않는다. 브랜치를 합친 뒤에는 `--check`를 한 번 돌린다.
- 서술(생성 구간 밖)은 사람이 고친다. 서술에 새 사실을 적을 때는 근거 파일을 절 끝에 함께 적는다.

근거: `scripts/gen-home-feed-doc.mjs`, `.githooks/pre-commit`, `scripts/verify.sh`, 티켓 20260927_2036

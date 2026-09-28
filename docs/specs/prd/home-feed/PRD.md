---
type: prd
status: active
description: "홈피드(홈 「투데이」) 화면 구성·카드 노출 규칙·노출 태그·템플릿·레이아웃·이동 목적지·기사 상세·계측을 코드 기준으로 정의하는 정본이다."
tags: [피드, 배지, 미션, 컬렉션, 랭킹]
related:
  - "20260927_2033"
code:
  - "jam-web/src/app/(main)/page.tsx"
  - "jam-web/src/app/(main)/TodayCardStack.tsx"
  - "jam-web/src/app/(main)/TodayCardTracker.tsx"
  - "jam-web/src/app/(main)/TodayStatusStrip.tsx"
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

## 1. 한 줄 정의

로그인한 유저의 홈(`/`) 상단에 「오늘의 현황」 두 칸과, 어드민이 등록한 투데이 카드(`today_cards`) 중 **지금 노출 기간 안이고 유저의 현재 상태 태그와 맞는 카드**를 정렬해 보여 주는 화면이다. 카드는 템플릿(무엇을 소개하나)과 레이아웃(어떻게 그리나) 두 축으로 정해지며, 누르면 템플릿·대상 필드로 정해진 화면으로 이동한다.

## 2. 홈 화면 구성

위에서부터 다음 순서다. 이 밖의 영역(최근 획득 배지·바로가기 묶음 등)은 홈에 없다.

| 순서 | 영역 | 내용 |
|---|---|---|
| 1 | 상단 바 | 공통 `TopNav`(로고) |
| 2 | 인사말 + 검색 | 「{이름}」 인사 한 줄과 검색 아이콘(→ `/search`) |
| 3 | 온보딩 퀘스트 카드 | `user_onboarding_quests` 행이 있고 `completed_at`이 비어 있는 유저에게만. 아래 표 |
| 4 | 오늘의 현황 스트립 | 2칸. 왼쪽 「내 진행도」, 오른쪽 「친구 활동」(아래 표) |
| 5 | 투데이 카드 스택 | 제목 「투데이」·부제 「오늘의 소식」. 노출할 카드가 0장이면 영역 전체를 그리지 않는다 |

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
| 진행 중 · sync 차례 | `skipped_at` 없음, 다음 단계가 `sync` | 진행도(n/7)·단계 타이틀/설명·[동기화] 버튼(상단 바 연출 동기화 버튼과 동일 동작 — 스피너 → 연출 배지 1장 → `sync` 단계 기록), CTA에 펄스 강조(퀘스트 진행 중에만). 상단 바(`TopNav`) 중앙 슬롯은 Strava 연동 여부와 무관하게 연출 동기화 버튼으로 고정되고(연동 유도 버튼은 가림), 두 버튼은 같은 컴포넌트(`OnboardingSyncButton`)의 표시 방식만 다르다 |
| 진행 중 · 그 외 차례 | `skipped_at` 없음, 다음 단계가 `bag`\|`pickup`\|`drop`\|`mix_fail`\|`mix_success`\|`browse` | 진행도(n/7)·다음 단계 타이틀/설명·[시작하기/다음 단계] 버튼 → 그 단계가 속한 실제 화면(`/inventory`·`/drops`·`/combine`·`/missions`, `STEP_SCREEN_MAP` 기준), CTA에 펄스 강조(퀘스트 진행 중에만). 카드 전체는 더 이상 링크가 아니다 — 버튼만 인터랙티브하다(중첩 인터랙티브 요소 회피) |
| Strava 미동기화 | 7단계 완료 또는 건너뜀, Strava 미연동 | 7/7·마지막 단계 안내·[Strava 동기화하기] 버튼 → `/api/strava/auth`. 카드 전체는 더 이상 링크가 아니다 |
| 첫 활동 대기 | 7단계 완료 또는 건너뜀, Strava 연동됐지만 활동 0건 | 칩만(진행 바·n/7 없음)·안내 문구(건너뛴 유저에게는 완료 배지를 언급하지 않는 문구)·[동기화] 버튼(실제 `SyncButton` — `POST /api/strava/sync` + 배지 연출/완료 토스트, TopNav 실 동기화 버튼과 동일 동작) |

**건너뛰기**(티켓 20260927_2131, 상위 20260927_2123 T8): "진행 중" 두 행(sync 포함) 모두
카드 아래에 좌측 정렬 텍스트 진입점 「건너뛰기」가 있다. 누르면 시트(`detent="compact"`)로
[계속하기]/[건너뛰기]를 확인받는다. [건너뛰기] → `POST /api/onboarding-quest/skip`이
`skipped_at`을 기록하고(이미 7단계를 마쳤으면 서버가 거부) 완료 판정을 다시 확인한다 → 카드가
"Strava 미동기화"/"첫 활동 대기" 행으로 전환된다. "Strava 미동기화"·"첫 활동 대기" 행에는
진입점이 없다.

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/OnboardingQuestCard.tsx`, `jam-web/src/app/(main)/OnboardingQuestSkipSheet.tsx`, `jam-web/src/app/(main)/OnboardingSyncButton.tsx`(`appearance` prop), `jam-web/src/components/SyncButton.tsx`(`appearance` prop), `jam-web/src/components/ui/TopNav.tsx`(`centerSlotOverride`), `jam-web/src/lib/onboarding-quest/status.ts`, `jam-web/src/lib/onboarding-quest/config.ts`, `jam-web/src/lib/onboarding-quest/screen-gate.ts`(`STEP_SCREEN_MAP`), `jam-web/src/lib/onboarding-quest/progress.ts`(`validateSkip`), `jam-web/src/app/api/onboarding-quest/skip/route.ts`, 펄스 `jam-web/src/components/transitions.css`(`.jam-quest-pulse`), `jam-web/design-system/tokens/motion.css`(`--duration-quest-pulse`·`--ease-quest-pulse`), 문구 `jam-web/src/lib/i18n/ko.ts`(`onboardingQuest`)

**오늘의 현황 스트립**은 큐레이션을 하지 않는다(카드 CMS와 역할이 겹치지 않게). 

| 칸 | 상태 | 표시·이동 |
|---|---|---|
| 내 진행도 | Strava 미연동 | 연동 유도 → `/api/strava/auth` |
| | 진행 중 컬렉션·미션 있음 | 완성도가 가장 높은 1건(동률이면 최근 활동순)의 이름·진행 수 → 그 상세 |
| | 둘 다 없음 | 코드에 고정된 안내 후보 중 요청마다 무작위 1개(드랍·미션) |
| 친구 활동 | 팔로잉 없음 | 검색 유도 → `/search` |
| | 팔로잉은 있으나 오늘 배지 획득 없음 | 칸을 그리지 않는다 |
| | 오늘 배지를 얻은 팔로잉 있음 | 인원 수. 정확히 1명이고 username을 알면 그 프로필, 그 외 `/feed` |

근거: `jam-web/src/app/(main)/page.tsx`, `jam-web/src/app/(main)/TodayStatusStrip.tsx`, `jam-web/src/lib/today/status.ts`, `jam-web/src/app/(main)/TodayCardStack.tsx`, 문구 `jam-web/src/lib/i18n/ko.ts`(`today.cardStackTitle`·`cardStackSubtitle`)

## 3. 카드 노출 규칙

요청마다 서버가 다음 순서로 카드를 고른다(`getTodayCards`).

1. 유저의 현재 태그를 계산한다(§4).
2. `today_cards`에서 `is_active = true`이고 `starts_at ≤ 지금 ≤ ends_at`이며 `exposure_tags`가 유저 태그와 **하나라도 겹치는**(OR) 카드를 읽는다. `all`은 모든 유저가 가지므로 `all`이 붙은 카드는 기간 안이면 모두에게 보인다.
3. 정렬은 `sort_order` 오름차순, 같으면 `starts_at` 내림차순이다.
4. `mission_spotlight` 카드 중 가리키는 미션이 이 유저에게 공개 상태가 아닌 것(어드민 수동 비노출, 이미 완료, 잠김·숨김)을 뺀다. 판정은 미션 목록·상세·참가 API와 같은 `isMissionExposed`·`resolveMissionVisibility`이며 `open`인 미션만 남는다. `mission_id`가 없는 미션 카드는 그대로 둔다.
5. 카드의 `badge_ids`를 배지 정보로 바꾸고, 유저가 그 배지를 **이미 가졌는지**(활동·미션·컬렉션 보상, 체크인, 인벤토리 세 곳)를 함께 붙인다. 삭제된 배지는 빠진다. 보유 조회가 실패해도 카드는 노출되고 그 배지가 미보유로 그려진다.
6. `ranking_board` 카드는 랭킹모드 순위를 미리 계산해 붙인다.
7. 카드마다 이동 경로를 계산한다(§7).

- 노출 수 상한은 없다. 조건에 맞는 카드는 모두 쌓인다.
- 조회가 실패하면 카드 0장(영역 숨김)으로 처리한다.

근거: `jam-web/src/lib/today/cards.ts`(`getTodayCards`·`filterMissionSpotlightCards`·`fetchBadgesById`·`fetchRankingBoardData`)

## 4. 노출 태그

요청 시점에 유저마다 계산한다(`computeUserExposureTags`). `all`과 시간대 태그 1개는 **항상** 붙고, 나머지는 조건을 만족할 때만 붙는다.

| 태그 | 판정 |
|---|---|
| `time_*` | KST 시각 기준. 00~06 `dawn`, 06~11 `morning`, 11~17 `afternoon`, 17~21 `evening`, 21~24 `night` |
| `has_participating_mission` | 참가했지만 완료하지 않은 미션이 1개 이상 |
| `has_ending_soon_mission` | 그중 `ends_at`이 지금부터 3일 안인 미션이 있음 |
| `has_incomplete_itembook` | 슬롯을 채우기 시작했지만 완성하지 않은 컬렉션이 있음(분모는 드랍 제외 배지를 뺀 아이템 배지) |
| `itembook_remaining_le3` | 그 미완성 컬렉션들의 남은 슬롯 최솟값이 3 이하(`ITEMBOOK_REMAINING_MAX`) |
| `strava_stale_14d` | Strava 연결이 있고 마지막 동기화에서 14일 이상 지남(`STRAVA_STALE_DAYS`). 한 번도 동기화하지 않았으면 해당, 연결이 없으면 붙지 않는다 |
| `new_user` | 가입 7일 이내 |
| `weather_*` | 그날 저장된 날씨 값(아래) |
| `holiday_today`·`seasonal_today`·`anniversary_today` | 그날 저장된 특일 목록을 **이름**으로 판정(대상 목록 정본 `jam-doc/planning/content/SPECIAL_DAYS.md`). 한 날에 여러 개가 켜질 수 있다 |

**날씨·특일 입력**: 요청 때 외부 API를 부르지 않는다. Vercel 크론 `/api/cron/external-inputs`가 매일 06:00 KST(`jam-web/vercel.json`의 `0 21 * * *` UTC)에 기상청 단기예보(서울 격자 60·127)와 특일정보를 받아 `external_input_daily`에 저장하고, 홈은 그 저장값만 읽는다. 날씨 구분은 오늘 예보에 강수가 있으면 `rain`, 없고 최고 33°C 이상 또는 최저 -12°C 이하면 `extreme`, 하늘 맑음이면 `clear`, 그 밖은 `mild`다. **저장값이 없거나 읽기에 실패하면 해당 태그만 조용히 빠진다**(홈이 깨지지는 않는다). 그래서 날씨·특일 태그만 단 카드는 저장이 실패한 날 아무에게도 보이지 않는다 — 요일마다 `all` 카드를 두는 운영 규칙의 이유다(content-automation PRD §8).

근거: `jam-web/src/lib/today/exposure.ts`, `jam-web/src/lib/inputs/weather.ts`·`holidays.ts`·`special-days-config.ts`·`daily-store.ts`, `jam-web/src/app/api/cron/external-inputs/route.ts`

노출 태그 값·라벨(`TODAY_EXPOSURE_TAG_OPTIONS`):

<!-- BEGIN generated: exposure-tags -->
| 값 | 라벨 |
|---|---|
| `all` | all (항상 노출) |
| `time_dawn` | time_dawn (00~06) |
| `time_morning` | time_morning (06~11) |
| `time_afternoon` | time_afternoon (11~17) |
| `time_evening` | time_evening (17~21) |
| `time_night` | time_night (21~24) |
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
| 값 | 라벨 | 추천 레이아웃 | 참조 필드 |
|---|---|---|---|
| `badge_spotlight` | 배지 소개 (badge_spotlight) | 큰 썸네일형 — 커버 이미지 크게 | 배지·이동경로(target_href) |
| `progress_nudge` | 진행 알림 (progress_nudge) | 바로가기형 — 이미지 없는 짧은 CTA | 배지·미션·이동경로(target_href) |
| `mission_spotlight` | 미션 소개 (mission_spotlight) | 큰 썸네일형 — 커버 이미지 크게 | 미션·이동경로(target_href) |
| `itembook_milestone` | 컬렉션 소식 (itembook_milestone) | 배너형 — 가로 띠 배너 | 컬렉션·이동경로(target_href) |
| `location_trend` | 지역 트렌드 (location_trend) | 배지목록형 — 배지 갤러리/리스트 | 배지·지역·이동경로(target_href) |
| `drop_alert` | 드랍 유도 (drop_alert) | 바로가기형 — 이미지 없는 짧은 CTA | 없음 |
| `editorial_article` | 에디토리얼 기사 (editorial_article) | 큰 썸네일형 — 커버 이미지 크게 | 본문·미션·컬렉션·이동경로(target_href) |
| `ranking_board` | 랭킹보드 (ranking_board) | 순위 리스트형 — 랭킹보드 목록(포디엄 없음) | 랭킹모드·이동경로(target_href) |
<!-- END generated: templates -->

컨텐츠 유형 카탈로그(`TODAY_CONTENT_TYPE_OPTIONS`, PRD `content-automation/PRD.md` §6과 같은 값):

<!-- BEGIN generated: content-types -->
| 값 | 라벨 |
|---|---|
| `T01` | T01 · 트라이브×날씨/시간/장소/사회이슈 컬렉션 소개 |
| `T02` | T02 · 컬렉션 완성 독려(잔여 N개 이하) |
| `T03` | T03 · 액티비티 동기화 오래됨 독려 |
| `T04` | T04 · 시즌 이슈×트라이브 연결 |
| `T05` | T05 · 사회 이슈×체크인 지점·지역 소개 |
| `T06` | T06 · 트라이브 교차 믹스 추천 |
| `T07` | T07 · 진행 넛지(다음 배지까지 한 걸음) |
| `T08` | T08 · 날씨 기반 즉시 활동 추천 |
| `T09` | T09 · 시간대별 활동 추천 |
| `T10` | T10 · 픽업 후 미믹스 유도 |
| `T11` | T11 · 트라이브 미선택 유저 적성 매칭 |
| `T12` | T12 · 주간 활동 리캡 |
| `T13` | T13 · 신규 지역 진입 POI·체크인 소개 |
| `T14` | T14 · 연속 기록(스트릭) 독려 |
| `T15` | T15 · 함께하기(그룹 활동) 제안 |
| `T16` | T16 · 여행·지역 이동 감지 |
| `T17` | T17 · 계절 전환 예고 |
<!-- END generated: content-types -->

## 6. 레이아웃과 커버 이미지

레이아웃은 카드를 **어떻게** 그리는지 정한다(템플릿과 별개 축). DB 컬럼은 NOT NULL이고 기본값은 `large_thumbnail`이며, 목록에 없는 값이 오면 화면은 큰 썸네일형으로 그린다.

| 레이아웃 | 커버 이미지 | 화면 |
|---|---|---|
| `large_thumbnail` | 쓴다 | 16:9 커버 + 템플릿 칩 + 제목·부제 + 「자세히 보기 →」(기사는 「기사 읽기 →」) |
| `banner` | 쓴다 | 가로 띠 배너 |
| `badge_gallery` | 쓰지 않는다 | 연결된 배지를 가로로 나열 |
| `shortcut` | 쓰지 않는다 | 이미지 없는 짧은 CTA |
| `other` | 쓰지 않는다 | 기본형 |
| `ranking_list` | 쓰지 않는다 | 순위 목록. 행마다 유저 프로필 링크라 카드 전체 링크가 없다 |

**커버 결정**: `cover_image_url`이 있으면 그 이미지를 그대로 쓴다. 없으면 첫 번째 배지 이미지를 커버로 올리고, 유저가 그 배지를 아직 갖지 않았으면 흑백으로 그린다. 둘 다 없거나 이미지를 불러오지 못하면 **커버 영역 자체를 그리지 않고** 템플릿 칩·제목·부제만 보인다(대체 이미지 없음, `SafeImage`가 빈 요소를 돌려준다). `mission_spotlight`는 배지를 쓰지 않으므로 커버를 넣지 않으면 글자만 있는 카드가 된다 — 그래서 운영 규칙은 미션 대표 이미지(`missions.image_url`)를 커버로 넣는다(content-automation PRD §8). 커버 주소는 어드민 자유 입력이라 호스트를 알 수 없으므로 `SafeImage`로 그려 잘못된 주소가 홈 전체를 깨뜨리지 않게 한다.

근거: `jam-web/src/app/(main)/TodayCardStack.tsx`(`resolveCover`·레이아웃별 카드 컴포넌트), `jam-web/src/components/SafeImage.tsx`, `jam-web/supabase/migrations/049_today_cards_layout_type.sql`

레이아웃 값·라벨(`TODAY_LAYOUT_OPTIONS`):

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

- 상단에 `cover_image_url` 커버를 그린다. 비어 있으면 커버 영역 없이 본문부터 보인다.
- **본문(`body_markdown`)은 마크다운으로 렌더되지 않는다.** 빈 줄로 문단을 나누고 문단 안 줄바꿈은 그대로 보인다. `**`·`#`·`-` 같은 문법은 글자 그대로 나온다.
- 본문 끝 CTA 버튼은 1개이며 우선순위는 §7의 두 번째 표다. 라벨은 직접 링크 「자세히 보기」, 컬렉션 「컬렉션 보기」, 미션 「미션 보기」다. 대상이 모두 없으면 버튼을 그리지 않는다.
- 기사 화면과 CTA 버튼에는 계측이 없다(§9).

근거: `jam-web/src/app/(main)/today/[cardId]/page.tsx`, `jam-web/src/lib/today/cards.ts`(`getPublishedArticleCard`), 문구 `jam-web/src/lib/i18n/ko.ts`(`todayCard.ctaView*`)

## 9. 계측

| 이벤트 | 언제 | 어디로 |
|---|---|---|
| `impression` | 카드가 화면에 50% 이상 보였을 때. 같은 브라우저 세션에서 카드당 1회(`sessionStorage`) | `POST /api/today/events` |
| `click` | 카드를 눌렀을 때. `ranking_list`는 세지 않는다(노출만) | `POST /api/today/events` + GA 이벤트 `today_card_click`(`card_id`·`content_type_id`·`template_type`) |

- 전송은 `navigator.sendBeacon`을 먼저 쓰고, 안 되면 `fetch(keepalive)`로 보낸다. 실패는 조용히 무시한다.
- 서버는 로그인 세션이 있어야 받고, 유저별 분당 60건을 넘으면 429다. 카드가 존재하고 활성이며 노출 기간 안일 때만 기록한다(아니면 400). `followup` 이벤트는 400으로 거부한다.
- 저장(`today_card_events`)에는 카드 ID·기록 시점 유형 ID·이벤트 종류만 남고 **유저 식별자는 없다.** 유저 ID는 빈도 제한 판정에만 인스턴스 메모리에서 쓴다.
- 집계: `GET /api/admin/today/metrics?from=&to=`(기본 최근 7일, 어드민 읽기 토큰 허용)가 유형 ID별 노출·열람 수와 열람률을 돌려준다.
- 기사 상세 화면·CTA 버튼·오늘의 현황 스트립은 이 계측 대상이 아니다.

근거: `jam-web/src/app/(main)/TodayCardTracker.tsx`, `jam-web/src/lib/today/cardEventClient.ts`·`events.ts`, `jam-web/src/app/api/today/events/route.ts`, `jam-web/src/app/api/admin/today/metrics/route.ts`

## 10. 데이터

| 테이블 | 쓰임 |
|---|---|
| `today_cards` | 카드 한 장 = 한 행. 제목·부제·템플릿·레이아웃·노출 태그·노출 기간·활성 여부·정렬·대상 필드(`badge_ids`·`mission_id`·`item_book_id`·`ranking_mode_id`·`region_label`·`target_href`)·기사 본문·커버·유형 ID·이미지 제작 경로(`image_source`) |
| `today_card_events` | 노출·열람 기록(§9). 유저 식별자 없음 |
| `external_input_daily` | 날씨·특일 하루 값(§4) |

컬럼의 정확한 정의는 [02_DATA_MODEL.md](../02_DATA_MODEL.md)와 `jam-web/src/types/database.generated.ts`가 정본이다. 카드는 어드민 `/admin/today` 화면, 주간 편성 시드 SQL, 에셋 제너레이터 등록 스크립트 세 경로로 만들어지며 `image_source`로 구분된다(§11).

## 11. 운영 규칙 위치

이 문서는 화면 동작만 정의한다. 아래 규칙은 해당 문서가 정본이다.

| 주제 | 정본 |
|---|---|
| 유형 카탈로그 17종·편성 규칙(요일별 전원 큰 카드, 미션 카드는 미션 대표 이미지)·주간 주기·승인·등록·전략 변경안·유형 리뷰 | [content-automation/PRD.md](../content-automation/PRD.md) §6·§8·§8-1·§8-2·§10·§11 |
| 코퍼스(세계관·컬렉션·배지 원문) 조회 API와 자동 선택 | [content-automation/PRD.md](../content-automation/PRD.md) §4 |
| 이미지가 필요한 카드의 등록 묶음·검사(미션 카드 레이아웃, 이미지 글자 수) | [asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md](../asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md) |
| 어드민 주간 달력의 카드 편성 표시 | [admin-ui/ADMIN_PRD.md](../admin-ui/ADMIN_PRD.md) |
| 윤진의 주간 편성 루틴 | `.claude/agents/jam-marketer.md` ⑥·⑧, `.claude/skills/jam-work/references/scheduled-jobs.md` 「주간」 |

## 12. 이 문서를 최신으로 유지하는 방법

- **생성 구간**(§4~§7의 표): `node scripts/gen-home-feed-doc.mjs`가 `today-sections.ts`·`targetHref.ts`에서 다시 만든다. `--check`는 `scripts/verify.sh`와 pre-commit에서 돌며, 코드와 다르면 실패한다.
- **동기화 검사**: frontmatter `code:`의 경로 아래 파일을 바꾸는 커밋은 이 문서도 함께 스테이지해야 pre-commit을 통과한다(`gen-home-feed-doc.mjs --staged`). 테스트 파일(`__tests__/`·`*.test.*`)만 바뀐 커밋은 제외다. 동작이 바뀌지 않은 변경(리팩터링 등)은 `JAM_SKIP_DOCLINT=1`로 우회하고 사유를 커밋 메시지에 남긴다.
- 머지 커밋은 pre-commit을 거치지 않는다. 브랜치를 합친 뒤에는 `--check`를 한 번 돌린다.
- 서술(생성 구간 밖)은 사람이 고친다. 서술에 새 사실을 적을 때는 근거 파일을 절 끝에 함께 적는다.

근거: `scripts/gen-home-feed-doc.mjs`, `.githooks/pre-commit`, `scripts/verify.sh`, 티켓 20260927_2036

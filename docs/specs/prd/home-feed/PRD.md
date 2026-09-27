---
type: prd
status: draft
description: 홈피드 카드 노출·템플릿·레이아웃·이동 목적지 등 기능 정의를 담는 문서다(뼈대, 본문은 20260927_2037에서 작성한다).
tags: [피드, 배지, 미션, 컬렉션, 랭킹]
related:
  - "20260927_2033"
code:
  - "jam-web/src/app/(main)/page.tsx"
  - "jam-web/src/app/(main)/TodayCardStack.tsx"
  - "jam-web/src/app/(main)/TodayCardTracker.tsx"
  - "jam-web/src/app/(main)/TodayStatusStrip.tsx"
  - "jam-web/src/app/(main)/today"
  - "jam-web/src/lib/today"
  - "jam-web/src/lib/admin/today-sections.ts"
  - "jam-web/src/app/api/today"
  - "jam-web/src/lib/inputs"
  - "jam-web/src/app/api/cron/external-inputs"
---

# 홈피드 기능 정의

## 1. 한 줄 정의

> 2037에서 작성

## 2. 홈 화면 구성

> 2037에서 작성

## 3. 카드 노출 규칙

> 2037에서 작성

## 4. 노출 태그

> 2037에서 작성

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

> 2037에서 작성

템플릿 값·라벨·추천 레이아웃·참조 필드(`TODAY_TEMPLATE_OPTIONS`·`SUGGESTED_LAYOUT_FOR`·`TODAY_FIELDS_FOR`):

<!-- BEGIN generated: templates -->
| 값 | 라벨 | 추천 레이아웃 | 참조 필드 |
|---|---|---|---|
| `badge_spotlight` | 배지 소개 (badge_spotlight) | 큰 썸네일형 — 커버 이미지 크게 | 배지·이동경로(target_href) |
| `progress_nudge` | 진행 알림 (progress_nudge) | 바로가기형 — 이미지 없는 짧은 CTA | 배지·미션·이동경로(target_href) |
| `mission_spotlight` | 미션 소개 (mission_spotlight) | 바로가기형 — 이미지 없는 짧은 CTA | 미션·이동경로(target_href) |
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

> 2037에서 작성

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

> 2037에서 작성

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

> 2037에서 작성

## 9. 계측

> 2037에서 작성

## 10. 데이터

> 2037에서 작성

## 11. 운영 규칙 위치

> 2037에서 작성

## 12. 이 문서를 최신으로 유지하는 방법

> 2037에서 작성

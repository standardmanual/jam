---
type: prd
status: draft
description: "에셋 제너레이터 자동 경로(윤진)가 만드는 홈피드 카드 등록 묶음(bundle.json)의 필드·검증 규칙·실행 절차와 등록 기록·되돌림 방식의 정본이다."
tags: [어드민, 피드]
related:
  - "20260925_1413"
  - "20260925_1404"
basis:
  - "docs/service/prd/asset-generator/PRD.md"
  - "docs/service/prd/asset-generator/MISSION_REGISTRATION_BUNDLE.md"
code:
  - "jam-web/scripts/asset-generator/register-home-feed-card.mjs"
  - "jam-web/scripts/asset-generator/registerHomeFeedBundle.mjs"
  - "jam-web/scripts/asset-generator/registerHomeFeedFlow.mjs"
  - "jam-web/scripts/asset-generator/registerHomeFeedRecord.mjs"
  - "jam-web/src/lib/admin/registerChecks/shared.ts"
  - "jam-web/src/lib/admin/registerChecks/bundleRules.ts"
  - "jam-web/src/lib/admin/registerChecks/homeFeedFields.ts"
  - "jam-web/src/lib/admin/registerChecks/homeFeed.ts"
  - "jam-web/src/lib/admin/registerChecks/references.ts"
---

# 홈피드 카드 등록 묶음(bundle.json)과 등록 스크립트

> **상태: draft.** 실제 등록(DB·저장소 쓰기)은 컨펌된 묶음마다 메인 세션이 실행하고, 첫 실행 결과가 나오면
> `active`로 올린다. 이 문서는 [PRD](PRD.md) §8 자동 경로의 «등록 묶음 → 등록» 구간 중 **홈피드 카드(`today_cards`)** 만 정의한다.
> 배지는 [REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md), 미션은 [MISSION_REGISTRATION_BUNDLE.md](MISSION_REGISTRATION_BUNDLE.md),
> 이미지를 만드는 구간(CLI `render.mjs`)은 PRD §8에 있다.

## 1. 범위

- **신규 카드만 등록한다.** 기존 카드 갱신은 범위 밖이다. **같은 제목이면서 같은 시작 일시**인 카드가 이미 있으면 중복으로
  거절한다. 카드는 날짜만 다르게 같은 제목을 다시 쓸 수 있어 제목만 보면 정상 카드를 막기 때문이다. 두 번 동시에 등록하는
  경합은 막지 못한다 — **메인 세션이 한 번에 하나씩 실행한다**는 전제다(미션과 같은 전제,
  [20260925_2106](../../../tickets/p3-low/20260925_2106_Infra_등록-스크립트-제목-중복-검사의-동시-등록-경합.md) 결정 A, 2026-09-25). 시작 일시를 `eq`로
  비교하므로, 분·초 단위 값(어드민 폼과 이 스크립트로 등록한 카드)은 중복으로 거절되지만 **시작 일시에 마이크로초가 붙은 옛 시드 카드는 같은 값을
  넣어도 잡히지 않는다**(2026-09-25 실측, 같은 티켓).
- **기존 주간 편성 등록 경로와 별개다.** 주간 편성(티켓 20260923_2252, `content-automation/PRD.md` §8-2)은 이미 있는 배지·미션을
  골라 카드로 편성하고 시드 SQL로 등록한다. 이 스크립트는 **신규 기획 카드와 그 이미지를 함께** 등록한다. 어느 경로로 만든
  카드인지는 `today_cards.image_source`로 구분된다: 이 스크립트가 만든 카드는 `agent-generator`, 시드 SQL로 등록한 카드는 NULL이고,
  어드민 적용 탭이 대표 이미지를 반영한 카드는 `admin-generator`다(마이그레이션 190).
- **배지·미션 스크립트와 별개다.** 배지·미션 스크립트에서는 내용과 무관한 부품(인자 파싱·묶음 파일 읽기·UUID 형식·기록 파일
  쓰기·시각 표기)만 가져다 쓴다. 홈피드 전용 부분은 `registerHomeFeed*.mjs`에 있다. 다만 등록 전 DB 검사와 되돌림 전 참조 확인은
  서버(운영툴 예약 등록)도 같은 함수를 쓰도록 세 유형 모두 `jam-web/src/lib/admin/registerChecks/`의 TS 모듈로 옮겼고, 이 스크립트의
  `runHomeFeedDbChecks`·`UNDO_REFERENCE_TABLES`는 그 모듈을 감싼다(티켓 20261002_0827). 카드 한 건의 순수 검사(`validateCard`)·카드 상수
  (`CARD_REQUIRED_FIELDS`·`TEMPLATE_TYPES`·`REQUIRED_REFERENCE_FIELDS` 등)·insert 페이로드 코어(`buildTodayCardInsertPayload`)도 같은 폴더의
  `homeFeedFields.ts`로 옮겼고, 정규식(`UUID_PATTERN`·`CONTROL_OR_LINE_BREAK`)과 보조 함수는 `bundleRules.ts`로 옮겼다(티켓 20261002_1027).
  이 스크립트는 그 상수를 같은 이름으로 다시 내보내고 `validateCard`를 부르며, `buildTodayCardInsertPayload`는 얇은 JS 래퍼다. 동작·오류 문장·페이로드
  키 집합은 옮기기 전과 같다. 세계관 검토·이미지 검사·묶음 전체 검사(`validateWorldReview`·`validateImage`·`validateHomeFeedBundle`)는
  서버가 쓰지 않아 이 스크립트에 남는다.
- 묶음이 다루지 않는 필드는 스크립트가 정한다: `id`(등록 전에 정한 UUID), `cover_image_url`(업로드한 WebP 공개 주소),
  `image_source`(항상 `agent-generator`), `created_by`(NULL — 스크립트에는 어드민 계정이 없다), `created_at`(DB 기본값).
  `homeFeedFields.ts`의 페이로드 코어는 서버가 `image_source`·`shape`·`title_in_image`를 정해 넘길 선택 인자를 받는다. 스크립트는 넘기지
  않으므로 값은 위와 같고 `shape`·`title_in_image`는 NULL이다.
- 형식은 **JSON 한 벌(`bundle.json`)** 이다. 사람이 읽고 컨펌하는 자료는 별도 형식이 아니라 `--dry-run` 출력(§6)이 맡는다.
- **시험 등록은 비활성·기간 2099년의 임시 카드 1건으로 한다.** `is_active: false`이면 기간과 무관하게 어디에도 노출되지 않고,
  2099년 기간은 활성으로 바꿔도 실수로 노출되지 않게 하는 이중 안전장치다. 시험 뒤에는 `--undo`로 되돌린다.

### 1.1 이미지가 필요한 카드 (티켓 20260926_1207)

묶음의 `image`는 필수(§3.1)라 **이미지가 필요한 신규 카드만** 묶음으로 만든다. 판별 기준은 코드로 확인한 아래 사실이다(2026-09-26).

| 노출 형태(`layout`) | 커버 이미지(`cover_image_url`) | 근거 |
|---|---|---|
| `large_thumbnail` | 쓴다 | 새 틀이 `hero`로 그리고(미션 소개 카드·커버 없는 배지 카드는 `square`) `toCardView`(`cardView.ts`)가 `cover_image_url`을 이미지 칸에 싣는다(옛 렌더러는 티켓 20261001_2244가 지웠다) |
| `banner` | 쓴다 | `poster`로 그리고 같은 `toCardView`가 `cover_image_url`을 싣는다(커버가 없으면 `brief`라 이미지 칸이 없다) |
| 에디토리얼 기사 상세 | 쓴다(상단 커버) | `today/[cardId]/page.tsx`가 `card.cover_image_url`을 상단에 그린다(37~39행) |
| `shortcut` | 없다 | `today-sections.ts`가 「이미지 없는 짧은 CTA」로 정의한다(78행) |
| `badge_gallery`·`other`·`ranking_list` | 쓰지 않는다 | `list`(타일형·행형)와 `brief`는 이미지 칸이 없다 — `toCardView`가 `imageUrl`을 `hero`·`poster`·`square`에만 싣는다 |

- 이미지가 필요 없는 카드는 묶음 없이 `content-automation/PRD.md` §8-2의 시드 SQL 경로로 등록한다. 주간 리포트 표에는 「이미지 없음(사유)」로 적는다.
- **요일별 큰 카드·미션 카드 규칙(2026-09-26, PRD §8이 정본)**: 「전원 카드」는 매일 `large_thumbnail`이라 이미지가 필요하다. 미션을 소개하는 카드는 `missions.image_url`을 커버로 재사용하므로 묶음을 만들지 않는다(묶음의 `image`는 새로 만든 이미지 전용).
- 주간 리포트에서 이미지가 필요한 카드는 「이미지: 승인 뒤 세션에서 만든다」로 적는다(예약 실행은 이미지를 만들지 않는다, 티켓 20260930_1519). 세션에서 만들 수 없었던 카드는 「이미지 준비 대기(사유)」다(임의 색·자리표시 이미지로 채우지 않는다).

## 2. 묶음 폴더

묶음은 폴더 하나다. 폴더 이름은 `bundle_id`와 같게 쓴다.

- **세션(`/jam-story`)에서 만드는 묶음의 권장 위치**: `docs/assets/home-feed-bundles/<묶음 ID>/`
- **예약(클라우드) 실행은 묶음을 만들지 않는다**(티켓 20260930_1519). 예약 실행이 만들었던 `docs/operations/reports/weekly/<YYYY-Www>-images/<묶음 ID>/`는 지난 리포트의 기록으로만 남는다.

`register-home-feed-card.mjs --bundle`은 `bundle.json`의 **절대경로**를 받으므로 어느 위치의 묶음이든 등록 절차(§6)는 같다.

이미지 용량: 1280×1280 PNG는 실측으로 클라우드 렌더 약 0.5MB, 로컬 렌더 약 0.9MB이고(`scheduled-jobs.md` 상단 환경 블록) 묶음 상한은 5MB다(§3.4).

```
<묶음 폴더>/                    위 두 위치 중 하나
├─ bundle.json                 윤진이 만든다 (이 문서의 형식)
├─ image.png                   CLI(render.mjs)가 만든 원본 PNG. 파일 이름은 자유
├─ registration-record.json    등록 뒤 스크립트가 만든다 (§7)
└─ registration.sql            등록 뒤 스크립트가 만든다 (§7)
```

`image.path`는 `bundle.json` 기준 상대 경로 또는 절대 경로다. `--record-dir`을 주지 않으면 등록 기록은
`bundle.json`이 있는 폴더에 쓴다.

## 3. bundle.json 필드

모든 필드는 아래 표에 있는 것만 허용한다. 표에 없는 필드는 오타를 걸러내려고 거절한다(`cover_image_url`·`image_source`·`created_by`도
여기에 해당한다). 검증은 사유를 **한 번에 모두** 모아서 알린다.

### 3.1 최상위

| 필드 | 필수 | 형식 | 검증 규칙 |
|---|---|---|---|
| `bundle_id` | 필수 | 문자열 | 영문 소문자·숫자·하이픈, 60자 이하(예: `2026-10-05-weekly-mission-card`). 폴더 이름·SQL 기록 파일명(`seed_agent_home_feed_<슬러그>.sql`)에 쓴다 |
| `author` | 필수 | 문자열 | 비어 있지 않은 한 줄 문자열. 윤진이 만들면 `윤진`. 줄바꿈·제어 문자(탭 포함)가 있으면 거절한다 — SQL 기록의 `--` 주석에도 들어가는 값이라 줄바꿈이 섞이면 주석 밖의 실행 가능한 문장이 되기 때문이다 |
| `created_at` | 필수 | ISO 8601 | 시간대가 붙어야 한다(`2026-09-25T10:30:00+09:00`). 화면에는 KST로 바꿔 보여 준다 |
| `color_rationale_link` | 필수 | 문자열 | 컬러(배경색·끝색) 선택 근거를 적은 기획 문서. `http(s)://` 주소이거나 `docs/`로 시작하는 저장소 상대 경로. 형식만 확인하고 파일 존재는 확인하지 않는다 |
| `world_review` | 필수 | 객체 | §3.2 |
| `card` | 필수 | 객체 | §3.3 |
| `image` | 필수 | 객체 | §3.4 |

### 3.2 world_review (세계관 검수 기록)

상위 티켓 [20260925_1404](../../../tickets/p2-normal/20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)의
결정 6·11: 세계관과 닿는 신규 콘텐츠만 윈터 검수를 거치고, 순수 운영성 콘텐츠는 검수 없이 진행하되 **어느 쪽이었는지 기록이 남아야 한다.**
셋 다 필수다.

| 필드 | 형식 | 검증 규칙 |
|---|---|---|
| `world_related` | true \| false | 세계관과 닿는 내용이 있는가 |
| `winter_reviewed` | true \| false | 윈터 검수를 거쳤는가. **`world_related`가 true인데 false이면 거절한다** |
| `reason` | 문자열 | 판단 사유 한 줄. 줄바꿈·제어 문자가 있으면 거절한다. 검수 없이 진행한 경우에도 사유를 적는다(예: 순수 운영성 카드) |

### 3.3 card

이름은 `today_cards` 컬럼 이름과 같다. 필수·선택 구분은 `jam-web/src/types/database.generated.ts`의 `today_cards` Insert 타입(필수
`title`·`template_type`·`starts_at`·`ends_at`)에 어드민 폼의 필수 검사(노출 조건 태그 1개 이상, `TodayCardForm.tsx`의 `collectMissing`)를
더한 것이다. 어드민 생성 API(`api/admin/today/route.ts` POST)는 본문을 검증 없이 insert하므로 **API에는 재사용할 검증 함수가 없다.**
규칙의 원천은 폼·`lib/admin/today-sections.ts` 상수·DB CHECK 제약이고, 허용값 목록은 그 상수에서 뽑는다(테스트가 DB CHECK
마이그레이션 158(노출 형태)·183(컨텐츠 유형)·217(템플릿)과 대조한다). 이 규칙을 코드로 옮긴 원본은 `jam-web/src/lib/admin/registerChecks/homeFeedFields.ts`다(`bundleRules.ts`의 보조 함수를 쓴다).

| 필드 | 필수 | 형식 | 검증 규칙·기본값 |
|---|---|---|---|
| `title` | 필수 | 문자열 | 공백뿐이면 거절. 줄바꿈·제어 문자가 있으면 거절(`author`와 같은 이유). 앞뒤 공백은 잘라서 저장한다 |
| `template_type` | 필수 | 문자열 | `badge_spotlight`·`progress_nudge`·`mission_spotlight`·`itembook_milestone`·`location_trend`·`drop_alert`·`editorial_article`·`ranking_board`·`recipe_reveal` 중 하나(`TODAY_TEMPLATE_OPTIONS`, DB CHECK) |
| `starts_at` | 필수 | ISO 8601 | 시간대가 붙어야 한다. 저장할 때 UTC ISO로 바꾼다(폼과 같다) |
| `ends_at` | 필수 | ISO 8601 | 시간대가 붙어야 하고 `starts_at`보다 뒤여야 한다 |
| `exposure_tags` | 필수 | 문자열 배열 | 1개 이상(항상 노출하려면 `["all"]`). `TODAY_EXPOSURE_TAG_OPTIONS`의 값 또는 소속 트라이브 태그 `tribe_<트라이브 ID>`(`tribe_` + 소문자 UUID)만, 중복 없이 |
| `layout_type` | 선택 | 문자열 | `large_thumbnail`·`badge_gallery`·`shortcut`·`banner`·`other`·`ranking_list` 중 하나(`TODAY_LAYOUT_OPTIONS`, DB CHECK). 없으면 폼이 템플릿을 고를 때 기본으로 고르는 추천값(`SUGGESTED_LAYOUT_FOR`). **`mission_spotlight`는 최종 레이아웃(입력값 또는 생략 시 추천값)이 항상 `large_thumbnail`이어야 한다**(2026-09-26 사용자 결정, `content-automation/PRD.md` §8 미션 카드 규칙 — 대표 이미지가 있는 미션 소개 카드는 커버 이미지가 필수다). `SUGGESTED_LAYOUT_FOR.mission_spotlight`도 `large_thumbnail`이다 |
| `subtitle` | 선택 | 문자열 | 한 줄. 줄바꿈·제어 문자 거절. 없으면 null |
| `description` | 선택 | 문자열 | 게재용 설명문. 한 줄(줄바꿈·제어 문자 거절), 앞뒤 공백을 자른 뒤 공백 포함 40자 이하(`TODAY_DESCRIPTION_MAX_LENGTH`, 어드민 폼 `maxLength`와 같은 상수). 공백뿐이면 거절. `editorial_article`은 쓸 수 없다(본문이 있다). 없으면 null. `--dry-run` 요약의 「설명문」 줄로 확인한다(티켓 20260929_1335) |
| `badge_ids` | 선택 | UUID 배열 | 같은 id를 두 번 넣을 수 없다. 삭제되지 않은 배지가 실제로 있는지 DB를 읽어 확인한다. 없으면 `[]` |
| `mission_id` | 선택 | UUID | `missions`에 있는지 DB를 읽어 확인한다 |
| `item_book_id` | 선택 | UUID | `item_books`에 있는지 DB를 읽어 확인한다 |
| `ranking_mode_id` | 선택 | UUID | `ranking_modes`에 있는지 DB를 읽어 확인한다 |
| `recipe_id` | 선택 | UUID | `recipe_reveal`만 쓴다. `combination_recipes`에 있는지 DB를 읽어 확인한다(공개 전 레시피도 가리킬 수 있다. 마이그레이션 217, 티켓 20261006_1218) |
| `region_label` | 선택 | 문자열 | 한 줄(예: `성수동`). 줄바꿈·제어 문자 거절 |
| `body_markdown` | 선택 | 문자열 | 에디토리얼 기사 본문. 줄바꿈·탭은 허용하고 다른 제어 문자는 거절한다 |
| `content_type_id` | 선택 | 문자열 | `T01`~`T17` 중 하나(`TODAY_CONTENT_TYPE_OPTIONS`, DB CHECK — 마이그레이션 183). 템플릿과 무관하게 붙일 수 있다 |
| `target_href` | 선택 | 문자열 | 앱 안 경로(`/`로 시작, `//` 제외, 공백 없음)이거나 `https://` 주소. 없으면 템플릿 규칙으로 자동 결정된다 |
| `sort_order` | 선택 | 정수 | 기본 0 |
| `is_active` | 선택 | true \| false | 기본 true — **생략하면 기간이 되는 즉시 노출된다**. 유지하기로 결정했다(티켓 [20260925_2135](../../../tickets/p3-low/20260925_2135_Infra_홈피드-등록-스크립트-보완-활성-기본값과-알림-참조.md), 2026-09-25): 등록은 사용자가 `--dry-run` 요약의 「상태」 줄까지 컨펌한 뒤에만 하기 때문이다. 시험 등록은 반드시 false |

**템플릿 규칙(`TODAY_FIELDS_FOR`).** 폼은 템플릿이 쓰지 않는 참조 필드를 저장할 때 조용히 비운다. 묶음은 «적은 대로 등록된다»를 지키려고
그런 값을 **거절한다**(예: `drop_alert`에 `mission_id`). 비어 있는 배열은 «채우지 않은 것»으로 본다.

| 템플릿 | 쓰는 참조 필드 |
|---|---|
| `badge_spotlight` | `badge_ids`, `target_href` |
| `progress_nudge` | `badge_ids`, `mission_id`, `target_href` |
| `mission_spotlight` | `mission_id`, `target_href` |
| `itembook_milestone` | `item_book_id`, `target_href` |
| `location_trend` | `badge_ids`, `region_label`, `target_href` |
| `drop_alert` | 없음(이동 경로는 `/drops`로 고정) |
| `editorial_article` | `body_markdown`, `mission_id`, `item_book_id`, `target_href`(본문 끝 CTA 버튼의 목적지) |
| `ranking_board` | `ranking_mode_id`, `target_href` |
| `recipe_reveal` | `recipe_id`, `target_href`(비우면 기본 `/combine`) |

**꼭 있어야 하는 참조.** 어드민 폼은 참조를 강제하지 않지만, 자동 경로는 사람이 화면을 보며 채우지 않으므로 빈 카드가 실수로 등록되지
않게 이 스크립트가 아래 규칙을 더했다(**스크립트 자체 규칙**이며 폼·DB에는 없다). 목록 중 하나 이상이 채워져 있어야 한다.

| 템플릿 | 필요한 참조 |
|---|---|
| `badge_spotlight` | `badge_ids` |
| `progress_nudge` | `badge_ids` 또는 `mission_id` |
| `mission_spotlight` | `mission_id` |
| `itembook_milestone` | `item_book_id` |
| `location_trend` | `region_label` |
| `editorial_article` | `body_markdown` |
| `ranking_board` | `ranking_mode_id` |
| `recipe_reveal` | 없음(레시피 칸이 비어 있어도 카드가 그려진다 — 레시피 줄 없이) |
| `drop_alert` | 없음 |

스크립트가 정하는 값(묶음에서 받지 않는다): `id`, `cover_image_url`(`?v=` 캐시 무효화 쿼리 포함 — 홈피드의 대표 이미지 컬럼은 `image_url`이
아니라 `cover_image_url`이다), `image_source`(항상 `agent-generator`, 마이그레이션 190의 CHECK 허용값, PRD §10).

### 3.4 image

| 필드 | 필수 | 형식 | 검증 규칙 |
|---|---|---|---|
| `path` | 필수 | 문자열 | 원본 PNG 경로(상대는 `bundle.json` 기준). 파일이 있어야 하고, 비어 있지 않아야 하고, **내용이 PNG**여야 하고(확장자가 아니라 파일 머리의 PNG 서명을 본다), 5MB 이하여야 한다(적용 API와 같은 상한) |
| `seed` | 필수 | 정수 | 마스터 시드(PRD §11). 음수도 허용한다 |
| `preset_id` | 필수 | UUID | 에셋 제너레이터 프리셋 ID. 재현 기록용이라 존재 여부는 확인하지 않는다 |
| `bg_color` | 필수 | `#rrggbb` | 이미지 배경색(그라데이션 시작색과 같다, PRD §8). 알파 없는 6자리만 허용 |
| `end_color` | 필수 | `#rrggbb` | 그라데이션 끝색 |
| `text` | 선택 | 문자열 | CLI `--text01`에 넣은 값(필드 이름은 예전 그대로다). 같은 프리셋·색·텍스트·시드면 같은 이미지가 나오므로(PRD §11) 재현하려면 필요해서 기록한다. 홈피드 프리셋의 `text01` 레이어(제목)에 들어간 값. **글자 수 검사(PRD §8 글자 수 가이드 실측)**: 줄바꿈이 있으면 거절(제목은 항상 1줄), 공백 포함 11자를 넘으면 거절 |
| `subtext` | 선택 | 문자열 | CLI `--text02`에 넣은 값(필드 이름은 예전 그대로다). 홈피드 프리셋의 `text02` 레이어(설명)에 들어간 값이며 `text`처럼 재현용으로 기록한다. 레이어 번호 규칙·글자 수는 PRD §8. **글자 수 검사**: 1줄이면 공백 포함 22자 이하, 줄바꿈으로 2줄이면 줄마다 공백 포함 15자 이하, 3줄 이상은 거절 |

두 필드 모두 값이 없으면(선택 필드) 글자 수 검사를 하지 않는다. 글자 수는 문자열 `length`가 아니라 **사용자에게 보이는 글자(코드 포인트) 수**로 센다(`[...s].length`). 렌더 인자가 리터럴 `\n`(백슬래시+n 두 글자)을 실제 개행으로 바꾸는 규칙(`renderArgs.mjs`)과 같게, 묶음 값의 리터럴 `\n`과 실제 개행을 둘 다 줄 구분자로 본다.

## 4. 검증이 내는 사유 예

| 상황 | 사유 |
|---|---|
| 필수 항목 누락 | `card.title: 필수 항목이 없어요.` |
| 작성자·제목·부제·지역·검수 사유에 줄바꿈·제어 문자 | `card.title: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).` (`author`·`card.subtitle`·`card.region_label`·`world_review.reason`도 같은 문장) |
| 세계관 내용이 있는데 검수 안 함 | `world_review.winter_reviewed: 세계관과 닿는 카드(world_related=true)는 윈터 검수를 거쳐야 해서 true여야 해요.` |
| 허용값 밖 템플릿·노출 형태·컨텐츠 유형 | `card.template_type: badge_spotlight · … 중 하나여야 해요(받은 값: "weekly_recap").` |
| 노출 태그 없음·허용 밖 태그 | `card.exposure_tags: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).` · `card.exposure_tags: 허용하지 않는 태그예요 — "sunny". 허용 태그: …` |
| 설명문이 40자를 넘음 | `card.description: 공백 포함 40자 이하여야 해요(받은 값: 41자).` (줄바꿈이면 `card.description: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).`, 기사면 `card.description: editorial_article 템플릿은 이 필드를 쓰지 않아요…`) |
| 템플릿이 쓰지 않는 참조 | `card.mission_id: drop_alert 템플릿은 이 필드를 쓰지 않아요(어드민 폼도 저장할 때 비워요). 묶음에서 빼 주세요.` |
| 필요한 참조 없음 | `card.mission_id: mission_spotlight 템플릿은 이 참조가 있어야 카드가 의미가 있어요.` |
| mission_spotlight인데 최종 레이아웃이 large_thumbnail이 아님 | `card.layout_type: mission_spotlight 템플릿은 항상 large_thumbnail이어야 해요(대표 이미지로 미션을 소개하는 카드 규칙, content-automation/PRD.md §8. 받은 값: "shortcut").` |
| 기간 순서 | `card.starts_at: ends_at보다 앞이어야 해요.` |
| 이동 경로 형식 | `card.target_href: 앱 안 경로(/로 시작, 예: /missions/…)이거나 https 주소여야 해요(받은 값: "missions").` |
| 이미지 없음·PNG 아님 | `image.path: 이미지 파일을 찾을 수 없어요: <절대경로>` · `image.path: PNG 파일이 아니에요: <절대경로>` |
| 제목(image.text) 줄바꿈·글자 수 초과 | `image.text: 제목은 줄바꿈 없이 한 줄이어야 해요(홈피드 프리셋 글자 수 가이드, asset-generator/PRD.md §8).` · `image.text: 홈피드 프리셋 글자 수 가이드를 넘어요 — 제목은 공백 포함 11자 이하여야 해요(받은 글자 수: 12, asset-generator/PRD.md §8).` |
| 요약(image.subtext) 글자 수 초과·3줄 이상 | `image.subtext: 홈피드 프리셋 글자 수 가이드를 넘어요 — 1줄이면 공백 포함 22자 이하여야 해요(받은 글자 수: 23, asset-generator/PRD.md §8).` · `image.subtext: 홈피드 프리셋 글자 수 가이드를 넘어요 — 2줄이면 줄마다 공백 포함 15자 이하여야 해요(받은 줄 글자 수: 16 · 15, asset-generator/PRD.md §8).` · `image.subtext: 3줄 이상은 쓸 수 없어요(가능하면 1줄, 부득이할 때만 2줄로 나눠 주세요, asset-generator/PRD.md §8).` |
| 제목·시작 일시 중복(DB 읽기) | `제목·시작 일시 중복: 같은 제목·같은 시작 일시의 카드가 이미 있어요(id: …). 기존 카드 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.` |
| 참조 행 없음(DB 읽기) | `미션 존재: mission_id에 해당하는 미션이 없어요: <id>` (`컬렉션 존재`·`배지 존재`·`랭킹 모드 존재`·`레시피 존재`도 같은 모양) |

## 5. 예시

아래 묶음이 예시 폴더 `jam-web/scripts/asset-generator/__fixtures__/example-home-feed-bundle/`의 `bundle.json`과 같은 내용이다(같은
폴더에 작은 `image.png`가 있다). 제목에 `[TEST]`를 붙이고 `is_active: false`·2099년 기간으로 두어 실수로 등록해도 알아보고 서비스에 보이지
않게 했다.

```json
{
  "bundle_id": "example-home-feed-card",
  "author": "윤진",
  "created_at": "2026-09-25T10:30:00+09:00",
  "color_rationale_link": "docs/service/content/TRIBES.md",
  "world_review": {
    "world_related": false,
    "winter_reviewed": false,
    "reason": "세계관과 무관한 예시 카드라 윈터 검수를 거치지 않았습니다."
  },
  "card": {
    "title": "[TEST] 예시 주간 홈피드 카드",
    "subtitle": "묶음 형식을 확인하는 예시예요",
    "template_type": "editorial_article",
    "layout_type": "large_thumbnail",
    "body_markdown": "묶음 형식을 확인하려고 만든 예시 카드입니다.\n\n실제로 등록하지 않습니다.",
    "content_type_id": "T12",
    "exposure_tags": ["all"],
    "starts_at": "2099-01-01T00:00:00+09:00",
    "ends_at": "2099-01-08T00:00:00+09:00",
    "sort_order": 0,
    "is_active": false
  },
  "image": {
    "path": "image.png",
    "seed": 20260925,
    "preset_id": "11111111-1111-4111-8111-111111111111",
    "bg_color": "#ff1a00",
    "end_color": "#ff4dff",
    "text": "예시 카드",
    "subtext": "짧은 설명"
  }
}
```

미션 소개 카드라면 `template_type`을 `mission_spotlight`로 바꾸고 `"mission_id": "<미션 UUID>"`를 넣고 `body_markdown`을 뺀다.

## 6. 실행 절차

```
윤진   : 프리셋·색으로 CLI 실행 → PNG + 시드 → 묶음 폴더 준비(bundle.json + PNG, 세계관 검수 기록 포함)
         → --dry-run 실행 → 요약을 기획안·이미지와 함께 사용자에게 보여 주며 컨펌 요청
사용자 : 컨펌
카리나 : --dry-run 없이 실행 → 이미지 업로드 + 카드 행 등록 → 등록 기록 파일 생성
         → SQL 기록을 마이그레이션 폴더로 옮겨 커밋 → 등록 기록·되돌림을 리포트에 남김
```

스크립트는 **cwd가 `jam-web`인 `tsx`** 로 실행한다. 허용값 상수(`lib/admin/today-sections.ts`)와 이미지 변환기가 내부에서 `@/` 별칭을
쓰고 tsx는 cwd의 `tsconfig.json`에서 별칭을 읽기 때문이다(저장소 루트에서 실행하면 별칭을 못 찾는다는 안내를 내고 끝난다). 필요한
환경변수는 `jam-web/.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`이고(`register-badge.mjs`와 같다), `--dry-run`에서는
없어도 된다.

```
cd jam-web

# 1) 검증 — DB·저장소·파일에 쓰지 않는다
npx tsx scripts/asset-generator/register-home-feed-card.mjs --bundle <bundle.json 절대경로> --dry-run

# 2) 등록 — 사용자 컨펌 뒤 메인 세션만 실행한다
npx tsx scripts/asset-generator/register-home-feed-card.mjs --bundle <bundle.json 절대경로> [--record-dir <폴더 절대경로>]

# 3) 되돌림
npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로> [--dry-run]
```

### 카드 한 장 원샷(`make-home-feed-card.mjs`)과 대비 계산(`contrast.mjs`)

묶음 폴더를 만드는 「렌더 → `bundle.json` 작성 → `--dry-run` 검증」을 명령 하나로 한다(티켓 20260926_1544). 인자 규칙·묶음 기본값
(`bundle_id`=폴더 이름, `author`=`윤진`, `created_at`=지금, 시드=묶음 ID에서 정함)은 `makeHomeFeedCardArgs.mjs` 상단 주석이 정본이다.
`color_rationale_link`·`world_review`는 기본값이 없어 `--meta`로 직접 준다.

```
cd jam-web
npx tsx scripts/asset-generator/make-home-feed-card.mjs --preset <프리셋 id> --bg "#8a5a2e" --end "#3d2812" --text01 "제목" [--text02 "설명"] \
  --card '<card JSON>' --meta '<메타 JSON>' --out-dir <묶음 폴더 절대경로> [--seed <정수>]
node scripts/asset-generator/contrast.mjs --bg "#8a5a2e" --end "#3d2812"   # 흰 글자 대비: 큰 글자 3:1·일반 글자 4.5:1
```

- 표준 출력은 한 줄 JSON이다(`ok`·이미지 경로와 크기·시드·`dryRun.{result, errors, skipped, webp, note}`). 검증 실패면 `ok: false`, 종료 코드 1이다.
- 이 스크립트의 `--dry-run`은 **서비스 롤 키 없이 형식만 검증한다** — DB 읽기 검사는 항상 «건너뜀»이고 `dryRun.skipped`에 나온다. 컨펌 근거로 쓰지 않고,
  등록 직전에 아래 `register-home-feed-card.mjs --dry-run`을 서비스 키가 있는 환경에서 다시 돌린다.
- 이미지 렌더는 `render.mjs`와 같은 함수(`renderCard.mjs`)라 같은 인자·시드면 같은 이미지가 나온다.

### `--dry-run`

묶음을 검증하고 컨펌 자료를 한국어로 출력한다: 묶음(작성자·작성 시각 KST·컬러 근거), 세계관 검수(있음/없음·윈터 검수 여부·사유),
카드(제목·부제·템플릿·노출 형태·컨텐츠 유형·기간·노출 태그·참조·설명문·본문 글자 수·이동 경로·정렬·활성 여부), 이미지(경로·크기·프리셋·시드·색·
텍스트·WebP 변환 결과), DB 읽기 검사, 등록 예정 내용, 되돌림 SQL 미리보기. 종료 코드는 통과 0, 실패 1이다.

- **쓰기를 하지 않는다.** 업로드·insert·삭제·기록 파일 생성 없이 메모리에서 WebP 변환만 해 본다.
- **DB 읽기 검사**(제목·시작 일시 중복, 그리고 묶음이 채운 참조에 한해 미션·컬렉션·배지·랭킹 모드·레시피 존재)는 서비스 키가 있을 때만
  읽기 전용으로 돌리고, 키가 없으면 «건너뜀»으로 표시한다. 그래서 키가 없는 환경(격리 워크트리 등)에서도 로컬 검증만으로 통과·실패가
  나온다. 참조가 없는 항목은 «해당 없음»이다.
  건너뜀이 있으면 요약 첫 줄이 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`으로 나오고 바로 아래에 «컨펌 근거로 쓰지 말고 키가 있는 환경(메인 폴더)에서 다시 돌리라»는 안내가 붙는다(배지 등록과 같다).
- 이미 `registration-record.json`이 있는 폴더는 «이미 등록한 묶음»으로 실패 처리한다.

### 등록 순서와 실패 처리

1. 묶음 검증 → DB 읽기 검사. 하나라도 실패하면 아무것도 쓰지 않고 끝낸다.
2. 새 카드 id를 `crypto.randomUUID()`로 미리 정한다(이미지 저장 경로에 쓰려고).
3. 이미지 업로드: 원본 PNG `today_cards/asset-generator/{id}.png`, 표시 규격 WebP `today_cards/asset-generator/{id}.webp`
   (`images` 버킷, 긴 변 1280px 이하 — PRD §9. 저장 경로·WebP 변환은 어드민 적용 API의 홈피드 경로와 같다). 하나라도 실패하면 이미
   올라간 파일을 지우고 끝낸다.
4. 카드 행 insert(`cover_image_url` = WebP 공개 주소 + `?v=`, `image_source = 'agent-generator'`). 실패하면 올라간 파일 2개를 지우고
   끝낸다. 이미지를 먼저 올리는 이유는 insert가 성공한 뒤 업로드가 실패해 이미지 없는 카드가 서비스에 보이는 것을 막으려는 것이다.
5. 등록 기록 파일 생성. 이 단계가 실패해도 등록은 끝난 상태이므로 기록 내용을 화면에 그대로 찍는다.

## 7. 등록 기록과 되돌림

등록하면 묶음 폴더(또는 `--record-dir`)에 두 파일이 생긴다. 기존 기록은 덮어쓰지 않는다. 형식은 배지·미션 등록과 같은 방식이다
([REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md) §7).

**`registration-record.json`** — 카드 id·제목·템플릿·노출 형태·기간·활성 여부, **등록 경로 표지 `card.image_source`**, 세계관 검수 기록
(`world_review`), 저장소 경로 2개(`storage.png_path`·`storage.webp_path`), 이미지 URL(`urls.cover_image_url`), 시드·프리셋·색·텍스트, 작성자,
등록 시각(KST, `+09:00`), 컬러 근거 링크, 묶음 요약 한 줄(`summary`).

**`registration.sql`** — 머리 주석에 등록 경로(에이전트 등록 스크립트, `image_source = agent-generator`, 기존 seed SQL 등록 카드는 NULL)를
적고, 등록과 동등한 `INSERT INTO public.today_cards …`(같은 id가 있으면 아무 일도 하지 않는다)와 파일 끝의 되돌림 표식을 둔다.
`badge_ids`는 `uuid[]` 컬럼이라 `ARRAY[…]::uuid[]`로 쓴다. 사용자 입력은 `--` 주석에 넣기 전에 한 줄로 정리한다.

```sql
-- 되돌림 SQL
-- delete from public.today_cards where id = '<카드 id>';
```

표식은 마이그레이션 되돌림 규칙(`.claude/skills/jam-work/references/db-migration-rules.md` §4)의 형식이다.

**메인 세션의 마무리:**

1. `registration.sql`을 `jam-web/supabase/migrations/seed_agent_home_feed_<슬러그>.sql`로 옮겨 커밋한다. 슬러그는 `bundle_id`의
   영문·숫자가 아닌 문자를 밑줄로 바꾼 값이다(`registration.sql` 머리 주석에 정확한 파일명이 적혀 있다). 이미 DB에 반영된
   기록이므로 다시 실행하지 않는다.
2. 카드 id·제목·되돌림 명령을 `docs/operations/reports/weekly/`의 해당 주 「등록 기록」 절에 표로 남긴다.

### `--undo`

저장소 파일은 SQL로 지울 수 없어서 스크립트가 파일 2개와 카드 행을 함께 지운다.

- 지우기 전에 **노출·열람 기록이 붙었는지** 읽는다. `today_cards`를 참조하는 외래 키는 생성 타입상 `today_card_events.card_id` 하나이고
  (테스트가 생성 타입과 대조한다), 마이그레이션 183의 삭제 규칙은 `ON DELETE SET NULL`이다. 즉 **카드를 지워도 삭제는 막히지 않고**
  이벤트 행의 `card_id`만 NULL로 바뀐다(기록된 컨텐츠 유형 `content_type_id`는 남는다). 그래도 기록이 붙었다는 것은 이 카드가 실제 유저에게
  나갔다는 뜻이고 지우면 그 기록이 어느 카드의 것인지 잃으므로, 이 스크립트의 되돌림은 «방금 등록한 카드가 아직 아무에게도 노출되지
  않았다»는 전제 아래 하나라도 붙어 있으면 아무것도 지우지 않고 건수를 알리며 중단한다. 참조를 읽지 못해도 중단한다. 이때는 삭제하지 말고
  어드민에서 카드를 비활성으로 바꾼다.
- 그 밖에 카드 id를 담는 곳은 알림 announcement 페이로드의 `today_card_id`(JSON 안의 값, 외래 키가 아니다)뿐이다. **이 스크립트는 알림 페이로드를 검사하지
  않는다**(티켓 [20260925_2135](../../../tickets/p3-low/20260925_2135_Infra_홈피드-등록-스크립트-보완-활성-기본값과-알림-참조.md) 결정, 2026-09-25). 등록 직후 되돌리는
  상황에서는 알림에 실릴 가능성이 낮다고 보는 판단이며, 알림 저장 구조는 확인하지 않았다.
- 기록의 저장소 경로가 규칙(`today_cards/asset-generator/{id}.png`·`.webp`)과 다르면 시작하지 않는다(엉뚱한 파일을 지우지 않으려고).
- `image_source`가 `agent-generator`가 아닌 카드(시드 SQL 등록 카드는 NULL, 적용 탭 카드는 `admin-generator`)는 지우지 않는다.
- 카드 행을 먼저 지우고 파일을 지운다. 행 삭제가 막히면 이미지는 그대로 남아 카드가 깨지지 않는다.
- `--dry-run`을 붙이면 참조 확인까지만 하고 지우지 않는다.

## 8. 관련 문서

- [PRD](PRD.md) §8(자동 경로)·§9(출력 규격)·§10(제작 경로 표시)·§11(시드와 재현)
- 배지·미션 등록 묶음: [REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md) · [MISSION_REGISTRATION_BUNDLE.md](MISSION_REGISTRATION_BUNDLE.md)
- 기존 주간 편성 등록 경로: [content-automation/PRD.md](../content-automation/PRD.md) §8-2
- 이미지 만들기 CLI: `jam-web/scripts/asset-generator/render.mjs`
- 이 문서를 만든 티켓: [20260925_1413](../../../tickets/p2-normal/20260925_1413_Infra_홈피드-등록묶음-포맷과-등록스크립트.md)

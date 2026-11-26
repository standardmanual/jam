# 윤진 모드 ⑨ — 운영 묶음 기획(주간)

> 윤진(`jam-marketer`)은 이 모드를 실행할 때만 이 파일을 읽는다. Bash 사용 범위와 금지 사항은 정의 문서(`.claude/agents/jam-marketer.md`)가 우선한다.

## ⑨ 운영 묶음 기획 (정본 `docs/plan/vision/07 JAM! 라이브 운영 블루프린트.md` 3.2)

Weekly scheduled run only. Read the 카즈하 briefing and the tool data (`ops-read.mjs`: patterns,
patterns-draw, decisions, rules, item-paths, trend-sources, places, badges), plan next week's
operations bundle, and submit it to the inbox — you are the only agent that does (07 3.2 steps 2 and 6).
The bundle format is the validator code (`jam-web/src/lib/admin/opsInbox/validate.ts`·`constants.ts`), not this file.

### Machine checks — know them, plan so they pass

At submission the validator rejects an `editorial_article` card and a bundle holding more than
`MAX_ITEMS` items (the whole bundle). A bundle free of format errors can still fail at registration
after approval: `registerChecks/copyRules.ts` rejects 「~하세요」, an exclamation mark or a sentence
ending in 「획득」·「보상」 in a description, reward words or `숫자 + 포인트·잼` in a mission description, a
title that summarizes the condition, and the words 도장·500m·장소 배지·발견·찾아서·이웃;
`registerChecks/homeFeedFields.ts` rejects a landing on a list root (`LIST_ROOT_PATHS`) and a missing
required reference (`REQUIRED_REFERENCE_FIELDS`; `links` to items in this bundle count). Count items
before submitting, and plan each card to register.

### What to plan

- Planning is your job: the trends, the 카즈하 metrics, the pattern dictionary and the draw are
  material, and you decide what each day's home feed offers. The draw shows what has gone unused; it
  does not choose for you.
- Plan topic first: read the topic patterns (`patterns`; rows with a `topic`, P19 onward), pick each
  day's topics for the situation, then choose the concrete content inside the topic. A topic pattern
  carries sample `angles` (type 소개·유도·미션·큐레이션·현황·회고·이야기, each with the `needs` material
  to read first: places, place-stats, badges, item-paths, trends, kpi); the angles are examples, not
  a closed list, so invent new ones when the material and the trends support them. Do not treat the
  topic list as slots to fill every week.
- Bundle topics (`bundle/…`) combine several topics into one connected set of cards and missions;
  links between items of the same bundle are allowed.
- A card with no fitting pattern leaves `pattern_no` empty and takes the shape that shows its content best.
- Never introduce, rank or single out an individual user: use aggregates only.
- Use only what exists: live missions, badges and recipes, or a mission or badge item proposed in
  this same bundle; never present invented ones or invented numbers as fact. Check every action
  word, screen name and reward against `docs/plan/jam2/10 JAM 2.0 서비스 운영 로직.md` before handing
  the draft on.
- Weather appears only in the reason chip (`rationale.kind = weather`) and in the copy, never as a
  mission condition.
- Never plan articles: no article-style series, no article body copy, and never propose a pattern
  that depends on an article.

### Places and badges

- Check-in missions and place cards use only categories that have a check-in badge (read them with
  `places`); categories without one serve drops and pickups only.
- `places` counts only active, review-passed places by default and reports `inactiveCount` and
  `pendingReviewCount` separately. Narrow it with `status=active|inactive|pending|all`, `sido` and
  `gu` (exact match), read each listed place's `sido`/`gu`, and use `groupBy=region` (optionally with
  `category`) to plan regional cards such as the mountains of one district. Plan a regional card only
  on regions that are filled: places whose `sido`/`gu` is still null are grouped in a null row.
- Each tier in `badges` carries its `badgeId`, which goes into `card.badge_ids` of a
  `badge_spotlight` card (no `content_intro` stand-in for a badge introduction).

### Trend material

Trend material lives per topic in `docs/operations/trendresearch/` (its README holds the topic table,
cycle and entry format). Pick the day's topics first, then read only those topics' `latest.md`
(entries still within their 유효 date) and recent `notes/`; a bundle topic reads the folders of the
topics it combines, and folders of topics you did not pick stay closed. If a picked topic's folder is
empty or out of date, call it 자료 부족 and mark that material as an assumption in the item's
rationale instead of presenting it as fact.

### Card type and daily floor

- A card's type is `resource.feed_type` (required; one of the eight types in `home-feed/PRD.md` §6
  「개편 규격」), with the fields that belong to it (box shape, chips, title-chip words, description
  visibility, stamp, list items, collection burst; names and meanings: `ops-tool/PRD.md` §8.4).
  Choosing the type and the chips is your planning judgment. The old `shape` and `layout_type` are
  not used.
- Leave the colors and the seed empty; the system sets them when the card is registered.
- Never use `full_image` (it is switched off on the home screen). Give each type its required
  material (a collection intro needs a cover image, a drop-and-pickup card needs linked badges, a
  gallery list needs at least one item), and keep phrase chips within 12 characters.
- Whether the description shows is a card field (description visibility); do not hide it when the
  description carries the message.
- Every day needs at least 5 cards visible to everyone (`all`) with different content, drawn broadly
  from missions, badges, check-ins, capsules, collections and mix, places, tribe stories and
  motivation; personalized cards come on top. This is a floor so each person finds something of
  interest, not a slot template: do not give weekdays fixed roles or card types fixed counts. A card
  spanning several days counts on each of them.

### Copy

The speaker, sentence habits, banned words and the mission copy split are in
`docs/service/writing/UX_WRITING_GUIDELINE.md` §2.6. On top of that:

- The title stays short and may carry the tribe's or the season's feeling; put the appeal in the
  title, not in the description. The title speaks the scene or the anticipation (good: 「지하철 역에서
  만나는 행운」).
- The `copy.description` (up to 60 characters) of a card that does not point to a mission is
  rational and exact, written like a badge acquisition condition: the action, the numbers, the
  period and what the user receives.
- A mission-pointing card (`mission_spotlight`) and a mission description hold only one scene line
  that makes the user want to take the mission: the system adds the period and reward line
  (`buildFacts` in `lib/today/cardView.ts`) and the mission screen shows the conditions as bullets.
- Do not put dates in the description sentence; cards without the system's period line carry no
  dates (use 「이번 주」 if needed). Do not show base-policy numbers.
- Voice (every card, mission and image text): marketing voice in short plain spoken Korean, one idea
  per sentence, the result or the thing to do first and the condition after it in easy words; never
  a specification-style sentence in English word order (no chains of 「N월 N일~N월 N일 안에 …가 N개가
  되면 …해요」), no empty filler (「다양한」「특별한」「지금 바로」), no noun-phrase lists, and vary
  sentence endings inside one card.
- Use only the UX Writing Guide terms: 체크인 (never 방문·인증), 획득, 드랍, 픽업, 장소, 장착·완성, 포인트.
  Pattern names (for example P08) are internal and are not copied into copy.
- Do not line up aggregate counts (「산 590개」); say the flow instead (「요즘은 산, 편의점, 마트,
  관공서에서 아이템 배지를 많이 획득해요」).
- A 소개 card presents one concrete badge, collection, place or recipe as something to go and do; it
  never explains a feature or a policy.
- Example now live (card): 「각희산과 군산에서 체크인하고 숨겨진 아이템 배지도 획득해 봐요.」
- Run the new copy through `scripts/check-slop.mjs` rules and the humanize-korean check before
  handing the draft on.

### Landing

Every card lands on the detail screen of the one thing it introduces, never on a list screen, and
the landing must match what the card copy promises the user will do next.

- One badge → `/badges/<badgeId>` (a `badge_spotlight` with that id in `card.badge_ids`; a
  `content_intro` that cannot carry `badge_ids` gets `target_href` `/badges/<badgeId>`). When tiers
  share a name, pick the tier whose condition matches the card copy (3 hours → the 180-minute tier,
  once in a weekend → the `total_count` 1 tier). If a card seems to introduce several badges, pick
  the one the copy leads with.
- A mission → `/missions/<missionId>`, a collection → `/collections/<itemBookId>`, hidden item
  badges or drops → `/drops`, a place or check-in card → `/drops` (the map lives inside the drop
  menu; the app has no separate map route).
- A card that introduces content with no mission, badge or collection behind it uses
  `resource.template_type` `content_intro` with `resource.target_href` pointing at a real screen that
  has no per-item detail (`/combine`, `/drops`, `/feed`, `/inventory`, `/points`, `/profile`).
- A card that tells the viewer how to do something, such as opening a locked item badge with points
  (the P26 opening angles), is a `content_intro` with `target_href` `/inventory`, never carries
  `badge_ids`, and never shows one badge as its picture or link: whether a given badge is already
  open differs per viewer.

### Other items

- A recipe item needs real `resource.slots`. A mission's `mission_type` must be one
  `toMissionRegisterInput` accepts; ranking missions are not registrable, so do not plan them.
- `jam_badge` and `collection_launch` items are out of scope.
- Fill the bundle's `title` (30 chars max), each item's `rationale` and `highlight` (5 or fewer per
  bundle), the plain one-sentence 「유저가 겪는 것」, `trends[]`, and `routine_run.stages` (윤진 `plan`,
  윈터 `world_review`, 혜린 `balance_check`).
- Always submit a bundle, even with zero items (a missing bundle is read as a routine failure).
  Items that 윈터 or 혜린 removed go in the bundle's `excluded_items` (`stage` = `world_review` or
  `balance_check`, one-line `reason` required).

### Images

The tool makes images after approval (07 4.5); you only set `image_spec.preset_id`, and an item
without `preset_id` is skipped silently and ends up with no image.

- Every mission item, and every card whose card type uses a cover image (`hero_box`,
  `collection_intro`, or a `text_box` whose `box_kind` is `image_mask`; the rule is
  `feedTypeUsesCoverImage` in `jam-web/src/lib/today/feedConstants.ts`) except a `mission_spotlight`
  card, carries an `image_spec`:
  - `hero_box` and an image-mask `text_box` (a wide image box): 「홈피드 16:9」 `c5491ad2-12d4-4ab0-a59d-6897067a8a9a`
  - `collection_intro` (a square 168×168 representative picture): 「홈피드」 (1:1) `51aa4673-f723-4929-ac20-a302202b7aa7`
  - every mission item: 「미션」 (1:1) `98562783-36c9-44aa-8fba-3c4793608f28`
- Give `image_spec` only `preset_id`. Leave `bg` and `end` empty: the server sets the colors from a
  table of unified-palette color pairs and balances the families inside the bundle (a sent value is
  overwritten and the validator warns). Leave `values` out: the 홈피드 and 미션 presets have no text
  or logo layers (a `values` entry is ignored and the validator warns). Text limits and layer numbers
  apply only to presets that still have text layers (`docs/service/prd/asset-generator/PRD.md` §8).
- `badge_intro`, `badge_only`, `drop_pickup`, `gallery_list` and a `text_box` without an image mask
  take no new image, so leave `preset_id` out: the home screen never draws a cover image for them.
- A `mission_spotlight` card carries no `image_spec`: the app draws the linked mission's
  representative image (`missions.image_url`) as that card's cover, so the image is made once, on
  the mission item (the tool skips such a card's `image_spec`).

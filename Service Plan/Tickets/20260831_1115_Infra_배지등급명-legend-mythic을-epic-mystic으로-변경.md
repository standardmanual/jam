---
id: 20260831_1115
category: Infra
status: OPEN
created: 2026-08-31
closed:
---

# [Infra] 배지 등급명 `legend`·`mythic` → `epic`·`mystic` 전면 변경

## 배경 / 문제 정의

배지 희귀도 4단계 중 3·4단계 명칭을 변경한다.

| 서열 | 기존 값 | 변경 후 값 | 표시명 | 색상(유지) |
|---|---|---|---|---|
| 1 | `common` | `common` | Common | `#6b6b6b` |
| 2 | `rare` | `rare` | Rare | `#00cc7a` |
| 3 | `legend` | **`epic`** | **Epic** | `#f5a300` |
| 4 | `mythic` | **`mystic`** | **Mystic** | `#ff2d87` |

1·2단계는 변경 없다. UI 표시명은 이미 대문자 시작(`Common`/`Rare`/`Legend`/`Mythic`)이므로
DB enum은 소문자, 표시만 대문자 시작이라는 현행 구조를 그대로 유지한다.

### 선행 작업의 미완료 잔재 (이번에 함께 청소)

2026-08-13 티켓 `20260813_003`(`legendary` → `legend`)이 enum만 rename하고 나머지를 놓쳤다.
현재 프로덕션에 남아 있는 잔재 (2026-08-31 service_role 조회 실측):

| 위치 | 잔재 | 이번 조치 |
|---|---|---|
| `drop_policy` 컬럼명 | `rarity_legendary` (개명 누락) | → `rarity_epic` |
| `user_activity_feed.metadata->>'rarity'` | `legendary` 14건 | → `epic` |
| `missions` 3건 | "레전더리 배지", "희귀도 legendary" 문구 노출 중 | → `Epic` |

`ambient_drop_config`는 `rarity_legend`로 개명돼 있어 두 테이블이 불일치 상태다.

> **별건**: `updateDropPolicy()`가 존재하지 않는 컬럼으로 upsert하면서 `error`를 확인하지 않아
> 어드민 드랍 정책 저장이 조용히 실패했을 가능성이 있다. **이 티켓 범위 밖**이며 별도 세션에서
> 확인 중이다. 이 티켓은 컬럼 개명만 하고 에러 처리에는 손대지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점

#### A. 선행 안전장치 — 타입 강화 (다른 변경보다 **먼저**, 별도 커밋)

등급을 키로 쓰는 맵이 전부 `Record<string, X>`로 선언돼 있어, 키를 안 고쳐도 TypeScript가
잡지 못하고 런타임에 `undefined`가 된다. `20260813_003`이 3곳을 놓친 근본 원인이다.
**아래 6곳을 `Record<BadgeRarity, X>`로 좁히고 빌드가 통과하는지 먼저 확인한다.**
이후의 모든 누락이 컴파일 에러로 드러난다.

| 파일 | 심볼 | 누락 시 결과 |
|---|---|---|
| `src/lib/badge-engine/index.ts:20` | `RARITY_TIER` | 배지 발급 로직 붕괴 |
| `src/lib/missions/visibility.ts:28` | `RARITY_TIER` | 레벨업 미션 게이팅 붕괴 |
| `src/lib/notifications/message.ts:225` | `RARITY_RANK` | 알림 필터 무력화 |
| `src/lib/rarity.ts:3` | `RARITY_LABEL` | 유저 화면 등급 라벨 빈칸 |
| `src/lib/admin/item-badge-status.ts:69` | `RARITY_LABEL` | 어드민 라벨 소실 |
| `src/lib/admin/item-badge-status.ts:76` | `RARITY_BADGE_COLOR` | 어드민 색 소실 |

`RARITY_TIER`는 `badge-engine`과 `missions/visibility` **두 곳에 복사**돼 있다
(visibility.ts:27 주석이 "같은 표"라고만 적고 있다). 이번에 **한 곳으로 통합**하고 다른 쪽이
import하게 한다. 통합 위치는 구현자가 판단하되 순환 참조가 없어야 한다.

#### B. DB 마이그레이션 (SQL 파일 작성만 — 실행은 오케스트레이터가 5단계에서)

파일: `jam-web/supabase/migrations/115_rename_rarity_epic_mystic.sql`
(번호는 push 직전 원격 staging 기준으로 재확인할 것 — 병렬 세션 선점 가능)

한 트랜잭션으로 묶는다:

1. `ALTER TYPE badge_rarity RENAME VALUE 'legend' TO 'epic';`
2. `ALTER TYPE badge_rarity RENAME VALUE 'mythic' TO 'mystic';`
3. `ALTER TABLE drop_policy RENAME COLUMN rarity_legendary TO rarity_epic;`
4. `ALTER TABLE drop_policy RENAME COLUMN rarity_mythic TO rarity_mystic;`
5. `ALTER TABLE ambient_drop_config RENAME COLUMN rarity_legend TO rarity_epic;`
6. `ALTER TABLE ambient_drop_config RENAME COLUMN rarity_mythic TO rarity_mystic;`

`RENAME VALUE`는 `enumsortorder`를 보존하므로 서열(`common < rare < epic < mystic`)이 유지되고
기존 행 UPDATE가 불필요하다. 기존 이름이 재사용되지 않으므로 역방향 rename으로 롤백 가능하다.

**실행 전 백업 필수** — 별도 SQL 파일로 남긴다:
`badges` · `user_activity_feed` · `engine_decision_log` 스냅샷 테이블 생성.

#### C. 과거 데이터 정정 SQL (작성만)

파일: `jam-web/supabase/seed_rarity_rename_data_20260831.sql`

| 대상 | 규칙 | 실측 건수 |
|---|---|---|
| `user_activity_feed.metadata->>'rarity'` | `legendary`·`legend` → `epic` | 46 |
| `user_activity_feed.metadata->>'rarity'` | `mythic` → `mystic` | 41 |
| `engine_decision_log.payload` | 동일 규칙 | 144 |

`legendary`와 `legend`가 **둘 다 구 3단계**를 뜻하므로 함께 `epic`으로 보낸다.

#### D. 소스코드 전수 치환 (48 파일, 테스트 8 포함)

`legend` → `epic`, `mythic` → `mystic` (대소문자 각 형태). 특히 확인할 지점:

- `src/lib/ambient-drop/rarity.ts` — `RARITY_ORDER` 배열, `randomRarityDistribution()`의
  구조분해 객체 리터럴 키
- `src/lib/notifications/batch/following.ts:38-39,253,292` — `FOLLOWING_PRIORITY` 키,
  `.in('rarity', [...])` 배열, 최상위 등급 판정 삼항식
- `src/lib/notifications/message.ts:241` — 리터럴 비교 체인
- `src/lib/drop-engine/policy.ts`·`layers.ts` — `DEFAULT_DROP_POLICY` 키, 구조분해
- `src/types/database.ts` · `database.generated.ts` — `BadgeRarity` 유니온, 테이블 컬럼 타입

> `database.generated.ts`는 자동생성 파일이다. 마이그레이션 실행 후 `supabase gen types`
> 재실행으로 동기화되므로, 수동 패치 후 재생성 결과와 일치하는지 확인한다.

#### E. 어휘 충돌 주의 (치환 시 오탐 방지)

- **`mystic` vs `mythic`은 한 글자 차이다.** 눈으로는 구분이 어렵다. 치환 후 `mythic` 잔재가
  0건임을 반드시 grep으로 확인한다.
- 드랍 엔진에 **기존 `mystery`** 어휘가 있다 — `MYSTERY_FACTION_ID`, `mystery_spice_rate`,
  `mysteryFactionId`, `mysteryAvailable`("미스터리 헌터" 세계관 전용 로직).
  **이건 등급과 무관하므로 절대 건드리지 않는다.** `myst`로 뭉뚱그려 검색·치환 금지.
- `src/lib/drop-engine/layers.ts:124` 주석의 "legend+ 드랍" → "epic+ 드랍"으로 고치되,
  같은 문장의 "미스터리 헌터"는 그대로 둔다.
- HTML `<legend>` 태그 오탐은 이 저장소에 없음을 확인했다.

### UI/UX 관점

#### F. 디자인 토큰 — 값은 그대로, 이름만 이동 (서열 기준 색 유지 확정)

```
--color-rarity-legend       #f5a300  →  --color-rarity-epic
--color-rarity-legend-text  #000000  →  --color-rarity-epic-text
--color-rarity-mythic       #ff2d87  →  --color-rarity-mystic
--color-rarity-mythic-text  #ffffff  →  --color-rarity-mystic-text
```

색상값은 바꾸지 않는다. 유저가 보는 색 배치는 변화 없다.
(`RarityBadge.prompt.md`의 "never re-map these, users have learned the color language" 준수)

연쇄 대상:
- `colors.css:93,95` — `--color-tag-3`·`--color-tag-5`가 위 토큰을 참조
- `_adherence.oxlintrc.json:179-182, 291-294` — 린트 허용 토큰 목록에 등록돼 있음
- **등급과 무관한 재사용처** (토큰명만 따라가고 의미는 그대로):
  `forms/Input.jsx:30` · `Textarea.jsx:24` · `Checkbox.jsx:35` · `Select.jsx:41`의 error 보더,
  `Input.stories.tsx` · `Textarea.stories.tsx`의 에러 텍스트 색,
  `guidelines/dos-donts.html:15`(하지 말아야 할 것 제목), `guidelines/loader.html:42`(눈동자 색)

#### G. MODULAR 컴포넌트 — 연결/병존 구분 (1.6절)

이번 변경은 **토큰 + 연결된 컴포넌트** 부류에 해당한다. 서비스에 즉시 반영된다.

- **`RarityBadge`** (연결된 9종 중 하나): `RarityBadge.jsx:15-18`의 매핑 객체 키를 바꾼다.
  누락 시 등급 pill이 렌더링되지 않는다. 서비스 8개 파일이 직접 사용 중:
  `FeedSection.tsx` · `badges/[id]/BadgeHeroSection.tsx` · `drops/BadgeDetailSheet.tsx` ·
  `missions/[id]/MissionDetailClient.tsx` · `(main)/page.tsx` · `PoiCarouselModal.tsx` ·
  `components/ui/BadgeGridCard.tsx` · `components/ui/CollectionGridCard.tsx`
- 동반 파일: `RarityBadge.d.ts`(`Rarity` 타입) · `.stories.tsx`(Story 이름 `Legend`→`Epic`,
  `Mythic`→`Mystic`) · `.prompt.md`
- **`.prompt.md`의 색 설명이 실제와 다르다** — "legend=purple, mythic=amber"라고 적혀 있으나
  토큰은 `#f5a300`(금)·`#ff2d87`(핑크)다. 어드민 Tailwind 색(violet/amber) 기준으로 쓰인 낡은
  기술로 보인다. 이번에 실제 토큰 기준으로 바로잡는다.
- 기타 Story·가이드라인: `BadgeFrame.stories.tsx` · `BadgeGridCard.*` · `CollectionGridCard.*` ·
  `ListRowCard.stories.tsx` · `TabBar.stories.tsx` · `ModalToast.stories.tsx` ·
  `BadgeRevealCarousel.stories.tsx` · `foundations/Colors.stories.tsx` · `dashboard.html` ·
  `guidelines/colors-rarity.html` · `guidelines/badge-frames.html` · `_ds_manifest.json`
- `_vendor/babel.min.js`는 벤더 파일이므로 제외.

#### H. 어드민

어드민은 MODULAR 적용 제외 대상이고 Tailwind 색 체계(`bg-violet-200`/`bg-amber-200`)를
따로 쓴다. `item-badge-status.ts`의 라벨·색 맵 키만 바꾸고 **색값은 유지**한다.
어드민 화면 30개 파일 + API 라우트 13개가 영향 범위다.

### 컨텐츠 관점

#### I. 한글 등급 표기를 영문으로 통일 — **건별 수동 처리 (일괄 치환 금지)**

DB 실데이터에 한글 등급 표기가 혼재한다. 매핑이 직관에 반하므로 스크립트 치환하면 틀린다.

| 기존 표기 | 변경 후 |
|---|---|
| "레전더리" / "레전드" | `Epic` |
| "신화" (등급을 뜻하는 경우) | `Mystic` |

대상 (SQL 파일로 남기고 실행은 5단계):
- `missions` 3건 — "'굿 바이브스 온리' 레전더리 배지 획득하기" / "희귀도 legendary 아이템배지…"
  / "'아이 오브 더 선' 신화 배지 획득하기" / "'러브 세이브' 신화 배지 획득하기"
- `today_cards` 2건 — "핫한 성수동에서 발견된 레전드 배지" / "보유자가 손에 꼽는 신화 배지"
- `badges.description` 10건 — "이제 첫 숨결 **Legend**에 도전하세요" → `Epic`,
  "첫 고도 **Mythic**에 도전하세요" → `Mystic`

#### J. 세계관 카피 전면 재점검

배지 설명 카피가 등급별 세계관에 묶여 있다 (실측: "블랙 트랙" 45건 / "화이트 룸" 60건 중
mythic 48건 / 3단계 설명의 "전설" 18건).

- 최상위 등급명이 `Legend`가 아니게 되므로 **"전설" 표현과 등급명이 충돌하지 않는다.**
  다만 "블랙 트랙이 이 지구력을 전설로 기록합니다"가 이제 `Epic` 등급 카피가 되므로
  위계 표현이 적절한지 검토한다.
- 세계관 매핑(블랙 트랙=3단계, 화이트 룸=4단계) 자체는 유지한다. `Mystic`(신비로운)은
  화이트 룸의 차원·미스터리 컨셉과 오히려 잘 맞는다.
- 문서 쪽: `Specs/Content/ACTIVITY_BADGES.md`(Legend/Mythic 101줄),
  `Specs/Content/COMBINE_RECIPES.md`(조합 결과물 25건)

#### K. 문서 갱신

- 갱신: `Specs/` 15파일, `Business/` 3파일
- **`Specs/UX_WRITING_GUIDELINE.md:70` 고정 용어표 갱신 — 필수.** 단순 교체로 끝내지 말고:
  - 새 고정 용어: `Common / Rare / Epic / Mystic`
  - **매핑 이력 명시**: "구 Legend = 현 Epic, 구 Mythic = 현 Mystic" — 이후 작업자·에이전트가
    과거 티켓·문서의 `Legend` 표기를 현 등급으로 오독하지 않게 한다
  - 금지어 재작성: `Legendary` · `레전더리` · `레전드` · `신화` · **`Mythic`**
  - **`Mystic`/`Mythic` 철자 혼동 주의** 명기
- **미변경**: `Tickets/`(역사 기록) · `Archive/`(읽기 전용) · `Assets/`(파이프라인 산출물 102파일)
  — `20260813_003` 선례를 따른다

## 구현 계획

### 순서

1. **A. 타입 강화 + `RARITY_TIER` 통합** → `npm run build` / `npx tsc --noEmit` 통과 확인
2. **B·C. SQL 파일 작성** (백업 + 마이그레이션 + 데이터 정정) — **실행하지 않는다**
3. **D. 소스코드 치환** → 1단계 덕분에 누락이 컴파일 에러로 드러남
4. **F·G·H. 디자인 토큰·MODULAR·어드민**
5. **I·J. 컨텐츠 SQL 작성 + 카피 재점검**
6. **K. 문서 갱신**
7. 검증: `npm test` · `tsc --noEmit` · 잔재 grep 0건

### 잔재 검증 기준 (구 이름이 완전히 소멸하므로 성립)

```
rg -i "legendary|mythic" jam-web/src jam-web/design-system "Service Plan/Specs" "Service Plan/Business"
```
→ **0건**이어야 한다. (`legend`는 `epic`으로 갔으므로 역시 0건. 단 `Tickets/`·`Archive/`·
`Assets/`·과거 마이그레이션 SQL은 제외 대상)

### 주의사항

- **과거 마이그레이션 SQL(001~114)은 수정하지 않는다.** 재실행 이력이 깨진다.
- **SQL은 작성만 하고 실행하지 않는다.** `/jam-work` 5단계에서 오케스트레이터가 사용자 승인 하에
  실행한다 (jam-developer에는 service_role 권한을 위임하지 않는다).
- Supabase는 staging·프로덕션 **공용 단일 DB**다. DB 변경은 즉시 프로덕션에 반영되고
  정적 파일은 배포 후 반영되므로, DB 실행과 배포 사이에 불일치 구간이 생긴다.
- 어드민은 staging에서 검증할 수 없다 — 프로덕션 배포 후 확인한다.

---

## 구현 결과 (2026-08-31)

브랜치: `claude/jamwork-20260831_1115-rarity-epic-mystic` (origin/staging 기점)

### 커밋 3건

1. `안전장치: 등급 맵 타입을 Record<BadgeRarity, X>로 강화하고 RARITY_TIER 통합` — A단계
2. `추가: 등급명 legend·mythic → epic·mystic DB 마이그레이션 SQL` — B·C·I단계 (작성만, 미실행)
3. `변경: 배지 등급명 legend·mythic → epic·mystic 소스 전수 치환` — D·F·G·H단계

### A. 타입 강화 결과

`RARITY_TIER`를 `src/lib/rarity.ts` 한 곳으로 통합하고, `badge-engine/index.ts`·
`missions/visibility.ts`·`missions/visibility-server.ts`·테스트 2건이 여기서 import하도록 정리.
티켓이 지목한 6곳을 `Record<BadgeRarity, X>`로 좁혔다.

이 조치는 실제로 효과가 있었다 — 소스 치환 직후 `tsc --noEmit`이
`design-system/components/cards/RarityBadge.d.ts`의 `Rarity` 타입 누락을 **11개 호출부에서
컴파일 에러로** 드러냈다. 타입을 안 좁혔으면 등급 pill이 조용히 렌더링되지 않았을 것이다.

### B. 티켓 본문 외 추가 발견 — `abusing_policy` 컬럼

`database.generated.ts`(2026-08-30 재생성) 대조 결과, `abusing_policy`의 실제 컬럼은
`soft_legendary_rate`·`hard_legendary_rate`인데 수기 타입 `database.ts`와 `abusing/policy.ts`는
`soft_legend_rate`·`hard_legend_rate`로 적고 있었다. `20260813_003`이 놓친 네 번째 잔재다.

`shadow-ban.ts:42`가 `` `${banLevel}_${rarity}_rate` ``로 컬럼명을 **런타임 조합**하므로:
- 지금까지 3단계는 `soft_legend_rate`(없는 컬럼) → `undefined ?? 1.0` → **섀도우밴이 3단계
  드랍을 한 번도 차단하지 못했다.**
- enum을 `epic`/`mystic`으로 바꾸면 키가 `soft_epic_rate`/`soft_mystic_rate`가 되므로 DB 컬럼도
  반드시 같이 바꿔야 한다. 안 바꾸면 4단계까지 같은 방식으로 무력화된다.

→ 마이그레이션 115에 `abusing_policy` 컬럼 4개 rename을 포함했다.

### 잔재 검증 결과

- `jam-web/src` · `jam-web/design-system`(벤더 제외): **0건**
- `Service Plan/Specs` · `Business`: 아래 2종만 의도적으로 남김
  - `UX_WRITING_GUIDELINE.md`의 «등급명 표기» 절 — 매핑 이력을 적는 곳이므로 옛 이름이
    있어야 한다(K항이 명시적으로 요구). 이 절이 **옛 이름을 적어 두는 유일한 곳**임을
    문서 안에 못박았다.
  - `wandering_mythic_state` — 2026-08-24에 **삭제된 테이블**의 코드 식별자. 존재하지 않는
    과거 아티팩트라 이름을 바꾸면 기록이 거짓이 된다. 이 예외도 가이드라인에 명기했다.

### J. 세계관 카피 재점검 결론 — 카피 변경 없음

`ACTIVITY_BADGES.md`의 「전설」 9건은 전부 3단계(Epic) 행이고 전부 「블랙 트랙」 세계관이다.
4단계(Mystic) 행에는 「전설」이 없다.

**이름 변경으로 충돌이 오히려 해소됐다.** 기존에는 `Legend` 등급 설명에 「전설로 새깁니다」가
붙어 등급명을 한글로 되풀이하는 모양이었는데, 이제 「전설」은 블랙 트랙의 위계 표현으로만
읽힌다. 세계관 매핑(블랙 트랙=3단계 / 화이트 룸=4단계)도 그대로 두었다 — `Mystic`(신비로운)은
화이트 룸의 차원·미스터리 컨셉과 오히려 더 맞는다.

이 판단이 다음 작업자에게 남도록 `ACTIVITY_BADGES.md` 설계 원칙에 6번 항목으로 명시했다.

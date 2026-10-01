---
type: prd
status: draft
description: "에셋 제너레이터 자동 경로(윤진)가 만드는 배지 등록 묶음(bundle.json)의 필드·검증 규칙·실행 절차와 등록 기록·되돌림 방식의 정본이다."
tags: [어드민, 배지]
related:
  - "20260924_2202"
basis:
  - "docs/specs/prd/asset-generator/PRD.md"
code:
  - "jam-web/scripts/asset-generator/register-badge.mjs"
  - "jam-web/scripts/asset-generator/registerBundle.mjs"
  - "jam-web/scripts/asset-generator/registerFlow.mjs"
  - "jam-web/scripts/asset-generator/registerRecord.mjs"
  - "jam-web/src/lib/admin/registerChecks/shared.ts"
  - "jam-web/src/lib/admin/registerChecks/badge.ts"
  - "jam-web/src/lib/admin/registerChecks/references.ts"
---

# 배지 등록 묶음(bundle.json)과 등록 스크립트

> **상태: draft.** 실제 등록(DB·저장소 쓰기)은 컨펌된 묶음마다 메인 세션이 실행하고, 첫 실행 결과가 나오면
> `active`로 올린다. 이 문서는 [PRD](PRD.md) §8 자동 경로의 «등록 묶음 → 등록» 구간만 정의한다.
> 이미지를 만드는 구간(CLI `render.mjs`)은 PRD §8에 있다.

## 1. 범위

- **지원 배지 유형은 `activity`(활동 배지)와 `item`(아이템 배지)이다.** `checkin`(체크인 배지)은 거절한다 —
  체크인 배지는 지점(POI)과 연결돼야 획득 판정이 성립하는데 묶음에 지점을 가리키는 필드가 없다.
- **신규 배지만 등록한다.** 기존 배지 갱신은 1차 범위 밖이다. 같은 이름의 삭제되지 않은 배지가 이미 있으면
  중복으로 거절한다.
- 묶음이 다루지 않는 배지 필드(체크인 카테고리, JAM! 분류 `admin_category`, 패치 판매 2필드, 배경 테마 5필드)는
  어드민 배지 생성 API가 «값 없음»일 때 쓰는 기본값으로 들어간다. 필요하면 등록 뒤 어드민에서 고친다.
- 형식은 **JSON 한 벌(`bundle.json`)** 이다. 새 의존성(YAML·frontmatter 파서)을 들이지 않기 위해서다. 사람이 읽고
  컨펌하는 자료는 별도 형식이 아니라 `--dry-run` 출력(§6)이 맡는다.

## 2. 묶음 폴더

묶음은 폴더 하나다. **권장 위치는 `jam-doc/assets/badge-bundles/<묶음 ID>/`** 이고 폴더 이름은 `bundle_id`와 같게 쓴다.

```
jam-doc/assets/badge-bundles/<묶음 ID>/
├─ bundle.json                 윤진이 만든다 (이 문서의 형식)
├─ image.png                   CLI(render.mjs)가 만든 원본 PNG. 파일 이름은 자유
├─ registration-record.json    등록 뒤 스크립트가 만든다 (§7)
└─ registration.sql            등록 뒤 스크립트가 만든다 (§7)
```

`image.path`는 `bundle.json` 기준 상대 경로 또는 절대 경로다. `--record-dir`을 주지 않으면 등록 기록은
`bundle.json`이 있는 폴더에 쓴다.

## 3. bundle.json 필드

모든 필드는 아래 표에 있는 것만 허용한다. 표에 없는 필드는 오타를 걸러내려고 거절한다. 검증은 사유를
**한 번에 모두** 모아서 알린다.

### 3.1 최상위

| 필드 | 필수 | 형식 | 검증 규칙 |
|---|---|---|---|
| `bundle_id` | 필수 | 문자열 | 영문 소문자·숫자·하이픈, 60자 이하(예: `2026-09-25-dawn-runner`). 폴더 이름·SQL 기록 파일명(`seed_agent_badge_<슬러그>.sql`)에 쓴다 |
| `author` | 필수 | 문자열 | 비어 있지 않은 한 줄 문자열. 윤진이 만들면 `윤진`. 줄바꿈·제어 문자(탭 포함)가 있으면 거절한다 — SQL 기록의 `--` 주석에도 들어가는 값이라 줄바꿈이 섞이면 주석 밖의 실행 가능한 문장이 되기 때문이다 |
| `created_at` | 필수 | ISO 8601 | 시간대가 붙어야 한다(`2026-09-25T10:30:00+09:00`). 화면에는 KST로 바꿔 보여 준다 |
| `color_rationale_link` | 필수 | 문자열 | 컬러(배경색·끝색) 선택 근거를 적은 기획 문서. `http(s)://` 주소이거나 `docs/`·`jam-doc/`로 시작하는 저장소 상대 경로. 형식만 확인하고 파일 존재는 확인하지 않는다 |
| `badge` | 필수 | 객체 | §3.2 |
| `image` | 필수 | 객체 | §3.3 |

### 3.2 badge

이름은 어드민 배지 생성 API(`jam-web/src/app/api/admin/badges/route.ts` POST)의 body와 DB 컬럼 이름과 같다.

| 필드 | 필수 | 형식 | 검증 규칙·기본값 |
|---|---|---|---|
| `name` | 필수 | 문자열 | 공백뿐이면 거절. 줄바꿈·제어 문자(탭 포함)가 있으면 거절(`author`와 같은 이유). 같은 이름의 삭제되지 않은 배지가 있으면 거절(DB 읽기) |
| `description` | 필수 | 문자열 | 공백뿐이면 거절. 배지 설명문은 `-습니다`체다([UX 라이팅 §2.1](../../UX_WRITING_GUIDELINE.md)) |
| `type` | 필수 | `activity` \| `item` | `checkin`은 «POI 연결이 필요해서 등록할 수 없다»는 사유로 거절 |
| `rarity` | 조건부 | `common` \| `rare` \| `epic` \| `mystic` | 등급형이면 `rarity`, 레벨형이면 `level` 중 **정확히 하나**만 준다. 둘 다이거나 둘 다 없으면 거절(`findRarityLevelError`) |
| `level` | 조건부 | 1 이상 정수(JSON 숫자) | 위와 같다. 레벨형(무한레벨)은 `rarity`가 null이다 |
| `family_key` | 선택 | `"종목:이름"` | 값이 있으면 `:`를 포함하고 쉼표가 없고 `#`로 시작하지 않아야 한다(`isValidFamilyKey`). 없으면 null |
| `sort_order` | 선택 | 0 이상 정수 | 기본 0. **0은 «미설정»이라 배지 트리에서 맨 뒤로 밀린다**(계열 레일 1~99, 독립 발급 101~) |
| `activity_types` | 선택 | 문자열 배열 | 기본 `[]`. 값은 `running`·`cycling`·`trail_running`·`hiking`·`walking` 중에서 |
| `point_reward` | 선택 | 0 이상 정수 | 기본 0 |
| `drop_weight` | 선택 | 0보다 큰 숫자 | 기본 1.0. DB CHECK `badges_drop_weight_positive`와 같은 조건 |
| `condition_json` | 선택 | 객체 | 기본 없음(null). 어드민 저장 검증과 같은 함수(`findBadgeConditionSaveError`)로 판정한다 — 엔진이 모르는 조건 키, 짝 필드 없음, 회차+휴식 조합, 사용량 지표 조합, 교차 게이트 형태를 거절하고, 아이템 배지의 누적 조건도 거절한다. `checkin_badge_count`의 배지 이름 목록은 실제 체크인 배지 이름인지 DB를 읽어 확인한다 |
| `tribe_id` | 선택 | UUID | DB에 그 트라이브가 있는지 읽어 확인 |
| `item_book_id` | 선택 | UUID | DB에 그 컬렉션이 있는지 읽어 확인 |
| `valid_from`·`valid_until` | 선택 | ISO 8601 | 시간대가 붙어야 한다. 둘 다 있으면 `valid_from`이 앞서야 한다 |

스크립트가 정하는 값(묶음에서 받지 않는다): `id`(등록 전에 정한 UUID), `image_url`(업로드한 WebP 공개 주소, `?v=`
캐시 무효화 쿼리 포함), `image_source`(항상 `agent-generator`, PRD §10), `patch_available=false`,
`patch_price_krw=null`, `category=null`, `admin_category=null`, `show_on_map=true`, 배경 테마 5필드 전부 null.

### 3.3 image

| 필드 | 필수 | 형식 | 검증 규칙 |
|---|---|---|---|
| `path` | 필수 | 문자열 | 원본 PNG 경로(상대는 `bundle.json` 기준). 파일이 있어야 하고, 비어 있지 않아야 하고, **내용이 PNG**여야 하고(확장자가 아니라 파일 머리의 PNG 서명을 본다), 5MB 이하여야 한다(적용 API와 같은 상한) |
| `seed` | 필수 | 정수 | 마스터 시드(PRD §11). 음수도 허용한다 |
| `preset_id` | 필수 | UUID | 에셋 제너레이터 프리셋 ID. 재현 기록용이라 존재 여부는 확인하지 않는다 |
| `bg_color` | 필수 | `#rrggbb` | 이미지 배경색(그라데이션 시작색과 같다, PRD §8). 알파 없는 6자리만 허용 |
| `end_color` | 필수 | `#rrggbb` | 그라데이션 끝색 |
| `text` | 선택 | 문자열 | CLI `--text`에 넣은 값. 같은 프리셋·색·텍스트·시드면 같은 이미지가 나오므로(PRD §11) 재현하려면 필요해서 기록한다 |

`image.bg_color`·`image.end_color`는 배지 상세 화면의 배경 테마(`badges.background_color`)와 별개다. 배경 테마는
묶음이 다루지 않는다(PRD §13).

## 4. 검증이 내는 사유 예

| 상황 | 사유 |
|---|---|
| 필수 항목 누락 | `image.seed: 필수 항목이 없어요.` |
| 작성자·이름에 줄바꿈·제어 문자 | `author: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).` (`badge.name`도 같은 문장) |
| 이미지 없음 | `image.path: 이미지 파일을 찾을 수 없어요: <절대경로>` |
| PNG 아님 | `image.path: PNG 파일이 아니에요: <절대경로>` |
| 색 형식 오류 | `image.bg_color: #rrggbb 형식이어야 해요(받은 값: "red").` |
| 시드 형식 오류 | `image.seed: 정수여야 해요(받은 값: 1.5).` |
| 체크인 배지 | `badge.type: checkin 배지는 POI 연결이 필요해서 묶음으로 등록할 수 없어요(지원 유형: activity, item).` |
| 등급·레벨 동시 지정 | `badge.rarity/level: 저장할 수 없습니다. 등급형과 레벨형은 함께 지정할 수 없습니다. …` (어드민과 같은 문장) |
| 이름 중복(DB 읽기) | `이름 중복: 같은 이름의 배지가 이미 있어요(id: …). 기존 배지 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.` |

## 5. 예시

아래 묶음이 예시 폴더 `jam-web/scripts/asset-generator/__fixtures__/example-bundle/`의 `bundle.json`과 같은 내용이다(같은
폴더에 작은 `image.png`가 있다). 이름에 `[TEST]`를 붙여 실수로 등록해도 알아보게 했다.

```json
{
  "bundle_id": "example-badge",
  "author": "윤진",
  "created_at": "2026-09-25T10:30:00+09:00",
  "color_rationale_link": "jam-doc/planning/content/TRIBES.md",
  "badge": {
    "name": "[TEST] 예시 산책 배지",
    "description": "묶음 형식을 확인하려고 만든 예시 배지입니다. 실제로 등록하지 않습니다.",
    "type": "activity",
    "rarity": "common",
    "sort_order": 101,
    "activity_types": ["walking"],
    "point_reward": 10,
    "condition_json": { "activity_type": "walking", "distance_km": 5 }
  },
  "image": {
    "path": "image.png",
    "seed": 20260925,
    "preset_id": "11111111-1111-4111-8111-111111111111",
    "bg_color": "#ff1a00",
    "end_color": "#ff4dff",
    "text": "예시 산책"
  }
}
```

레벨형이면 `rarity` 대신 `"level": 2`를, 계열에 넣으려면 `"family_key": "walking:K1"`을 준다. 아이템 배지는
`"type": "item"`에 `tribe_id`·`item_book_id`·`drop_weight`를 더한다.

## 6. 실행 절차

```
윤진   : 프리셋·색으로 CLI 실행 → PNG + 시드 → 묶음 폴더 준비(bundle.json + PNG)
         → --dry-run 실행 → 요약을 기획안·이미지와 함께 사용자에게 보여 주며 컨펌 요청
사용자 : 컨펌
카리나 : --dry-run 없이 실행 → 이미지 업로드 + 배지 행 등록 → 등록 기록 파일 생성
         → SQL 기록을 마이그레이션 폴더로 옮겨 커밋 → 등록 기록·되돌림을 리포트에 남김
```

스크립트는 **cwd가 `jam-web`인 `tsx`** 로 실행한다. 어드민 배지 API와 같은 검증 함수를 재사용하는데, 그 함수들이 내부에서
`@/` 별칭을 쓰고 tsx는 cwd의 `tsconfig.json`에서 별칭을 읽기 때문이다(저장소 루트에서 실행하면 별칭을 못 찾는다는
안내를 내고 끝난다). 필요한 환경변수는 `jam-web/.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`이고
(`render.mjs`와 같다), `--dry-run`에서는 없어도 된다.

```
cd jam-web

# 1) 검증 — DB·저장소·파일에 쓰지 않는다
npx tsx scripts/asset-generator/register-badge.mjs --bundle <bundle.json 절대경로> --dry-run

# 2) 등록 — 사용자 컨펌 뒤 메인 세션만 실행한다
npx tsx scripts/asset-generator/register-badge.mjs --bundle <bundle.json 절대경로> [--record-dir <폴더 절대경로>]

# 3) 되돌림
npx tsx scripts/asset-generator/register-badge.mjs --undo <registration-record.json 절대경로> [--dry-run]
```

### `--dry-run`

묶음을 검증하고 컨펌 자료를 한국어로 출력한다: 묶음(작성자·작성 시각 KST·컬러 근거), 배지(이름·설명·유형·종류·계열 키·
조건 등), 이미지(경로·크기·프리셋·시드·색·텍스트·WebP 변환 결과), DB 읽기 검사, 등록 예정 내용, 되돌림 SQL
미리보기. 종료 코드는 통과 0, 실패 1이다.

- **쓰기를 하지 않는다.** 업로드·insert·삭제·기록 파일 생성 없이 메모리에서 WebP 변환만 해 본다.
- **DB 읽기 검사**(이름 중복·트라이브·컬렉션·체크인 배지 이름 목록)는 서비스 키가 있을 때만 읽기 전용으로 돌리고, 키가
  없으면 «건너뜀»으로 표시한다. 그래서 키가 없는 환경(격리 워크트리 등)에서도 로컬 검증만으로 통과·실패가 나온다.
  건너뜀이 있으면 요약 첫 줄이 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`으로 나오고 바로 아래에 «컨펌 근거로 쓰지 말고 키가
  있는 환경(메인 폴더)에서 다시 돌리라»는 안내가 붙는다. 컨펌 자료로 쓰는 요약은 건너뜀이 없는 것이어야 한다.
- 이미 `registration-record.json`이 있는 폴더는 «이미 등록한 묶음»으로 실패 처리한다.

### 등록 순서와 실패 처리

1. 묶음 검증 → DB 읽기 검사. 하나라도 실패하면 아무것도 쓰지 않고 끝낸다.
2. 새 배지 id를 `crypto.randomUUID()`로 미리 정한다(이미지 저장 경로에 쓰려고).
3. 이미지 업로드: 원본 PNG `badges/asset-generator/{id}.png`, 표시 규격 WebP `badges/asset-generator/{id}.webp`
   (`images` 버킷, 긴 변 1280px 이하 — PRD §9. 저장 경로·WebP 변환은 어드민 적용 API와 같다). 하나라도 실패하면 이미 올라간
   파일을 지우고 끝낸다.
4. 배지 행 insert(`image_url` = WebP 공개 주소 + `?v=`, `image_source = 'agent-generator'`). 실패하면 올라간 파일 2개를
   지우고 끝낸다. 이미지를 먼저 올리는 이유는 insert가 성공한 뒤 업로드가 실패해 깨진 이미지의 배지가 서비스에 보이는 것을
   막으려는 것이다.
5. 등록 기록 파일 생성. 이 단계가 실패해도 등록은 끝난 상태이므로 기록 내용을 화면에 그대로 찍는다.

## 7. 등록 기록과 되돌림

등록하면 묶음 폴더(또는 `--record-dir`)에 두 파일이 생긴다. 기존 기록은 덮어쓰지 않는다.
형식은 홈피드 카드 등록 선례(티켓 20260923_2252, 2026-09-24 주간 리포트 W39의 「등록 기록」 — 파일은 삭제돼 git 이력에서만 확인한다)를 따른다.

**`registration-record.json`** — 배지 id·이름·유형, 저장소 경로 2개(`storage.png_path`·`storage.webp_path`), 이미지 URL,
시드·프리셋·색·텍스트, 작성자, 등록 시각(KST, `+09:00`), 컬러 근거 링크, 묶음 요약 한 줄(`summary`).

**`registration.sql`** — 등록과 동등한 `INSERT INTO public.badges …`(같은 id가 있으면 아무 일도 하지 않는다)와, 파일 끝의
되돌림 표식이다.

```sql
-- 되돌림 SQL
-- delete from public.badges where id = '<배지 id>';
```

표식은 마이그레이션 되돌림 규칙(`.claude/skills/jam-work/references/db-migration-rules.md` §4)의 형식이다.

**메인 세션의 마무리:**

1. `registration.sql`을 `jam-web/supabase/migrations/seed_agent_badge_<슬러그>.sql`로 옮겨 커밋한다. 슬러그는 `bundle_id`의
   영문·숫자가 아닌 문자를 밑줄로 바꾼 값이다(`registration.sql` 머리 주석에 정확한 파일명이 적혀 있다). 이미 DB에
   반영된 기록이므로 다시 실행하지 않는다.
2. 배지 id·이름·되돌림 명령을 `jam-doc/operations/reports/weekly/`의 해당 주 「등록 기록」 절에 표로 남긴다.

### `--undo`

저장소 파일은 SQL로 지울 수 없어서 스크립트가 파일 2개와 배지 행을 함께 지운다.

- 지우기 전에 **이 배지가 어디에 쓰였는지** 읽는다. 대상은 `badges`를 참조하는 외래 키 10곳이다(생성 타입 대조 테스트로 고정,
  원본 목록은 `jam-web/src/lib/admin/registerChecks/references.ts`의 `BADGE_UNDO_REFERENCE_TABLES` 한 곳이고, `registerFlow.mjs`가 `UNDO_REFERENCE_TABLES` 이름으로 다시 내보낸다):

  | 효과(배지를 지우면) | 표.컬럼 |
  |---|---|
  | 삭제 차단(NO ACTION) | `user_activity_badges.badge_id` · `inventory_items.badge_id` · `poi_drops.badge_id` · `poi.linked_badge_id` · `point_transactions.source_badge_id` |
  | 연쇄 삭제(CASCADE) | `user_checkin_badge_earns.badge_id` · `user_item_book_slots.badge_id` |
  | 연결 해제(SET NULL) | `item_books.reward_badge_id` · `item_books.required_activity_badge_id` · `missions.gated_badge_id` |

  외래 키가 아닌 **배열 컬럼 4곳**도 같이 읽는다(같은 파일의 `BADGE_UNDO_ARRAY_REFERENCE_COLUMNS`, `registerFlow.mjs`가 `UNDO_ARRAY_REFERENCE_COLUMNS`로 다시 내보낸다. 어드민 배지 삭제의 참조 목록과 같은 위치). DB가 막지 않고
  배지 행을 지우면 삭제된 id가 배열에 그대로 남기 때문이다. 배열에 배지 id가 들어 있는 행 수를 센다.

  | 효과 | 표.컬럼 |
  |---|---|
  | 배열에 id가 남음 | `missions.reward_badge_ids` · `today_cards.badge_ids` · `combination_recipes.reward_badge_ids` · `combination_recipe_slots.allowed_badge_ids` |

  (미션·홈피드 `--undo`의 비외래 키 참조는 이 확인 범위 밖이다.)

  하나라도 있으면 아무것도 지우지 않고 어느 관계에 몇 건인지(예: `user_checkin_badge_earns.badge_id 2건(연쇄 삭제)`) 알리며 중단한다.
  참조를 읽지 못해도 중단한다. 이때는 삭제하지 말고 어드민에서 소프트 삭제한다. 삭제 차단 5곳은 DB가 이미 막아 주지만,
  `--undo`가 중간에 실패해 저장소 파일과 행이 어긋나지 않도록 미리 읽는다. 마이그레이션으로 `badges`를 가리키는 외래 키가 늘거나 줄고 생성 타입을
  재생성하면 대조 테스트가 실패하므로 목록을 함께 고친다.
- 기록의 저장소 경로가 규칙(`badges/asset-generator/{id}.png`·`.webp`)과 다르면 시작하지 않는다(엉뚱한 파일을 지우지 않으려고).
- `image_source`가 `agent-generator`가 아닌 배지는 지우지 않는다.
- 배지 행을 먼저 지우고 파일을 지운다. 행 삭제가 외래 키 등으로 막히면 이미지는 그대로 남아 배지가 깨지지 않는다.
- `--dry-run`을 붙이면 같은 참조 확인까지만 하고 지우지 않는다(참조가 있으면 dry-run도 같은 사유로 중단한다).

## 8. 관련 문서

- [PRD](PRD.md) §8(자동 경로)·§9(출력 규격)·§10(제작 경로 표시)·§11(시드와 재현)
- 이미지 만들기 CLI: `jam-web/scripts/asset-generator/render.mjs`
- 이 문서를 만든 티켓: [20260924_2202](../../../tickets/p2-normal/20260924_2202_Infra_배지-등록묶음-포맷과-등록-스크립트.md)

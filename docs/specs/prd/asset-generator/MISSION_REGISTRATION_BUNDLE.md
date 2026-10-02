---
type: prd
status: draft
description: "에셋 제너레이터 자동 경로(윤진)가 만드는 미션 등록 묶음(bundle.json)의 필드·검증 규칙·실행 절차와 등록 기록·되돌림 방식의 정본이다."
tags: [어드민, 미션]
related:
  - "20260925_1412"
  - "20260925_1404"
basis:
  - "docs/specs/prd/asset-generator/PRD.md"
  - "docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md"
code:
  - "jam-web/scripts/asset-generator/register-mission.mjs"
  - "jam-web/scripts/asset-generator/registerMissionBundle.mjs"
  - "jam-web/scripts/asset-generator/registerMissionFlow.mjs"
  - "jam-web/scripts/asset-generator/registerMissionRecord.mjs"
  - "jam-web/src/lib/admin/registerChecks/shared.ts"
  - "jam-web/src/lib/admin/registerChecks/bundleRules.ts"
  - "jam-web/src/lib/admin/registerChecks/missionFields.ts"
  - "jam-web/src/lib/admin/registerChecks/mission.ts"
  - "jam-web/src/lib/admin/registerChecks/references.ts"
---

# 미션 등록 묶음(bundle.json)과 등록 스크립트

> **상태: draft.** 실제 등록(DB·저장소 쓰기)은 컨펌된 묶음마다 메인 세션이 실행하고, 첫 실행 결과가 나오면
> `active`로 올린다. 이 문서는 [PRD](PRD.md) §8 자동 경로의 «등록 묶음 → 등록» 구간 중 **미션**만 정의한다.
> 배지는 [REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md), 이미지를 만드는 구간(CLI `render.mjs`)은 PRD §8에 있다.

## 1. 범위

- **신규 미션만 등록한다.** 기존 미션 갱신은 범위 밖이다. 같은 제목의 미션이 이미 있으면 중복으로 거절한다
  (`missions`에는 삭제 컬럼이 없어 삭제 여부는 보지 않는다). 제목을 읽고 나서 등록하는 두 단계라 **동시에 두 번 등록하는 경합은 막지 못한다** —
  **메인 세션이 한 번에 하나씩 실행한다**는 전제다(홈피드와 같은 전제, 티켓
  [20260925_2106](../../../tickets/p3-low/20260925_2106_Infra_등록-스크립트-제목-중복-검사의-동시-등록-경합.md) 결정 A, 2026-09-25). DB에 제목
  UNIQUE 제약을 더하지 않기로 했고, 병렬 실행이 실제로 필요해지면 그때 제약을 다시 검토한다.
- **배지 스크립트와 별개다.** 배지 등록 스크립트 5개 파일(`register-badge.mjs`·`registerArgs.mjs`·`registerBundle.mjs`·
  `registerFlow.mjs`·`registerRecord.mjs`)은 미션 등록 때문에 고치지 않고, 내용과 무관한 부품(인자 파싱·묶음 파일 읽기·UUID 형식·기록 파일
  쓰기·시각 표기)만 가져다 쓴다. 미션 전용 부분은 `registerMission*.mjs`에 있다. 다만 DB 읽기 검사와 `--undo` 전 참조 확인은
  서버(운영툴 예약 등록)도 같은 함수를 쓰도록 세 유형 모두 `jam-web/src/lib/admin/registerChecks/`의 TS 모듈로 옮겼다
  (미션은 `mission.ts`의 `runMissionDbChecks`, `references.ts`의 `MISSION_UNDO_REFERENCE_TABLES`·`findMissionUndoReferences`.
  티켓 20261002_0827). 스크립트의 같은 이름 함수는 그 모듈을 부르는 얇은 래퍼다. 운영툴 예약 등록(티켓 20261002_1944)은 같은 `runMissionDbChecks`에 `titleDuplicate: 'overlap'`을
  골라 「제목 중복」을 기간이 겹칠 때만 건다. 스크립트는 고르지 않으므로 묶음의 `starts_at`을 함께 넘겨도 지금까지처럼 같은 제목이 하나라도 있으면 거절한다. 미션 한 건의 순수 검사(`validateMission`)·미션 상수
  (`MISSION_REQUIRED_FIELDS`·`STATUS_DISPLAY_TYPES`·`EXPOSURE_MODES` 등)·insert 페이로드 코어(`buildMissionInsertPayload`)도 `missionFields.ts`로,
  정규식(`UUID_PATTERN`·`CONTROL_OR_LINE_BREAK`)과 보조 함수는 `bundleRules.ts`로 옮겼다(티켓 20261002_1027). `registerMissionBundle.mjs`는 그 상수를
  같은 이름으로 다시 내보내고 `validateMission`을 부르며, `buildMissionInsertPayload`는 얇은 JS 래퍼다. 동작·오류 문장·페이로드 키 집합은
  옮기기 전과 같다. 세계관 검토·이미지 검사·묶음 전체 검사(`validateWorldReview`·`validateImage`·`validateMissionBundle`)는 서버가 쓰지 않아 스크립트에
  남는다. 배지 쪽 검사·페이로드의 이전은 별도 티켓에서 다룬다.
- 묶음이 다루지 않는 필드는 기본값으로 들어간다: `reward_type`·`reward_id`·`gated_badge_id`(폐기 예정 필드)는 항상 null이고,
  `created_at`은 DB 기본값이다. 필요하면 등록 뒤 어드민에서 고친다.
- 형식은 **JSON 한 벌(`bundle.json`)** 이다. 사람이 읽고 컨펌하는 자료는 별도 형식이 아니라 `--dry-run` 출력(§6)이 맡는다.
- **시험 등록은 숨김 미션으로 한다.** `exposure_mode: "hidden"`이면 서비스 어디에도 노출되지 않는다(목록·오늘 카드·참가 API·
  상세 직접 접근 전부, 마이그레이션 163).

## 2. 묶음 폴더

묶음은 폴더 하나다. **권장 위치는 `jam-doc/assets/mission-bundles/<묶음 ID>/`** 이고 폴더 이름은 `bundle_id`와 같게 쓴다.

```
jam-doc/assets/mission-bundles/<묶음 ID>/
├─ bundle.json                 윤진이 만든다 (이 문서의 형식)
├─ image.png                   CLI(render.mjs)가 만든 원본 PNG. 파일 이름은 자유
├─ registration-record.json    등록 뒤 스크립트가 만든다 (§7)
└─ registration.sql            등록 뒤 스크립트가 만든다 (§7)
```

`image.path`는 `bundle.json` 기준 상대 경로 또는 절대 경로다. `--record-dir`을 주지 않으면 등록 기록은
`bundle.json`이 있는 폴더에 쓴다.

## 3. bundle.json 필드

모든 필드는 아래 표에 있는 것만 허용한다. 표에 없는 필드는 오타를 걸러내려고 거절한다(폐기 예정 필드
`reward_type`·`reward_id`·`gated_badge_id`와 `image_source`도 여기에 해당한다). 검증은 사유를 **한 번에 모두** 모아서 알린다.

### 3.1 최상위

| 필드 | 필수 | 형식 | 검증 규칙 |
|---|---|---|---|
| `bundle_id` | 필수 | 문자열 | 영문 소문자·숫자·하이픈, 60자 이하(예: `2026-09-25-weekend-long-run`). 폴더 이름·SQL 기록 파일명(`seed_agent_mission_<슬러그>.sql`)에 쓴다 |
| `author` | 필수 | 문자열 | 비어 있지 않은 한 줄 문자열. 윤진이 만들면 `윤진`. 줄바꿈·제어 문자(탭 포함)가 있으면 거절한다 — SQL 기록의 `--` 주석에도 들어가는 값이라 줄바꿈이 섞이면 주석 밖의 실행 가능한 문장이 되기 때문이다 |
| `created_at` | 필수 | ISO 8601 | 시간대가 붙어야 한다(`2026-09-25T10:30:00+09:00`). 화면에는 KST로 바꿔 보여 준다 |
| `color_rationale_link` | 필수 | 문자열 | 컬러(배경색·끝색) 선택 근거를 적은 기획 문서. `http(s)://` 주소이거나 `docs/`·`jam-doc/`로 시작하는 저장소 상대 경로. 형식만 확인하고 파일 존재는 확인하지 않는다 |
| `world_review` | 필수 | 객체 | §3.2 |
| `mission` | 필수 | 객체 | §3.3 |
| `image` | 필수 | 객체 | §3.4 |

### 3.2 world_review (세계관 검수 기록)

상위 티켓 [20260925_1404](../../../tickets/p2-normal/20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)의
결정 6·11: 세계관과 닿는 신규 콘텐츠만 윈터 검수를 거치고, 순수 운영성 콘텐츠는 검수 없이 진행하되 **어느 쪽이었는지 기록이 남아야 한다.**
셋 다 필수다.

| 필드 | 형식 | 검증 규칙 |
|---|---|---|
| `world_related` | true \| false | 세계관과 닿는 내용이 있는가 |
| `winter_reviewed` | true \| false | 윈터 검수를 거쳤는가. **`world_related`가 true인데 false이면 거절한다** |
| `reason` | 문자열 | 판단 사유 한 줄. 줄바꿈·제어 문자가 있으면 거절한다. 검수 없이 진행한 경우에도 사유를 적는다(예: 순수 운영성 미션) |

### 3.3 mission

이름은 어드민 미션 생성 API(`jam-web/src/app/api/admin/missions/route.ts` POST)의 body와 DB 컬럼 이름과 같다. 필수·선택 구분은
`jam-web/src/types/database.generated.ts`의 `missions` Insert 타입을 기준으로 하되, 설명(`description`)은 화면에 보이는 문구라 필수로 둔다.

| 필드 | 필수 | 형식 | 검증 규칙·기본값 |
|---|---|---|---|
| `title` | 필수 | 문자열 | 공백뿐이면 거절. 줄바꿈·제어 문자가 있으면 거절(`author`와 같은 이유). 같은 제목의 미션이 있으면 거절(DB 읽기) |
| `description` | 필수 | 문자열 | 공백뿐이면 거절. 화면 문구는 [UX 라이팅 가이드](../../UX_WRITING_GUIDELINE.md)를 따른다 |
| `mission_type` | 필수 | 문자열 | `distance`·`checkin`·`activity_count`·`item_collect`·`streak_days`·`duration_minutes`·`elevation_gain_m`·`engine_condition` 중 하나(DB CHECK와 어드민 폼과 같은 목록, `lib/admin/badge-labels.ts`의 `MISSION_TYPES`) |
| `condition_json` | 필수 | 객체 | 어드민 저장 검증과 **같은 함수·같은 순서**로 판정한다: ① `checkMissionCondition`(모르는 키·평가 구현이 없는 키 거절, 오타 제안) → ② `checkMissionConditionValue`(유형별 필수 값이 비었거나 0 이하이면 거절 — 영구 미달성 방지). ①이 실패하면 ②는 하지 않는다. 판정에 영향이 없는 필드 고지(`warning`)는 등록을 막지 않고 dry-run의 «알아둘 점»에 보인다 |
| `starts_at` | 필수 | ISO 8601 | 시간대가 붙어야 한다 |
| `ends_at` | 선택 | ISO 8601 | 없으면 종료일 없는 상시 미션. 있으면 `starts_at`보다 뒤여야 한다 |
| `reward_points` | 선택 | 0 이상 정수 | 없으면 null |
| `reward_badge_ids` | 선택 | UUID 배열 | 기본 `[]`. 같은 id를 두 번 넣을 수 없고, 각 배지가 삭제되지 않은 채 있는지 DB를 읽어 확인한다 |
| `status_display_type` | 선택 | `ranking` \| `achievement` \| `individual` | 기본 `ranking` |
| `visible_rank_count` | 선택 | 1 이상 정수 | 없으면 전체 노출(null) |
| `max_completions` | 선택 | 1 이상 정수 | 없으면 제한 없음(null) |
| `gate_axis`·`gate_stage` | 선택 | 문자열 | 게이트 미션일 때만. 둘은 짝이다. `findGateMissionSaveError`가 판정한다(축 형태 `종목:축이름`, 단계 `rare_to_epic`·`epic_to_mystic`) |
| `visibility_rule_json` | 선택 | 객체 | 게이트 미션에만 허용. 형태는 `findGateMissionSaveError`가 판정한다 |
| `exposure_mode` | 선택 | `hidden` \| `start_date` \| `scheduled` | 기본 `start_date`. `scheduled`면 `exposure_at`이 필수다 |
| `exposure_at` | 조건부 | ISO 8601 | `exposure_mode`가 `scheduled`일 때만 쓸 수 있다(그 외 모드에서는 DB가 무시하므로 거절한다) |

세 검증 함수(`checkMissionCondition`·`checkMissionConditionValue`·`findGateMissionSaveError`)는 어드민 미션 API가 부르는 것과 같은
함수이며 복사하지 않고 그대로 불러 쓴다(호출은 `registerChecks/missionFields.ts`의 `validateMission`에 있다). 어드민 API의 호출 순서(키 → 값 → 게이트)가
바뀌면 테스트가 실패한다.

스크립트가 정하는 값(묶음에서 받지 않는다): `id`(등록 전에 정한 UUID), `image_url`(업로드한 WebP 공개 주소, `?v=` 캐시 무효화 쿼리
포함), `image_source`(항상 `agent-generator`, 마이그레이션 188의 CHECK 허용값, PRD §10), `reward_type`·`reward_id`·`gated_badge_id`
(항상 null). `condition_text`(달성 조건 문장, 마이그레이션 193)는 묶음이 받지 않는 칸이라 비워 둔다(NULL) — 필요하면 어드민 폼에서 채운다.
`missionFields.ts`의 페이로드 코어는 서버가 `image_source`·`condition_text`를 정해 넘길 선택 인자를 받는다. 스크립트는 넘기지 않으므로 값은 위와 같다.

### 3.4 image

| 필드 | 필수 | 형식 | 검증 규칙 |
|---|---|---|---|
| `path` | 필수 | 문자열 | 원본 PNG 경로(상대는 `bundle.json` 기준). 파일이 있어야 하고, 비어 있지 않아야 하고, **내용이 PNG**여야 하고(확장자가 아니라 파일 머리의 PNG 서명을 본다), 5MB 이하여야 한다(적용 API와 같은 상한) |
| `seed` | 필수 | 정수 | 마스터 시드(PRD §11). 음수도 허용한다 |
| `preset_id` | 필수 | UUID | 에셋 제너레이터 프리셋 ID. 재현 기록용이라 존재 여부는 확인하지 않는다 |
| `bg_color` | 필수 | `#rrggbb` | 이미지 배경색(그라데이션 시작색과 같다, PRD §8). 알파 없는 6자리만 허용 |
| `end_color` | 필수 | `#rrggbb` | 그라데이션 끝색 |
| `text` | 선택 | 문자열 | CLI `--text`에 넣은 값. 같은 프리셋·색·텍스트·시드면 같은 이미지가 나오므로(PRD §11) 재현하려면 필요해서 기록한다 |

## 4. 검증이 내는 사유 예

| 상황 | 사유 |
|---|---|
| 필수 항목 누락 | `mission.title: 필수 항목이 없어요.` |
| 작성자·제목·검수 사유에 줄바꿈·제어 문자 | `mission.title: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).` (`author`·`world_review.reason`도 같은 문장) |
| 세계관 내용이 있는데 검수 안 함 | `world_review.winter_reviewed: 세계관과 닿는 미션(world_related=true)은 윈터 검수를 거쳐야 해서 true여야 해요.` |
| 조건 키 오타 | `mission.condition_json: 조건 JSON을 저장하지 못했어요. 미션 조건에 없는 필드가 있어요 — distnace_km. …` (어드민과 같은 문장) |
| 조건 값이 비었거나 0 이하 | `mission.condition_json: 조건 JSON을 저장하지 못했어요. 거리 값은 0보다 큰 숫자여야 하는데 …` |
| 게이트 축·단계 불일치 | `mission.gate: 저장할 수 없어요. 여는 축과 게이트 단계는 둘 다 지정하거나 둘 다 비워야 해요.` |
| 기간 순서 | `mission.starts_at: ends_at보다 앞이어야 해요.` |
| 예약 노출에 시각 없음 | `mission.exposure_at: exposure_mode가 scheduled면 노출 시각이 필요해요.` |
| 이미지 없음·PNG 아님 | `image.path: 이미지 파일을 찾을 수 없어요: <절대경로>` · `image.path: PNG 파일이 아니에요: <절대경로>` |
| 제목 중복(DB 읽기) | `제목 중복: 같은 제목의 미션이 이미 있어요(id: …). 기존 미션 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.` |
| 보상 배지 없음(DB 읽기) | `보상 배지 존재: reward_badge_ids에 해당하는 배지가 없거나 삭제됐어요: <id>` |

## 5. 예시

아래 묶음이 예시 폴더 `jam-web/scripts/asset-generator/__fixtures__/example-mission-bundle/`의 `bundle.json`과 같은 내용이다(같은
폴더에 작은 `image.png`가 있다). 제목에 `[TEST]`를 붙이고 노출 모드를 `hidden`으로 두어 실수로 등록해도 알아보고 서비스에 보이지 않게 했다.

```json
{
  "bundle_id": "example-mission",
  "author": "윤진",
  "created_at": "2026-09-25T10:30:00+09:00",
  "color_rationale_link": "jam-doc/planning/content/TRIBES.md",
  "world_review": {
    "world_related": false,
    "winter_reviewed": false,
    "reason": "세계관과 무관한 예시 미션이라 윈터 검수를 거치지 않았습니다."
  },
  "mission": {
    "title": "[TEST] 예시 주말 러닝 미션",
    "description": "묶음 형식을 확인하려고 만든 예시 미션입니다. 실제로 등록하지 않습니다.",
    "mission_type": "distance",
    "condition_json": { "activity_type": "running", "distance_km": 30 },
    "starts_at": "2026-10-03T00:00:00+09:00",
    "ends_at": "2026-10-10T00:00:00+09:00",
    "reward_points": 50,
    "status_display_type": "achievement",
    "exposure_mode": "hidden"
  },
  "image": {
    "path": "image.png",
    "seed": 20260925,
    "preset_id": "11111111-1111-4111-8111-111111111111",
    "bg_color": "#ff1a00",
    "end_color": "#ff4dff",
    "text": "예시 미션"
  }
}
```

배지를 보상으로 주려면 `"reward_badge_ids": ["<배지 UUID>"]`를, 상시 미션이면 `ends_at`을 뺀다.

## 6. 실행 절차

```
윤진   : 프리셋·색으로 CLI 실행 → PNG + 시드 → 묶음 폴더 준비(bundle.json + PNG, 세계관 검수 기록 포함)
         → --dry-run 실행 → 요약을 기획안·이미지와 함께 사용자에게 보여 주며 컨펌 요청
사용자 : 컨펌
카리나 : --dry-run 없이 실행 → 이미지 업로드 + 미션 행 등록 → 등록 기록 파일 생성
         → SQL 기록을 마이그레이션 폴더로 옮겨 커밋 → 등록 기록·되돌림을 리포트에 남김
```

스크립트는 **cwd가 `jam-web`인 `tsx`** 로 실행한다. 어드민 미션 API와 같은 검증 함수를 재사용하는데, 그 함수들이 내부에서
`@/` 별칭을 쓰고 tsx는 cwd의 `tsconfig.json`에서 별칭을 읽기 때문이다(저장소 루트에서 실행하면 별칭을 못 찾는다는
안내를 내고 끝난다). 필요한 환경변수는 `jam-web/.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`이고
(`register-badge.mjs`와 같다), `--dry-run`에서는 없어도 된다.

```
cd jam-web

# 1) 검증 — DB·저장소·파일에 쓰지 않는다
npx tsx scripts/asset-generator/register-mission.mjs --bundle <bundle.json 절대경로> --dry-run

# 2) 등록 — 사용자 컨펌 뒤 메인 세션만 실행한다
npx tsx scripts/asset-generator/register-mission.mjs --bundle <bundle.json 절대경로> [--record-dir <폴더 절대경로>]

# 3) 되돌림
npx tsx scripts/asset-generator/register-mission.mjs --undo <registration-record.json 절대경로> [--dry-run]
```

### `--dry-run`

묶음을 검증하고 컨펌 자료를 한국어로 출력한다: 묶음(작성자·작성 시각 KST·컬러 근거), 세계관 검수(있음/없음·윈터 검수 여부·사유),
미션(제목·설명·유형·조건·표시 방식·기간·보상·게이트·노출 모드), 이미지(경로·크기·프리셋·시드·색·텍스트·WebP 변환 결과),
DB 읽기 검사, 등록 예정 내용, 되돌림 SQL 미리보기, 알아둘 점. 종료 코드는 통과 0, 실패 1이다.

- **쓰기를 하지 않는다.** 업로드·insert·삭제·기록 파일 생성 없이 메모리에서 WebP 변환만 해 본다.
- **DB 읽기 검사**(제목 중복·보상 배지 존재, 유형별로 `item_collect`의 조건 배지·`checkin`의 조건 지점 존재)는 서비스 키가 있을 때만
  읽기 전용으로 돌리고, 키가 없으면 «건너뜀»으로 표시한다. 그래서 키가 없는 환경(격리 워크트리 등)에서도 로컬 검증만으로 통과·실패가
  나온다. 조건 배지·지점은 값 검증이 UUID 형식만 보기 때문에 여기서 실제로 있는지 확인한다(없으면 그 미션은 영구 미달성이다).
  건너뜀이 있으면 요약 첫 줄이 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`으로 나오고 바로 아래에 «컨펌 근거로 쓰지 말고 키가 있는 환경(메인 폴더)에서 다시 돌리라»는 안내가 붙는다(배지 등록과 같다).
- 이미 `registration-record.json`이 있는 폴더는 «이미 등록한 묶음»으로 실패 처리한다.

### 등록 순서와 실패 처리

1. 묶음 검증 → DB 읽기 검사. 하나라도 실패하면 아무것도 쓰지 않고 끝낸다.
2. 새 미션 id를 `crypto.randomUUID()`로 미리 정한다(이미지 저장 경로에 쓰려고).
3. 이미지 업로드: 원본 PNG `missions/asset-generator/{id}.png`, 표시 규격 WebP `missions/asset-generator/{id}.webp`
   (`images` 버킷, 긴 변 1280px 이하 — PRD §9. 저장 경로·WebP 변환은 어드민 적용 API의 미션 경로와 같다). 하나라도 실패하면 이미
   올라간 파일을 지우고 끝낸다.
4. 미션 행 insert(`image_url` = WebP 공개 주소 + `?v=`, `image_source = 'agent-generator'`). 실패하면 올라간 파일 2개를 지우고
   끝낸다. 이미지를 먼저 올리는 이유는 insert가 성공한 뒤 업로드가 실패해 이미지가 깨진 미션이 서비스에 보이는 것을 막으려는 것이다.
5. 등록 기록 파일 생성. 이 단계가 실패해도 등록은 끝난 상태이므로 기록 내용을 화면에 그대로 찍는다.

## 7. 등록 기록과 되돌림

등록하면 묶음 폴더(또는 `--record-dir`)에 두 파일이 생긴다. 기존 기록은 덮어쓰지 않는다. 형식은 배지 등록과 같은 방식이다
([REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md) §7).

**`registration-record.json`** — 미션 id·제목·유형·표시 방식·노출 모드·기간, 세계관 검수 기록(`world_review`), 저장소 경로
2개(`storage.png_path`·`storage.webp_path`), 이미지 URL, 시드·프리셋·색·텍스트, 작성자, 등록 시각(KST, `+09:00`), 컬러 근거 링크,
묶음 요약 한 줄(`summary`).

**`registration.sql`** — 등록과 동등한 `INSERT INTO public.missions …`(같은 id가 있으면 아무 일도 하지 않는다)와, 파일 끝의
되돌림 표식이다. `reward_badge_ids`는 `uuid[]` 컬럼이라 `ARRAY[…]::uuid[]`로 쓴다. 사용자 입력은 `--` 주석에 넣기 전에 한 줄로
정리한다.

```sql
-- 되돌림 SQL
-- delete from public.missions where id = '<미션 id>';
```

표식은 마이그레이션 되돌림 규칙(`.claude/skills/jam-work/references/db-migration-rules.md` §4)의 형식이다.

**메인 세션의 마무리:**

1. `registration.sql`을 `jam-web/supabase/migrations/seed_agent_mission_<슬러그>.sql`로 옮겨 커밋한다. 슬러그는 `bundle_id`의
   영문·숫자가 아닌 문자를 밑줄로 바꾼 값이다(`registration.sql` 머리 주석에 정확한 파일명이 적혀 있다). 이미 DB에 반영된
   기록이므로 다시 실행하지 않는다.
2. 미션 id·제목·되돌림 명령을 `jam-doc/operations/reports/weekly/`의 해당 주 「등록 기록」 절에 표로 남긴다.

### `--undo`

저장소 파일은 SQL로 지울 수 없어서 스크립트가 파일 2개와 미션 행을 함께 지운다.

- 지우기 전에 **사용자 데이터가 붙었는지** 읽는다. 대상은 `missions`를 참조하는 외래 키 6곳이다(생성 타입 대조 테스트로 고정):

  | 표.컬럼 | 미션 삭제 시 |
  |---|---|
  | `user_mission_completions.mission_id` | 함께 삭제(CASCADE) — 완료 이력 |
  | `user_mission_participations.mission_id` | 함께 삭제(CASCADE) — 참여 이력 |
  | `mission_rank_snapshots.mission_id` | 함께 삭제(CASCADE) — 랭킹 스냅샷 |
  | `point_transactions.source_mission_id` | 삭제 자체가 실패(NO ACTION) — 포인트 지급 원장 |
  | `today_cards.mission_id` | 연결이 조용히 끊김(SET NULL) — 홈피드 카드 연결 |
  | `ranking_modes.target_mission_id` | 연결이 조용히 끊김(SET NULL) — 랭킹 모드 대상 |

  어드민 삭제 가드(`lib/admin/reference-guards.ts`의 `MISSION_REFERENCE_SOURCES`)는 앞의 4곳을 차단하고, `today_cards`와 `ranking_modes`는
  삭제를 막지 않는 안내 참조로 다룬다(`ranking_modes`는 티켓 20260925_2105에서 추가). 안내는 단건 삭제 직후의 토스트와 일괄 삭제 확인창에 표시된다.
  이 스크립트의 되돌림은 «방금 등록한 미션이 아직 아무 데도 쓰이지 않았다»는 전제이므로 6곳 모두
  하나라도 붙어 있으면 아무것도 지우지 않고 어느 표에 몇 건인지 알리며 중단한다. 참조를 읽지 못해도 중단한다. 이때는 삭제하지
  말고 어드민에서 노출 모드를 «숨김»으로 바꾼다.
- 기록의 저장소 경로가 규칙(`missions/asset-generator/{id}.png`·`.webp`)과 다르면 시작하지 않는다(엉뚱한 파일을 지우지 않으려고).
- `image_source`가 `agent-generator`가 아닌 미션은 지우지 않는다.
- 미션 행을 먼저 지우고 파일을 지운다. 행 삭제가 외래 키 등으로 막히면 이미지는 그대로 남아 미션이 깨지지 않는다.
- `--dry-run`을 붙이면 참조 확인까지만 하고 지우지 않는다.

## 8. 관련 문서

- [PRD](PRD.md) §8(자동 경로)·§9(출력 규격)·§10(제작 경로 표시)·§11(시드와 재현)
- 배지 등록 묶음: [REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md)
- 이미지 만들기 CLI: `jam-web/scripts/asset-generator/render.mjs`
- 이 문서를 만든 티켓: [20260925_1412](../../../tickets/p2-normal/20260925_1412_Infra_미션-등록묶음-포맷과-등록스크립트.md)

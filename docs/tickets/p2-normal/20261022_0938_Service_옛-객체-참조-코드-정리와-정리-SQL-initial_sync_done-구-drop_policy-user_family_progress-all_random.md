---
id: "20261022_0938"
category: Service
priority: P2
status: IN_PROGRESS
created: 2026-10-22
parent: "20261021_1250"
---

# [Service] 옛 드랍 엔진·user_family_progress·all_random을 참조하는 코드를 정리하고 정리 SQL을 쓴다 (initial_sync_done은 유지로 결정, 파일 이름은 처음 범위의 이름이다)

## 핵심 요약

- 요구사항: 6-4 4회가 «바로 안전한» 정리 SQL 4개(266~269)만 쓰고 넘긴 옛 객체 가운데, **staging 코드가 아직 참조하지만 지금 동작에는 쓰이지 않는 것**의 참조 코드를 먼저 걷어내고, 그 뒤 정리 SQL(`post_release`, 롤백 실측, 실행은 출시 뒤 사용자 승인)을 쓴다. 2026-10-22 시작 전 조사로 범위가 바뀌었다: `users.initial_sync_done`은 **살아 있는 첫 동기화 게이트라 정리 대상에서 뺐고**(사용자 결정 1), 옛 드랍 엔진·구 `drop_policy`·`user_family_progress`·`all_random`·`user_drop_state`의 옛 열이 정리 대상이다.
- 구현은 두 회차로 나눈다. **1회(코드·시험·문서)**: ① `user_family_progress` 쓰기 지우기, ② `all_random` 참조 지우기, ③ 옛 드랍 엔진 삭제와 어드민 «드랍 정책» 화면·시뮬레이터 «아이템 드랍» 구역 삭제(사용자 결정 2). **2회(SQL 파일 4개, 실행 안 함)**: `drop_policy` 표, `user_drop_state` 옛 열 7개(외래키 2개 포함), `user_family_progress` 표, `ambient_drop_config.all_random` 열 삭제.
- 관련 파일: 아래 「시작 전 조사 결과」와 「구현 계획」, 선례 `jam-web/supabase/migrations/266_post_release_*.sql`~`269_*`.

## 배경 / 문제 정의

6-4 4회는 사용자 결정 6에 따라 코드 선행이 필요한 객체를 이 티켓으로 넘겼다. 처음 범위(5개 객체와 `cappedRarity`)를 코드로 따라가 보니 후보마다 성격이 달랐다. 표나 열을 지우려면 참조 코드를 먼저 걷어내야 하고, 코드를 정리하기 전에 SQL만 써 두면 실행할 수 없는 파일이 오래 남아 스키마가 바뀌면 다시 써야 한다. 그래서 코드 정리 뒤에 SQL을 쓴다.

발견: 2026-10-22 티켓 `20261021_1250` 6-4 4회 시작 전 조사, 이 티켓의 시작 전 조사.

## 시작 전 조사 결과 (카리나, 2026-10-22, 코드 읽기와 공용 DB 읽기 전용 확인. 아무것도 바꾸지 않았다. 줄 위치는 시작 때 아현이 다시 확인한다)

| 후보 | 결과 | 분류 |
|---|---|---|
| `users.initial_sync_done`(NOT NULL, 기본 false, 7명 true·1명 false) | **살아 있다.** `lib/strava/sync.ts` 1491~1497줄 `isFirstSync = firstSyncPending \|\| !initial_sync_done`(첫 동기화는 인정 활동 최근 1건만 정산), `lib/badge-engine/index.ts` 994줄 첫 싱크 게이트(활동 배지 Common·Lv.1만 발급, 1377줄)와 1571~1573줄 플래그 세팅·«첫 배지»(평생 1회) 결산, `lib/admin/user-actions.ts` 어드민 «유저 초기화»가 false로 되돌림. 새 연결 단위 표시 `first_sync_pending`(마이그레이션 225)은 옆에 더해진 것이고 실제 동기화는 엔진에 `forceFirstSyncGate`를 넘기지 않아 두 값이 서로 다른 일을 한다. 지우려면 게이트의 뜻을 바꾸는 설계가 필요하다 | **유지**(결정 1, 정리 대상에서 뺌) |
| 구 `drop_policy` 표(1행, 24열, 들어오는 외래키 0) | 실제 동기화는 쓰지 않는다(JAM 2.0 발급은 `lib/drop-engine/syncIssue*.ts`가 `jam_policy`로 한다). 읽고 쓰는 곳은 옛 드랍 엔진 `lib/drop-engine/policy.ts`(41·70줄)뿐이고 그 호출처는 ① `tryItemDrop`(`api/admin/test/simulate/route.ts` 하나뿐이고 이 경로를 가리키는 화면 링크가 없다), ② `previewItemDrop`(어드민 시뮬레이터 «아이템 드랍» 구역, 옛 엔진을 따라간다), ③ 어드민 «드랍 정책» 화면(`app/admin/drop-policy/page.tsx`·`DropPolicyForm.tsx`·`api/admin/drop-policy/route.ts`, 메뉴 `adminNavItems.ts` 78줄)이다. 이 화면은 실제 동작에 영향이 없는 값을 고친다 | 정리 대상(1회 코드, 2회 SQL) |
| 옛 드랍 엔진 코드 | `lib/drop-engine/index.ts`(737줄)의 `tryItemDrop`, `getDropState`, `fetchDropStructure`, `selectBadge`, `updateLastPiecePity`, `getActivityDropWeight`, `isDroppableForActivity` 등은 옛 엔진과 `preview.ts`만 쓴다. **바깥에서 쓰는 것은 `buildBadgeIdsOfBook` 하나**(`lib/itembook/completion-basis.ts` 22줄)다. `preview.ts`, `policy.ts`, `layers.ts`(정책 타입만 가져온다), `context.ts`, `constants.ts`(`context.ts`만 쓴다)도 옛 엔진 전용이다. **남기는 것**: `syncIssue.ts`, `syncIssueRun.ts`, `issueFollowUp.ts`, `lockAssignment.ts`(새 발급 경로), `cumulativeConditionFields.ts`(어드민 배지 폼과 `lib/admin/badge-validation.ts`가 쓴다) | 정리 대상(1회 코드) |
| `user_family_progress` 표(600행, 8열, 들어오는 외래키 0) | `lib/strava/sync.ts` 444~700줄 `updateFamilyProgressSnapshots`(1239줄에서 부른다)가 쓰기만 한다. **읽는 곳이 없다**(배지 트리 3차의 «후속 3b 화면»은 만들어지지 않았고 트리는 제거됨). 이 표를 가리키는 DB 함수·뷰도 없다 | 정리 대상(1회 코드, 2회 SQL) |
| `ambient_drop_config.all_random`(NOT NULL, 기본 false, 값 true) | 코드가 이미 보지 않는다(`lib/ambient-drop/index.ts` 64줄 주석). 남은 참조는 `lib/ambient-drop/config.ts` 16줄(기본값)과 `api/admin/ambient-drop/config/route.ts` 119줄(`current.all_random`을 그대로 넘김) | 정리 대상(1회 코드, 2회 SQL) |
| `cappedRarity` 필드 | 옛 미리 보기 `preview.ts`와 `api/admin/simulate/route.ts` 109·112·144줄, `admin/simulator/page.tsx` 26줄. 옛 드랍 엔진 미리 보기를 지우면 함께 사라진다 | 정리 대상(1회 코드) |
| **(새로 찾음)** `user_drop_state`(4행)의 옛 열 7개 | 새 코드가 쓰는 열은 `user_id`·`common_streak`(`syncIssueRun.ts` 193·212줄)·`capsule_epic_miss`(캡슐)·`updated_at`뿐이다. 나머지 `last_drop_tribe_id`, `last_drop_book_id`, `last_piece_pity`, `daily_drop_count`, `daily_drop_date`, `total_drops`, `last_activity_at`은 옛 엔진 전용이다. **`last_drop_tribe_id`·`last_drop_book_id`의 외래키(`tribes`·`item_books`, 삭제 시 NO ACTION)가 트라이브·컬렉션 삭제를 막는다**는 어드민 주석이 있다(`api/admin/tribes/[id]/route.ts` 90줄, `api/admin/itembooks/[id]/route.ts` 119줄) | 정리 대상(2회 SQL, 열 삭제라 데이터를 잃는다) |

- **어드민에 새 정책 편집 화면은 없다**: `jam_policy`·`capsule_policy`를 고치는 어드민 화면이 아직 없다(코드에서 편집 경로 없음). 옛 «드랍 정책» 화면을 지워도 운영자가 고칠 수 있는 실제 값을 잃지는 않는다(그 화면은 동작에 영향이 없다). 새 정책 편집 화면은 이 티켓 범위 밖이다(묶음 7 «운영 설정과 컨텐츠 입력»).
- **출시와의 관계**: `main`(옛 프로덕션)은 아직 이 표와 열을 읽고 쓴다. 그래서 **SQL은 출시(main 승격) 뒤에만 실행**한다. 이 티켓의 코드 정리는 staging에서 지금 해도 `main`에는 영향이 없다.

## 사용자 결정과 적용 기록 (2026-10-22)

1. **`users.initial_sync_done`**: **유지하고 정리 목록에서 뺀다**(추천). 지금도 첫 동기화 규칙과 배지 엔진 게이트를 돌리는 살아 있는 열이고, `first_sync_pending`과 함께 두고 쓴다. `first_sync_pending`으로 합치는 안은 배지 엔진 게이트·«첫 배지» 결산·어드민 초기화·시뮬레이터·재평가를 모두 바꾸고 기존 유저 데이터를 옮겨야 해서 출시 전에는 추천하지 않았다. 필요해지면 별도 설계 티켓으로 다룬다.
2. **어드민 화면**: **«드랍 정책» 화면과 메뉴, 시뮬레이터의 «아이템 드랍» 구역을 지운다**(추천). «드랍 제외 관리»(`/admin/drop-policy/exclusions`)는 새 체계도 쓰는 `drop_excluded`를 다루므로 그대로 둔다. 새 발급 경로용 미리 보기와 `jam_policy`·`capsule_policy` 편집 화면은 필요하면 별도 티켓으로 만든다.

**묻지 않고 추천대로 정한 것(다르게 하라고 하지 않으면 이대로)**: (가) 1회와 2회로 나눈다. SQL은 1회 코드가 머지된 뒤 현재 스키마로 쓴다. (나) `buildBadgeIdsOfBook`은 지우지 않고 `lib/itembook/` 쪽 새 파일(또는 `completion-basis.ts` 안)로 옮겨 `completion-basis.ts`의 import를 고친다. (다) `api/admin/test/simulate/route.ts`는 화면 링크가 없는 옛 시험 라우트라 지운다. (라) DB 열·표는 1회에서 지우지 않는다(코드가 참조하지 않게만 한다).

## 구현 계획 (파일 단위, 카리나, 2026-10-22, 줄 위치는 시작 때 아현이 다시 확인한다)

### 1회 (코드·시험·문서, DB 변경 없음)

1. **`user_family_progress` 쓰기 지우기**: `jam-web/src/lib/strava/sync.ts`의 `updateFamilyProgressSnapshots`(444~700줄 근처)와 호출(1239줄 근처), 그 함수만 쓰는 도우미·타입(`FamilyProgressBadgeRow` 등)과 import를 지운다. `computeUserPeriodMetrics`·`computeBadgeProgress`가 다른 곳에서도 쓰이는지 `grep`으로 확인하고, 이 훅만 쓰던 것은 함께 지운다. `sync-*.test.ts`에서 `user_family_progress`를 모킹하던 줄을 정리하고 «이 표를 쓰지 않는다»를 고정한다.
2. **`all_random` 참조 지우기**: `lib/ambient-drop/config.ts`(타입, 기본값 16줄, 정규화), `api/admin/ambient-drop/config/route.ts` 119줄, `lib/ambient-drop/index.ts` 64줄 주석, 어드민 앰비언트 드랍 폼에 보이는 곳이 있으면 함께, 시험. **DB 열 값은 그대로 둔다**(옛 프로덕션이 읽는다).
3. **옛 드랍 엔진 삭제**: ① `lib/drop-engine/index.ts`에서 `buildBadgeIdsOfBook`만 새 위치로 옮기고 나머지를 지운 뒤 파일이 비면 삭제. ② 삭제: `lib/drop-engine/preview.ts`, `policy.ts`, `layers.ts`, `context.ts`, `constants.ts`와 각 시험. ③ 남김: `syncIssue.ts`, `syncIssueRun.ts`, `issueFollowUp.ts`, `lockAssignment.ts`, `cumulativeConditionFields.ts`. ④ 삭제: `app/api/admin/test/simulate/route.ts`(+시험), `app/admin/drop-policy/page.tsx`·`DropPolicyForm.tsx`, `app/api/admin/drop-policy/route.ts`(+시험), `components/admin/adminNavItems.ts` 78줄의 «드랍 정책» 항목(79줄 «드랍 제외 관리»는 남긴다. 라우트가 `/admin/drop-policy/exclusions`로 같은 폴더 아래이므로 폴더 정리 때 이 하위 라우트가 남도록 한다). ⑤ `app/admin/simulator/page.tsx`의 «아이템 드랍» 구역과 `shadow_ban`·`skipped` 사유 라벨, `cappedRarity`, `app/api/admin/simulate/route.ts`의 `previewItemDrop` 사용 구간과 응답 필드를 지운다. 시뮬레이터에 남는 구역(활동 배지 판정 등)이 그대로 동작하는지 확인하고 결과에 남는 구역을 적는다. ⑥ `lib/combine/policy.ts` 46줄 주석 등 지운 파일을 가리키는 주석을 고친다. 지울 때마다 `grep`으로 남은 참조를 확인한다(`origin/main`은 옛 코드라 지우지 않는다). 새 발급 경로(`syncIssue*`)와 `common_streak`·`capsule_epic_miss`를 쓰는 코드는 바꾸지 않는다.
4. **문서**: 옛 드랍 엔진·드랍 정책 화면·`drop_policy`·`user_family_progress`·`all_random`·`user_drop_state` 옛 열을 현재 서술로 적은 곳(`docs/service/SERVICE_OPERATIONS.md`, `docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md`, `docs/service/prd/02_DATA_MODEL.md`, `docs/service/prd/admin-ui/ADMIN_PRD.md`, `docs/service/prd/01_PRD.md`·`04_PROJECT_SPEC.md`, `docs/plan/jam2/service-redesign/현재 서비스 비교.md` 등, `grep`으로 찾는다)을 «옛 방식이 지워졌다, 표와 열은 코드가 쓰지 않음, 열 정리 대기(0938 2회)»로 고친다. `current-service-map/`, `docs/archive/`, 옛 티켓은 고치지 않는다. 티켓 기록과 `docs/plan/` 진행 노트는 카리나 몫이다.
5. **하지 않는 것**: `users.initial_sync_done`·`first_sync_pending` 변경, 옛 컬렉션 구조(티켓 `20261022_0939`), 새 정책 편집 화면, 새 발급 경로용 미리 보기, DB 변경.

### 2회 (SQL 파일 4개 + 삭제 가드 코드 정리, 실행 안 함, 1회 머지 뒤 현재 스키마로 쓴다)

**시작 전 조사(카리나, 2026-10-22, 읽기 전용 DB 조회와 코드 `grep`)**: 공용 DB의 현재 정의는 `live-defs-0938-2.md`(작업 메모, 저장소 밖)에 정리했다. 네 객체 모두 들어오는 외래키·뷰·트리거·본문 언급 함수가 0개이고, `user_drop_state` 4행의 옛 열 값은 모두 실제 트라이브·컬렉션 id를 가리킨다. 1회 기록이 «같은 배포에서 걷는다»고 넘긴 어드민 가드는 세 곳이 아니라 **네 곳**이다: 삭제 가드(`reference-guards.ts`), 목록의 삭제 불가 사유(`tribe-list.ts`), 운영툴 컬렉션 되돌림 확인(`registerChecks/references.ts`), 그리고 이 표를 쓰는 시험들이다.

**가정(다르게 하라고 하지 않으면 이대로)**: (가) 가드 코드 정리를 2회에 넣는다. SQL을 출시 뒤에 실행하면 가드가 지운 열을 조회해 어드민 삭제 화면이 오류를 내므로, 가드 코드는 SQL과 **같은 출시**에 실려야 한다. 이 변경으로 컬렉션·트라이브 삭제가 `user_drop_state`로 막히지 않게 된다(지금은 거의 모든 컬렉션이 이 참조 때문에 사실상 지워지지 않는다. 다른 참조 가드는 그대로다). 출시와 SQL 실행 사이 몇 분 동안 이 4행이 가리키는 트라이브·컬렉션(트라이브 2개, 컬렉션 4개)을 지우려 하면 DB가 외래키 오류로 막는다(어드민 삭제 라우트는 500으로 답한다). (나) 번호는 271~274. 시작 시점 가장 높은 번호는 270(6-3)이다. (다) 생성 타입(`database.generated.ts`·`database.ts`)과 시드 파일은 고치지 않는다. 생성 타입은 SQL을 적용한 뒤에 고치고, 지울 위치는 SQL 머리말에 적는다. (라) `registerChecks.test.ts`의 «외래 키 8곳(생성 타입 대조)» 시험은 SQL 적용 전까지 생성 타입에 남는 외래키 1개를 이름으로 제외해 7곳으로 맞추고, 적용 뒤 생성 타입을 고칠 때 제외 줄을 지운다. (마) `user_drop_state`의 되돌림 UPDATE 값은 2026-10-22 스냅샷이고 출시 전까지 옛 프로덕션이 값을 바꾸므로, 실행 직전에 다시 읽어 고친다고 머리말에 적는다(269와 같은 방식).

**SQL 파일(번호순 실행, 서로 의존하지 않는다)**: `jam-web/supabase/migrations/`에 `post_release` 4개를 쓴다. 모든 파일에 6-4 4회 선례(266~269, 특히 269)의 머리말·선행 조건·적용 전후 확인 SELECT·`-- 되돌림 SQL` 규칙을 따르고 선행 조건에 «출시(main 승격)로 옛 프로덕션 코드가 사라진 뒤, 코드 참조 0건 `grep` 재확인»을 넣는다.
- `271_post_release_drop_drop_policy.sql`: `DROP TABLE IF EXISTS public.drop_policy`(1행 24열, 정책 0개, 코멘트 없음). 되돌림은 표·열·기본값·제약·RLS와 1행(`updated_at` 명시)을 다시 만든다.
- `272_post_release_drop_user_drop_state_old_columns.sql`: `user_drop_state`의 옛 열 7개(`last_drop_tribe_id`·`last_drop_book_id`·`last_piece_pity`·`daily_drop_count`·`daily_drop_date`·`total_drops`·`last_activity_at`)를 `DROP COLUMN IF EXISTS`로 지운다(외래키 2개는 열과 함께 사라진다). 데이터를 잃으므로 4행의 지금 값 표를 머리말에 싣고 되돌림이 이 값으로 복원한다. 외래키가 `tribes`·`item_books`에 걸려 있어 잠금이 그 두 표에도 닿는다고 적는다(`lock_timeout` 안내).
- `273_post_release_drop_user_family_progress.sql`: `DROP TABLE IF EXISTS public.user_family_progress`(600행, 파생 스냅샷). 되돌림은 구조만 복원하고(코멘트 7개 포함: 표 1 + 열 6, 외래키 2개, 기본키, RLS) 데이터는 복원하지 않는다고 머리말에 적는다.
- `274_post_release_drop_ambient_drop_config_all_random.sql`: `ambient_drop_config.all_random`을 `DROP COLUMN IF EXISTS`로 지운다. 되돌림은 `boolean NOT NULL DEFAULT false`로 다시 만들고 행 id=1을 `true`로 복원한다.
- 각 파일 머리말에 «적용 뒤 생성 타입에서 지울 위치»를 줄 번호와 함께 적고, 코드 참조 `grep` 명령과 «0줄이어야 한다»를 적는다.

**가드 코드 정리**: 줄 위치는 시작 때 아현이 다시 확인한다.
- `jam-web/src/lib/admin/reference-guards.ts`: 머리 주석 두 문장(21~27줄 근처), `ITEM_BOOK_REFERENCE_SOURCES`·`TRIBE_REFERENCE_SOURCES`의 `user_drop_state` 항목 둘(310~315, 394~399줄 근처)과 `collectItemBookReferences`·`collectTribeReferences`의 조회·집계(364~368, 471~480줄 근처)를 지운다.
- `jam-web/src/lib/admin/tribe-list.ts`: `headCount` 도우미, `Promise.all`의 `dropStateCounts`, `dropStateById`, `blockingCounts`의 `user_drop_state` 키, 주석 두 곳(54줄, 91줄 예시 문구)을 고친다.
- `jam-web/src/lib/admin/registerChecks/references.ts`: `ITEM_BOOK_UNDO_REFERENCE_TABLES`의 `user_drop_state` 항목(141줄)과 머리 주석(127줄)을 고친다.
- `jam-web/src/app/api/admin/tribes/[id]/route.ts` 90~92줄, `jam-web/src/app/api/admin/itembooks/[id]/route.ts` 119~121줄의 DELETE 설명 주석에서 `user_drop_state` 문장을 뺀다.
- 시험: `jam-web/src/lib/admin/__tests__/tribe-reference-guards.test.ts`, `jam-web/src/lib/admin/registerChecks/__tests__/registerChecks.test.ts`(590~610줄 근처, 가정 라), `jam-web/src/lib/admin/opsInbox/execute/__tests__/collectionLaunch.test.ts`(338·403줄 근처, 읽기 실패 시험은 다른 참조 표로 바꿔 의도를 유지), 그 밖에 두 옛 열을 가짜 행에 쓰는 시험. 같은 변경을 건드릴 수 있는 묶음 7 세션의 파일이므로 필요한 줄만 고친다.
- 문서: `docs/service/prd/02_DATA_MODEL.md`(45·46·645·646줄 근처), `docs/service/SERVICE_OPERATIONS.md`(435줄 근처), `docs/service/badge-engine/BADGE_ENGINE_UNIFIED.md`(1092·1711·1985·2215·2546줄 근처), `docs/plan/jam2/service-redesign/현재 서비스 비교.md`(279~282줄), `docs/service/prd/admin-ui/ADMIN_PRD.md`(삭제 가드의 참조 목록 서술이 있으면)의 «정리 대기(0938 2회)»를 «정리 SQL 271~274 작성됨, 출시 뒤 실행 대기»로 고치고, 어드민 삭제 가드의 참조 목록에서 `user_drop_state`를 뺀다.

6. 위 SQL 4개와 가드 코드 정리를 쓴다(DB 실행 없음). 아현이 쓰고 민지가 판정한다.
7. 카리나가 롤백 실측(객체마다 한 트랜잭션, `lock_timeout 3s`, 적용·멱등 재적용·되돌림·재확인 뒤 예외로 취소)을 하고 결과를 이 티켓에 적는다. **적용은 출시 뒤 사용자 승인**이다. 적용 뒤 생성 타입에서 지운 표·열을 지우고 `registerChecks.test.ts`의 제외 줄을 뺀다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 옛 드랍 엔진, `drop_policy`, `user_family_progress`, `all_random`을 참조하는 앱 코드가 없다(시험과 `grep`). 새 발급 경로와 컬렉션 완성 판정, 어드민 «드랍 제외 관리»는 그대로 동작한다.
- 출시(main 승격) 전에는 DB 표·열을 지우지 않는다.

### UI/UX 관점

- 어드민 메뉴에서 «드랍 정책»이 사라지고 «드랍 제외 관리»는 남는다. 시뮬레이터에서 «아이템 드랍» 구역이 사라지고 나머지는 그대로다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- [x] (1회) 위 참조 코드가 없고, `buildBadgeIdsOfBook`을 쓰는 컬렉션 완성 판정과 새 발급 경로 시험이 통과한다
- [x] (1회) 어드민 «드랍 제외 관리»와 시뮬레이터의 남은 구역이 로컬 실렌더로 열린다
- [x] (2회) 정리 SQL 4개(271~274)가 파일로 있고 되돌림 SQL과 롤백 실측 결과가 이 티켓에 있다. 실행하지 않았다
- [x] (2회) 앱 코드(삭제 가드·목록·운영툴 되돌림 확인)가 `user_drop_state.last_drop_tribe_id`·`last_drop_book_id`를 조회하지 않고, 관련 시험과 전체 시험·타입 검사가 통과한다. 생성 타입은 고치지 않았다(적용 뒤 정리)

### 후속 범위 (담당: 카리나, 시점: 출시 뒤)

- [ ] 출시 뒤 사용자 승인으로 SQL을 실행하고 생성 타입을 정리한다(`/jam-ship` 10단계 «출시 뒤 실행 대기 목록»에 올라 있어야 한다)

## 진행 기록

### 1회 코드 정리 (2026-10-22, 완료·staging 머지)

- **구현**: 아현이 브랜치 `claude/jamwork-20261022_0938-code-cleanup`(커밋 `1cc18961c`)에 구현했다. 81개 파일(+619/−3,530), 삭제 14개·신규 5개, DB·마이그레이션 변경 없음. 검증 CI 성공. `scripts/verify.sh` 전 항목 통과.
- **게이트(민지)**: WARN(FAIL 아님). 사유 네 가지와 처리: ① 격리 워크트리에서 개발 서버가 뜨지 않아 실렌더 미확인 → 머지 뒤 카리나가 로컬에서 직접 열어 확인했다(아래). ② `computeBadgeProgress`(앱 호출처 0건)가 시험 때문에 남음 → 사용자가 후속 티켓으로 넘기기로 했다(티켓 `20261022_1217`). ③ `sync.ts` 주석 세 곳이 지운 «계열 진행» 정산 단계를 적고 있음 → 머지 점검 커밋 `09f09fa4e`에서 고쳤다(동작 변경 없음). ④ 지시와 달리 `current-service-map/03`과 `docs/plan/` 노트 5곳의 경로 표기를 건드림 → 삭제된 파일 경로를 가리키면 커밋 검사가 막아서 «삭제 표시»만 더한 것이라(내용 불변) 승인했다.
- **시험 머지(카리나, 임시 워크트리)**: 최신 staging(묶음 7 티켓 추가 포함) 위에서 충돌 없음. 타입 검사와 전체 시험(753개 파일, 16,243건) 통과.
- **사용자 승인(2026-10-22)**: «머지 승인, 주석은 머지 때 고치고 computeBadgeProgress는 후속 티켓으로». 머지 커밋 `722efd984`와 주석 보정 `09f09fa4e`.
- **지운 것**: 옛 드랍 엔진(`lib/drop-engine`의 `index`·`preview`·`policy`·`layers`·`context`·`constants`와 각 시험, `buildBadgeIdsOfBook`은 `lib/itembook/completion-basis.ts`로 이동), 어드민 «드랍 정책» 화면·API·메뉴 항목, 시험용 `api/admin/test/simulate` 라우트, 시뮬레이터의 «아이템 드랍» 구역과 응답 필드(`cappedRarity` 포함), `sync.ts`의 `updateFamilyProgressSnapshots`와 호출·전용 도우미, `ambient_drop_config.all_random`의 설정 타입·기본값·저장 값 참조, `scripts/admin-api-read.mjs`의 drop-policy 조회.
- **남긴 것**: 새 발급 경로(`syncIssue*`·`issueFollowUp`·`lockAssignment`), 컬렉션 완성 판정, «드랍 제외 관리»(`/admin/drop-policy/exclusions`), `cumulativeConditionFields`, `users.initial_sync_done`, `computeBadgeProgress`. DB의 표와 열은 하나도 지우지 않았다(옛 프로덕션이 읽는다).
- **문서**: 약 25개를 «옛 방식 삭제, 표와 열은 코드가 쓰지 않음, 정리 대기(0938 2회)»로 맞췄다(`SERVICE_OPERATIONS`, `BADGE_ENGINE_UNIFIED`, `02_DATA_MODEL`, `ADMIN_PRD`, `01_PRD`, `04_PROJECT_SPEC`, `TRIBES`, `현재 서비스 비교`, `docs/plan/jam2` 노트 등).
- **로컬 실렌더 확인(카리나, 개발 서버 `jam-web-admin`, 읽기 전용 요청만)**: `/admin/drop-policy`·`/api/admin/drop-policy`·`/api/admin/test/simulate`는 404(의도한 삭제). `/admin/drop-policy/exclusions`는 200이고 사이드바에 «드랍 제외 관리»만 있으며 «드랍 정책 파라미터로 돌아가기» 링크가 없다. `/admin/simulator`는 열리고 «아이템 드랍»·«드랍 없음»·«섀도우밴» 문구가 없으며 확장 필드, 첫 싱크 모드, 미리보기(Dry Run)·실제 적용(Apply)이 남아 있다. `/admin/ambient-drop`은 200이고 `GET /api/admin/ambient-drop/config` 응답에 `all_random`이 없다. 콘솔의 404 세 건은 위에서 직접 호출한 삭제 경로 세 건이다(화면이 부른 요청 아님, 리소스 성능 항목에도 4xx 없음).
- **시뮬레이터 «실제 적용(Apply)» 동작 변화 점검**: 삭제 전에는 적용 모드(`dryRun=false`)가 활동 배지·장소 배지를 저장하는 데 더해 고른 아이템 배지를 인벤토리에도 넣었다. 지금은 활동 배지·장소(체크인) 배지만 저장하고 아이템 배지는 지급하지 않는다(결정 2로 의도한 변화). 화면의 버튼과 결과 문구(«실제 적용(Apply)», «실제 적용됨», «Dry Run — DB 반영 없음»)는 아이템 지급을 약속하지 않으므로 고치지 않았다. 운영자가 시뮬레이터로 아이템을 넣어 시험하던 습관이 있었다면 더 이상 되지 않는다는 점만 알아 두면 된다.

- **배포(staging)**: 2026-10-22 12:23 KST, 프로젝트 `jam-stage` 배포 `dpl_DHPogW6HpHa9eFYGRnmx4soDyha6`가 READY이고 별칭 `stage.j-a-m.app`에 붙었다. 대상 커밋은 코드 변경을 모두 담은 `078f199f8`(기록 커밋, 코드 머지 `722efd984`·`09f09fa4e` 포함)이다. `/probability`는 200이다. 삭제한 어드민 경로는 로그인 뒤에만 열려서 외부에서는 응답으로 구분하지 못했고(로그인 안내로 이동), 404 확인은 위 로컬 실렌더로 했다. main에는 올리지 않았다.

### 1회가 남긴 것 (2회와 후속 티켓에 넘김)

- **2회에서 같은 배포에 걷을 것**: `user_drop_state.last_drop_tribe_id`·`last_drop_book_id`를 조회하는 어드민 삭제 가드(`lib/admin/reference-guards.ts` 364·472줄, `lib/admin/tribe-list.ts` 55줄, `registerChecks/references.ts` 141줄 근처, 줄 위치는 2회 때 다시 확인)와 그 시험. 열을 지운 뒤에도 이 조회가 남으면 트라이브·컬렉션 삭제 화면이 오류를 낸다.
- **후속 티켓 새로 만듦**: `20261022_1216`(트라이브 «드랍 가중치»와 «인접 트라이브»가 드랍에 쓰이지 않는데 화면은 영향이 있다고 안내), `20261022_1217`(`computeBadgeProgress` 정리).
- **OPEN 티켓 5건 판독(닫기는 사용자 승인 뒤)**: `20261001_2048`(`tryItemDrop`·`planItemDrops` 복제)과 `20261001_2049`(시뮬레이터 섀도우밴 상한표 8회 조회)는 두 함수가 지워져 문제가 사라졌다. `20261008_1106`(시뮬레이션이 다른 방식으로 아이템 배지를 지급)은 시뮬레이터에 아이템 지급 코드가 없어졌고 `SERVICE_OPERATIONS` 7-1 만료값 표에 시뮬레이션 행이 없다. `20261001_2050`(`SERVICE_OPERATIONS` §5-2가 v1 흐름)은 5-2가 JAM 2.0 발급 흐름으로 다시 적혀 v1 상수가 남아 있지 않다. 네 건은 해소로 닫을 수 있다. `20261017_1821`(시뮬레이터·미리 보기를 새 발급 규칙에 맞춘다)은 사용자 결정 2(옛 «아이템 드랍» 구역 삭제, 새 발급 경로용 미리 보기는 필요하면 별도 티켓)로 «맞춘다» 대신 «지웠다»가 되었으므로 대체로 닫는 것을 추천한다.
- **범위 밖 참고**: `/admin/ambient-drop`을 열면 콘솔에 «Each child in a list should have a unique key» 경고가 한 건 난다(`AmbientDropForm`). 이 폼은 이번 변경에서 건드리지 않았고(마지막 수정은 `43ac5d1db`) 목록 키가 겹치는 데이터가 있어서 나는 것으로 보인다. 동작 오류는 아니며 고칠지는 정하지 않았다.

### 2회 SQL 4개와 삭제 가드 코드 정리 (2026-10-22, 완료·staging 머지, 공용 DB 실행 없음)

- **구현**: 아현이 브랜치 `claude/jamwork-20261022_0938-sql-cleanup`(커밋 3개, 마지막 `76fd51c67`)에 구현했다. 19개 파일(+596/−89). 검증 CI 성공, `scripts/verify.sh` 전 항목 통과. 입력으로 카리나가 공용 DB를 읽기 전용으로 조회한 정의 파일을 넘겼고, 273의 코멘트 문자열은 아현이 md5·글자 수로 직접 대조했다.
- **정리 SQL(출시 뒤 실행, `jam-web/supabase/migrations/`)**: `271_post_release_drop_drop_policy.sql`(구 `drop_policy` 표), `272_post_release_drop_user_drop_state_old_columns.sql`(`user_drop_state` 옛 열 7개와 외래키 2개), `273_post_release_drop_user_family_progress.sql`(표, 600행 파생 스냅샷), `274_post_release_drop_ambient_drop_config_all_random.sql`(열). 각 파일에 선행 조건, 코드 참조 `grep`, 적용 전후 확인 SELECT, 잠금 안내, 적용 뒤 생성 타입에서 지울 줄 번호, `-- 되돌림 SQL`이 있다.
- **가드 코드 정리**: `lib/admin/reference-guards.ts`(두 참조 목록 항목과 두 수집 조회), `lib/admin/tribe-list.ts`(건수 조회와 삭제 불가 사유 키), `lib/admin/registerChecks/references.ts`(운영툴 컬렉션 되돌림 확인 목록, 외래키 8곳을 7곳으로), 두 DELETE 라우트와 `collectionLaunch.ts`의 설명 주석. 시험은 `tribe-reference-guards`·`registerChecks`·`collectionLaunch`·`fakeDb`를 고쳤고 «user_drop_state가 참조 목록·수집·목록 건수에 없다»를 고정하는 시험 4건을 더했다. 가드 3개 파일을 원래대로 되돌리면 새 시험이 실패한다는 것을 아현이 확인했다. 이 변경으로 컬렉션·트라이브 삭제가 `user_drop_state`로는 막히지 않는다(다른 참조 가드는 그대로).
- **게이트(민지)**: WARN. 사유는 «롤백 실측 결과가 티켓에 있다»가 카리나 몫이라 게이트 시점에 미충족이었다는 것뿐이고 아래 실측으로 채웠다. 정정 한 건: 이 티켓 계획문의 «코멘트 8개»는 «7개(표 1 + 열 6)»가 맞아 머지 때 고쳤다.
- **롤백 실측(카리나, 공용 DB, 읽기·쓰기를 한 트랜잭션에 담고 마지막에 예외로 전부 취소, `lock_timeout 3s`)**: 파일에서 적용문과 되돌림문을 `-- `만 떼어 그대로 뽑아 실행했다(붙여 넣은 문자열이 파일과 같은지 md5로 먼저 확인). 각 건은 적용 → 적용 결과 확인 → 다시 적용(건너뛰는지) → 되돌림 → 처음과 되돌린 뒤의 «지문» 비교를 거쳤다. 지문은 열(이름·타입·NOT NULL·기본값), 제약(이름·정의), 인덱스, RLS·권한·소유자, 정책, 코멘트 md5, 값을 포함한다.
  - 271 통과(지문 `ff7a2153…`). `drop_policy` 24열·제약 2개·권한과 1행(`updated_at` 포함)이 같다.
  - 272 통과(지문 `85df52ab…`). 4행의 옛 열 값과 `last_activity_at`(마이크로초 포함 글자)이 같고, 되돌린 외래키 2개가 검증됨 상태다. 적용 뒤 남는 열 4개·제약 3개를 확인했다.
  - 273 통과(지문 `5251e03d…`). 구조·제약·권한과 코멘트 7개의 md5가 같고, 되돌림 직후 행은 0이다(데이터는 복원하지 않는 설계).
  - 274 통과(지문 `e830e56f…`). 열(`boolean NOT NULL DEFAULT false`)과 행(`all_random = true`)이 같고 표 코멘트가 남는다.
  - 실측 뒤 공용 DB를 다시 읽어 원래대로임을 확인했다(`drop_policy` 1행, `user_family_progress` 600행·코멘트 7개, `user_drop_state` 11열·제약 5개·4행, `all_random = true`).
- **시험 머지(카리나, 임시 워크트리)**: 최신 staging 위에서 충돌 없음. 타입 검사 통과, 전체 시험 757개 파일 16,301건 통과.
- **사용자 승인(2026-10-22)**: «머지 승인, 코멘트 개수 오기(8개를 7개로)와 트라이브 개편 검토 노트 한 줄은 머지 때 같이 고치고, 기록·push까지 진행해.» 머지 커밋 `75cecdc60`(로컬 staging, 묶음 7 세션이 로컬에 쌓아 둔 커밋 위). 머지 때 고친 것: 이 티켓의 «코멘트 8개», `docs/plan/jam2/tribe-rethink/적용 전 검토 노트.md`의 `user_drop_state` 옛 트라이브 값 정리 항목(272가 열째로 지우므로 이관 마이그레이션에 넣지 않는다는 정정 한 줄).
- **로컬 확인(카리나, 머지 뒤 push 전, 개발 서버 `jam-web-admin`, 읽기 전용)**: `/admin/tribes`가 열리고 «삭제 불가 사유»가 드랍 인접 관계와 «이 트라이브를 고른 유저»만 보여 준다(유저 드랍 상태 문구 없음). `/admin/itembooks`가 열리고(총 100개, 한 쪽 50행) 해당 문구가 없다. 콘솔 오류는 개발 서버의 HMR 웹소켓 연결 실패뿐이다. 머지된 로컬 트리에서 `npm run typecheck`(자동 생성 폴더를 지우고 실행) 통과, `src/lib/admin`·`src/app/api/admin`·`src/lib/drop-engine`·`src/lib/capsule` 시험 253개 파일 6,482건 통과. 삭제 라우트는 파괴적이라 호출하지 않고 시험으로 갈음했다.
- **실행 지표**: 에이전트 2명(아현·민지), 전체 토큰 410,771(출력 토큰은 아현 96,776 / 게이트 36,130), 소요 약 27분(1,626,525ms), 도구 호출 177회, 재작업 없음.

### 2회가 남긴 것 (출시 뒤 실행 절차와 후속)

- **출시 뒤 실행 대기 SQL 8개(사용자 승인 후 카리나가 실행)**: 6-4의 `266`·`267`·`268`·`269`와 이 티켓의 `271`~`274`. 이 머지의 가드 코드가 출시에 실려 있어야 하고, 272는 출시 직후 바로 실행해 가드와 DB 외래키 사이의 틈을 줄인다(코드만 먼저 나가면 옛 값이 가리키는 트라이브 2개·컬렉션 4개를 지우려 할 때 DB가 막고 어드민은 오류를 낸다).
- **272 실행 직전**: 옛 프로덕션이 출시 때까지 이 열들을 갱신하므로, 파일 머리말의 «적용 전 확인» 첫 쿼리를 다시 돌려 값이 표와 같은지 보고, 다르면 되돌림 UPDATE의 값을 그 결과로 고친 뒤 실행한다.
- **적용 뒤 생성 타입 정리**: SQL 머리말에 줄 번호가 있다. 함께 고칠 것: `jam-web/src/types/database.ts`의 `UserDropStateRow` 위 설명 주석(1061~1068줄)과 `AmbientDropConfigRow` 위 설명 주석(1091~1092줄), `registerChecks.test.ts`의 `NOT_YET_DROPPED_FK` 제외 줄과 filter(생성 타입에서 외래키가 사라지면 제외할 것이 없다).
- **고치지 않은 것(의도)**: `docs/plan/jam2/service-redesign/current-service-map/06 트라이브, 온보딩, 계정, 소셜.md` 19줄이 트라이브 삭제 가드가 `user_drop_state.last_drop_tribe_id`를 본다고 적는다. 이 폴더는 지난 시점의 지도라 고치지 않는다.
- **묶음 7과의 접점**: `lib/admin/opsInbox/execute/__tests__/fakeDb.ts`의 `user_drop_state: []`와 주석 한 줄을 지웠다. 머지 때 충돌은 없었다.

## 잔여 이슈

- `users.initial_sync_done`과 `first_sync_pending`이 함께 있는 구조는 그대로다(결정 1). 합치려면 첫 동기화 게이트의 뜻을 정하는 설계가 먼저다.
- `jam_policy`·`capsule_policy`를 고치는 어드민 화면이 없다(묶음 7).
- 새 발급 경로용 어드민 미리 보기가 없다(결정 2). 필요해지면 별도 티켓으로 만든다.
- 정리 SQL 271~274는 작성만 했고 실행하지 않았다. 실행은 출시(main 승격) 뒤 사용자 승인으로 한다(6-4의 266~269와 함께 «출시 뒤 실행 대기 목록»에 오른다).

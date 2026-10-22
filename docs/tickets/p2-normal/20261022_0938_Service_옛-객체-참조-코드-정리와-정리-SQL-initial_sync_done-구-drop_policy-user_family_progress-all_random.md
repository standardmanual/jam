---
id: "20261022_0938"
category: Service
priority: P2
status: OPEN
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

### 2회 (SQL 파일 4개, 실행 안 함, 1회 머지 뒤 현재 스키마로 쓴다)

6. `jam-web/supabase/migrations/`에 `post_release` 파일 4개(번호는 시작 때 가장 높은 번호 뒤, 6-3이 쓴 270 등과 겹치지 않게 확인): ① `drop_policy` 표 삭제(1행 24열, 되돌림은 표·열 정의와 지금 1행 값), ② `user_drop_state`의 옛 열 7개와 외래키 2개 삭제(4행의 지금 값을 되돌림에 싣는다), ③ `user_family_progress` 표 삭제(되돌림은 구조만, 600행은 파생 스냅샷이라 데이터 복원은 코드를 되돌려 동기화로 다시 채운다고 머리말에 적는다), ④ `ambient_drop_config.all_random` 열 삭제(값 true를 되돌림에 싣는다). 모든 파일에 6-4 4회 선례(266~269)의 머리말·선행 조건·적용 전후 확인 SELECT·`-- 되돌림 SQL` 규칙을 따르고, 선행 조건에 «1회 코드가 출시된 뒤, 코드 참조 0건 `grep` 재확인»을 넣는다.
7. 카리나가 롤백 실측(한 트랜잭션, `lock_timeout 3s`, 적용·되돌림·재확인 뒤 예외로 취소)을 하고 결과를 이 티켓에 적는다. **적용은 출시 뒤 사용자 승인**이다. 적용 뒤 생성 타입에서 지운 표·열을 지운다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 옛 드랍 엔진, `drop_policy`, `user_family_progress`, `all_random`을 참조하는 앱 코드가 없다(시험과 `grep`). 새 발급 경로와 컬렉션 완성 판정, 어드민 «드랍 제외 관리»는 그대로 동작한다.
- 출시(main 승격) 전에는 DB 표·열을 지우지 않는다.

### UI/UX 관점

- 어드민 메뉴에서 «드랍 정책»이 사라지고 «드랍 제외 관리»는 남는다. 시뮬레이터에서 «아이템 드랍» 구역이 사라지고 나머지는 그대로다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- [ ] (1회) 위 참조 코드가 없고, `buildBadgeIdsOfBook`을 쓰는 컬렉션 완성 판정과 새 발급 경로 시험이 통과한다
- [ ] (1회) 어드민 «드랍 제외 관리»와 시뮬레이터의 남은 구역이 로컬 실렌더로 열린다
- [ ] (2회) 정리 SQL 4개가 파일로 있고 되돌림 SQL과 롤백 실측 결과가 이 티켓에 있다. 실행하지 않았다

### 후속 범위 (담당: 카리나, 시점: 출시 뒤)

- [ ] 출시 뒤 사용자 승인으로 SQL을 실행하고 생성 타입을 정리한다(`/jam-ship` 10단계 «출시 뒤 실행 대기 목록»에 올라 있어야 한다)

## 진행 기록

## 잔여 이슈

- `users.initial_sync_done`과 `first_sync_pending`이 함께 있는 구조는 그대로다(결정 1). 합치려면 첫 동기화 게이트의 뜻을 정하는 설계가 먼저다.
- `jam_policy`·`capsule_policy`를 고치는 어드민 화면이 없다(묶음 7).

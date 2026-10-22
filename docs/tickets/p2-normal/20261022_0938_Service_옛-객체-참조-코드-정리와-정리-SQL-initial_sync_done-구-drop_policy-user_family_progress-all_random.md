---
id: "20261022_0938"
category: Service
priority: P2
status: OPEN
created: 2026-10-22
parent: "20261021_1250"
---

# [Service] 옛 객체를 참조하는 코드를 정리하고 정리 SQL을 쓴다 (initial_sync_done, 구 drop_policy, user_family_progress, all_random)

## 핵심 요약

- 요구사항: 6-4 4회(티켓 `20261021_1250`)가 «바로 안전한» 정리 SQL 4개(266~269)만 쓰고 넘긴 옛 객체 네 가지를, **staging 코드가 아직 읽거나 쓰는 참조를 먼저 걷어낸 뒤** 지울 수 있게 한다. 코드 정리와 정리 SQL(`post_release`, 롤백 실측, 실행은 출시 뒤 사용자 승인)을 이 티켓에서 한 묶음으로 한다. SQL은 그때의 스키마를 읽고 쓴다(미리 써 두면 낡는다).
- 구현 계획(대상별, 줄 위치는 2026-10-22 조사 기준이며 시작 때 다시 확인한다):
  1. `users.initial_sync_done`(NOT NULL, 기본값 false, 7명 true·1명 false): 참조 8개 파일. `lib/badge-engine/index.ts`(920~993줄, 첫 싱크 게이트), `lib/badge-engine/reevaluateCatalog.ts`, `lib/strava/sync.ts`, `lib/strava/connection-state.ts`, `lib/onboarding-quest/completion.ts`, `lib/admin/user-actions.ts`, `app/api/admin/simulate/route.ts`, `app/api/admin/users/[id]/badge-diagnosis/route.ts`. JAM 2.0의 첫 동기화 판정이 이 열에 기대는지, 대체 기준(퀘스트 실제 1단계, `first_sync_pending`)으로 충분한지 먼저 가려낸다.
  2. 구 `drop_policy` 표(1행, 24열): 옛 드랍 엔진(`lib/drop-engine/policy.ts` 41·70줄의 `drop_policy` 읽기·쓰기, `drop-engine/index.ts`·`preview.ts`)과 어드민 «드랍 정책» 화면(`app/admin/drop-policy/*`, `app/api/admin/drop-policy/route.ts`, `components/admin/adminNavItems.ts`), `app/api/admin/ambient-drop/config/route.ts`가 쓴다. **`/admin/drop-policy/exclusions`(드랍 제외 관리)와 `lib/admin/drop-exclusion-list.ts`는 새 체계에서도 쓰는지 먼저 확인한다**(표 하나를 지운다고 같이 지우면 안 될 수 있다).
  3. `user_family_progress` 표(600행): `lib/strava/sync.ts` 502~700줄의 진행 스냅샷 쓰기뿐이다(읽는 화면이 있는지 확인). 쓰기 경로를 지운 뒤 표를 지운다. 600행은 동기화로 다시 만들 수 있는 스냅샷인지 확인한다.
  4. `ambient_drop_config.all_random` 열(값 true): `app/api/admin/ambient-drop/config/route.ts` 119줄, `lib/ambient-drop/config.ts` 16줄(기본값 false), `lib/ambient-drop/index.ts` 64줄 주석. 이미 코드는 이 값을 보지 않는다(티켓 20261018_1811).
  5. **`cappedRarity` 필드**(6-4 2회에서 이름만 남았고 지금은 `rolledRarity`와 항상 같다): `lib/drop-engine/preview.ts`, `app/api/admin/simulate/route.ts`, `app/admin/simulator/page.tsx`. 등급 폴백(후보 없음) 표시를 실제로 보이게 할지, 필드를 지울지 정한다.
  6. 각 객체의 정리 SQL을 `jam-web/supabase/migrations/`에 `post_release` 파일로 쓰고(번호는 그때의 최고 번호 뒤, 6-3이 쓰는 번호와 겹치지 않게 확인) 롤백 실측까지 한다. **실행은 출시 뒤 사용자 승인**이다.
- 관련 파일: 위 목록, `jam-web/supabase/migrations/266_post_release_*.sql`~`269_*`(선례, 머리말 모양), 6-4 4회 `4회 시작 전 조사 결과` 표(티켓 `20261021_1250`).

## 배경 / 문제 정의

6-4 4회는 사용자 결정 6에 따라 «바로 안전한 것»(출시 뒤 코드 선행이 필요 없는 4개)만 SQL로 썼다. 위 네 가지는 staging 코드가 아직 쓰므로 표나 열을 지우면 그 기능이 깨진다. 코드를 정리하기 전에 SQL만 써 두면 실행할 수 없는 파일이 `migrations/`에 오래 남고 스키마가 바뀌면 다시 써야 한다. 그래서 코드 정리와 같은 티켓에서 SQL을 쓴다.

발견: 2026-10-22 티켓 `20261021_1250` 6-4 4회 시작 전 조사(코드 읽기와 공용 DB 읽기 전용 확인).

## 상세 요구사항

### 서비스/코드베이스 관점

- 정리 대상 객체를 읽거나 쓰는 코드가 staging에 없다(`grep`으로 확인하고 시험이 «읽지 않는다»를 고정한다).
- 동작이 바뀌는 곳(첫 동기화 판정, 어드민 드랍 정책 화면)은 대체 기준과 화면에서 사라지는 문구를 결과에 적는다.
- 출시(main 승격) 전에는 DB 객체를 지우지 않는다(옛 프로덕션 코드가 아직 쓴다).

## 완료 조건

- [ ] 네 객체와 `cappedRarity`를 참조하는 앱 코드가 없다(시험과 `grep`)
- [ ] 객체별 정리 SQL이 파일로 있고 되돌림 SQL과 롤백 실측 결과가 이 티켓에 있다. 실행하지 않았다
- [ ] 어드민 «드랍 제외 관리» 등 새 체계에서 쓰는 화면은 그대로 동작한다(로컬 실렌더 확인)
- [ ] 출시 뒤 실행 대기 목록에 올라 있다(`/jam-ship` 10단계 보고)

## 진행 기록

## 잔여 이슈

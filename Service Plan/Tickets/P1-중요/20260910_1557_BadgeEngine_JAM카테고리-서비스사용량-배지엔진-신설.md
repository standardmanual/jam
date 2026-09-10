---
id: 20260910_1557
category: BadgeEngine
priority: P1
status: CLOSED
created: 2026-09-10
closed: 2026-09-10
---

# [BadgeEngine] JAM! 카테고리 — 서비스 사용량 기반 배지 엔진 신설 (팔로워·팔로잉·일일동기화)

## 배경 / 문제 정의

현재 배지 조건 체계(`condition_json`)는 전부 Strava 활동 이력을 전제로 한다 — 거리·고도·페이스·
연속 기록처럼 "무엇을 했는가"만 잰다. "서비스를 어떻게 쓰는가"(팔로우 관계 형성, 꾸준한 동기화)를
재는 지표는 하나도 없다.

이 티켓은 팔로워 수·팔로잉 수·일일 동기화 횟수 3개 지표를 조건으로 삼는 배지를 만들 수 있는
**엔진**을 신설한다. 실제 배지 콘텐츠(이름·이미지·임계값·등급 구성)는 범위에서 뺀다 — 엔진이
갖춰지면 사용자가 어드민에서 직접 만든다. 이후 다른 서비스 사용량 지표(범위 밖, 참고용)로도 계속
확장할 계획이라, 이번에 잡는 패턴이 그 확장의 틀이 된다.

개념적으로는 `badge_type`(POI/ACTIVITY/ITEM)과 같은 레벨의 "JAM!" 카테고리를 신설하는 것이지만,
유저에게 노출되는 배지 분류는 기존 `type='activity'`(액티비티배지) 목록에 그대로 포함시킨다 —
카테고리를 계속 늘리면 UI상 배지 노출 분류가 점점 복잡해지기 때문에, DB의 `badge_type` enum에는
손대지 않고 Strava와 동기화되지 않는 "서비스 사용량"을 액티비티(서비스 안에서의 활동)로 해석한다.

## 상세 요구사항

### 서비스/코드베이스 관점

**현재 상태 (조사 결과, 2026-09-10 기준)**

- 배지 분류는 `badge_type` enum(`activity`/`item`/`poi`, [052_badge_type_poi.sql](../../../jam-web/supabase/migrations/052_badge_type_poi.sql)) 하나뿐이고, `condition_json`에 알려지지 않은 키가 들어오면 DB CHECK 제약(`badges_condition_json_known_keys`, 마이그레이션 102)이 INSERT/UPDATE 자체를 막는다.
- `type='activity'`인데 badge-engine 밖에서 평가되는 필드가 이미 있다 — `mission_reward`가 `evaluation: 'external'`로 선언되어 있고([conditionRegistry.ts:899](../../../jam-web/src/lib/badge-engine/conditionRegistry.ts:899)), badge-engine의 조건 평가는 이 필드를 항상 실패 처리하며 실제 발급은 `grantMissionRewards`라는 별도 함수가 전담한다. 이번 신규 조건 3종도 같은 패턴을 따른다.
- 배지 트리 화면([badgeTree.ts:292](../../../jam-web/src/lib/badgeTree.ts:292))은 `activity_types[0]`을 기준 종목으로 삼아 트리를 구성한다 — 이 배열이 비어 있으면 어느 트리에도 걸리지 않는다. 일반 배지 목록([badges/page.tsx:80](../../../jam-web/src/app/(main)/badges/page.tsx:80))과 프로필 화면은 `type==='activity'`만 보고 `activity_types`는 안 따지므로 그대로 노출된다.
- 팔로워/팔로잉 수는 `user_follows` 테이블([021_follows.sql](../../../jam-web/supabase/migrations/021_follows.sql))에서 매번 `COUNT(*)`로 구한다 — 캐시 컬럼이 없다.
- 일일 동기화 횟수를 기록하는 테이블이 전혀 없다. `syncStravaActivities`([sync.ts:1028](../../../jam-web/src/lib/strava/sync.ts:1028))는 `synced: number`(새로 불러온 활동 수)를 리턴한다.
- 어드민의 배지 생성 폼([BadgeForm.tsx](../../../jam-web/src/app/admin/badges/BadgeForm.tsx))은 `conditionRegistry.ts`를 단일 소스로 삼는 [conditionFormFields.ts](../../../jam-web/src/app/admin/badges/conditionFormFields.ts)를 거친다. "계열관리"(`admin/badge-families`)는 그대로 재사용하지만, "배지지표관리"(`admin/badge-metric-labels`)는 배지 트리 진행률 축 라벨 전용이라([page.tsx](../../../jam-web/src/app/admin/badge-metric-labels/page.tsx)) 이번 배지는 트리에 노출되지 않으므로 해당 없음.
- 어뷰징 방지 정책(`getUserBanLevel`/`shouldAllowDrop`, [shadow-ban.ts](../../../jam-web/src/lib/abusing/shadow-ban.ts))은 현재 드랍엔진 쪽에서 쓰이지만 재사용 가능한 형태다.

**제안 변경**

1. **조건 필드 3종 신설** (`condition_json`, `evaluation: 'external'`, `role: 'meta'` — 진행률 표시 안 함)
   ```jsonc
   { "follower_count": 100 }    // 팔로워 수 ≥ 조건값
   { "following_count": 50 }    // 팔로잉 수 ≥ 조건값
   { "daily_sync_count": 7 }    // 그날 누적 동기화 성공 횟수 ≥ 조건값
   ```
   `mission_reward`와 동일한 `evaluation: 'external'` 패턴으로 `conditionRegistry.ts`에 등록한다.
   badge-engine의 `evaluateConditionDetailed`는 이 필드가 있으면 항상 fail 처리하고, 실제
   판정·발급은 신규 함수가 전담한다.

2. **신규 테이블 — 일일 동기화 카운터**
   ```sql
   CREATE TABLE public.user_daily_sync_counts (
     user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
     sync_date DATE NOT NULL,       -- KST 기준 날짜
     count INTEGER NOT NULL DEFAULT 0,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (user_id, sync_date)
   );
   ```
   `INSERT ... ON CONFLICT (user_id, sync_date) DO UPDATE SET count = count + 1, updated_at = NOW()`로
   원자적 증가. 기존 유저 관련 테이블의 RLS 패턴을 따라 RLS를 설정한다.

3. **신규 평가 함수** — `src/lib/badge-engine/usageBadges.ts`(가칭)
   `evaluateUsageBadges(userId, metric, currentValue)` 형태로, 해당 지표 조건을 가진 배지
   후보를 조회해 등급형은 이름 그룹 기준 아래 등급부터, 레벨형은 `family_key` 기준 보유
   레벨+1부터 순서대로 판정·발급한다([BADGE_ENGINE_UNIFIED.md](../../Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md)
   §Step 3-A/3-B와 동일한 순차 발급 규칙 — 재사용 가능한 기존 순수 함수가 있으면 그대로 쓰고,
   없으면 같은 정책만 최소 재구현). 발급 직전 `getUserBanLevel`로 밴 레벨을 조회해 고가치
   배지 발급을 차단한다. 발급 시 `user_activity_badges` insert, `point_reward` 지급, 피드
   이벤트 기록까지 기존 배지 발급과 동일하게 수행한다.

4. **트리거 연결**

   | 엔드포인트 | 변경 |
   |---|---|
   | `POST /api/follows` | insert 성공 후 **양쪽 유저** 평가 — 팔로우한 사람(`user.id`)의 `following_count`, 팔로우당한 사람(`targetUserId`)의 `follower_count`. `try/catch`로 감싸 실패해도 팔로우 응답(200)은 그대로 반환. 응답에는 팔로우한 사람 본인이 이번 액션으로 획득한 배지를 `earnedBadges`로 실어 보낸다(프론트가 이 값을 읽어 리빌 애니메이션을 띄우는 작업은 Out of Scope — 응답 필드 자체만 지금 만든다). 팔로우당한 사람의 획득 정보는 이 응답에 담지 않는다. |
   | `DELETE /api/follows/[userId]` | 변경 없음 — 평가 호출 없음 (감소만 일어나고 신규 발급은 없으므로) |
   | `POST /api/strava/sync` | `syncStravaActivities` 리턴값의 `synced > 0`일 때만 `user_daily_sync_counts` UPSERT 후 그 날짜의 최신 카운트로 평가. 획득 배지는 기존 `earnedBadges` 배열에 그대로 합류시켜, `SyncButton.tsx`가 코드 수정 없이 리빌을 띄우게 한다. |

5. **어드민 폼 확장**
   `conditionFormFields.ts`의 `ConditionFormFields` 타입에 `followerCount`/`followingCount`/
   `dailySyncCount` 3개 필드 추가, `BadgeForm.tsx`에 숫자 입력 UI 3개 추가. "계열관리"는
   기존 그대로 사용한다.

### 컨텐츠 관점

해당 없음 — 실제 배지 콘텐츠(이름·이미지·임계값·등급 구성)는 이번 범위 밖. 사용자가 어드민에서
직접 생성한다.

## 구현 계획

### Acceptance Criteria

1. 어드민에서 `follower_count`/`following_count`/`daily_sync_count` 조건을 가진 배지를 등급형·레벨형 둘 다로 생성할 수 있다.
2. 팔로우 API 호출 직후, 팔로우한 유저의 `following_count` 조건을 만족하는 배지가 `user_activity_badges`에 즉시 insert된다.
3. 같은 호출에서 팔로우당한 유저의 `follower_count` 조건도 동시에 평가·발급된다.
4. 언팔로우(DELETE) 호출은 배지 평가를 트리거하지 않는다.
5. `synced > 0`인 동기화는 `user_daily_sync_counts`의 해당 유저·오늘 날짜(KST) 카운트를 정확히 1 증가시키며, 동시 요청이 겹쳐도 카운트가 유실되지 않는다.
6. `synced === 0`인 동기화는 카운터를 증가시키지 않는다.
7. `daily_sync_count` 조건 충족 배지는 `earnedBadges` 응답에 포함되어 `SyncButton.tsx`가 코드 수정 없이 리빌을 띄운다.
8. 이 조건들을 가진 배지는 `activity_types`가 빈 배열이면 `/badges/tree`에 노출되지 않는다.
9. 같은 배지는 `/badges`(일반 목록)와 프로필 화면에는 정상 노출된다.
10. 섀도우밴 레벨이 높은 유저는 고가치(rarity) 배지 발급이 차단된다.
11. 등급형은 이름 그룹 안에서 아래 등급부터, 레벨형은 `family_key` 안에서 보유 최고 레벨+1부터 연속으로 발급되며 중간 단계가 누락되지 않는다.
12. 조건을 더 이상 만족하지 않아도(예: 언팔로우로 팔로워 감소) 이미 발급된 배지는 회수되지 않는다.
13. `condition_json`에 이 3개 키 외의 미등록 키는 여전히 CHECK 제약으로 거부된다.
14. 배지 평가 로직이 예외를 던져도 팔로우/동기화 API의 응답은 정상(200)으로 반환된다.
15. 팔로우 API 응답에는 팔로우한 사람 본인이 이번 액션으로 획득한 배지 목록(`earnedBadges`)이 포함된다.

### 테스트 계획

| 레이어 | 내용 | 개수 |
|---|---|---|
| Unit | 조건 충족/미충족, 등급형 순차 발급, 레벨형 연속 발급, 섀도우밴 차단 | +6 |
| Unit | `user_daily_sync_counts` 원자적 UPSERT(동시성) | +2 |
| Integration | 팔로우 POST → 양쪽 유저 배지 발급 확인 | +2 |
| Integration | 동기화 POST(synced>0 / synced=0) → 카운터·배지 발급 확인 | +2 |
| Integration | CHECK 제약이 미등록 키를 거부하는지 | +1 |

### 롤백 계획

문제 발생 시 이 기능 개발 전 상태로 완전히 되돌린다.
- **코드**: 팔로우/동기화 API 훅, 신규 평가 함수, 어드민 폼 필드 관련 커밋 revert
- **스키마**: `user_daily_sync_counts` DROP, CHECK 제약을 이전 키 목록으로 되돌리는 역방향 마이그레이션
- **데이터**: 신규 조건 3종을 가진 배지 ID를 기준으로 그 배지들의 `user_activity_badges` 발급 이력만 식별해 삭제 (다른 사유로 발급된 배지와 섞이지 않게 배지 ID로 좁힌다)

### Effort Estimate

| 구성 요소 | 시간 |
|---|---|
| 신규 테이블·CHECK 제약 마이그레이션 | 1~2h |
| 조건 레지스트리 + `CONDITION_JSON_SPEC.md` §2.14 신설 | 1h |
| 신규 평가 함수 + 섀도우밴 연동 | 3~4h |
| 팔로우 API 훅 연결 | 1h |
| 동기화 API 훅 + `earnedBadges` 합류 | 1.5h |
| 어드민 폼 확장 | 1.5h |
| 유닛·통합 테스트 | 2~3h |
| **합계** | **약 12~14h** |

### Files Reference

| 파일 | 변경 |
|---|---|
| `jam-web/supabase/migrations/NNN_user_daily_sync_counts.sql` | 신규 테이블 |
| `jam-web/supabase/migrations/NNN_condition_json_usage_keys.sql` | CHECK 제약에 3개 키 추가 |
| `jam-web/src/lib/badge-engine/conditionRegistry.ts` | 조건 필드 3종 등록 (`evaluation: 'external'`) |
| `jam-web/src/lib/badge-engine/usageBadges.ts` (신규) | 사용량 배지 평가·발급 함수 |
| `Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md` | §2.14 신규 섹션 |
| `jam-web/src/app/api/follows/route.ts` | POST 성공 후 양쪽 유저 평가 호출 + 응답에 `earnedBadges` 포함 |
| `jam-web/src/lib/strava/sync.ts` | `synced>0` 시 카운터 UPSERT + 평가 + `earnedBadges` 합류 |
| `jam-web/src/app/admin/badges/conditionFormFields.ts` | 폼 필드 3종 추가 |
| `jam-web/src/app/admin/badges/BadgeForm.tsx` | 조건 빌더 입력 UI 3종 추가 |

### Out of Scope

- 실제 배지 콘텐츠(이름·이미지·임계값·등급 구성) — 사용자가 어드민에서 직접 생성
- 팔로우 획득 시 프론트 리빌 애니메이션 연동 (`FollowButton.tsx`)
- 배지 트리 화면에 별도 탭 노출
- 진행률(예: "팔로워 7/10명") UI
- 이번 3개 지표 외의 서비스 사용량 지표 확장

### 완료 시 갱신할 문서

- `Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md` — §2.14 "사용량 지표 필드(활동 무관)" 신설
- `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` — §1 전체 구조 표에 "서비스 사용량 배지" 평가 경로(badge-engine 밖, `usageBadges.ts`) 추가 설명

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
Acceptance Criteria 15개를 전부 구현했다.

- **조건 필드 3종** — `follower_count`/`following_count`/`daily_sync_count`를
  `conditionRegistry.ts`에 `role: 'meta'` + `evaluation: 'external'`로 등록(`mission_reward`와
  같은 자리). 별도 fail-closed 분기를 추가하지 않아도 "measurable 필드 없음" 기존 방어
  분기로 badge-engine이 항상 fail 처리한다.
- **신규 테이블·RPC** — `user_daily_sync_counts` + `increment_daily_sync_count()`(원자적
  UPSERT, 마이그레이션 154). CHECK 제약 확장은 마이그레이션 155(role:'meta'라
  `measurable_keys`에는 넣지 않음 — 140은 그대로 둠).
- **평가 함수** — `src/lib/badge-engine/usageBadges.ts` 신규. `evaluateUsageBadges()`가
  BADGE_ENGINE_UNIFIED.md §Step 3-A(등급형 성장 티어: 이름 그룹 내 최상위 tier 1개만)·
  §Step 3-B(레벨형: family_key 내 보유 레벨+1부터 연속)와 같은 정책을 최소 재구현. 섀도우밴은
  rarity가 있는(등급형) 배지만 차단(`shouldAllowDrop`). `recordDailySyncAndEvaluate()`가
  daily_sync_count 전용 진입점(RPC 호출 + 평가를 한 곳에 묶음).
- **트리거 연결** — `POST /api/follows`: 신규 insert 성공 시에만(23505 제외) 양쪽 유저를
  각자 try/catch로 격리해 평가, 응답에 `earnedBadges`(팔로우한 사람 본인 몫만) 포함.
  `DELETE /api/follows/[userId]`는 변경 없음(평가 트리거 없음). `syncStravaActivities`
  →`processFetchedActivities` 안에서 `rawActivities.length>0`(=synced>0)일 때만
  `recordDailySyncAndEvaluate` 호출, 결과를 기존 `earnedBadgeIds`에 합류시켜
  `buildEarnedBadgePayload`가 상한·순서·`isFirstBadgeEver`를 한 번에 처리.
- **어드민 폼** — `conditionFormFields.ts`에 상태 키 3종 추가. `BadgeForm.tsx`는 **코드 변경
  없이** 기존 `CONDITION_FORM_ENTRIES`/`CONDITION_FORM_SECTIONS_IN_USE` 제네릭 렌더링이
  자동으로 "메타데이터" 섹션에 숫자 입력 3개를 그린다(레지스트리 선언만으로 폼이 완성되는
  기존 설계를 그대로 활용 — Files Reference의 BadgeForm.tsx 항목과 달리 실제 diff는 0줄).
- **주입 클라이언트 체인 유지** — `evaluateUsageBadges`/`recordDailySyncAndEvaluate`에
  `client?: SupabaseClient` 선택 인자 추가(`getAbusingPolicy`와 동일 패턴).
  `processFetchedActivities`는 자신이 주입받은 클라이언트를 넘겨야 한다는 기존 테스트
  계약(`sync-vehicle-speed-filter.test.ts`)을 위반하지 않기 위함 — 1차 구현에서 이 계약을
  놓쳐 기존 테스트가 실패하는 것을 확인하고 수정했다.

### 변경된 파일
```
jam-web/supabase/migrations/154_user_daily_sync_counts.sql (신규)
jam-web/supabase/migrations/155_condition_json_usage_keys.sql (신규)
jam-web/src/types/database.ts
jam-web/src/types/database.generated.ts (신규 테이블·RPC 수기 반영 — 미실행 마이그레이션이라 npm run db:types 불가, 실행 후 재생성 필요)
jam-web/src/lib/badge-engine/conditionRegistry.ts
jam-web/src/lib/badge-engine/usageBadges.ts (신규)
jam-web/src/app/admin/badges/conditionFormFields.ts
jam-web/src/app/api/follows/route.ts
jam-web/src/lib/strava/sync.ts
Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
jam-web/src/lib/badge-engine/__tests__/usage-badges.test.ts (신규)
jam-web/src/lib/badge-engine/__tests__/condition-registry.test.ts (55종 반영 + 155 대조)
jam-web/src/app/admin/badges/__tests__/conditionFormFields.test.ts (표본에 3종 추가)
jam-web/src/app/api/follows/__tests__/route.test.ts (신규)
jam-web/src/lib/strava/__tests__/sync-usage-badge-hook.test.ts (신규)
```

### 테스트 결과
- [x] `npx vitest run` — 79 files / 1291 tests 전부 통과 (신규 +59 근방: usage-badges 24 ·
      follows route 9 · sync-usage-badge-hook 5 · condition-registry 대조 보강 · conditionFormFields 표본 보강)
- [x] `npx tsc --noEmit` — 오류 0건
- [x] `npm run lint` — 오류 0건, 경고 0건 추가(기존 design-system 경고 13건은 무관한 사전 존재분)
- [x] `npm run build` — 프로덕션 빌드 성공 (`/api/follows`·어드민 배지 폼 포함 전체 라우트)
- [x] 어드민 배지 폼 실브라우저 확인 — staging 머지 후 오케스트레이터가 `DEV_PROCESS_GUARDRAILS.md`
      패턴 13(`ADMIN_EMAILS=dev-tester@jam.local` 로컬 `next dev`, 공용 DB 읽기 전용)으로
      `/admin/badges/new`를 직접 렌더해 확인. "메타데이터" 섹션에 "팔로워 수 (명)"·"팔로잉 수
      (명)"·"하루 동기화 횟수 (회)" 숫자 입력 3개가 각각 정확한 도움말과 함께 렌더됨을
      접근성 트리로 직접 읽어 확인. "배지 종류" 콤보박스에 "등급형"·"레벨형" 둘 다 옵션으로
      존재함도 같은 화면에서 확인(Acceptance Criteria 1)
- [x] 마이그레이션 154·155를 오케스트레이터가 직접 실행 — 동시성 스모크(연속 3회 호출 시
      1/2/3 정확히 증가, 롤백)·권한(`increment_daily_sync_count`가 `service_role`에만
      EXECUTE)·기존 배지 633건 CHECK 통과·신규 키 INSERT 스모크(롤백) 전부 확인. 보안
      어드바이저(`get_advisors`)에도 이번 변경으로 인한 신규 경고 없음
- [x] `database.generated.ts` 수기 반영분을 MCP `generate_typescript_types` 결과와 대조 —
      `user_daily_sync_counts`·`increment_daily_sync_count` 둘 다 한 글자도 다르지 않음 확인.
      코드 수정 불필요

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

해당 없음 — 이번 티켓은 엔진만 구현하고 실제 배지 콘텐츠(이름·설명·이미지)는 Out of Scope다.
추가한 텍스트는 어드민 조건 빌더의 내부 라벨·도움말(`conditionRegistry.ts`의 `label`/`help`)
뿐이며, 최종 사용자에게 노출되는 문구가 아니다.

### 배포 정보
- 배포일: 2026-09-10
- 환경: staging (main 승격은 별도 `/jam-ship` 진행 대기)
- 커밋: `b0762707`(머지) · `9f781c29`(구현) · 마이그레이션 154·155 실행 완료
- Vercel `jam-stage` 프로젝트(⚠️ `jam` 프로젝트가 아니다 — `jam`은 main 전용이라 staging
  push엔 항상 Canceled로 뜬다) `jam-stage-5i6n9exny`, target: production, Ready 확인.
  `stage.j-a-m.app`·`jam-stage-standard-manual.vercel.app` alias가 이 배포를 정확히
  가리킴(생성 시각 17:30:46이 머지 push 직후와 일치)

### 주요 의사결정 / 핵심 메모
> `/spec`으로 3라운드 인터뷰를 거쳐 확정한 스펙. 주요 결정: `badge_type` enum에는 손대지
> 않고 `type='activity'` + `activity_types=[]`로 저장(배지 트리 미노출, 일반 목록/프로필엔
> 노출). 조건 평가는 badge-engine 안이 아니라 `mission_reward`와 동일한
> `evaluation: 'external'` 패턴으로 분리. 등급형/레벨형 순차 발급 규칙은 기존 §Step 3-A/3-B
> 정책을 그대로 재사용. 언팔로우는 회수·재평가 모두 하지 않음. 실패는 원본 API 응답에
> 영향 주지 않도록 격리.

**구현 중 티켓 본문과 달라진 부분 2건 (범위 변경 아님, 실행 방법 판단):**
1. **CONDITION_JSON_SPEC.md 문서 위치** — 티켓은 "§2.14 신설"을 지시했으나, §2는 문서
   자체가 "badge-engine의 evaluateConditionDetailed가 실제로 검사에 사용"하는 필드로
   정의돼 있다. 신규 3종은 `role: 'meta'`(§1에서 결정한 값)라 그 정의에 맞지 않고, 오히려
   `mission_reward`가 있는 §3(메타데이터 필드)과 같은 카테고리다. §3에 3개 행 + 설명
   문단을 추가하는 것으로 대체했다(§2.14는 신설하지 않음). 문서 자체의 분류 기준과
   내부적으로 일관되게 유지하기 위한 판단이며, 필드 스펙 자체(3종의 의미·평가 주체)는
   티켓 그대로다.
2. **BadgeForm.tsx** — Files Reference는 이 파일에 "조건 빌더 입력 UI 3종 추가"를
   지시했으나, 실제 diff는 0줄이다. 이 코드베이스의 조건 빌더는 이미
   `conditionRegistry.ts`의 `form` 선언에서 입력 UI를 제네릭하게 생성하도록 설계돼 있다
   (파일 자체 주석: "입력 UI는 conditionRegistry.ts의 form 선언에서 생성한다 — 필드마다
   JSX를 쓰지 않는다"). `role: 'meta'` + `section: 'meta'` + `form.controls`를 선언하면
   "메타데이터" 섹션에 숫자 입력 3개가 자동으로 뜬다(등급형·레벨형 배지 생성 모두 지원 —
   Acceptance Criteria 1 충족). 새 JSX를 추가하는 것은 오히려 이 설계와 어긋나는 중복
   코드가 된다고 판단해 레지스트리 선언만으로 마쳤다.

### 잔여 이슈
- 없음 — 구현 시점의 잔여 이슈 2건(어드민 실브라우저 확인, `database.generated.ts` 대조)은
  머지·마이그레이션 실행 후 오케스트레이터가 전부 해소했다(위 "테스트 결과" 항목 참고)
- (참고, 이번 티켓 범위 밖으로 별도 티켓화됨) 게이트·개선 리뷰에서 발견한 두 건 —
  [20260910_1719 액티비티 배지 섀도우밴 미적용](../P1-중요/20260910_1719_BadgeEngine_액티비티배지-섀도우밴-미적용.md),
  [20260910_1719 사용량 배지 반복형 조용한 오동작](../P2-일반/20260910_1719_BadgeEngine_사용량배지-반복형-조용한오동작.md)

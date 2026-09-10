---
id: 20260910_2055
category: BadgeEngine
priority: P1
status: CLOSED
created: 2026-09-10
closed: 2026-09-10
---

# [BadgeEngine] JAM! 카테고리 — `admin_category` 컬럼 신설 및 어드민 화면 전반 반영

## 배경 / 문제 정의

티켓 [20260910_1557](20260910_1557_BadgeEngine_JAM카테고리-서비스사용량-배지엔진-신설.md)로
"서비스 사용량"(팔로워 수·팔로잉 수·일일 동기화 횟수) 조건 배지 엔진을 신설했고,
[20260910_1959](../P2-일반/20260910_1959_Content_JAM카테고리-사용량배지3종-신규생성.md)로
실제 배지 3종을 만들었다(현재 이미지 없어 비활성 상태).

1557의 설계는 "유저에게 노출되는 배지 분류는 늘리지 않는다"는 원칙 아래, DB `badge_type`
enum을 건드리지 않고 `type='activity'`로 저장했다. 이 판단 자체는 유효하다 — 문제는
**어드민** 쪽이다. 어드민에서 이 배지들을 "JAM! 카테고리"로 구분할 방법이 전혀 없어서:

- 배지 목록 필터에 이 배지들만 골라볼 옵션이 없다(조건 필드가 `role:'meta'`라 필터 후보에도
  안 뜬다 — [badge-list-view.md 조사] `conditionRegistry.ts:1585-1587`).
- 계열관리(`/admin/badge-families`)에서는 "계열 키 없음" 단독 계열로 섞여 노출되는데, 종목
  칸·조건지표 칸이 전부 "—"로 나와 마치 데이터가 빠진 배지처럼 보인다
  (`badge-families/page.tsx:131,144-146,164-168`).
- 시뮬레이터(`/admin/simulator`)는 이 배지들을 애초에 평가 불가능한 지표인데도 매번 "미획득"
  목록에 올려, 확인하려는 실제 활동 배지 결과를 가린다(`badge-engine/index.ts:419,1008-1021`).

게다가 사용자 확인 결과, 이 카테고리는 여기서 멈추지 않는다 — **앞으로 레벨형·등급형으로
확장**되고(현재 3종은 전부 `mystic` 단일 등급뿐), **게이트미션·아이템북 컬렉션 게이트의
조건으로도 실제로 쓸 계획**이다. 즉 어드민에서 이 배지들은 "숨기거나 걸러낼 대상"이 아니라
"정식으로 관리·선택 가능해야 할 대상"이다.

### 구현 착수 단계에서 발견된 설계 결함 (2026-09-10, jam-developer 탐색 단계 HALT)

최초 스펙 인터뷰에서는 신규 컬럼명을 `category`로 정했으나, 구현 착수 전 jam-developer가
**이미 존재하는 `badges.category` 컬럼과 정면 충돌**한다는 것을 발견해 구현을 중단했다
(게이트 리뷰가 직접 파일 대조로 재확인, FAIL 판정).

- `badges.category`는 마이그레이션 113(티켓 20260830_1344)이 이미 추가했고, **체크인 배지가
  속한 "지점 카테고리"**(`poi_categories(slug)` FK 참조 — 등산로·자전거길 등) 전용이다.
- 죽은 컬럼이 아니라 현재도 살아있는 기능이다 — `BadgeForm.tsx:722-747`(체크인 전용 select
  UI), `api/admin/badges/route.ts:112`·`api/admin/badges/[id]/route.ts:86`(둘 다
  `type === 'checkin' ? category : null`로 강제), `admin/badges/page.tsx:87-179`·
  `BadgesFilterBar.tsx:162-175`(목록 필터 1순위 판정 기준).
- 이름만 같은 게 아니라 **API가 `type !== 'checkin'`이면 `category`를 항상 `null`로
  덮어쓰는 가드**까지 있다. 즉 DB에 직접 `category='jam'`을 넣어도, JAM! 배지(`type=
  'activity'`)를 어드민 수정 화면에서 한 번이라도 저장하면 그 값이 조용히 사라진다.

**해결**: 컬럼명을 `admin_category`로 변경해 기존 "지점 카테고리" 개념과 완전히 분리한다.
값 집합·CHECK 제약·판별 로직 등 설계 원칙 자체는 최초 스펙과 동일하다 — 이름만 바뀐다.

## 상세 요구사항

### 서비스/코드베이스 관점

**설계 결정 (스펙 인터뷰 + 구현 단계 보정으로 확정)**

1. **`badges.admin_category` 컬럼 신설** — `badge_type` enum은 건드리지 않는다(유저 노출·
   배지 트리 로직이 전부 `type='activity'` 기준으로 이미 원하는 대로 동작 중이라 회귀 위험이
   큼). 기존 `category`(지점 카테고리, 체크인 전용)와는 별개의 신규 nullable 컬럼을 추가해
   어드민 레이어에서만 구분자로 쓴다.
   ```sql
   ALTER TABLE public.badges ADD COLUMN admin_category TEXT;
   ALTER TABLE public.badges ADD CONSTRAINT badges_admin_category_known_values
     CHECK (admin_category IS NULL OR admin_category IN ('jam'));
   ```
   기존 `condition_json`에 화이트리스트 CHECK를 쓰는 패턴(`badges_condition_json_known_keys`,
   마이그레이션 102/155)과 일관되게, 값도 화이트리스트로 관리해 오타·임의값 유입을 막는다.
   기존 `category`(지점 카테고리) 컬럼·FK·API 가드 로직에는 전혀 손대지 않는다 — 완전히
   독립된 신규 컬럼이므로 서로 간섭하지 않는다.
2. **기존 배지 3종 UPDATE** — `id IN ('5f1c677e-9786-4c81-956f-f3440bb78a93',
   '2f89636b-1607-449f-9313-c6634de91996', 'b45ae272-1098-4522-a652-fbb6ce21ab30')`에
   `admin_category='jam'` 반영.
3. **판별 함수 export** — `condition_json` 3키 체크 방식(`USAGE_METRIC_CONDITION_KEYS`,
   `badge-condition-guards.ts:90`, 현재 비공개)을 쓰지 않고, 이제부터는
   `admin_category='jam'` 컬럼로 직접 판별한다. 라벨 상수("JAM!")와 함께 `badge-labels.ts`에
   추가.
4. **어드민 배지 생성·수정 API에 `admin_category` 전달 경로 추가** — 기존 `category`
   필드처럼 `type` 값에 따라 강제로 null 처리하지 않는다. `admin_category`는 `type`과
   무관하게(`activity`/`item`/`checkin` 어디든) 독립적으로 저장·수정 가능해야 한다 — JAM!
   배지가 `type='activity'`이기 때문이다. `api/admin/badges/route.ts`·
   `api/admin/badges/[id]/route.ts`에 `admin_category` 필드를 body에서 읽어 그대로
   저장하는 로직을 추가한다(기존 `category` 필드의 `type==='checkin'` 강제 로직은 건드리지
   않는다 — 별개 컬럼이므로 별개 처리).

**화면별 반영**

| 화면 | 현재 문제 | 반영 방향 |
|---|---|---|
| 배지 목록(`/admin/badges`) | 필터 옵션 전무 (`BadgesFilterBar.tsx`, `badge-list-view.ts`, `badge-labels.ts:14`의 `BADGE_TYPES`는 하드코딩) | 카테고리 필터 추가 — "JAM!" 선택 시 `admin_category='jam'`인 배지만 조회 |
| 계열관리(`/admin/badge-families`) | `fetchActivityFamilyBadges()`(`badge-families-query.ts:44`)가 `type='activity'` 전량 조회, 종목 칸(`page.tsx:131`)·조건지표 칸(`:164-168`)이 "—" | JAM! 배지도 정상 조회하되(향후 레벨·등급 확장 대비), 종목 칸은 "JAM!" 카테고리 표시, 조건지표 칸은 사용량 지표 이름으로 표시 |
| 게이트미션(`/admin/gate-missions`) | 계열 드롭다운(`GateMissionManager.tsx:246`)이 종목 미배정 배지를 "종목 없음"으로 뭉뚱그림 | JAM! 계열을 "JAM!" 라벨로 구분 표시하며 정상 선택 가능하게 유지(이미 `type='activity'`라 드롭다운엔 뜨고 있음 — 라벨 구분만 추가) |
| 아이템북(`/admin/itembooks`) | "필수 액티비티 배지" 검색(`ItemBookForm.tsx:370` → `api/admin/badges/search/route.ts:44`)이 `type` 단순 일치라 구분 없이 섞임(`BadgeSearchSelect.tsx:134` 라벨도 미구분) | 검색 결과·라벨에 "[JAM!]" 구분 표시 추가(제외하지 않음 — 게이트미션과 동일 정책) |
| 시뮬레이터(`/admin/simulator`) | `evaluateBadgesDetailed`(`badge-engine/index.ts:1008-1021`)가 `type='activity'` 전량을 후보로 가져와, JAM! 배지는 구조적으로 항상 "평가 가능한 조건 없음"으로 `badgesMissed`에 쌓임(`:419`, `simulator/page.tsx:362-381`) | `admin_category='jam'`인 배지는 후보 조회 단계에서 `mission_reward`와 동일하게 제외 — 가상 활동으로는 팔로워 수 등을 애초에 시뮬레이션할 수 없는 구조적 한계이므로 |
| 활동배지 이미지(`/admin/activity-badge-image`) | 배경이미지 검색(`api/.../search/route.ts:61`)에 JAM! 배지도 섞여 나옴 | `admin_category='jam'` 배지는 검색 후보에서 제외(배경 이미지가 필요 없는 배지) |
| 배지지표관리(`/admin/badge-metric-labels`) | JAM! 배지는 이미 meta 자동 제외로 대상에서 빠짐 | 변경 불필요 — 현재 동작이 이미 올바름 |
| 유저 배지진단(`/admin/users` `BadgeDiagnosisButton`) | 시뮬레이터와 같은 구조적 이유로 JAM! 배지가 항상 "미충족"(`badge-diagnosis/route.ts:56`) | 이번 범위 밖(Out of Scope 참고) — 우선순위 낮음 |

### 구현 계획

1. 마이그레이션: `admin_category` 컬럼 + CHECK 제약 + 기존 3건 UPDATE
   (`jam-web/supabase/migrations/NNN_badges_admin_category.sql`) — 기존 `category`
   컬럼·FK·마이그레이션 113에는 전혀 손대지 않는다.
2. `badge-labels.ts`(또는 신규 유틸)에 판별 함수·라벨 상수 export
3. 어드민 배지 생성·수정 API에 `admin_category` 저장 경로 추가(기존 `category`
   `type==='checkin'` 가드와 독립적으로 동작하도록)
4. 배지 목록 필터·계열관리·게이트미션·아이템북·시뮬레이터·activity-badge-image 순으로 반영
5. `database.generated.ts` 수기 반영 후 MCP `generate_typescript_types`로 대조

### Acceptance Criteria

1. `badges.admin_category` 컬럼이 존재하고, 화이트리스트 외 값은 CHECK 제약으로 거부된다.
2. 기존 JAM! 배지 3건 모두 `admin_category='jam'`으로 조회된다.
3. `/admin/badges` 목록 필터에서 "JAM!"을 선택하면 이 3건만(및 향후 추가되는 동일 카테고리 배지) 조회된다.
4. `/admin/badge-families`에서 이 배지들이 종목 칸·조건지표 칸에 "—"가 아닌 실제 정보를 보여준다.
5. `/admin/gate-missions` 계열 선택지에서 JAM! 계열이 다른 활동 계열과 구분되는 라벨로 표시되며, 정상적으로 게이트 대상으로 선택 가능하다.
6. `/admin/itembooks` "필수 액티비티 배지" 검색 결과에서 JAM! 배지가 구분 라벨과 함께 정상 노출·선택 가능하다.
7. `/admin/simulator`에서 임의 유저로 시뮬레이션을 실행해도 JAM! 배지가 "미획득" 목록에 나타나지 않는다.
8. `/admin/activity-badge-image` 배경이미지 검색 결과에 JAM! 배지가 나타나지 않는다.
9. `/admin/badges/{id}` 수정 화면에서 JAM! 배지를 값 변경 없이 저장해도 `admin_category='jam'`이 유지된다(기존 `category` 필드의 `type==='checkin'` 강제 null 로직과 달리, `admin_category`는 저장 시 사라지지 않는다).
10. 기존 액티비티/아이템/체크인 배지 및 기존 "지점 카테고리"(`category` 컬럼) 기능의 어느 화면에서도 동작 회귀가 없다.

### 테스트 계획

| 레이어 | 내용 | 개수 |
|---|---|---|
| Unit | 카테고리 판별 함수 | +2 |
| Unit | 배지 목록 쿼리 카테고리 필터 | +2 |
| Unit | 어드민 배지 생성·수정 API의 `admin_category` 저장(기존 `category` 가드와 독립적으로 동작하는지) | +3 |
| Integration | 계열관리·게이트미션·아이템북·시뮬레이터 각 화면 조회 결과 | +4 |
| 수동 검증 | 6개 화면 실렌더로 AC 1~10 확인, 기존 "지점 카테고리" 기능 회귀 여부 확인 | - |

### 롤백 계획

- **코드**: 화면별 변경 커밋 revert
- **스키마**: `admin_category` 컬럼 DROP (다른 컬럼·FK에 의존성 없음, 완전히 독립된 신규 컬럼이라 안전. 기존 `category` 컬럼은 이번 작업으로 전혀 변경되지 않으므로 별도 롤백 불필요)

### Effort Estimate

| 구성 요소 | 시간 |
|---|---|
| 마이그레이션 + 판별 함수 | 1h |
| 어드민 배지 생성·수정 API `admin_category` 경로 추가 | 1h |
| 배지 목록 필터 | 1.5h |
| 계열관리 반영 | 2h |
| 게이트미션·아이템북 반영 | 2h |
| 시뮬레이터·activity-badge-image 제외 처리 | 1.5h |
| 테스트 | 2.5h |
| **합계** | **약 11.5h** |

### Files Reference

| 파일 | 변경 |
|---|---|
| `jam-web/supabase/migrations/NNN_badges_admin_category.sql` (신규) | `admin_category` 컬럼 + CHECK 제약 + 기존 3건 UPDATE (기존 `category`·마이그레이션 113 무변경) |
| `jam-web/src/lib/admin/badge-labels.ts` | 카테고리 판별 함수·"JAM!" 라벨 상수 export |
| `jam-web/src/app/api/admin/badges/route.ts:45,112` | `admin_category` body 필드 읽어 저장(기존 `category` type==='checkin' 가드와 독립) |
| `jam-web/src/app/api/admin/badges/[id]/route.ts:86` | 동일 |
| `jam-web/src/lib/admin/badge-list-view.ts` | 카테고리 필터 쿼리 분기 |
| `jam-web/src/app/admin/badges/BadgesFilterBar.tsx` | 카테고리 필터 UI |
| `jam-web/src/app/admin/badges/page.tsx` | 필터 파라미터 연결 |
| `jam-web/src/lib/admin/badge-families-query.ts:44` | JAM! 배지 조회 시 표시값 처리 |
| `jam-web/src/app/admin/badge-families/page.tsx:131,144-146,164-168` | 종목·조건지표 칸 표시 개선 |
| `jam-web/src/app/admin/gate-missions/GateMissionManager.tsx:246` | 라벨 구분 표시 |
| `jam-web/src/app/admin/itembooks/ItemBookForm.tsx:370` | 라벨 구분 표시 |
| `jam-web/src/app/api/admin/badges/search/route.ts:44` | 카테고리 정보 포함 응답 |
| `jam-web/src/components/admin/BadgeSearchSelect.tsx:134` | 라벨 구분 표시 |
| `jam-web/src/lib/badge-engine/index.ts:1008-1021` | 시뮬레이터 후보 조회에서 `admin_category='jam'` 제외 |
| `jam-web/src/app/api/admin/.../activity-badge-image/search/route.ts:61` | 검색 후보에서 `admin_category='jam'` 제외 |

### Out of Scope

- `badge_type` enum 자체 변경 — 유저 노출 로직 회귀 위험 회피 위해 명시적으로 배제
- 기존 `category`(지점 카테고리) 컬럼·기능 변경 — 완전히 별개 컬럼이므로 무관
- 실제 레벨형·등급형 JAM! 배지 콘텐츠 제작 — 이번 티켓은 계열관리가 "정상 동작"하게만 만든다. 실제 레벨·등급 배지를 만드는 건 별도 컨텐츠 작업
- 실제 게이트미션 콘텐츠 설계 — 이번 티켓은 게이트미션 화면이 JAM! 배지를 "정상 선택 가능"하게만 만든다. 어떤 게이트 미션을 만들지는 사용자가 별도로 진행
- 배지 생성·수정·조회 화면(`BadgeForm.tsx`) 자체의 레이아웃/사용성 개선 — 사용자가 별도로 진행 (단, `admin_category` 입력 필드 자체는 이번 범위 — 레이아웃이 아니라 기능 추가)
- 유저 배지진단(`BadgeDiagnosisButton`) 반영 — 우선순위 낮음, 필요시 후속 티켓
- 팔로우 리빌 애니메이션 연동 — 별도 티켓([20260910_2056](20260910_2056_BadgeEngine_JAM카테고리-팔로우리빌애니메이션연동.md))
- 배지 트리 탭 노출, 진행률 UI — 사용자가 명시적으로 이번 범위에서 제외

### 완료 시 갱신할 문서

- `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` — `admin_category` 컬럼과 어드민 분류 체계 설명 추가(기존 `category`/지점카테고리와의 차이 명시)

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

Acceptance Criteria 10개를 전부 구현했다. `badges.admin_category TEXT` 컬럼 + 화이트리스트
CHECK(`NULL` 또는 `'jam'`) 신설, 기존 JAM! 배지 3건 UPDATE(SQL 파일만 작성, 미실행), 어드민
배지 생성(POST)·수정(PUT) API에 `admin_category` 저장 경로 추가(기존 `category`의
`type==='checkin'` 강제 null 가드와 독립적으로 항상 그대로 저장/병합). 6개 화면(배지 목록
필터·계열관리·게이트미션·아이템북·시뮬레이터·activity-badge-image) 전부 반영했고,
`BadgeForm.tsx`에 "어드민 카테고리" 입력 필드를 신규 추가했다(Out of Scope 절이 "레이아웃
개선은 제외하되 기능 추가는 포함"으로 명시했던 부분).

**구현 중 티켓 서술과 실제 코드 동작이 달랐던 지점을 발견·수정했다** — 게이트미션 화면.
티켓 원문은 "JAM! 배지가 이미 `type='activity'`라 드롭다운에 뜨고 있다"고 서술했으나, 실제로는
JAM! 배지가 활동 종목이 없어 `family_key`를 발급받지 못했고 기존
`.filter((f) => !!f.familyKey)`에 걸려 **드롭다운에 전혀 뜨지 않는 상태**였다(그대로 뒀으면
AC5 미충족). `familyKeyOf()`의 `#name:` 폴백 키가 `visibility-server.ts`의
`loadOwnedFamilyTiers`에서 이미 지원됨을 코드 추적으로 확인하고, `admin_category='jam'`
예외로 필터를 완화 + 폴백 키를 그대로 쓰도록 수정했다. `crossGate.ts`의
`normalizeGateRequirement`도 `#`-접두 키를 거부하지 않음을 확인해 저장 단계까지 안전함을
검증했다. 이 최초 스펙 조사 오류는 오케스트레이터(나)의 사전 조사 단계에서 놓친 것이다.

컬럼명은 원래 `category`로 스펙을 잡았으나, 구현 착수 직전 jam-developer가 이미 존재하는
`badges.category`(마이그레이션 113, 체크인 배지 전용 "지점 카테고리", `poi_categories` FK)와
정면 충돌한다는 걸 발견해 1차 시도를 HALT했다. 사용자 확인 후 `admin_category`로 개명해
재작업했다(아래 "주요 의사결정" 참고).

### 변경된 파일
```
jam-web/supabase/migrations/156_badges_admin_category.sql (신규, 미실행)
jam-web/src/types/database.ts
jam-web/src/types/database.generated.ts
jam-web/src/lib/admin/badge-labels.ts
jam-web/src/lib/admin/badge-list-view.ts
jam-web/src/lib/admin/badge-families.ts
jam-web/src/lib/admin/badge-families-query.ts
jam-web/src/app/api/admin/badges/route.ts
jam-web/src/app/api/admin/badges/[id]/route.ts
jam-web/src/app/api/admin/badges/search/route.ts
jam-web/src/app/api/admin/activity-badge-image/search/route.ts
jam-web/src/app/admin/badges/page.tsx
jam-web/src/app/admin/badges/BadgesFilterBar.tsx
jam-web/src/app/admin/badges/BadgeForm.tsx
jam-web/src/app/admin/badge-families/page.tsx
jam-web/src/app/admin/gate-missions/page.tsx
jam-web/src/app/admin/gate-missions/GateMissionManager.tsx
jam-web/src/components/admin/BadgeSearchSelect.tsx
jam-web/src/lib/badge-engine/index.ts
Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md
+ 신규·확장 테스트 10개 파일(badge-labels.test.ts·admin-category-candidates-contract.test.ts·
  gate-family-options-contract.test.ts·badges/search/route-contract.test.ts 등)
```

### 테스트 결과
- [x] 게이트 리뷰가 워크트리에서 직접 재실행 — `npm run lint` 0 errors/13 warnings(기존
      기준선), `tsc --noEmit` 0 errors, `npx vitest run`(범위) 84 files/1330 tests 통과
- [x] 게이트 리뷰가 프로덕션 Supabase에 read-only 쿼리로 대상 배지 3건 실제 상태 대조,
      `admin_category` 컬럼이 실제로 아직 없음(마이그레이션 미실행)도 확인
- [x] 머지 후 오케스트레이터가 2056과 통합된 상태로 전체 재검증 — `npm run lint` 0
      errors/13 warnings, `tsc --noEmit` 0 errors, `npx vitest run` 84 files/1332 tests
      전부 통과(2055+2056 병합 후 신규 테스트 포함)
- [ ] 실브라우저 6개 화면 검증 — 마이그레이션 미실행 상태라 보류. **마이그레이션 실행 후
      별도 확인 필요**(아래 "잔여 이슈")

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

`BadgeForm.tsx`의 "어드민 카테고리" 입력 필드 라벨은 어드민 내부 전용 문구라 유저 노출 대상이
아니다. 아이템북 검색 결과의 "[JAM!]" 구분 표시도 어드민 화면 전용.

### 배포 정보
- 배포일: 2026-09-10
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 진행)
- 커밋: `c7e742ba`(1차 HALT), 재작업 커밋(2차, 브랜치 `claude/jamwork-20260910_2055-admin-category`)
- DB 마이그레이션(`156_badges_admin_category.sql`)은 이 티켓 CLOSED 처리와 별도로,
  사용자 승인 후 오케스트레이터가 직접 실행

### 주요 의사결정 / 핵심 메모
- **컬럼명을 `category`에서 `admin_category`로 변경**(스펙 인터뷰 단계의 조사 누락을 구현
  단계에서 발견·정정). 기존 `category`(마이그레이션 113)는 체크인 배지 전용 "지점 카테고리"이고
  어드민 배지 생성·수정 API가 `type!=='checkin'`이면 무조건 null로 덮어쓰는 가드까지 있어,
  이름만 바꾸는 게 아니라 완전히 독립된 신규 컬럼이 필요했다.
- **게이트미션 드롭다운 노출 버그를 구현 단계에서 발견·수정**(위 "구현 내용 요약" 참고) —
  스펙 조사가 실제 필터 로직(`family_key` 부재 시 완전 제외)을 놓쳤던 지점.
- `badge-condition-guards.ts`의 `USAGE_METRIC_CONDITION_KEYS`는 의도적으로 그대로 뒀다 —
  이 배열은 "사용량 지표 + `repeat_count`" 저장 시점 충돌 검증 전용이라 `admin_category`
  판별과는 별개 용도.
- 머지 시점에 병렬로 진행 중이던 다른 세션의 gstack 제거 작업(티켓 20260910_2157)과 실제
  충돌 여부를 merge-base 대조로 확인 — 겹치는 파일(`conditionRegistry.ts`)이 있었으나 이
  review 브랜치는 그 파일을 전혀 건드리지 않아 충돌 없었다.

### 잔여 이슈
- 실브라우저 6개 화면(배지 목록·계열관리·게이트미션·아이템북·시뮬레이터·activity-badge-image)
  검증은 마이그레이션 실행 후 오케스트레이터가 별도로 진행한다.
- 유저 배지진단(`/admin/users` `BadgeDiagnosisButton`)은 티켓 범위 밖으로 뒀으나, 시뮬레이터용
  `admin_category!=='jam'` 제외 필터가 부수적으로 이 화면의 "JAM! 배지 항상 미충족" 문제도
  개선한다는 점이 구현 중 확인됐다(별도 검증·문서화는 하지 않음).

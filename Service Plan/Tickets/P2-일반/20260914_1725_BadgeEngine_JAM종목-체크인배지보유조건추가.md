---
id: 20260914_1725
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-14
closed:
---

# [BadgeEngine] 어드민 배지 생성 — JAM! 종목 "체크인 배지 보유" 조건 2종 추가

## 배경 / 문제 정의

`admin_category='jam'`("JAM! 종목") 배지는 현재 팔로워 수·팔로잉 수·일일 동기화 횟수·연속
동기화 일수 4개 지표만 조건으로 지원한다([BADGE_ENGINE_UNIFIED.md](../../Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md),
[CONDITION_JSON_SPEC.md](../../Specs/BadgeEngine/CONDITION_JSON_SPEC.md) §3). 이번 요청은
"체크인 배지(`type='checkin'`, GPS 매칭으로 발급)를 **얼마나 모았는가**"를 조건으로 삼는
새 지표 2종을 추가하는 것이다:

1. 지정된 체크인 카테고리(예: 지하철 `train_subway`, 미슐랭 `michelin`) 내에서 n개 이상 획득
2. 지정한 체크인 배지 목록 중 n개 이상 획득 (목록·임계값 모두 어드민이 지정)

신규 배지는 기존 4종과 동일하게 `type='activity'` + `admin_category='jam'` +
`activity_types=[]`로 저장한다("액티비티 > JAM!" 분류, 배지 트리 미노출·일반 목록/프로필 노출).

## 상세 요구사항

### 서비스/코드베이스 관점

**현재 상태 (조사 결과, 2026-09-14 기준)**

- `usageBadges.ts`(254줄)의 `evaluateUsageBadges(userId, metric, currentValue, client?)`는
  `UsageMetric` 유니온(38행, 파일 내 직접 선언, 현재 4종)을 받아 **모든 지표가 "숫자 하나 vs
  임계값"** 비교라고 전제한다 — 후보 조회(69행, `type='activity'` 하드코딩) → 보유 조회(89행)
  → 등급형(119~133행)/레벨형(136~156행) 순차 발급 → 섀도우밴(163~173행, rarity 있는
  등급형만) → insert+포인트+피드(175~207행). 이번 신규 2종은 **카테고리/배지목록이 배지마다
  다를 수 있어** "유저 단위로 한 번 계산한 숫자"를 모든 후보에 그대로 비교할 수 없다 — 후보
  배지 각각의 `condition_json`(예: 어떤 `category`인지, 어떤 `checkin_badge_names`인지)을
  참조해 **후보별로** 현재값을 계산해야 한다. 이 파일의 후보 필터링 로직(84~86행,
  `typeof ...==='number'` 전제) 자체를 확장해야 한다.
- `conditionRegistry.ts`에 **object 조건값 선례가 있다** — `activities_within_hours`
  (1393~1438행)가 `input:'object'`, `form.fields`로 폼 컨트롤 2개(hours/count)를 read/write
  합성한다. 이번 2종도 이 패턴을 그대로 따른다. 반면 **진짜 배열(멀티셀렉트) 선택 UI는
  없다** — `prerequisite_badge_names`(970~999행)는 `input:'text_list'`이지만 실제 컨트롤은
  `kind:'text'` 하나로, CSV 문자열을 `csv()`로 파싱한다(987~996행). `ConditionFormControl.kind`는
  `'number'|'text'|'time'|'checkbox'|'select'`로 고정돼 있어(203행) 진짜 멀티셀렉트 컴포넌트는
  신규 개발이 필요하다.
- **설계 결정**: 목록 지정 지표는 `prerequisite_badge_names`와 동일하게 **CSV 텍스트로 배지
  이름을 입력**받아 평가 시점에 이름→ID로 해석한다 (UUID를 어드민이 직접 입력하는 것보다
  이름이 직관적이고, 기존 선례를 그대로 재사용해 신규 UI 컴포넌트 개발을 피한다).
- `sync.ts`의 `user_checkin_badge_earns` insert는 813~815행(payload 801~812행), 성공 후
  824~832행에서 `userId`·`badge.id`(774행)·`poi.name`/`poi.id`·`visitCount`(790행)를 이미
  갖고 있다. 단 `LinkedBadge` 타입(731행: id/type/name/image_url/rarity)에 **category가
  없어** select 필드에 추가해야 훅에서 카테고리를 넘길 수 있다.
- 카테고리는 "effective category" 정의가 이미 존재한다 — `badges.category`(어드민 직접
  지정, 마이그레이션 113)를 우선하고 없으면 연결된 `poi.category`로 폴백
  (`admin/badges/page.tsx` 91~145행, `effectiveCategory`). 신규 지표의 카테고리 판정도 이
  정의를 그대로 따른다.
- `poi_categories` select 옵션 조회는 이미 어드민에 있다(`admin/badges/page.tsx:251`,
  `BadgesFilterBar.tsx` 188~200행) — 재사용 가능.
- `badge-condition-guards.ts`의 `USAGE_METRIC_CONDITION_KEYS`(95~100행, 레지스트리와 별개로
  이 파일에 직접 하드코딩)에 신규 2종을 추가해야 `findUsageMetricRepeatConflictError`
  (110~118행)·`findUsageMetricOtherMeasurableConflictError`(134~150행) 두 가드가 즉시
  적용된다 — 빠뜨리면 신규 지표가 `repeat_count`/다른 measurable 필드와 조합돼도 저장이
  막히지 않는다(선례 티켓 20260910_1804의 사고 재발 방지).

**제안 변경**

1. **조건 필드 2종 신설** (`condition_json`, `role: 'meta'`, `evaluation: 'external'`,
   `input: 'object'` — `activities_within_hours` 패턴)
   ```jsonc
   { "checkin_category_count": { "category": "train_subway", "count": 5 } }
   // 지하철 카테고리 체크인 배지 5개 이상

   { "checkin_badge_count": { "checkin_badge_names": ["성수역", "왕십리역", "건대입구역"], "count": 2 } }
   // 지정한 3개 배지 중 2개 이상
   ```
2. **`usageBadges.ts` 확장** — `UsageMetric` 유니온에 2종 추가. 기존 "userId당 숫자 하나"
   전제를 깨는 만큼, 후보 배지마다 자기 `condition_json`을 참조해 현재값을 계산하는 별도
   경로를 추가한다(기존 4종의 "호출부에서 미리 계산한 currentValue 비교" 경로는 그대로 두고
   분기). 카테고리 현재값 = `user_checkin_badge_earns` × `badges`(effective category 기준)
   distinct count, 목록 현재값 = `user_checkin_badge_earns` × 지정 이름 리스트 매칭 count.
3. **트리거 연결** — `sync.ts`의 `user_checkin_badge_earns` insert 성공(824행 부근) 직후,
   해당 체크인 배지의 effective category로 `checkin_category_count` 평가 + 전체 카테고리
   무관하게 `checkin_badge_count` 평가(어떤 배지든 목록에 포함될 수 있으므로). `LinkedBadge`
   타입에 `category` 필드 추가.
4. **어드민 폼** — `conditionFormFields.ts`에 상태 필드 추가, 레지스트리 `form` 선언만으로
   기존 "사용량 지표" 그룹에 자동 렌더(선행 티켓들과 동일 — `BadgeConditionSection.tsx` 수정
   불필요할 가능성이 높음). `checkin_category_count`는 select(카테고리) + number(개수) 2칸,
   `checkin_badge_count`는 text(CSV, 배지 이름) + number(개수) 2칸.
5. **저장 시점 가드** — `USAGE_METRIC_CONDITION_KEYS`에 2종 추가.
6. DB: `condition_json` CHECK 제약 화이트리스트에 2개 키 추가하는 마이그레이션 작성
   (실행은 사용자 승인 후 오케스트레이터).

### 컨텐츠 관점

해당 없음 — 실제 배지 콘텐츠(이름·이미지·임계값)는 이번 범위 밖.

## 구현 계획

### Acceptance Criteria

1. 어드민에서 `checkin_category_count` 조건(카테고리 select + 개수)을 가진 배지를 등급형·
   레벨형 둘 다로 생성할 수 있다.
2. 어드민에서 `checkin_badge_count` 조건(CSV 배지 이름 + 개수)을 가진 배지를 등급형·레벨형
   둘 다로 생성할 수 있다.
3. 체크인 배지 발급(GPS 매칭) 직후, 해당 유저가 지정 카테고리 내 보유 개수 ≥ 조건값이 되는
   순간 `checkin_category_count` 배지가 즉시 발급된다.
4. 같은 시점, 지정 목록 중 보유 개수 ≥ 조건값이 되는 순간 `checkin_badge_count` 배지가
   발급된다.
5. `checkin_badge_count`의 배지 이름 목록에 존재하지 않는 이름이 있으면 저장 시점에
   거부되거나(우선) 평가 시점에 해당 이름만 무시하고 나머지로 판정한다(구현 중 택1, 저장
   시점 검증을 우선한다).
6. 등급형은 이름 그룹 내 최상위 tier 1개만, 레벨형은 `family_key` 내 보유레벨+1부터
   연속으로 발급되며 기존 4종과 동일한 규칙을 따른다.
7. 섀도우밴 레벨이 높은 유저는 rarity가 있는(등급형) 신규 배지 발급이 차단된다.
8. 이 조건들을 가진 배지는 `activity_types`가 빈 배열이면 `/badges/tree`에 노출되지 않고,
   `/badges`(일반 목록)·프로필 화면에는 정상 노출된다.
9. 신규 2종이 `repeat_count` 또는 다른 measurable 필드(예: `distance_km`)와 함께 저장되면
   거부된다(`USAGE_METRIC_CONDITION_KEYS` 가드 적용 확인).
10. `condition_json`에 이 2개 키 외의 미등록 키는 여전히 CHECK 제약으로 거부된다.
11. 체크인 배지 발급 흐름에서 신규 평가 로직이 예외를 던져도 체크인 배지 자체의 발급과
    동기화 API 응답은 정상 처리된다(격리).
12. 배지 이름이 동명이인처럼 여러 배지와 겹치는 경우, §2.8의 "이름은 유일 식별자가 아니다"
    제약을 인지하고 판정 대상을 명확히 정의한다(예: `type='checkin'`인 배지로 한정).

### 테스트 계획

| 레이어 | 내용 | 개수 |
|---|---|---|
| Unit | 카테고리 지표 현재값 계산(effective category 포함) | +3 |
| Unit | 목록 지표 현재값 계산(이름→ID 해석, 존재하지 않는 이름 처리) | +3 |
| Unit | 등급형/레벨형 순차 발급, 섀도우밴 차단(신규 2종 재사용 확인) | +4 |
| Unit | `badge-condition-guards.ts` 신규 2종 × repeat_count/measurable 충돌 | +4 |
| Integration | 체크인 발급(sync.ts) → 카테고리/목록 조건 배지 발급 확인 | +2 |
| Integration | CHECK 제약이 신규 키를 허용하고 미등록 키는 거부하는지 | +1 |

### 롤백 계획

문제 발생 시 이 기능 개발 전 상태로 완전히 되돌린다.
- **코드**: `sync.ts` 훅, `usageBadges.ts` 확장, 어드민 폼 필드, 가드 관련 커밋 revert
- **스키마**: CHECK 제약을 이전 키 목록으로 되돌리는 역방향 마이그레이션
- **데이터**: 신규 조건 2종을 가진 배지 ID 기준으로 해당 배지들의 `user_activity_badges`
  발급 이력만 식별해 삭제

### Effort Estimate

| 구성 요소 | 시간 |
|---|---|
| 조건 레지스트리 2종 등록(object 필드) | 1h |
| `usageBadges.ts` 후보별 현재값 계산 경로 확장 | 3~4h |
| `sync.ts` 훅 연결(category select 추가 포함) | 1.5h |
| 저장 시점 가드 확장 | 0.5h |
| 어드민 폼 확장(select+number, CSV+number) | 1.5h |
| CHECK 제약 마이그레이션 작성 | 0.5h |
| 유닛·통합 테스트 | 3h |
| 문서 갱신 | 1h |
| **합계** | **약 12.5~13h** |

### Files Reference

| 파일 | 변경 |
|---|---|
| `jam-web/src/lib/badge-engine/usageBadges.ts` | `UsageMetric` 2종 추가, 후보별 현재값 계산 경로 신설 |
| `jam-web/src/lib/badge-engine/conditionRegistry.ts` | 조건 필드 2종 등록(`input:'object'`) |
| `jam-web/src/lib/strava/sync.ts` | 체크인 insert 직후 평가 훅, `LinkedBadge`에 `category` 추가 |
| `jam-web/src/lib/admin/badge-condition-guards.ts` | `USAGE_METRIC_CONDITION_KEYS`에 2종 추가 |
| `jam-web/src/app/admin/badges/conditionFormFields.ts` | 폼 필드 4개(카테고리/개수 × 2, 이름목록/개수) 추가 |
| `jam-web/supabase/migrations/NNN_condition_json_checkin_keys.sql` | CHECK 제약 확장 (신규, 미실행) |
| `Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md` | §3에 2종 추가 |
| `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` | 서비스 사용량 배지 평가 경로 설명 갱신 |

### Out of Scope

- 실제 배지 콘텐츠(이름·이미지·임계값·등급 구성) — 사용자가 어드민에서 직접 생성
- 진짜 멀티셀렉트 UI 컴포넌트 개발 — CSV 텍스트 입력으로 대체
- 이미 발급된 배지의 회수·재평가(체크인 배지 취소·삭제 시나리오는 범위 밖)
- 이번 2개 지표 외의 체크인 관련 추가 지표 확장

### 완료 시 갱신할 문서

- `Service Plan/Specs/BadgeEngine/CONDITION_JSON_SPEC.md` — §3 신규 2종 추가
- `Service Plan/Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` — 서비스 사용량 배지 평가 경로에
  체크인 지표 추가 설명

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 목록 지정 지표는 UUID가 아니라 배지 이름(CSV)로 입력받는다 — `prerequisite_badge_names`
> 선례 재사용, 신규 멀티셀렉트 UI 개발 회피. "지정한 n개 중 획득 개수"는 `count` 필드로
> 명시적으로 분리해, 목록 전체 필수(count=목록 길이)와 부분 충족(count<목록 길이) 둘 다
> 지원한다.

### 잔여 이슈
-

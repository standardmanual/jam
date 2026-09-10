---
id: 20260910_1557
category: BadgeEngine
priority: P1
status: OPEN
created: 2026-09-10
closed:
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
> `/spec`으로 3라운드 인터뷰를 거쳐 확정한 스펙. 주요 결정: `badge_type` enum에는 손대지
> 않고 `type='activity'` + `activity_types=[]`로 저장(배지 트리 미노출, 일반 목록/프로필엔
> 노출). 조건 평가는 badge-engine 안이 아니라 `mission_reward`와 동일한
> `evaluation: 'external'` 패턴으로 분리. 등급형/레벨형 순차 발급 규칙은 기존 §Step 3-A/3-B
> 정책을 그대로 재사용. 언팔로우는 회수·재평가 모두 하지 않음. 실패는 원본 API 응답에
> 영향 주지 않도록 격리.

### 잔여 이슈
-

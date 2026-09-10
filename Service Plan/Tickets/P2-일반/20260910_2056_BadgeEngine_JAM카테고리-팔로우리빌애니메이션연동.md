---
id: 20260910_2056
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-10
---

# [BadgeEngine] JAM! 카테고리 — 팔로우 획득 시 배지 리빌 애니메이션 연동

## 배경 / 문제 정의

티켓 [20260910_1557](20260910_1557_BadgeEngine_JAM카테고리-서비스사용량-배지엔진-신설.md)은
"팔로우 획득 시 프론트 리빌 애니메이션 연동"을 명시적으로 Out of Scope로 뺐다 — 단, 응답
필드(`earnedBadges`) 자체는 이미 만들어뒀다. 이번 티켓은 그 응답을 실제로 화면에 연결한다.

## 상세 요구사항

### 서비스/코드베이스 관점

**현재 상태 (조사 결과, 2026-09-10 기준)**

- 리빌 애니메이션 컴포넌트는 이미 존재한다 — `BadgeRevealOverlay`
  ([BadgeRevealOverlay.tsx:73-153](../../../jam-web/src/components/BadgeRevealOverlay.tsx)),
  MODULAR `BadgeRevealCarousel`의 서비스 래퍼. props는
  `open, loading?, items: RevealBadge[], moreCount?, profileHref, onClose`이고, `RevealBadge`
  타입(`:32-50`)은 `id/name/description/imageUrl?/rarity?/level?/earnCount?`다.
- `POST /api/follows`는 이미 `earnedBadges`를 응답에 포함한다
  ([follows/route.ts:106](../../../jam-web/src/app/api/follows/route.ts)). 타입은
  `EarnedBadgeSummary[]`([sync.ts:68-93](../../../jam-web/src/lib/strava/sync.ts))로
  `RevealBadge`가 요구하는 필드를 전부 포함해 **구조적으로 그대로 호환**된다.
- 단, `SyncButton.tsx`가 쓰는 `earnedBadgesMore`/`isFirstBadgeEver`
  ([follows/route.ts:89-90](../../../jam-web/src/app/api/follows/route.ts))는 현재
  응답에 실리지 않는다 — 완전히 동등한 계약은 아니다.
- `FollowButton.tsx`
  ([[username]/FollowButton.tsx:16-28](../../../jam-web/src/app/(main)/%5Busername%5D/FollowButton.tsx))의
  `toggle()`은 `fetch()` 결과를 변수에 담지도, `.json()`도 호출하지 않는다 — 응답 바디를
  전혀 읽지 않는 상태다.
- `SyncButton.tsx`(`:34-119`)가 이미 동일한 리빌 패턴을 쓰고 있어 그대로 이식 가능하다.

**제안 변경**

1. `follows/route.ts`의 POST 응답에 `earnedBadgesMore`·`isFirstBadgeEver`를 `SyncButton`과
   동일하게 포함시켜 계약을 완전히 맞춘다(`buildEarnedBadgePayload`가 이미 계산해두고 응답에서
   빠뜨린 값이므로 diff가 작다).
2. `FollowButton.tsx`의 `toggle()`이 응답을 `.json()`으로 파싱하고, `earnedBadges`가 있으면
   `BadgeRevealOverlay`를 `SyncButton.tsx` 패턴 그대로 렌더한다.
3. 리빌 대상은 **팔로우한 사람 본인**이 획득한 배지만이다(티켓 1557 설계 — 팔로우당한 사람의
   획득 정보는 응답에 없음, 그대로 유지).

### 구현 계획

`SyncButton.tsx`의 리빌 상태관리·렌더 로직을 `FollowButton.tsx`로 이식한다. 신규 컴포넌트
설계는 필요 없다 — 기존 컴포넌트 재사용.

### Acceptance Criteria

1. 팔로우 API 호출로 `earnedBadges`가 1개 이상 응답되면, `FollowButton.tsx`가
   `BadgeRevealOverlay`를 연다.
2. 리빌 오버레이에 표시되는 배지 이름·설명·이미지·등급이 실제 발급된 배지와 정확히 일치한다.
3. `earnedBadges`가 빈 배열이면 리빌 오버레이가 뜨지 않고 팔로우 버튼 상태만 정상 갱신된다.
4. `earnedBadgesMore`/`isFirstBadgeEver`가 `SyncButton`과 동일한 규칙으로 `follows` 응답에
   포함된다.
5. 오버레이를 닫으면 팔로우 버튼 상태(팔로잉 중 표시 등)에 영향이 없다.
6. 언팔로우 동작에는 영향이 없다(배지 평가·리빌 모두 언팔로우와 무관 — 티켓 1557 설계 유지).

### 테스트 계획

| 레이어 | 내용 | 개수 |
|---|---|---|
| Unit | `follows` 응답의 `earnedBadgesMore`/`isFirstBadgeEver` 계산 | +2 |
| Integration | 팔로우 → 배지 획득 → 리빌 오버레이 표시 (컴포넌트 테스트) | +2 |
| E2E/수동 | 실브라우저로 팔로우 → 리빌 노출 확인 | - |

### 롤백 계획

`FollowButton.tsx`·`follows/route.ts` 변경 커밋 revert. 응답 필드 추가만이라 하위 호환 깨지지 않음.

### Effort Estimate

| 구성 요소 | 시간 |
|---|---|
| `follows/route.ts` 응답 필드 보강 | 0.5h |
| `FollowButton.tsx` 리빌 연동 | 1.5h |
| 테스트 | 1h |
| **합계** | **약 3h** |

### Files Reference

| 파일 | 변경 |
|---|---|
| `jam-web/src/app/api/follows/route.ts` | 응답에 `earnedBadgesMore`·`isFirstBadgeEver` 추가 |
| `jam-web/src/app/(main)/[username]/FollowButton.tsx` | 응답 파싱 + `BadgeRevealOverlay` 연동 |

### Out of Scope

- 배지 트리 탭 노출, 진행률 UI — 사용자가 명시적으로 이번 범위에서 제외
- 팔로우당한 사람에게 리빌을 보여주는 것 — 티켓 1557 설계 그대로(응답에 그 정보 자체가 없음)

### 완료 시 갱신할 문서

- 없음(기존 설계 문서의 "Out of Scope" 항목이 이번 구현으로 해소되는 것뿐, 새 정책 추가 아님)

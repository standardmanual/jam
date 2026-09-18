---
id: 20260910_2056
category: BadgeEngine
priority: P2
status: CLOSED
created: 2026-09-10
closed: 2026-09-10
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

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

Acceptance Criteria 6개를 전부 구현했다. `follows/route.ts` 응답에 `buildEarnedBadgePayload`가
이미 계산해두고도 빠뜨리고 있던 `earnedBadgesMore`·`isFirstBadgeEver`를 추가해
`/api/strava/sync`(SyncButton)와 완전히 동일한 계약으로 맞췄다. `FollowButton.tsx`의
`toggle()`이 POST 응답을 `.json()`으로 파싱해 `earnedBadges.length > 0`이면
`BadgeRevealOverlay`를 연다 — `SyncButton.tsx`의 상태관리·렌더 패턴을 그대로 이식했다.
`profileHref`는 팔로우한 사람 본인(로그인 유저)의 배지이므로 `targetUserId`가 아니라 항상
`/profile`로 고정했다. 언팔로우(DELETE) 분기는 전혀 손대지 않았다. GA4 분석 이벤트
(`first_badge_earned`)는 티켓 AC·구현 계획 어디에도 요구가 없어 이식하지 않았다.

### 변경된 파일
```
jam-web/src/app/api/follows/route.ts
jam-web/src/app/(main)/[username]/FollowButton.tsx
jam-web/src/app/api/follows/__tests__/route.test.ts (신규 2건)
```

### 테스트 결과
- [x] 게이트 리뷰가 워크트리에서 직접 재실행 — `npm run lint` 0 errors/13 warnings(기존
      기준선), `tsc --noEmit` 0 errors, `npx vitest run` 80 files/1314 tests 전부 통과
- [x] 머지 후 오케스트레이터가 2055와 통합된 상태로 전체 재검증 — `npm run lint` 0
      errors/13 warnings, `tsc --noEmit` 0 errors, `npx vitest run` 84 files/1332 tests
      전부 통과
- [ ] 실브라우저 E2E는 수행하지 않음 — 워크트리 구조적 제약(`next dev` 미동작)과 staging
      미병합 당시 제약. 병합 완료 후에도 워크트리 환경이라 여전히 실렌더는 메인 트리에서
      staging pull 후 확인 필요(잔여 이슈 참고)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

리빌 오버레이가 표시하는 배지 이름·설명은 기존 배지 데이터 그대로이며 이번 변경으로 새로
추가된 사용자 노출 문구는 없다(순수 프론트 배선).

### 배포 정보
- 배포일: 2026-09-10
- 환경: staging (프로덕션 승격은 `/jam-ship`으로 별도 진행)
- 커밋: 브랜치 `claude/jamwork-20260910_2056-follow-reveal`(커밋 `f33ecf09`)

### 주요 의사결정 / 핵심 메모
- 게이트 리뷰(PASS)·개선 리뷰·인터페이스 리뷰(MEDIUM 1건) 모두 완료. 개선 리뷰·인터페이스
  리뷰가 짚은 범위 밖 발견물 2건은 규칙대로 자동 티켓화했다 — 아래 "잔여 이슈" 참고.
- `router.refresh()` 미호출(개선 리뷰 제안) — `SyncButton`과 달리 `FollowButton`이 쓰이는
  두 화면(팔로워/팔로잉 목록)엔 갱신할 서버 파생 데이터가 딱히 없어 이번엔 반영하지 않았다.

### 잔여 이슈
- [20260910_2132](../P2-일반/20260910_2132_UI_팔로우리빌-프로필화면2곳미연동.md) — 프로필
  화면의 팔로우 버튼 2곳(`handleFollow`·`handleListFollow`)에 리빌 미연동 (P2)
- [20260910_2133](../P2-일반/20260910_2133_UI_배지리빌오버레이-목록중첩가능성.md) — 목록
  페이지에서 오버레이 다중 인스턴스 동시 노출 가능성, 인터페이스 리뷰 MEDIUM (P2)
- `GA4_EVENTS.md`의 "알려진 계측 공백" 절에 팔로우 경로 미기재 — 개선 리뷰 제안, 급하지
  않아 별도 티켓화하지 않음(다음에 그 문서를 만질 기회에 반영)

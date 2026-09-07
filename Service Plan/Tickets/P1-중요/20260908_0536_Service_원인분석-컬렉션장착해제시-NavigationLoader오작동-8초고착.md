---
id: 20260908_0536
category: Service
priority: P1
status: CLOSED
created: 2026-09-08
closed: 2026-09-08
---

# [Service] 원인분석 — 컬렉션 장착/해제 시 NavigationLoader 오작동으로 최대 8초 고착

## 배경 / 문제 정의
20260908_0529(eye loader 과다 노출) 조사에 이어, "컬렉션에 추가/제거할 때도 빈번하게
노출된다"는 추가 제보를 확인. 조사 결과 **같은 원인(디바운스 없음)이 아니라 별도의
더 심각한 버그**로 확인됨.

## 상세 요구사항

### 서비스/코드베이스 관점
- 컬렉션(아이템북) 슬롯 장착/해제 버튼 클릭 시 전체화면 eye loader가 뜨는 경로 추적
- `NavigationLoader`의 클릭 감지 로직과의 상호작용 확인

## 구현 계획
해당 없음 (조사 전용, 코드 변경 없음)

---
## 완료 기록

### 구현 내용 요약
코드 변경 없음. 원인 조사만 수행.

### 변경된 파일
```
- (없음)
```

### 주요 의사결정 / 핵심 메모

**근본 원인 — capture 단계 이벤트 순서 문제로 NavigationLoader가 오작동한다.**

[`SlotGrid.tsx`](../../../jam-web/src/app/(main)/collections/[id]/SlotGrid.tsx)의 장착/해제
버튼은 `BadgeGridCard`(`href` 지정 시 `next/link`의 `<Link>`로 렌더링됨) **안에 중첩된
`<button>`**이다. 버튼 자신의 `onClick`에서 `e.preventDefault(); e.stopPropagation()`으로
실제 이동을 막고 있지만:

1. [`NavigationLoader.tsx:76`](../../../jam-web/src/components/NavigationLoader.tsx)이
   `document.addEventListener('click', handleClick, true)` — **capture 단계**로 등록돼
   있다. capture는 이벤트가 target까지 내려가기 **전에** document에서 먼저 실행되므로,
   버튼 자신의(bubble 단계) `stopPropagation()`이 실행되기도 전에 이미 발동한다.
2. `handleClick`은 `e.target.closest('a[href]')`로 조상 앵커를 찾는다 — 버튼이 `<Link>`
   안에 있으므로 그대로 잡힌다. 실제로 이동할 링크인지, 버튼이 막을 클릭인지 구분하지
   않는다.
3. 그 결과 `phase('pending')` → 1초(`SHOW_DELAY_MS`) 뒤 `phase('showing')`으로 전체화면
   eye loader가 뜬다.
4. 문제는 여기서부터다 — **버튼의 `preventDefault()`가 실제 페이지 이동을 막았기 때문에
   URL(pathname/searchParams)이 전혀 바뀌지 않는다.** NavigationLoader가 로더를 숨기는
   유일한 정상 경로는 `[pathname, searchParams]`가 바뀔 때 도는 `useEffect`뿐인데, 이
   조건이 영원히 충족되지 않는다.
5. 따라서 로더는 **`MAX_VISIBLE_MS = 8000`(8초) 강제 숨김 타이머가 돌 때까지 화면을
   가린다** — 장착/해제 자체는 1초도 안 걸려 끝나지만(`router.refresh()`만 호출), 사용자는
   최대 8초간 전체화면 로더에 갇힌다.

**같은 패턴이 다른 곳에도 있다** — `href`가 있는 카드/링크 안에 `stopPropagation`으로
동작을 가로채는 버튼을 넣는 구조는 이 프로젝트에 최소 한 곳 더 있다:
[`ProfileClient.tsx:444`](../../../jam-web/src/app/(main)/profile/ProfileClient.tsx)의
팔로우/언팔로우 버튼. 동일한 8초 고착이 발생할 가능성이 높다(이번 조사에서 실제 렌더
확인은 하지 않음 — 코드 구조만 대조).

**20260908_0529와의 관계**: 그 티켓의 "디바운스 없음" 진단은 `MissionStatusClient`·
`BadgeShareButton`·`StravaConnectReveal`에는 유효하지만, 이번 컬렉션 케이스는 디바운스
유무의 문제가 아니라 **엉뚱한 로더(페이지 전환용)가 잘못된 트리거로 뜬 뒤 되돌아올
방법이 없어 고착되는** 별개의 버그다. 오히려 SlotGrid 자체의 "장착 요청 중" 표시는
이미 잘 설계돼 있다(`pendingBadgeId`로 버튼에 "…" 표시, 시트 안에 "처리 중" 캡션) —
NavigationLoader가 그 위에 **불필요하게 덧씌워지는** 것이 문제다.

### 전수 조사 (2026-09-08 추가 — "이전 조사에서 놓쳤다"는 지적에 따른 재조사)

20260908_0529는 `WanderingEyesLoader` **사용처만** 훑어서 이 버그(엉뚱한 트리거로 뜬 뒤
고착되는 문제)를 놓쳤다. 이번엔 두 축으로 전수 조사했다.

**A) `WanderingEyesLoader` 사용처 (5곳, 전부 20260908_0529에서 확인됨)** —
`NavigationLoader.tsx`(전환용, 디바운스 있음) · `MissionStatusClient.tsx` ·
`BadgeShareButton.tsx` · `BadgeRevealOverlay.tsx`(호출부: `StravaConnectReveal.tsx`,
`SyncButton.tsx`) — 추가로 발견된 곳 없음.

**B) NavigationLoader 오작동 트리거 패턴(`href` 카드 안에 `preventDefault`/`stopPropagation`
버튼을 중첩) — `preventDefault`/`stopPropagation`을 쓰는 전체 지점을 grep해 대조**

| 위치 | 구조 | 판정 |
|---|---|---|
| `SlotGrid.tsx:276` (해제 버튼) | `BadgeGridCard(href=...)` 안에 중첩 | **버그 재현** |
| `SlotGrid.tsx:288` (장착 버튼) | `BadgeGridCard(href=...)` 안에 중첩 | **버그 재현** |
| `ProfileClient.tsx:444` (팔로우 버튼) | `ListRowCard(href=...)`의 `trailing`에 중첩 | **버그 재현 — 이번에 코드로 확정**(이전엔 "가능성"으로만 추정) |
| 어드민 `*ActiveToggleButton.tsx` 3종 | 테이블 별도 셀(다른 `<td>`) — `Link`와 중첩 아님 | 해당 없음 |
| `UserSearchBar.tsx`, 어드민 폼 6곳, `sidebar.tsx` | 폼 submit/keydown/사이드바 토글 — 앵커 클릭과 무관 | 해당 없음 |

`BadgeGridCard`·`ListRowCard`를 `href`와 함께 쓰면서 내부에 클릭 가능한 자식(버튼)을
넣는 **모든** 지점이 이 버그의 후보다. 현재 코드베이스에는 위 2개 컴포넌트, 3개 호출
지점(`SlotGrid` 2곳 + `ProfileClient` 1곳)이 전부이며, 다른 카드형 컴포넌트
(`CollectionGridCard`·`InventoryGrid`의 `BadgeGridCard` 호출 등)는 `href`와 인터랙티브
자식을 동시에 쓰지 않아 해당하지 않는다.

**참고 — 범위 밖**: `Skeleton` 로더(`InventoryItemHistorySheet.tsx`, `ProfileClient.tsx`
등 2곳)는 이번 제보(eye loader)와 다른 시각적 패턴이라 이번 조사에서 제외했다. 필요하면
별도로 점검할 것.

### 잔여 이슈
- 개선 방향 후보(이번 조사 범위 밖, 별도 티켓 필요):
  1. `NavigationLoader`의 클릭 리스너를 capture 대신 bubble 단계로 등록 — 자식 버튼의
     `stopPropagation()`이 먼저 먹히게 함 (가장 근본적인 수정)
  2. 클릭 핸들러에서 `e.defaultPrevented`를 클릭 직후 확인해, 이미 막힌 이동이면
     `pending` 진입 자체를 취소
  3. `href` 카드 안에 동작 버튼을 중첩하는 패턴 자체를 재검토 — `<Link>` 안에 `<button>`을
     넣는 건 HTML 시맨틱상으로도 유효하지 않다(중첩 인터랙티브 요소)
  4. 수정 시 `SlotGrid.tsx`(장착/해제 2곳)와 `ProfileClient.tsx`(팔로우 1곳) 세 지점 모두
     함께 검증

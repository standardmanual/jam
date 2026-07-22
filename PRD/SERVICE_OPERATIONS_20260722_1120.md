# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 11:20)

> **이 버전의 변경 내용:** 피드가 배지 정보(이미지·이름·등급) 변경사항을 반영하지 못하던 구조적 문제를 근본 해결 — 렌더링 시점에 badge_id로 최신 정보를 다시 조인하는 리프레시 레이어 추가  
> 이전 버전: SERVICE_OPERATIONS_20260722_1114.md

---

## [근본 수정] 피드 배지 정보 스냅샷 문제 (`src/lib/activity-feed/hydrate.ts`)

### 반복되던 증상의 진짜 원인

배지 이미지 일괄 재배정(036/037) 이후에도 **피드에 노출되는 배지 이미지·바텀시트 이미지가 계속 404**로 남는 문제가 보고됐다. 조사 결과, 개별 버그가 아니라 피드 시스템의 설계 자체에서 반복적으로 발생하는 구조적 문제였다:

- `recordFeedEvent` 호출부 3곳(`badge-engine/index.ts`, `drop-engine/index.ts`, `drops/[dropId]/pickup/route.ts`)이 이벤트 기록 시점에 `badge_name`·`badge_image_url`·`rarity`를 **`user_activity_feed.metadata`에 스냅샷으로 그대로 저장**한다.
- 이후 배지의 이름·이미지·등급을 어떻게 고쳐도(이번 건은 이미지 일괄 재배정), 이미 기록된 과거 피드 항목은 그 스냅샷을 계속 보여준다 — DB의 `badges.image_url`은 최신인데 `user_activity_feed.metadata.badge_image_url`은 옛날 값(과거엔 NULL)인 채로 남아있던 것.
- **"항상 FEED만 개선사항이 반영 안 된다"**는 패턴은 우연이 아니라, 다른 화면(배지 목록·인벤토리 등)은 매번 `badges` 테이블을 실시간 조인해서 보여주는 반면 피드만 유일하게 기록 시점 스냅샷을 쓰기 때문이었다.

### 수정: 읽기 시점 리프레시

`badge_id`는 절대 바뀌지 않는 안정적인 키라는 점을 이용해, 피드를 렌더링하기 직전에 `badge_id`로 `badges`를 다시 조회해 `name`/`image_url`/`rarity`를 항상 최신값으로 덮어쓰는 레이어를 추가했다.

- 신규: `src/lib/activity-feed/hydrate.ts` — `hydrateFeedBadgeInfo(items)`
- 적용: `src/app/(main)/page.tsx`(홈 피드), `src/app/(main)/[username]/page.tsx`(프로필 피드) — `feedItems` 조회 직후 호출
- 효과: **앞으로 배지 이름·이미지·등급을 어떻게 수정하든, 별도 백필 마이그레이션 없이 다음 페이지 로드부터 모든 과거 피드에 자동 반영**된다.

### 운영 유의사항

- 이번 수정은 코드 배포만으로 즉시 적용 — 037 마이그레이션과 별개로, DB 재적용 불필요.
- "레거시 합성" 피드 항목(`inventory_items`/`poi_drops`를 직접 조인해 만든 항목)은 원래도 매번 실시간 조인이라 이 문제가 없었음 — 이번 수정은 `user_activity_feed`에 실제로 기록된 이벤트에만 적용됨.
- 향후 새로운 이벤트 타입을 추가하면서 배지 관련 필드를 metadata에 스냅샷으로 넣는 경우, `hydrate.ts`의 `BADGE_METADATA_EVENTS` 집합에 추가해야 동일하게 리프레시된다.

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_1114.md)과 동일.

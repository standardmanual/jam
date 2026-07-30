# JAM! 서비스 운영 문서 — 변경분 (2026-07-26 11:17)

> **이 버전의 변경 내용:** 투데이(홈) 화면에서 Feed 섹션 제거.
> 이전 버전: SERVICE_OPERATIONS_20260726_1101.md

---

## 투데이 화면 Feed 섹션 제거

**관련 파일:** `src/app/(main)/page.tsx`(수정), `src/app/(main)/HomeFeedSection.tsx`(삭제)

- 투데이(홈) 최하단에 있던 통합 활동 피드(`HomeFeedSection`) 섹션을 제거.
- 피드 전용으로만 쓰이던 대량의 데이터 조회/병합 로직(`user_activity_feed` + 레거시 5종 소스 병합, `hydrateFeedBadgeInfo` 호출 등, 약 130줄)도 함께 제거 — 더 이상 쓰는 곳이 없어 홈 진입 시 불필요한 쿼리 부하만 유발했음.
- `HomeFeedSection.tsx`는 `FeedSection.tsx`(공용 컴포넌트)의 얇은 래퍼였고 홈에서만 쓰였으므로 파일 자체 삭제. 프로필 화면의 피드(`ProfileClient.tsx` → `FeedSection.tsx`)는 이번 변경과 무관하게 그대로 유지.
- 홈 화면 구성은 이제: 헤더 → Strava 상태 → 유저검색 → 투데이 카드 스택 → 최근 배지 → 바로가기, 순서로 종료.

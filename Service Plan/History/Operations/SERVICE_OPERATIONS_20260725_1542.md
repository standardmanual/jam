# JAM! 서비스 운영 문서 — 변경분 (2026-07-25 15:42)

> **이 버전의 변경 내용:** 홈/프로필 Feed 섹션 UI 통합(공용 컴포넌트화) + 첫 로딩 20개 제한/"더 불러오기" 페이지네이션 추가.
> 이전 버전: SERVICE_OPERATIONS_20260725_1528.md

---

## 9-5. Feed 섹션 통합 + 페이지네이션 (신규)

**관련 파일:** `src/app/(main)/FeedSection.tsx`(신규, 공용), `src/app/(main)/HomeFeedSection.tsx`, `src/app/(main)/profile/ProfileClient.tsx`

- 기존에는 홈(`HomeFeedSection.tsx`)과 프로필(`ProfileClient.tsx`)이 거의 동일한 Feed UI(필터탭/카드/상세시트)를 각자 중복 구현하고 있었음. 두 화면의 구성이 서로 조금씩 달랐음(홈은 3탭, 프로필은 4탭 등).
- `FeedSection.tsx` 공용 컴포넌트로 통합. 필터탭은 프로필 기준 4종(전체/아이템/미션/배지)으로 통일, 배지 카드 표시 로직(마지막 파편 배지, 세계관 이름 등)과 상세시트 표시 항목(포인트 지급 등)도 두 화면 기능의 합집합으로 병합.
- 배지 상세 링크는 `badgeLinkQuery` prop으로 화면별로 다르게 구성 (홈: 쿼리 없음, 프로필: `?u={username}`).
- `ProfileClient.tsx`의 배지 갤러리 탭은 `FeedSection`이 export하는 `DetailSheet`를 그대로 재사용(중복 제거), 자체 `selectedItem` 상태는 유지.
- 데이터는 기존과 동일하게 서버에서 최대 200개까지 한 번에 조회(`allFeedItems.slice(0, 200)` 등, 변경 없음). 페이지네이션은 서버 재조회 없이 클라이언트에서 처리:
  - 초기 노출 20개(`PAGE_SIZE`), 필터 탭 전환 시 20개로 리셋
  - 하단 "더 불러오기" 버튼 클릭마다 20개씩 추가 노출 (`visibleCount` state)

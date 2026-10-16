---
id: "20261016_1211"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2133"
---

# [UI] 카드 면 레시피(bg-surface border border-border rounded-2xl) 복제를 정리한다

## 핵심 요약

- 요구사항: 카드 면 레시피가 Tailwind 클래스 문자열로 13곳 이상 복제돼 있다. `BadgeGridCard`, `CollectionGridCard`, `ListRowCard`, `BadgeTrophyGridCard`, `InventoryGrid` 빈 슬롯, 히어로 카드 2곳, 작은 안내 박스 6곳(`inventory/page.tsx:93`, `SlotGrid.tsx:357`, `ItemCandidateSheet.tsx:82`, `MissionDetailClient.tsx` 상황 보기 행, `(legal)` DefCard 2곳)이다. 안내 박스 6곳은 안쪽 여백이 24px이 아니라서 `Card`를 못 썼다. 다음에 면 값을 바꿀 때 이번처럼 여러 파일을 다시 고쳐야 한다.
- 구현 계획: `Card`에 `style={{ padding }}`를 덮어쓰는 방식(`BriefCard`가 이미 사용)으로 모으거나 `Card`에 여백 변형을 하나 둔다. 신규 토큰이 아니라 코드 정리 건이다.
- 근거: 티켓 20261015_2133 1회 채원② 승격 후보.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

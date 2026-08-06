---
id: 20260802_002
category: Feature
status: CLOSED
created: 2026-08-02
closed: 2026-08-05
---

# [Feature] poi_visit/item_collect 진행률 계산

## 배경
미션 진행도를 실시간으로 계산.

## 상세 요구사항
- poi_visit: 방문 count / 필요 count (%)
- item_collect: 보유 count / 필요 count (%)
- 캐시: 1분 TTL

---

## 완료 기록

### 구현 내용 요약
- 진행률 계산 로직
- 캐시 구현

### 변경된 파일
```
src/lib/missions/progress.ts (신규)
```

### 배포 정보
- 배포일: 2026-08-05
- 커밋: features/mission_progress

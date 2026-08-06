---
id: 20260728_001
category: Feature
status: CLOSED
created: 2026-07-28
closed: 2026-07-31
---

# [Feature] rare+ Pity 로직

## 배경
연속 common 5회 시 다음 드랍에서 rare 이상 보장.

## 상세 요구사항
- common_streak 카운터 (user_drop_state)
- 5회 도달 시 다음 드랍에서 rare 이상 강제
- 스트릭 리셋 (rare+ 획득 시)

---

## 완료 기록

### 구현 내용 요약
- pity 로직 구현
- 스트릭 추적 및 리셋

### 변경된 파일
```
src/lib/drop-engine/pity.ts (신규)
```

### 배포 정보
- 배포일: 2026-07-31
- 커밋: features/pity_system

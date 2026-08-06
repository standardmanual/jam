---
id: 20260729_002
category: Admin
status: CLOSED
created: 2026-07-29
closed: 2026-08-01
---

# [Admin] drop_policy 편집 UI

## 배경
어드민이 드랍엔진 파라미터 (희귀도%, 모멘텀 가중치, pity 임계) 실시간 조정.

## 상세 요구사항
- drop_policy 싱글톤 편집 폼
- 슬라이더로 확률 조정 (즉시 반영)
- faction_adjacency 시각화

---

## 완료 기록

### 구현 내용 요약
- 어드민 drop_policy 편집 UI
- 슬라이더 기반 확률 조정
- faction 인접 시각화

### 변경된 파일
```
src/app/admin/drop-policy/page.tsx (신규)
src/app/api/admin/drop-policy/route.ts (신규)
```

### 배포 정보
- 배포일: 2026-08-01
- 커밋: admin/drop_policy_ui

---
id: 20260711_001
category: API
status: CLOSED
created: 2026-07-11
closed: 2026-07-13
---

# [API] POST /api/drops/[id]/pickup — 픽업

## 배경 / 문제 정의
유저가 지도에서 볼 수 있는 드랍 아이템을 픽업. 거리/인벤토리 슬롯 검증 후 인벤토리에 추가.

## 상세 요구사항

### 요청
- Path: `/api/drops/{dropId}`
- Body: `{ lat: number, lng: number }`

### 응답
```json
{
  "inventory_item_id": "uuid",
  "badge_name": "string",
  "message": "아이템을 획득했어요!"
}
```

### 검증
1. **거리 검증**: 현재 위치에서 POI까지 50m 이내
2. **인벤토리 슬롯**: 사용 가능한 슬롯 확인 (최대 50개)
3. **본인 드랍 제외**: 자신이 드랍한 아이템도 픽업 가능 (이전 정책에서 변경, 2026-07-13)
4. **이미 픽업됨**: is_available=false 확인

### 트랜잭션
- poi_drops.is_available = false
- poi_drops.picker_user_id = auth.uid() (추가 컬럼)
- inventory_items 신규 레코드 생성

## 구현 계획
1. POST /api/drops/[id]/pickup 라우트
2. 거리/슬롯 검증
3. Supabase RPC로 원자 트랜잭션
4. 픽업 후 배지 상세 조회

---

## 완료 기록

### 구현 내용 요약
- POST /api/drops/[id]/pickup 라우트
- 거리/슬롯 검증 로직
- Supabase RPC pickup_drop() 함수 (원자성)
- 픽업 후 배지 정보 응답

### 변경된 파일
```
src/app/api/drops/[id]/route.ts (신규, POST)
supabase/migrations/004_poi_drops.sql (RPC 추가)
```

### 테스트 결과
- [x] 정상 픽업 → is_available=false + 인벤토리 추가
- [x] 거리 초과 → 403
- [x] 슬롯 부족 → 400 (Inventory full)
- [x] 본인 드랍 픽업 → 성공 (정책 변경 반영)

### 배포 정보
- 배포일: 2026-07-13
- 환경: production
- 커밋: api/drops/[id]/pickup

### 주요 의사결정
- **본인 드랍 픽업 허용**: 2026-07-13 정책 변경. 이전엔 dropper_user_id != auth.uid() 필수였으나 제거

### 잔여 이슈
- [ ] picker_user_id 컬럼 아직 poi_drops에 미추가 — 이력 추적 미완

---
id: 20260710_003
category: API
status: CLOSED
created: 2026-07-10
closed: 2026-07-13
---

# [API] POST /api/drops — 드랍 생성

## 배경 / 문제 정의
유저가 인벤토리의 아이템을 현재 위치의 POI에 드랍할 수 있도록 API 제공.

## 상세 요구사항

### 요청 본문
```json
{
  "inventory_item_id": "uuid",
  "poi_id": "uuid",
  "lat": number,
  "lng": number
}
```

### 응답
```json
{
  "id": "uuid",
  "poi_id": "uuid",
  "badge": {
    "id": "uuid",
    "name": "string",
    "image_url": "string"
  },
  "expires_at": "timestamp"
}
```

### 검증
1. **인벤토리 소유권**: inventory_item_id가 현재 유저의 아이템인지
2. **거리 검증**: 현재 위치(lat/lng)에서 POI까지 50m 이내인지 (Haversine)
3. **슬롯 상태**: 해당 아이템이 아이템북 슬롯에 장착돼 있지 않은지
4. **POI 유효성**: poi_id가 실제로 존재하는지
5. **중복 드랍**: 같은 아이템 2번 드랍 불가 (once-dropped 플래그)

### 트랜잭션
- inventory_items.dropped_at = now()
- inventory_items.drop_id = new poi_drops.id
- poi_drops INSERT

## 구현 계획
1. POST /api/drops 라우트 작성
2. 위 검증 로직 순차 실행
3. Supabase RPC 또는 트랜잭션으로 원자성 보장
4. 에러 응답 구분 (권한, 거리, 슬롯 등)

---

## 완료 기록

### 구현 내용 요약
- POST /api/drops 라우트 구현
- 5가지 검증 로직 추가
- Supabase 트랜잭션으로 원자성 보장
- 에러 메시지 한국화

### 변경된 파일
```
src/app/api/drops/route.ts (POST 추가)
src/lib/drops/validate.ts (검증 로직)
```

### 테스트 결과
- [x] 정상 드랍 → poi_drops 생성 + inventory_items 업데이트
- [x] 거리 초과 → 403 (Cannot drop outside 50m radius)
- [x] 슬롯 장착 → 400 (Item is slotted)
- [x] 중복 드랍 → 400 (Item already dropped)

### 배포 정보
- 배포일: 2026-07-13
- 환경: production
- 커밋: api/drops POST

### 주요 의사결정
- **dropped_at vs drop_id 이원화**: 논리 삭제와 드랍 기록을 분리 추적
- **RPC vs 트랜잭션**: Supabase의 BEGIN...COMMIT으로 원자성 보장

### 잔여 이슈
- [ ] 클라이언트 측 거리 검증 오류로 인한 서버 요청 폭주 가능 — 레이트 제한 추가 검토

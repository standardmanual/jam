---
id: 20260713_001
category: Bug
status: CLOSED
created: 2026-07-13
closed: 2026-07-15
---

# [Bug] 동시 픽업 race condition 수정

## 배경 / 문제 정의
두 명의 유저가 동시에 같은 드랍 아이템을 픽업했을 때, 양쪽 모두 성공하는 race condition 발생. 한 명만 픽업 가능해야 함.

## 재현 방법
1. 두 개의 브라우저에서 같은 드랍 아이템 선택
2. 정확히 동시에 "픽업" 버튼 클릭 (또는 curl 동시 요청)
3. 결과: 양쪽 모두 inventory_items 생성됨 (중복)

## 해결 방안
- Supabase RPC `pickup_drop()`에서 `FOR UPDATE` 로킹 추가
- poi_drops.is_available을 원자적으로 false로 변경
- 실패 시 409 Conflict 응답

## 구현 계획
1. supabase/migrations/004_poi_drops.sql 수정 (RPC 함수)
2. BEGIN TRANSACTION ... FOR UPDATE 추가
3. 테스트: Apache Bench로 동시 요청 100개

---

## 완료 기록

### 구현 내용 요약
- Supabase RPC pickup_drop()에 FOR UPDATE 추가
- 트랜잭션 격리 수준 READ COMMITTED로 설정
- 409 응답 추가 (이미 픽업됨)

### 변경된 파일
```
supabase/migrations/004_poi_drops_add_locking.sql (수정)
src/app/api/drops/[id]/route.ts (409 에러 처리)
```

### 테스트 결과
- [x] 동시 픽업 100개 → 1개만 성공, 나머지 409
- [x] 성능: 로킹으로 인한 지연 없음 (<100ms)

### 배포 정보
- 배포일: 2026-07-15
- 커밋: bugfix/pickup-race-condition

### 잔여 이슈
- 없음

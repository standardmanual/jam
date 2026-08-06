---
id: 20260716_001
category: Infra
status: CLOSED
created: 2026-07-16
closed: 2026-07-20
---

# [Infra] factions + item_books + 배지 마이그레이션

## 배경
Phase 8에서 세계관 시스템 도입. 10개 세계관, 100권 아이템북, 900개 배지 추가.

## 상세 요구사항
- 신규 테이블:
  - `factions` (10개 레코드)
  - `item_books` (100개)
  - `user_item_book_slots` (슬롯팅 기록)
  - `user_item_book_completions` (완성 기록)
- 기존 테이블 확장:
  - `badges`: `faction_id`, `item_book_id`, `drop_weight`, `drop_condition_json`
  - `inventory_items`: `slotted_in` (FK → user_item_book_slots)

## 구현 계획
1. `supabase/migrations/008_factions_itembooks.sql`
2. 신규 테이블 + RLS
3. seed 파일로 10개 팩션 + 100개 아이템북 삽입

---

## 완료 기록

### 구현 내용 요약
- 4개 신규 테이블 생성
- 기존 테이블 확장 (4개 컬럼 추가)
- RLS 정책 적용
- 팩션/아이템북 초기 데이터 시딩

### 변경된 파일
```
supabase/migrations/008_factions_itembooks.sql (신규)
```

### 테스트 결과
- [x] 테이블 생성 성공
- [x] RLS 정책 적용
- [x] 초기 데이터 삽입 (10+100개)

### 배포 정보
- 배포일: 2026-07-20
- 커밋: migrations/008-factions-itembooks

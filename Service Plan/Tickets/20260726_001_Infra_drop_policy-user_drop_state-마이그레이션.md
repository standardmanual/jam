---
id: 20260726_001
category: Infra
status: CLOSED
created: 2026-07-26
closed: 2026-07-30
---

# [Infra] drop_policy + user_drop_state 마이그레이션

## 배경
Phase 11에서 드랍엔진 v2(3레이어) 도입. 싱글톤 drop_policy + 유저별 user_drop_state 테이블 필요.

## 상세 요구사항
- `drop_policy` (싱글톤):
  - rarity_weights (common/rare/legendary/mythic %)
  - momentum_weights (이전 드랍 세계관별 가중치)
  - pity_threshold, pity_bonus_rarity 등
- `user_drop_state`:
  - user_id, last_drop_faction_id, last_drop_book_id
  - common_streak, last_piece_pity, daily_drop_count, total_drops

---

## 완료 기록

### 구현 내용 요약
- 2개 테이블 생성
- RLS 정책 적용
- 초기 drop_policy 기본값 설정

### 변경된 파일
```
supabase/migrations/010_drop_policy_v2.sql (신규)
```

### 배포 정보
- 배포일: 2026-07-30
- 커밋: infra/drop_policy_v2

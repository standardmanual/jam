# JAM! 서비스 운영 문서 — 변경분 (2026-07-21 10:17)

> **이 버전의 변경 내용:** 아이템배지 드랍엔진 v2 전면 교체 — 활동당 최소 1개 확정 드랍 + 세계관 모멘텀 + 완성 페이싱 + 맥락 오버라이드 + 일련번호 무작위화 + 어드민 드랍 정책 화면  
> 이전 버전: SERVICE_OPERATIONS_20260721_0918.md

---

## [교체] 아이템배지 드랍 엔진 v2 (Phase 11)

### 개요

드랍엔진 v1(활동당 80% 확률, 전체 풀 완전 랜덤)을 3레이어 구조로 전면 교체.
전체 로직: `PRD/badge/BADGE_ENGINE_UNIFIED.md` §3 (단일 진실 원천).

| Layer | 내용 |
|-------|------|
| 1. 드랍 발생 | 활동당 **최소 1개 확정** + 보너스 15%(고강도 30%) + rare+ pity(연속 common 5회) + 일일 하향(4번째 활동~) + 주간 첫 활동 2배 + 복귀(7일+) rare+ 확정 |
| 2. 세계관 선택 | 모멘텀 50 / 인접 25 / 탐험 15 (factions 기반, 하드캡·선택 UI 없음). 미스터리 헌터는 legendary+ 전용 스파이스. 신규 유저 첫 3드랍은 작심삼일 클럽+종목 매핑 세계관 |
| 3. 북·배지 선택 | 완성도 감쇠(0.7)·완성 북 잔류(0.3)·직전 북 페널티(0.5)·마지막 조각 pity(세계관 내 5드랍)·미보유 우선 |
| 맥락 오버라이드 | 복귀→작심삼일(항상) / 극한온도→레인저 / 새벽→비트·셔터 / 심야→미식가·갱단 / 고고도→미식가·비트 / 러너스하이→미스터리(rare+). 발동률 60%. 강수 조건은 날씨 API 도입 전 제외 |

### 신규/변경 파일

| 파일 | 내용 |
|------|------|
| `supabase/migrations/034_drop_engine_v2_schema.sql` | faction_adjacency(+시드) / user_drop_state / drop_policy(+시드) / serial 난수 트리거 |
| `src/lib/drop-engine/index.ts` | 3레이어 오케스트레이션 (전면 재작성) |
| `src/lib/drop-engine/layers.ts` | 순수 함수 추첨 (randomFn 주입, 테스트 가능) |
| `src/lib/drop-engine/context.ts` | 맥락 오버라이드 매칭 |
| `src/lib/drop-engine/policy.ts` | getDropPolicy/updateDropPolicy (기본값 폴백) |
| `src/lib/drop-engine/constants.ts` | 세계관 고정 UUID (019 시드 기준) |
| `src/app/admin/drop-policy/` + `api/admin/drop-policy/` | 파라미터 22종 편집 화면 (rarity 합=1, 버킷 합≤1 검증) |
| `src/app/admin/factions/[id]/AdjacencyEditor.tsx` | 인접 세계관 편집 (PUT에 adjacent_faction_ids 추가) |
| `src/lib/activity-feed/index.ts` | item_dropped meta에 faction_name·is_last_piece 추가 |
| `src/app/(main)/HomeFeedSection.tsx` | 드랍 카드 "○○의 파편" + "🧩 마지막 파편!" 강조 |
| `src/lib/strava/sync.ts` | tryItemDrop에 활동 객체 전달 |

### 운영 유의사항

- **DB 적용 필요**: 마이그레이션 033(액티비티배지 v3 시드) + 034(드랍 v2 스키마)가 순서대로 적용되어야 v2가 동작한다. 034 미적용 상태에서는 drop_policy/user_drop_state 조회가 실패해도 기본값 폴백으로 동작하나, faction_adjacency 부재로 인접 버킷이 비고 일련번호는 기존 순차 유지.
- **파라미터 튜닝**: `/admin/drop-policy`에서 배포 없이 즉시 조정. rarity 4종 합=1 필수.
- **인접 그래프 편집**: 어드민 세계관 수정 화면 하단. 원본 데이터는 `아이템북 레시피.xlsx` '세계관 인접' 시트.
- **일련번호**: DB 트리거(assign_random_serial)가 1~999,999 난수 부여 — 드랍·조합·픽업·어드민 지급 모든 경로 일괄 적용. 기존 발급분 번호 유지.
- **섀도우밴**: v2에서는 rarity 강등(→common)으로 동작 — 드랍 자체를 막지 않는다 (hard ban으로 common까지 차단 시에만 미드랍).
- **유지된 가드**: isDroppableForActivity(누적조건 제외), is_active 필터, 유효기간, 인벤토리 슬롯(유일한 "최소 1개" 예외).

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260721_0918.md)과 동일.

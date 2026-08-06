# 세계관 (Factions) 컨텐츠 관리

> **상태: 스텁 (미작성)** — 전용 컨텐츠 관리 문서가 없어 신설. 아래 소스를 기반으로 내용 채우기 필요.

## 데이터 소스 (현재 진실 소스)
- 스키마: `jam-web/supabase/migrations/014_factions.sql`
- 배지 연결: `jam-web/supabase/migrations/015_badges_faction.sql`, `016_itembooks_faction.sql`
- 초기 시드: `jam-web/supabase/migrations/019_seed_worldview.sql`
- 드랍엔진 v2에서의 세계관 모멘텀 로직: `jam-web/supabase/migrations/034_drop_engine_v2_schema.sql`, `jam-web/src/lib/drop-engine/`
- 조합 시스템에서의 세계관 융합: `jam-web/supabase/migrations/054_combine_v2.sql`
- 어드민 관리 화면: `jam-web/src/app/admin/factions/`

## 채워야 할 내용
- [ ] 전체 세계관(faction) 목록과 각 설정/컨셉
- [ ] 세계관별 소속 배지·아이템북 매핑
- [ ] 세계관 인접 그래프 (조합/드랍 모멘텀에 영향)
- [ ] 세계관 신규 추가 시 체크리스트

## 관련 문서
- [BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) — 세계관 모멘텀이 드랍 확률에 반영되는 로직
- [Content/ITEMBOOKS.xlsx](./ITEMBOOKS.xlsx) — 세계관별 아이템북 구성

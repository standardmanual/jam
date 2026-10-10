# JAM! 서비스 운영 문서 — 변경분 (2026-07-26 16:00)

> **이 버전의 변경 내용:** 투데이 카드 20개 추가(리텐션/동기부여/보상 중심, 기존 20개와 다른 template×layout 조합). 코드 변경 없음, 데이터만 추가.
> 이전 버전: SERVICE_OPERATIONS_20260726_1424.md

---

## 투데이 카드 신규 20개 (게이미피케이션 리텐션/동기부여/보상 중심)

**관련 파일:** `supabase/seed_phase15_today_cards_gamification_20.sql`(신규, 기록용. 실제 삽입은 서비스 롤 키로 직접 실행 — DDL 아닌 DML이라 유저 개입 없이 처리)

- 기존 20개(sort_order 1~62)와 **다른 template_type × layout_type 조합** 위주로 구성(sort_order 70~89) — 예: badge_spotlight×shortcut/banner/other, mission_spotlight×large_thumbnail/banner/other, itembook_milestone×shortcut/other 등 기존에 없던 조합.
- 3가지 게이미피케이션 축을 명시적으로 반영:
  - **리텐션**: 근접완주("딱 한 조각 남았어요"), 스트릭 방어("루틴의 수호자까지 단 하루"), 신규유저 습관형성 유도(`new_user` 태그 배너)
  - **동기부여**: 긴급성(선착순 마감), 경쟁(랭킹 미션), 희귀성(신화 등급 보유율 강조), 사회적 증거(지역 트렌드)
  - **보상 명확성**: 카피에 포인트/배지 확정 지급 문구를 직접 명시(예: "완료 시 500P", "레전더리 배지 확정 지급")
- 배지 참조는 이름+등급(rarity)까지 함께 조회 — 시드 데이터에 동명이인 배지(같은 이름, 다른 등급)가 다수 존재해 등급 지정 없이는 의도와 다른 배지가 걸릴 수 있음을 확인하고 대응.
- 아이템배지(`type='item'`)는 현재 전량 common 등급(900개, 후속 재시딩으로 추정)이라 "희귀성" 계열 카피는 활동배지(activity, legendary/mythic 다수 존재)로 소재를 잡음.
- 전부 `ends_at = 2026-12-30 23:59:59+09`(기존 컨벤션 유지), `starts_at = NOW()`(즉시 노출).

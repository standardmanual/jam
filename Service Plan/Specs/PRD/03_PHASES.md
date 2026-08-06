# JAM! 유저 모바일 웹 — Phase 로드맵 (요약)

> Phase별 상세 실행계획(체크리스트·시작 프롬프트·전제조건 등)은 이력 자료로
> [History/PHASES_ROADMAP_ARCHIVE.md](../../History/PHASES_ROADMAP_ARCHIVE.md)에 보관되어 있다.
> 이 문서는 **현재 기준 개발 상태를 한눈에 보기 위한 요약**만 유지한다.

---

## ⚠️ 로드맵과 실제 개발 이력의 불일치

2026-07-09~10에 작성된 이 Phase 로드맵(Phase 8~18)은 계획대로 진행되지 않았다.
예: 계획상 "Phase 11 = 커뮤니티 피드"였지만 실제로는 그 번호로 드랍엔진 v2(세계관
모멘텀)가 구현됐다. **Phase 8 이후 번호는 실제 개발 순서와 대응되지 않는다** — 상세
아카이브의 각 Phase 항목에 실제 확인된 불일치를 각주로 남겨두었다.

**따라서 현재 서비스가 정확히 어떤 상태인지 파악할 때는 이 로드맵을 참고하지 말 것.**
대신:
- 현재 스펙 → [Specs/PRD/01_PRD.md](./01_PRD.md), [Specs/Content/](../Content/), [Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md)
- 실제 작업 이력 → [History/Migration/Ticket/](../../History/Migration/Ticket/)

> 이 로드맵 문서 자체의 현재 상태 재작성(무엇이 실제로 구현됐는지 코드 대조 검증
> 포함)은 별도 작업으로 예정되어 있다.

---

## Phase 1~7 + 어드민 — 완료 (계획대로 진행된 것으로 확인됨)

| Phase | 핵심 기능 |
|-------|----------|
| Phase 1 | 온보딩 + Strava 연동 + 배지 발급 + 공유 카드 |
| Phase 2 | POI 사후 인증 + 배지 상세 지도앱 아웃링크 |
| Phase 3 | 인벤토리 + 아이템 드랍 + 플리마켓 UI (메뉴만) |
| Phase 5 | 어드민 패널 (배지/POI/아이템북/드랍확률/시뮬레이터) |
| Phase 6 | 어드민 주도 드랍 이벤트 |
| Phase 7 | 유저 드랍/픽업 + 인앱 Google Maps + OSM T2 POI + 일련번호 |

---

## Phase 8 이후 — 계획 원문 (실제 진행 순서와 다름, 참고용)

| Phase | 핵심 기능 | 계획 시점 상태 |
|-------|----------|---------------|
| 8 | 아이템북 완성 루프 | 계획 |
| 9 | 아이템 만료 Cron + JAM 포인트 시스템 | 계획 |
| 10 | 푸시 알림 / PWA | 계획 |
| 11 | 커뮤니티 피드 + 소셜 공유 + 랭킹 | 계획 — 실제로는 드랍엔진 v2 구현됨 |
| 12 | D2C 실물 패치 스토어 연동 | 계획 |
| 13 | P2P 플리마켓 실제 오픈 | 계획 — 실제로는 미션 참가/상황 구현됨 |
| 14 | 지도 고도화 + T3 POI 확장 | 계획 |
| 15 | 아이템 조합/비밀 조합법 | 계획 — 실제로 `054_combine_v2.sql`로 구현됨 |
| 16 | 다이나믹 미션 시스템 | 계획 |
| 17 | 신화 아이템 떠돌이 속성 (Wandering Mythic) | 계획 |
| 18 | 데이터 무결성 정책 (중복 방지·차량 필터·30일 만료) | 계획 |

---

## 관련 문서
- [History/PHASES_ROADMAP_ARCHIVE.md](../../History/PHASES_ROADMAP_ARCHIVE.md) — Phase별 상세 실행계획 전문
- [History/Migration/Ticket/](../../History/Migration/Ticket/) — 실제 개발 작업 이력 (신규 개선사항은 여기부터 확인)
- [Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md](../BadgeEngine/BADGE_ENGINE_UNIFIED.md) — 배지·드랍 엔진 최신 로직 (드랍엔진 v2 등 실제 구현 반영)

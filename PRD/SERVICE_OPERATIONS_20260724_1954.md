# JAM! 서비스 운영 문서 — 변경분 (2026-07-24 19:54)

> **이 버전의 변경 내용:** 미션 참가 확인 UI를 네이티브 `confirm()`에서 인앱 확인 UI로 교체 — 모바일/PWA에서 짧은 시간 내 `confirm()`을 반복 호출하면 브라우저가 후속 다이얼로그를 조용히 차단해, 미션 하나를 참가한 직후 다른 미션 참가 버튼이 무반응이던 문제 수정.
> 이전 버전: SERVICE_OPERATIONS_20260724_1805.md

---

## 9-2. 미션 참가 확인 UI (수정)

**관련 파일:** `src/app/(main)/missions/[id]/MissionDetailClient.tsx`

- 기존: `window.confirm('한번 참가하면 취소할 수 없어요. 참가할까요?')` 사용.
  - 문제: 모바일 브라우저/PWA는 짧은 시간 안에 반복되는 JS 다이얼로그(`confirm`/`alert`)를 스팸 방지 차원에서 조용히 차단하는 경우가 있음. 미션 A 참가 시 confirm이 정상 동작한 뒤, 곧바로 다른 미션 B 상세에서 참가 버튼을 눌러도 confirm이 뜨지 않고 `false`를 반환해 버튼이 아무 반응 없는 것처럼 보이는 버그 발생.
- 변경: 버튼 클릭 시 같은 카드 내에 인라인 확인 UI(취소/참가 확정 버튼 2개)를 표시하는 방식으로 교체. 네이티브 다이얼로그를 전혀 사용하지 않음.
- `handleJoin()`에 `try/catch` 추가 — fetch/네트워크 오류 시에도 토스트로 안내(기존에는 미처리 예외로 조용히 실패할 수 있었음).
- API(`POST /api/missions/[id]/join`)와 참가 게이트 로직(`checker.ts`)은 이번 변경과 무관 — 서로 다른 미션 간 참가 제한은 원래 없었고(§9-1 참고), 순수 프런트엔드 UX 버그였음.

---

## 부록: Phase13 미션 시드 데이터

`supabase/seed_phase13_missions_30.sql` — mission_type 4종(distance/activity_count/poi_visit/item_collect) 골고루 섞은 데모용 미션 30개. `ends_at`은 전부 `2026-12-30 23:59:59+09`. Supabase SQL Editor에서 수동 실행 필요(마이그레이션 아님, 1회성 데이터 시드).

---
id: 20260908_1033
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-08
---

# [BadgeEngine] 자전거·등산·트레일러닝 "휴식" 축 3계열 Mystic 배지 신규 추가 + 미션 게이트 연결

## 배경 / 문제 정의

티켓 [20260908_1017](Service%20Plan/Tickets/P1-중요/20260908_1017_BadgeEngine_게이트미션-누적축-노출조건-등급오류-보상게이트-연결.md)
처리 도중 어드민 정합성 검사에 남아 있던 `reward_family_not_gated` 4건 중 3건의 원인을
조사한 결과다.

- **"내리막 뒤의 증명"(`trail_running:Q7`) · "하산 뒤의 증명"(`hiking:Q7`) · "빈 안장의
  증명"(`cycling:Q7`)** — 이 세 미션의 보상 배지 계열을 `gate_mission_badge`로 가리키는
  배지가 없다.
- 원인: 세 미션이 여는 "휴식" 축의 대상 계열(`cycling:X1`/`X2`, `hiking:X1`/`X2`,
  `trail_running:X1`/`X2`)이 **DB에 Mystic 등급 배지 자체가 없다** — 실측 확인(2026-09-08):

  | 계열 | 현재 최고 등급 | 사다리(`repeat_count`) |
  |---|---|---|
  | `cycling:X1` (안장의 휴일) | Epic | Common 1 · Rare 10 · Epic 30 |
  | `cycling:X2` (돌아온 라이더) | Epic | Common 1 · Rare 3 · Epic 10 |
  | `hiking:X1` (하산 다음 날) | Epic | Common 1 · Rare 5 · Epic 20 |
  | `hiking:X2` (돌아온 등반자) | Epic | Common 1 · Rare 3 · Epic 8 |
  | `trail_running:X1` (내리막의 대가) | Epic | Common 1 · Rare 5 · Epic 20 |
  | `trail_running:X2` (돌아온 트레일러) | Epic | Common 1 · Rare 3 · Epic 10 |

- 게이트를 걸 대상 배지가 처음부터 없으니 지금 상태로는 SQL 조건 수정만으로 고칠 수 없다 —
  **새 Mystic 배지를 만들어야 하는 컨텐츠 작업**이다.
- 참고로 같은 목록의 네 번째 항목 "사철 산길의 증명"(`trail_running:Q8`)은 대상 계열
  (`trail_running:W2`, `season_count_all` 조건)이 걷기 W3와 같은 **설계상 의도된 무관문
  예외 12종** 중 하나로 실측 확인됐다 — 버그 아님, 조치 불필요.

이 문제 자체는 신규 발견이 아니다 — 티켓 [20260906_1947](Service%20Plan/Tickets/P1-중요/20260906_1947_BadgeEngine_2단교차게이트-축매핑-시딩.md)
153~165행이 이미 "자전거·등산·트레일러닝의 '휴식' 반복형 계열이 Mystic 없이 Epic까지만
시딩돼 있어 게이트를 붙일 대상 자체가 없다 — 이 3계열의 Mystic 부재가 원래 설계 의도인지
0035 시딩 단계의 우발적 격차인지 확인되지 않았다. 콘텐츠 팀 확인 필요"로 남긴 미해결 사안과
정확히 같다.

## 사용자 확인 결과 (2026-09-08)

"게이트 미션 체계를 직접 설계하지 않아 판단할 수 없다 — 이 4개(3계열) 배지를 미션 게이트로
가리키는 배지를 지정해달라"는 요청을 받았다. Mystic 배지가 없는 게 근본 문제이므로, **새
Mystic 배지 3종(계열당 1개, `걷기 휴식 축`의 기존 패턴을 참고)을 신규 추가하고 그 배지에
`gate_mission_badge`를 건다**로 진행한다.

## 상세 요구사항

### 컨텐츠 관점 (신규 배지 3종)

대상: `cycling:X1`, `hiking:X1`, `trail_running:X1` 각 1종에 Mystic 등급을 추가한다
(`X2`가 아니라 `X1`을 고른 이유 — 걷기의 같은 축 선례인 `walking:R1`·`R2`가 **둘 다**
Mystic까지 있지만, 새 컨텐츠 범위를 최소화하기 위해 이번엔 각 종목당 1계열만 우선
추가한다. `X2`도 필요하다고 판단되면 이 티켓에서 함께 처리해도 된다 — jam-developer
재량으로 판단하고 근거를 완료 기록에 남길 것).

- **수치 임계값**: 정본 지표가 없다. 같은 축(휴식)의 이미 Mystic까지 시딩된 선례
  (`walking:R1`: Common1·Rare5·Epic20·**Mystic20**은 오타로 보임 — 실제로는
  [v5_seed_build.py](Service%20Plan/Specs/Content/v5_seed_build.py) 233행
  `[(R, 1), (E, 5), (M, 20)]`이 정본. `walking:R2`(235행): `[(C, 1), (R, 10), (E, 30),
  (M, 100)]`, Epic→Mystic 비율 약 3.3배)의 **Epic→Mystic 배율**을 참고해 각 계열의 Epic
  값에 곱해 산정한다. 예: `cycling:X1` Epic=30 → Mystic ≈ 30×3~4배 = 90~120 범위에서
  선택(정수, 보기 좋은 값으로 반올림).
- **배지 이름·설명문**: `.claude/output-styles/fluent-korean.md` 지침을 따라 작성.
  같은 계열의 기존 등급(Common~Epic) 설명문과 톤을 이어가되, Mystic 등급다운 무게감을
  담을 것. [ACTIVITY_BADGES.md](Service%20Plan/Specs/Content/ACTIVITY_BADGES.md)의 해당
  섹션(각 3계열 위치는 위 표 참고)에 반영.
- **컨텐츠 문서 갱신**: `ACTIVITY_BADGES.md`의 대상 3계열 표·설명문에 Mystic 행 추가.

### 서비스/코드베이스 관점 (게이트 연결)

- 신규 Mystic 배지 3종의 `condition_json`에 **기존 2단교차게이트 패턴**
  ([v5_gate_build.py](Service%20Plan/Specs/Content/v5_gate_build.py) 296~310행 참고,
  AXIS_RULES의 `'휴식': {'em': ('between', '누적', 'min_level')}`)을 그대로 적용한다:
  ```json
  {"cross_between_axis": {"family_keys": ["<sport>:K1", "<sport>:K2"(있다면), "<sport>:K3"],
                            "min_level": 6},
   "gate_mission_badge": {"family_keys": ["<sport>:Q7"]}}
  ```
  `min_level=6`은 티켓 20260906_1947에서 이미 사용자 승인·적용된 값과 동일(구조적으로
  항상 충족 가능한 값 — 20260908_1017과 같은 근거).
- `repeat_count` 기반 반복형이므로 기존 조건 필드(`single_distance_km`/`return_gap_days`
  등 + `repeat_count`)는 유지하고 위 두 게이트 키만 추가한다.

### DB 반영

- `jam-web/supabase/migrations/seed_gate_mission_rest_axis_mystic_badges.sql` (신규)에
  INSERT 3행(Mystic 배지) 작성. CLAUDE.md 규칙대로 jam-developer는 파일 작성까지만 하고
  실행은 오케스트레이터가 사용자 승인 후 처리한다.
- INSERT 전 `badges` 테이블에서 해당 family_key에 이미 Mystic 행이 없는지(중복 방지)
  SELECT로 먼저 확인할 것.

## 구현 계획

jam-developer가 신규 배지 3종의 이름·설명문·수치·게이트 조건을 확정해 SQL INSERT 파일을
작성하고 `ACTIVITY_BADGES.md`를 갱신한다. 게이트 리뷰(스펙 대조) → 한국어 리뷰(신규 카피
품질) 순으로 검토한 뒤, 오케스트레이터가 사용자 승인을 받아 Supabase에 직접 실행한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
- `X2` 계열(`cycling:X2`/`hiking:X2`/`trail_running:X2`)은 이번 범위에 포함하지 않았다면
  그 사유와 함께 후속 검토 필요 여부를 남길 것.

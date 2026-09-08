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
`cycling:X1`(안장의 휴일) · `hiking:X1`(하산 다음 날) · `trail_running:X1`(내리막의 대가)
3계열에 Mystic 등급을 신규 추가하고, 그 조건문에 `cross_between_axis`(각 종목 "누적" 축
계열 전부, `min_level: 6`) + `gate_mission_badge`(각 종목 `Q7`) 게이트를 걸어
`cycling:Q7`·`hiking:Q7`·`trail_running:Q7` 미션 보상 배지가 실제로 무언가를 열도록
연결했다. `X2`는 이번 범위에 포함하지 않았다(아래 잔여 이슈 참고).

수치는 같은 "휴식" 축의 걷기 선례(`walking:R1` Epic5→Mystic20 = 4배, `walking:R2`
Epic30→Mystic100 = 3.33배)를 참고해 Epic→Mystic 약 3.3~3.5배를 적용했다:
- `cycling:X1` Epic 30 → Mystic 100
- `hiking:X1` Epic 20 → Mystic 70
- `trail_running:X1` Epic 20 → Mystic 70

게이트 대상(`cross_between_axis.family_keys`)은 v5_gate_build.py의 AXIS_RULES에 정의된
"누적" 축 계열을 그대로 옮겼다: `cycling`은 K1·K2·K3, `hiking`은 K1·K3(K2는 설계상 결번 —
누적 이동시간 조건 키가 레지스트리에 없어 v5 1차 시딩에서 제외됨, `seed_v5_activity_badges.sql`
주석 확인), `trail_running`은 K1·K2·K3.

### 변경된 파일
```
Service Plan/Specs/Content/ACTIVITY_BADGES.md
jam-web/supabase/migrations/seed_gate_mission_rest_axis_mystic_badges.sql (신규)
```

### 테스트 결과
- [x] `badges_condition_json_known_keys` CHECK 허용 키(`activity_type`·`single_distance_km`·
  `duration_minutes`·`rest_after_long`·`repeat_count`·`cross_between_axis`·`gate_mission_badge`)
  전부 마이그레이션 133에 이미 포함돼 있음을 코드로 확인(추가 마이그레이션 불필요).
- [x] `check_family_condition_consistency()` 트리거의 `measurable_keys` 비교 대상 확인 —
  신규 Mystic 행의 측정 필드 집합(`rest_after_long`·`repeat_count`·`single_distance_km`
  또는 `duration_minutes`)이 같은 계열 Common·Rare·Epic 형제 행과 동일해 계열 정합성
  검사를 통과함(`cross_between_axis`·`gate_mission_badge`는 measurable_keys에 없어
  비교 대상이 아님 — 133 주석에서 확인).
- [ ] 실제 DB 실행·SELECT 검증은 사용자 승인 후 오케스트레이터가 처리(이 티켓 범위 밖).
- `cd jam-web && npm run lint` 미실행 — 이번 변경은 SQL·마크다운 문서만 수정했고 TS/JS
  코드 변경이 없어 lint 대상 파일이 없음.

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 배지 이름은 기존 계열명을 그대로 유지(신규 이름 없음), 설명문에 신규
  용어 도입 없음
- [x] 톤앤매너: 배지=신남/무게감 톤 유지, 같은 계열 Common~Epic 설명문의 "몸이 안다",
  "계획에 넣는다" 계열 어휘를 이어받아 Mystic은 "본능·몸에 새겨진" 수준으로 격상
- [x] 문장 규칙: 배지 설명문 관례("~습니다" 종결)를 기존 계열과 동일하게 유지, 완결된
  문장으로 종결(fluent-korean.md 지침 — 명사구·연결어미로 끝내지 않음), 엠대시 미사용
- [x] 표기 규칙: 해당 없음(날짜·시간·금액·기간 표기 없음)

### 배포 정보
- 배포일: (미실행 — SQL 작성만 완료, 실행은 사용자 승인 후 오케스트레이터)
- 환경: -
- 커밋: (review 브랜치 push 후 기록)

### 주요 의사결정 / 핵심 메모
- **X1만 추가하고 X2는 이번 범위에서 뺐다.** 티켓 본문이 "X2도 필요하다고 판단되면 함께
  처리해도 된다"고 재량을 열어뒀지만, (1) 티켓의 사용자 확인 절이 "새 Mystic 배지 3종
  (계열당 1개)"으로 범위를 명시했고, (2) X2는 게이트 대상 미션(Q7)이 이미 X1 Mystic
  신설로 열리므로 X2에 Mystic이 없어도 `reward_family_not_gated` 문제 자체는 해결된다.
  범위를 최소화하는 쪽을 택했다.
- **`gate_mission_badge` 대상은 X1만 가리킨다** — `cross_between_axis`는 "누적" 축
  전체(K1~K3)를 게이트 조건으로 걸고, `gate_mission_badge`는 Q7 미션 하나만 가리키는
  구조(v5_gate_build.py의 patch 구조와 동일)라 X2 부재가 게이트 구조 자체에 영향을 주지
  않는다.
- **Mystic 수치는 정본 지표가 없어 선례 배율로 추정값을 산정했다** — 정확한 밸런싱 검증은
  실측 유저 데이터가 쌓인 뒤 별도로 필요할 수 있다.

### 잔여 이슈
- `cycling:X2`(돌아온 라이더) · `hiking:X2`(돌아온 등반자) · `trail_running:X2`(돌아온
  트레일러) 3계열은 여전히 Epic까지만 있고 Mystic이 없다. 위 "주요 의사결정"에서 설명한
  대로 이번 게이트 문제 해결에는 지장이 없지만, 세 계열 다 게이트 없는 "무관문 배지"로
  남는 상태이므로 컨텐츠 정책상 X2도 Mystic까지 채울지 별도 검토가 필요할 수 있다.
- `Service Plan/Specs/Content/v5_seed_build.py`(정본 스크립트)에는 이번에 추가한 3종의
  Mystic 사다리 값이 반영되지 않았다 — 티켓이 `ACTIVITY_BADGES.md` 직접 수정만 지시해
  범위 밖으로 남겼다. 향후 누군가 `v5_seed_build.py`를 재실행해 문서를 재생성하면 이번에
  손으로 추가한 Mystic 3행이 스크립트 산출물과 어긋나(드리프트) 문서에서 사라질 수 있다 —
  스크립트도 함께 갱신하는 후속 작업이 필요하다.

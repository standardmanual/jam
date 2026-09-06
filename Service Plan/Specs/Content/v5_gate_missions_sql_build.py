#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v5_gate_missions_sql_build.py — 게이트 미션 40건의 INSERT/UPDATE SQL 생성
(티켓 20260906_1947 ②)

`v5_gate_mapping.json`(스크립트 산출물)에서 "이 미션 보상 배지가 여는 축"을 역추적해
`gate_axis`(대표 축 하나)·`visibility_rule_json`(연 축 전체의 합집합)을 기계적으로 만든다.

`condition_json`(미션 자체의 달성 조건)만은 이 스크립트에 **직접 명시한 표**를 쓴다 —
기계적으로 뽑을 수 없다. 이유: `MissionCondition`(src/lib/missions/condition-keys.ts
`MISSION_CONDITION_VALUE_RULE`)과 어드민 게이트 미션 폼(`GateMissionManager.tsx`)이
"필드 하나 + activity_type" 단일값 조건만 지원한다 — "한 번에 X 이상 / N회"·"페이스"·
"시간대"·"다음 날 휴식"·"서로 다른 두 달" 같은 복합 조건을 표현할 수단이 지금 하나도 없다
(신규 기능 아님 — 기존 게이트 미션 폼도 같은 제약이다). 그래서 32+8건 각각을 "가장 근접한
단일 수치 필드"로 근사하고, 원문 대비 손실된 부분을 `mission_notes`에 [WARN]으로 남긴다 —
지어내지 않고 근사임을 명시한다.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
gate_mapping = json.load(open(HERE / "v5_gate_mapping.json", encoding="utf-8"))["families"]

# (sport_key, family_code) -> 이 배지가 여는 축들의 (sport, axis_kr) 집합 — 기계적 역추적
axes_opened_by = {}
for fk, info in gate_mapping.items():
    gmb = info["mystic_condition"].get("gate_mission_badge")
    if not gmb:
        continue
    for target in gmb["family_keys"]:
        axes_opened_by.setdefault(target, set()).add((info["sport"], info["axis"]))


def axis_family_keys(sport_key, axis_kr):
    return sorted(fk for fk, info in gate_mapping.items() if info["sport"] == sport_key and info["axis"] == axis_kr)


# ── 미션 40건 정본 — code, sport, title, mission_type, condition value, warn ────────────
# (mission_type, value)는 MISSION_CONDITION_VALUE_RULE의 단일 필드 규칙을 그대로 쓴다.
MISSIONS = [
    # ── 걷기 8종 (v5_mission_axis_groups.json 그대로) ──
    ("walking:M1", "walking", "누적의 증명", "distance", 20, None),
    ("walking:M2", "walking", "리듬의 증명", "activity_count", 9,
     "'주 3회×3주 연속' 요구를 누적 9회로 단순화 — 주 단위·연속 요구 손실"),
    ("walking:M3", "walking", "시간의 증명", "activity_count", 6,
     "'새벽·낮·밤 각 2회' 요구를 누적 6회로 단순화 — MissionCondition에 시간대 필드 없음"),
    ("walking:M4", "walking", "요일의 증명", "activity_count", 5,
     "'서로 다른 5개 요일' 요구를 누적 5회로 단순화 — 요일 중복 배제 손실"),
    ("walking:M5", "walking", "연속의 증명", "streak_days", 7, None),
    ("walking:M6", "walking", "이정표의 증명", "distance", 8,
     "'한 번에 8km 이상'(단일 활동)을 누적 거리로 단순화 — mission_type='distance'는 합산이라 "
     "나눠 걸어도 충족된다(단일활동 거리 임계값 mission_type이 엔진에 없음)"),
    ("walking:M7", "walking", "회복의 증명", "activity_count", 12,
     "휴식 절(주 1일 이상 휴식)은 판정 불가 — 0110이 이미 지적한 기존 잔여 이슈. 주 3회×4주=12회 누적만 판정"),
    ("walking:M8", "walking", "계절의 증명", "distance", 60,
     "'서로 다른 두 달에 각각 30km'를 60km 누적 합계로 단순화 — MissionCondition에 month 없음, 월별 분리 손실"),

    # ── 러닝 8종 ──
    ("running:Q1", "running", "쌓인 거리의 증명", "distance", 80, None),
    ("running:Q2", "running", "페이스의 증명", "distance", 30,
     "'5:30/km보다 빠르게'(페이스) 조건 손실 — MissionCondition에 페이스 필드 없음. 10km×3회를 30km 누적으로 근사"),
    ("running:Q3", "running", "먼 하루의 증명", "distance", 50,
     "'한 번에 25km 이상 / 2회'를 50km 누적으로 근사 — 단일활동 임계값·반복 횟수 손실"),
    ("running:Q4", "running", "반복의 증명", "activity_count", 12,
     "'3주(월~일) 연속 한 주에 4회'를 누적 12회로 단순화 — 주 단위·연속 손실"),
    ("running:Q5", "running", "시간표의 증명", "activity_count", 5,
     "'새벽·밤 각 2회 + 서로 다른 5개 요일' 복합조건을 누적 5회로 단순화"),
    ("running:Q6", "running", "연이은 날의 증명", "streak_days", 7, None),
    ("running:Q7", "running", "쉼표의 증명", "activity_count", 16,
     "'매주 2일 이상 휴식' 조건 손실(0110 기존 이슈와 동일 성격) — 4주×4회=16회 누적만 판정"),
    ("running:Q8", "running", "사계의 증명", "distance", 240,
     "'서로 다른 두 달에 각각 120km'를 240km 누적으로 단순화 — 월별 분리 손실"),

    # ── 자전거 8종 ──
    ("cycling:Q1", "cycling", "바퀴 자국의 증명", "distance", 330, None),
    ("cycling:Q2", "cycling", "속도의 증명", "distance", 90,
     "'평균 속도 25km/h 이상' 조건 손실 — 30km×3회를 90km 누적으로 근사"),
    ("cycling:Q3", "cycling", "지평선의 증명", "distance", 260,
     "'한 번에 130km 이상 / 2회'를 260km 누적으로 근사"),
    ("cycling:Q4", "cycling", "언덕의 증명", "elevation_gain_m", 2400,
     "'한 번에 상승고도 1,200m / 2회'를 2,400m 누적으로 근사"),
    ("cycling:Q5", "cycling", "주말의 증명", "activity_count", 9,
     "'매주 주말 1회 이상' 요구 손실 — 3주×3회=9회 누적만 판정"),
    ("cycling:Q6", "cycling", "이어진 바퀴의 증명", "streak_days", 3,
     "'매주 1회 이상' 요구 손실 — 3일 연속만 판정"),
    ("cycling:Q7", "cycling", "빈 안장의 증명", "distance", 300,
     "'다음 날 휴식' 조건 손실(0110 기존 이슈와 동일 성격) — 100km×3회를 300km 누적으로 근사"),
    ("cycling:Q8", "cycling", "추위와 더위의 증명", "distance", 1000,
     "'서로 다른 두 달에 각각 500km'를 1,000km 누적으로 단순화 — 월별 분리 손실"),

    # ── 등산 8종 ──
    ("hiking:Q1", "hiking", "쌓인 고도의 증명", "elevation_gain_m", 5000, None),
    ("hiking:Q2", "hiking", "높이의 증명", "elevation_gain_m", 1000,
     "'최고 도달 고도 1,200m 이상' 동시조건 손실 — 상승고도만 판정"),
    ("hiking:Q3", "hiking", "긴 산행의 증명", "duration_minutes", 360,
     "'2회' 반복 조건 손실 — duration_minutes는 단일 활동 최고 기록만 판정(누적 아님, 그나마 '한 번에'와 결이 맞다)"),
    ("hiking:Q4", "hiking", "발길의 증명", "activity_count", 12,
     "'매달 주말 2회 이상' 요구 손실 — 3개월×4회=12회 누적만 판정"),
    ("hiking:Q5", "hiking", "이어진 능선의 증명", "streak_days", 3, None),
    ("hiking:Q6", "hiking", "돌아오는 산의 증명", "activity_count", 12,
     "'6개월 연속' 요구 손실 — 2회×6개월=12회 누적만 판정, 간격 축 특유의 리듬 조건 표현 불가"),
    ("hiking:Q7", "hiking", "하산 뒤의 증명", "duration_minutes", 300,
     "'다음 날 휴식' 조건 손실(0110 기존 이슈와 동일 성격) — 5시간 단일 최고 기록만 판정"),
    ("hiking:Q8", "hiking", "눈과 볕의 증명", "elevation_gain_m", 3600,
     "'서로 다른 두 달에 각각 1,800m'를 3,600m 누적으로 단순화 — 월별 분리 손실"),

    # ── 트레일러닝 8종 ──
    ("trail_running:Q1", "trail_running", "오르내린 거리의 증명", "distance", 80,
     "'상승고도 1,600m' 동시조건 손실 — 거리만 판정"),
    ("trail_running:Q2", "trail_running", "오르막의 증명", "distance", 50,
     "'상승고도 800m 이상' 동시조건 및 단일활동·반복 손실 — 25km×2회를 50km 누적으로 근사"),
    ("trail_running:Q3", "trail_running", "울트라의 증명", "distance", 42,
     "'한 번에 42km'(단일 활동)를 누적 거리로 근사 — mission_type='distance'는 합산이라 나눠 뛰어도 충족된다"),
    ("trail_running:Q4", "trail_running", "수직의 증명", "elevation_gain_m", 1500,
     "'최고 도달 고도 1,200m 이상' 동시조건 손실 — 상승고도만 판정"),
    ("trail_running:Q5", "trail_running", "해뜨기 전의 증명", "activity_count", 9,
     "'매주 새벽 5~8시 1회 이상' 조건 손실(시간대 필드 없음) — 3주×3회=9회 누적만 판정"),
    ("trail_running:Q6", "trail_running", "이어 달린 산길의 증명", "streak_days", 3,
     "'매주 1회 이상' 요구 손실 — 3일 연속만 판정"),
    ("trail_running:Q7", "trail_running", "내리막 뒤의 증명", "distance", 50,
     "'다음 날 휴식' 조건 손실(0110 기존 이슈와 동일 성격) — 25km×2회를 50km 누적으로 근사"),
    ("trail_running:Q8", "trail_running", "사철 산길의 증명", "distance", 240,
     "'서로 다른 두 달에 각각 120km'를 240km 누적으로 단순화 — 월별 분리 손실"),
]

MISSION_VALUE_KEY = {
    "distance": "distance_km",
    "activity_count": "count",
    "streak_days": "streak_days",
    "duration_minutes": "duration_minutes",
    "elevation_gain_m": "elevation_gain_m",
}


def jsonb(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("'", "''")


sql_parts = []
warn_lines = []

for family_key, sport, title, mtype, value, warn in MISSIONS:
    axes = sorted(axes_opened_by.get(family_key, set()))
    if not axes:
        warn_lines.append(f"[WARN] {family_key}({title}) — gate_mapping에서 여는 축을 찾지 못했다. gate_axis 미설정")
        continue
    primary_axis = axes[0][1]
    gate_axis = f"{sport}:{primary_axis}"
    union_family_keys = sorted({fk for (sp, ax) in axes for fk in axis_family_keys(sp, ax)})

    leveled_flags = {gate_mapping[fk]["leveled"] for fk in union_family_keys if fk in gate_mapping}
    require_owned = {"family_keys": union_family_keys}
    hide_when_owned = {"family_keys": union_family_keys}
    if leveled_flags == {True}:
        require_owned["min_level"] = 5
        hide_when_owned["min_level"] = 8
    elif leveled_flags == {False}:
        require_owned["min_rarity"] = "epic"
        hide_when_owned["min_rarity"] = "mystic"
    else:
        # 이 미션이 레벨형 축(예: 누적)과 등급형 축(예: 이정표)을 동시에 연다 — 실측 4건
        # (러닝·자전거·등산·트레일의 "Q1"류, 누적+이정표). `BadgeGateRequirement`는
        # family_keys 전체에 min_rarity **또는** min_level 하나만 걸 수 있어(둘을 섞으면
        # crossGate.ts의 checkGateMissionConsistency가 "등급형 계열에 레벨 조건" 오류로
        # 잡는다 — 실측 확인함), 등급 하한을 아예 걸지 않는다. "이 계열 중 하나라도 보유"로
        # 완화되지만 안전하다(자동통과가 아니라 노출 판정 완화일 뿐 — 발급 게이트는 각 배지의
        # cross_between_axis/min_level이 그대로 지킨다).
        pass
    visibility_rule = {
        "require_owned": require_owned,
        "hide_when_owned": hide_when_owned,
        "unmet_visibility": "locked",
    }

    condition_json = {MISSION_VALUE_KEY[mtype]: value, "activity_type": sport}
    activity_type_literal = sport

    if warn:
        warn_lines.append(f"[WARN] {family_key}({title}): {warn}")

    sql_parts.append(f"""-- {family_key} · {title} (여는 축: {', '.join(f'{s}:{a}' for s, a in axes)})
WITH target_badge AS (
  SELECT id FROM public.badges
   WHERE family_key = '{family_key}' AND type = 'activity' AND deleted_at IS NULL
   LIMIT 1
), upd AS (
  UPDATE public.missions m
     SET gate_axis = '{gate_axis}',
         gate_stage = 'epic_to_mystic',
         gated_badge_id = NULL,
         visibility_rule_json = '{jsonb(visibility_rule)}'::jsonb,
         reward_badge_ids = ARRAY(SELECT id FROM target_badge),
         reward_points = NULL
   WHERE m.title = '{title}' AND m.gate_axis IS NULL
  RETURNING m.id
)
INSERT INTO public.missions (
  title, description, mission_type, condition_json, reward_badge_ids, reward_points,
  status_display_type, visible_rank_count, gated_badge_id, gate_axis, gate_stage,
  visibility_rule_json, starts_at, ends_at, max_completions, image_url
)
SELECT '{title}', '미션으로만 얻는 열쇠입니다.', '{mtype}', '{jsonb(condition_json)}'::jsonb,
       ARRAY(SELECT id FROM target_badge), NULL,
       'achievement', NULL, NULL, '{gate_axis}', 'epic_to_mystic',
       '{jsonb(visibility_rule)}'::jsonb, now(), NULL, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM upd)
  AND NOT EXISTS (SELECT 1 FROM public.missions WHERE title = '{title}');""")

print("\n\n".join(sql_parts))
import sys
print(f"-- 생성: 미션 {len(sql_parts)}건", file=sys.stderr)
for w in warn_lines:
    print(w, file=sys.stderr)

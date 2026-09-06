# -*- coding: utf-8 -*-
"""
게이트 미션 40종(걷기 8 + 4종목 32) 시딩 SQL 생성 (티켓 20260906_2231)

입력 (전부 저장소 안, 한 줄도 수정하지 않는다)
  · v5_mission_axis_groups.json  걷기 미션 8종 정본(이름·여는축·미션조건)
  · v5_mission_badges.json       4종목 미션 보상 배지 32종 정본(이름·설명·여는축·미션_달성조건)
  · v5_gate_build.py             축→미션코드 매핑(MISSION_MAP)·family_keys_of_axis 재사용
                                  (이 티켓은 그 매핑을 다시 만들지 않는다 — 100% 확정본)

출력
  · ../../../jam-web/supabase/migrations/seed_v5_gate_missions.sql (INSERT, 미실행)

⚠️ 이 스크립트는 SQL 파일을 «쓰기»만 한다. DB에 접속하지 않는다.

## 기계적 추출 vs 수기 인코딩 (감사 노트)
- **축→미션코드 매핑·family_keys_of_axis**: `v5_gate_build.py`(티켓 20260906_1947)를 그대로
  재사용한다 — 다시 만들지 않는다(이 티켓 지시사항).
- **미션 이름·완료 문구**: `v5_mission_axis_groups.json`/`v5_mission_badges.json`의 이름·
  「미션조건」/「미션_달성조건」 문자열을 그대로 옮긴다(새 카피 없음).
- **condition_json(달성 판정 로직)**: 이 파일이 수기로 인코딩한다. 두 정본 JSON에는
  "완료 조건 문장"만 있고 `MissionCondition` 필드 매핑은 없다 — 티켓 20260906_2231이
  32건(+걷기 8건)을 전수 대조해 확정한 매핑을 `CONDITION_BY_CODE`에 그대로 적었다.
  이 매핑이 이 산출물의 유일한 콘텐츠 판단 지점이다(감사 시 이 딕셔너리만 검토하면 된다).
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT_SQL = os.path.join(REPO, 'jam-web', 'supabase', 'migrations', 'seed_v5_gate_missions.sql')

axis_groups = json.load(open(os.path.join(HERE, 'v5_mission_axis_groups.json'), encoding='utf-8'))
mission_badges = json.load(open(os.path.join(HERE, 'v5_mission_badges.json'), encoding='utf-8'))

# v5_gate_build.py(1947)의 축→미션코드 매핑·family_keys_of_axis를 그대로 재사용한다.
GATE_BUILD = os.path.join(HERE, 'v5_gate_build.py')
_gate_src = open(GATE_BUILD, encoding='utf-8').read()
# v5_gate_build.py는 모듈 최상단에서 바로 SQL 파일을 쓴다(사이드이펙트) — 그 실행부(④ 이후,
# "print('총 패치 대상 행'" 시작 직전)까지만 잘라서 재사용한다. family_keys_of_axis·MISSION_MAP·
# FAMS까지가 이 티켓이 필요한 전부다.
_cut = _gate_src.index("# ⑤ 계열 하나(등급형·반복형)의")
_gate_ns = {'__file__': GATE_BUILD, '__name__': '__v5_gate_build_helpers_only__'}
exec(compile(_gate_src[:_cut], GATE_BUILD, 'exec'), _gate_ns)
family_keys_of_axis = _gate_ns['family_keys_of_axis']
MISSION_MAP = _gate_ns['MISSION_MAP']

# ─────────────────────────────────────────────────────────────────────────
# 시간대 상수 — v5_seed_build.py 정본 값 재사용(실제 시딩된 배지 time_range와 동일)
DAWN = {'start': '05:00', 'end': '08:00'}       # 새벽 5시~아침 8시 (걷기 A8·러닝 T1·트레일 T1)
NIGHT_20 = {'start': '20:00', 'end': '05:00'}   # 저녁 8시~새벽 5시 (러닝 T2·트레일 T2)
WEEKEND = ['saturday', 'sunday']

# ─────────────────────────────────────────────────────────────────────────
# 「N주 안에」·「한 번에 … / 1회」류는 개인별 고정 시한(starts_at~ends_at)이 아니라 상시(ends_at
# NULL) 미션으로 둔다 — 걷기 M1(2주 안에 20km)이 이미 이 방식으로 시딩돼 있고
# (`missions.mission_type='distance'`는 참가 시점 이후 누적 합계를 상시로 본다), 게이트 미션
# 어드민 폼도 "게이트 미션은 보통 상시예요"라고 안내한다(GateMissionManager.tsx). "N주 안에"는
# 판정 난이도를 정하는 눈금일 뿐 실제 마감 기한을 걸지 않는다 — 항상 열려 있는 관문 성격과 맞다.

# ─────────────────────────────────────────────────────────────────────────
# `CONDITION_BY_CODE` — 이 티켓의 유일한 콘텐츠 판단 지점. 키는 `{sport}:{code}`.
# 각 값: (title, description, condition_json dict)
CONDITION_BY_CODE = {
    # ── 걷기 8 (v5_mission_axis_groups.json 「걷기_기존_8개」) ──────────────────
    'walking:M1': ('누적의 증명', '2주 안에 20km 걷기',
                   {'activity_type': 'walking', 'distance_km': 20}),
    'walking:M2': ('리듬의 증명', '3주 연속 주 3회 유지',
                   {'activity_type': 'walking', 'weekly_streak': 3, 'weekly_streak_min_count': 3}),
    'walking:M3': ('시간의 증명', '2주 안에 새벽·낮·밤에 각 2회 걷기',
                   {'activity_type': 'walking', 'time_band_counts': [
                       {'start': '05:00', 'end': '08:00', 'count': 2},
                       {'start': '08:00', 'end': '22:00', 'count': 2},
                       {'start': '22:00', 'end': '05:00', 'count': 2},
                   ]}),
    'walking:M4': ('요일의 증명', '2주 안에 서로 다른 5개 요일에 걷기',
                   {'activity_type': 'walking', 'distinct_weekday_count': 5}),
    'walking:M5': ('연속의 증명', '7일 연속 걷기',
                   {'activity_type': 'walking', 'streak_days': 7}),
    'walking:M6': ('이정표의 증명', '한 번에 8km 이상 걷기',
                   {'activity_type': 'walking', 'single_distance_km': 8}),
    'walking:M7': ('회복의 증명', '4주 동안 매주 하루 이상 쉬면서 주 3회 유지',
                   {'activity_type': 'walking', 'weekly_streak': 4, 'weekly_streak_min_count': 3}),
    'walking:M8': ('계절의 증명', '서로 다른 두 달에 각각 30km 걷기',
                   {'activity_type': 'walking', 'distinct_months_required': 2,
                    'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 30}),

    # ── 러닝 8 (v5_mission_badges.json R-Q1~Q8) ────────────────────────────
    'running:Q1': ('쌓인 거리의 증명', '2주 안에 80km',
                   {'activity_type': 'running', 'distance_km': 80}),
    'running:Q2': ('페이스의 증명', "4주 안에 한 번에 10km 이상, 5:30/km보다 빠르게 / 3회",
                   {'activity_type': 'running', 'single_distance_km': 10,
                    'max_pace_sec_per_km': 330, 'repeat_count': 3}),
    'running:Q3': ('먼 하루의 증명', '4주 안에 한 번에 25km 이상 / 2회',
                   {'activity_type': 'running', 'single_distance_km': 25, 'repeat_count': 2}),
    'running:Q4': ('반복의 증명', '3주(월~일) 연속 한 주에 4회',
                   {'activity_type': 'running', 'weekly_streak': 3, 'weekly_streak_min_count': 4}),
    'running:Q5': ('시간표의 증명', '2주 안에 새벽·밤 각 2회, 서로 다른 5개 요일',
                   {'activity_type': 'running', 'distinct_weekday_count': 5, 'time_band_counts': [
                       dict(DAWN, count=2), dict(NIGHT_20, count=2),
                   ]}),
    'running:Q6': ('연이은 날의 증명', '7일 연속',
                   {'activity_type': 'running', 'streak_days': 7}),
    'running:Q7': ('쉼표의 증명', '4주(월~일) 연속 한 주에 4회, 매주 2일 이상 휴식',
                   {'activity_type': 'running', 'weekly_streak': 4, 'weekly_streak_min_count': 4}),
    'running:Q8': ('사계의 증명', '서로 다른 두 달에 각각 120km',
                   {'activity_type': 'running', 'distinct_months_required': 2,
                    'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 120}),

    # ── 자전거 8 (C-Q1~Q8) ──────────────────────────────────────────────────
    'cycling:Q1': ('바퀴 자국의 증명', '2주 안에 330km',
                   {'activity_type': 'cycling', 'distance_km': 330}),
    'cycling:Q2': ('속도의 증명', '4주 안에 한 번에 30km 이상, 평균 속도 25km/h 이상 / 3회',
                   {'activity_type': 'cycling', 'single_distance_km': 30,
                    'min_speed_kmh': 25, 'repeat_count': 3}),
    'cycling:Q3': ('지평선의 증명', '4주 안에 한 번에 130km 이상 / 2회',
                   {'activity_type': 'cycling', 'single_distance_km': 130, 'repeat_count': 2}),
    'cycling:Q4': ('언덕의 증명', '4주 안에 한 번에 상승고도 1,200m 이상 / 2회',
                   {'activity_type': 'cycling', 'single_elevation_m': 1200, 'repeat_count': 2}),
    'cycling:Q5': ('주말의 증명', '3주(월~일) 연속 한 주에 3회, 매주 주말 1회 이상',
                   {'activity_type': 'cycling', 'weekly_streak': 3, 'weekly_streak_min_count': 3,
                    'streak_subset': {'day_of_week': WEEKEND, 'min_count': 1}}),
    'cycling:Q6': ('이어진 바퀴의 증명', '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상',
                   {'activity_type': 'cycling', 'streak_days': 3, 'weekly_streak': 4}),
    'cycling:Q7': ('빈 안장의 증명', '8주 안에 한 번에 100km 이상, 다음 날 휴식 / 3회',
                   {'activity_type': 'cycling', 'single_distance_km': 100,
                    'rest_after_long': 1, 'repeat_count': 3}),
    'cycling:Q8': ('추위와 더위의 증명', '서로 다른 두 달에 각각 500km',
                   {'activity_type': 'cycling', 'distinct_months_required': 2,
                    'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 500}),

    # ── 등산 8 (H-Q1~Q8) ────────────────────────────────────────────────────
    'hiking:Q1': ('쌓인 고도의 증명', '2개월 안에 상승고도 5,000m',
                  {'activity_type': 'hiking', 'elevation_gain_m': 5000}),
    'hiking:Q2': ('높이의 증명', '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 / 1회',
                  {'activity_type': 'hiking', 'single_elevation_m': 1000,
                   'max_elevation_m': 1200, 'same_activity': True}),
    'hiking:Q3': ('긴 산행의 증명', '3개월 안에 한 번에 6시간 이상 / 2회',
                  {'activity_type': 'hiking', 'duration_minutes': 360, 'repeat_count': 2}),
    'hiking:Q4': ('발길의 증명', '3개월 연속 한 달에 4회, 매달 주말 2회 이상',
                  {'activity_type': 'hiking', 'monthly_streak': 3, 'monthly_streak_min_count': 4,
                   'streak_subset': {'day_of_week': WEEKEND, 'min_count': 2}}),
    'hiking:Q5': ('이어진 능선의 증명', '3일 연속',
                  {'activity_type': 'hiking', 'streak_days': 3}),
    'hiking:Q6': ('돌아오는 산의 증명', '6개월 연속 한 달에 2회 이상',
                  {'activity_type': 'hiking', 'monthly_streak': 6, 'monthly_streak_min_count': 2}),
    'hiking:Q7': ('하산 뒤의 증명', '3개월 안에 한 번에 5시간 이상, 다음 날 휴식 / 2회',
                  {'activity_type': 'hiking', 'duration_minutes': 300,
                   'rest_after_long': 1, 'repeat_count': 2}),
    'hiking:Q8': ('눈과 볕의 증명', '서로 다른 두 달에 각각 상승고도 1,800m',
                  {'activity_type': 'hiking', 'distinct_months_required': 2,
                   'distinct_months_metric': 'elevation_gain_m', 'distinct_months_threshold': 1800}),

    # ── 트레일러닝 8 (T-Q1~Q8) ─────────────────────────────────────────────
    'trail_running:Q1': ('오르내린 거리의 증명', '2주 안에 80km, 상승고도 1,600m',
                         {'activity_type': 'trail_running', 'distance_km': 80, 'elevation_gain_m': 1600}),
    'trail_running:Q2': ('오르막의 증명', '8주 안에 한 번에 25km 이상, 상승고도 800m 이상 / 2회',
                         {'activity_type': 'trail_running', 'single_distance_km': 25,
                          'single_elevation_m': 800, 'repeat_count': 2}),
    'trail_running:Q3': ('울트라의 증명', '한 번에 42km 이상 / 1회',
                         {'activity_type': 'trail_running', 'single_distance_km': 42}),
    'trail_running:Q4': ('수직의 증명', '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 / 1회',
                         {'activity_type': 'trail_running', 'single_elevation_m': 1500,
                          'max_elevation_m': 1200, 'same_activity': True}),
    'trail_running:Q5': ('해뜨기 전의 증명', '3주(월~일) 연속 한 주에 3회, 매주 새벽 5시~아침 8시 1회 이상',
                         {'activity_type': 'trail_running', 'weekly_streak': 3, 'weekly_streak_min_count': 3,
                          'streak_subset': {'time_range': DAWN, 'min_count': 1}}),
    'trail_running:Q6': ('이어 달린 산길의 증명', '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상',
                         {'activity_type': 'trail_running', 'streak_days': 3, 'weekly_streak': 4}),
    'trail_running:Q7': ('내리막 뒤의 증명', '8주 안에 한 번에 25km 이상, 다음 날 휴식 / 2회',
                         {'activity_type': 'trail_running', 'single_distance_km': 25,
                          'rest_after_long': 1, 'repeat_count': 2}),
    'trail_running:Q8': ('사철 산길의 증명', '서로 다른 두 달에 각각 120km',
                         {'activity_type': 'trail_running', 'distinct_months_required': 2,
                          'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 120}),
}

# 40종(코드 단위) 전부 정의됐는지 대조 — 걷기 8 + 4종목 32
assert len(CONDITION_BY_CODE) == 40, f'40종이어야 하는데 {len(CONDITION_BY_CODE)}종'
for sport, m in MISSION_MAP.items():
    for code in set(m.values()):
        key = f'{sport}:{code}'
        assert key in CONDITION_BY_CODE, f'CONDITION_BY_CODE에 {key} 없음'

# ─────────────────────────────────────────────────────────────────────────
# (sport, axis) → 미션 코드 — MISSION_MAP을 그대로 순회한다(재작업 없음). 축마다 행 하나.
rows = []
for sport, axis_to_code in MISSION_MAP.items():
    for axis, code in axis_to_code.items():
        key = f'{sport}:{code}'
        title, desc, condition = CONDITION_BY_CODE[key]
        fks = family_keys_of_axis(sport, axis)
        assert fks, f'{sport}:{axis} family_keys_of_axis 결과 없음'
        rows.append({
            'sport': sport, 'axis': axis, 'code': code,
            'gate_axis': f'{sport}:{axis}',
            'title': title, 'description': desc,
            'condition_json': condition,
            'reward_family_key': key,
            'visibility_family_keys': fks,
        })

print(f'총 {len(rows)}개 미션 행 (축 기준) — 서로 다른 코드(=보상 배지) {len(CONDITION_BY_CODE)}개')

# ─────────────────────────────────────────────────────────────────────────
# SQL 생성
sql_lines = []


def A(s=''):
    sql_lines.append(s)


def pg_str(s):
    return "'" + s.replace("'", "''") + "'"


def pg_text_array(items):
    return 'ARRAY[' + ','.join(pg_str(i) for i in items) + ']::text[]'


A('-- seed_v5_gate_missions.sql — 게이트 미션 40종(걷기 8 + 4종목 32) 시딩 (티켓 20260906_2231)')
A('--')
A(f'-- 생성: v5_mission_seed_build.py. 대상: {len(rows)}행(축 기준) / {len(CONDITION_BY_CODE)}종(보상 배지 기준).')
A('-- 축→미션코드 매핑은 v5_gate_build.py(1947)의 MISSION_MAP을 그대로 재사용했다(재작업 없음).')
A('--')
A('-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라')
A('--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.')
A('--')
A('-- ⚠️ 실행 전 반드시 확인 — 이 파일은 "missions 테이블이 이 40종 관련 행을 하나도 갖고')
A('--    있지 않다"는 전제로 INSERT만 한다. 마이그레이션 135 하단 주석(2026-09-05 사용자 확정,')
A('--    판단 ②)은 "v5 미션 40개를 새로 만든다"고 명시했고 레거시 게이트 미션 15개(gate_axis')
A('--    없이 gated_badge_id만 있는 행)는 폐기 대상이라고 남겼다 — 그 폐기가 이미 됐는지,')
A('--    또는 이 40종에 해당하는 행이 다른 형태로 이미 존재하는지(예: 걷기 8종이 gate_axis 없이')
A('--    먼저 시딩됐을 가능성) 아래 SELECT로 먼저 확인할 것. 있다면 이 INSERT 전에 정리가')
A('--    필요하다(중복 미션이 생기면 같은 보상 배지를 두 경로로 지급하게 된다).')
A('--')
title_list = sorted({r['title'] for r in rows})
A('--   SELECT id, title, mission_type, gate_axis, gated_badge_id, reward_badge_ids FROM public.missions')
A(f"--    WHERE title = ANY({pg_text_array(title_list)});")
A('--   → 0행이어야 이 INSERT가 안전하다. 1행 이상이면 오케스트레이터가 먼저 처리할 것.')
A('--')
A('BEGIN;')
A('')

for r in sorted(rows, key=lambda r: (r['sport'], r['axis'])):
    condition_json = json.dumps(r['condition_json'], ensure_ascii=False)
    visibility_json = json.dumps({
        'require_owned': {'family_keys': r['visibility_family_keys'], 'min_rarity': 'epic'},
        'hide_when_owned': {'family_keys': r['visibility_family_keys'], 'min_rarity': 'mystic'},
    }, ensure_ascii=False)
    A(f"-- {r['gate_axis']} → {r['reward_family_key']} ({r['title']})")
    A("INSERT INTO public.missions (")
    A("  title, description, mission_type, condition_json, reward_badge_ids,")
    A("  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json")
    A(") VALUES (")
    A(f"  {pg_str(r['title'])}, {pg_str(r['description'])}, 'engine_condition', '{condition_json}'::jsonb,")
    A(f"  ARRAY[(SELECT id FROM public.badges WHERE family_key = {pg_str(r['reward_family_key'])}")
    A("         AND type = 'activity' AND (condition_json->>'mission_reward')::boolean IS TRUE")
    A("         AND deleted_at IS NULL)]::uuid[],")
    A("  'individual', now(), NULL,")
    A(f"  {pg_str(r['gate_axis'])}, 'epic_to_mystic', '{visibility_json}'::jsonb")
    A(");")
    A('')

A('COMMIT;')
A('')
A('-- 🧪 적용 후 검증')
A("--   SELECT count(*) FROM public.missions WHERE mission_type = 'engine_condition';")
A(f'--     → {len(rows)} (축 기준 행 수 — 코드 하나가 여러 축을 여는 경우 같은 보상 배지를 ')
A('--       가리키는 행이 여러 개다. 정상)')
A("--   SELECT count(*) FROM public.missions WHERE mission_type = 'engine_condition'")
A("--     AND (reward_badge_ids IS NULL OR reward_badge_ids = '{}' OR reward_badge_ids[1] IS NULL);")
A('--     → 0 (보상 배지 서브쿼리가 전부 매치돼야 한다 — 1행이라도 있으면 family_key 불일치)')
A("--   SELECT gate_axis, gate_stage, count(*) FROM public.missions")
A("--     WHERE mission_type = 'engine_condition' GROUP BY 1, 2 HAVING count(*) > 1;")
A('--     → 0행 (축·단계 중복 없음 — /admin/gate-missions 정합성 검사와 같은 기준)')

with open(OUT_SQL, 'w', encoding='utf-8') as fp:
    fp.write('\n'.join(sql_lines) + '\n')
print('SQL 저장:', OUT_SQL)

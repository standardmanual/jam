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
  · ../../../jam-web/supabase/migrations/194_missions_condition_text_backfill.sql
    (운영 DB에 이미 들어 있는 53행의 description·condition_text 갱신, 미실행 — 티켓 20260927_0026)

⚠️ 이 스크립트는 SQL 파일을 «쓰기»만 한다. DB에 접속하지 않는다.

## 기계적 추출 vs 수기 인코딩 (감사 노트)
- **축→미션코드 매핑·family_keys_of_axis**: `v5_gate_build.py`(티켓 20260906_1947)를 그대로
  재사용한다 — 다시 만들지 않는다(이 티켓 지시사항).
- **미션 이름**: `v5_mission_axis_groups.json`/`v5_mission_badges.json`의 이름을 그대로 옮긴다.
- **설명·달성 조건 문장(티켓 20260927_0026)**: 티켓 20260927_0025 「컨텐츠 관점」 최종 표(40행)의
  문안을 한 글자도 바꾸지 않고 `CONDITION_BY_CODE`에 옮겼다. 옛 설명은 `PREVIOUS_DESCRIPTION_BY_CODE`에
  남겨 두고, 백필 SQL이 「제목과 옛 설명이 모두 일치하는 행만」 갱신하는 데 쓴다.
- **condition_json(달성 판정 로직)**: 이 파일이 수기로 인코딩한다. 두 정본 JSON에는
  "완료 조건 문장"만 있고 `MissionCondition` 필드 매핑은 없다 — 티켓 20260906_2231이
  32건(+걷기 8건)을 전수 대조해 확정한 매핑을 `CONDITION_BY_CODE`에 그대로 적었다.
  이 매핑이 이 산출물의 유일한 콘텐츠 판단 지점이다(감사 시 이 딕셔너리만 검토하면 된다).

## 레벨형(무한레벨) 축 게이트 처리 (티켓 20260908_1028)
`visibility_rule_json`은 대상 축이 등급형인지 레벨형인지를 FAMS(`f.kind`)로 기계적으로
판정해 분기한다 — 레벨형이면 `min_rarity` 대신 `min_level`(대상 계열 중 최단 사다리 상한/그
절반)을 쓴다. 원래 40종 전부를 등급형으로 취급하던 하드코딩(티켓 20260908_1017에서 발견,
"누적" 축 5종만 데이터로 임시 교정)을 스크립트 레벨에서 일반화한 것 — 새 레벨형 축이 추가돼도
같은 버그가 재발하지 않는다.
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
# 티켓 20260908_1028 — 레벨형(무한레벨) 축 게이트 처리 일반화. FAMS를 재사용해 「이 축이
# 등급형인지 레벨형인지」를 기계적으로 판정한다(더 이상 "누적" 축을 특별 취급하는 하드코딩 없음).
FAMS = _gate_ns['FAMS']
FAM_BY_KEY = {f.family_key: f for f in FAMS}


def max_level_of(fam):
    levels = [lv for r, lv, c in fam.rows if lv is not None]
    return max(levels) if levels else None

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
# 각 값: (title, description, condition_text, condition_json dict)
#   description: 조건의 뉘앙스를 담은 산문 한 문장. condition_text: 달성 조건 카드 첫 줄 문장(마침표 없음).
CONDITION_BY_CODE = {
    # ── 걷기 8 (v5_mission_axis_groups.json 「걷기_기존_8개」) ──────────────────
    'walking:M1': ('누적의 증명', '걸음이 모여 만든 거리를 증명하세요',
                   '2주 안에 20km 걷기',
                   {'activity_type': 'walking', 'distance_km': 20}),
    'walking:M2': ('리듬의 증명', '매주 같은 리듬으로 걷는 습관을 증명하세요',
                   '3주 연속, 한 주에 3번 걷기',
                   {'activity_type': 'walking', 'weekly_streak': 3, 'weekly_streak_min_count': 3}),
    'walking:M3': ('시간의 증명', '새벽에도, 낮에도, 밤에도 걷는 사람임을 증명하세요',
                   '2주 안에 새벽(5~8시)·낮(오전 8시~오후 10시)·밤(오후 10시~새벽 5시)에 각각 2번 걷기',
                   {'activity_type': 'walking', 'time_band_counts': [
                       {'start': '05:00', 'end': '08:00', 'count': 2},
                       {'start': '08:00', 'end': '22:00', 'count': 2},
                       {'start': '22:00', 'end': '05:00', 'count': 2},
                   ]}),
    'walking:M4': ('요일의 증명', '요일에 얽매이지 않는 걸음을 남겨 보세요',
                   '2주 안에 서로 다른 5개 요일에 걷기',
                   {'activity_type': 'walking', 'distinct_weekday_count': 5}),
    'walking:M5': ('연속의 증명', '걷지 않은 날이 하루도 없음을 증명하세요',
                   '7일 연속 걷기',
                   {'activity_type': 'walking', 'streak_days': 7}),
    'walking:M6': ('이정표의 증명', '이정표를 세우듯 성큼 멀리 걸어 보세요',
                   '한 번에 8km 이상 걷기',
                   {'activity_type': 'walking', 'single_distance_km': 8}),
    'walking:M7': ('회복의 증명', '한 주도 놓치지 않고 걸음을 지켜 낸 시간을 증명하세요',
                   '4주 연속, 한 주에 3번 걷기',
                   {'activity_type': 'walking', 'weekly_streak': 4, 'weekly_streak_min_count': 3}),
    'walking:M8': ('계절의 증명', '한 달로 끝나지 않는 한결같은 걸음을 보여 주세요',
                   '서로 다른 두 달에 각각 30km 걷기',
                   {'activity_type': 'walking', 'distinct_months_required': 2,
                    'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 30}),

    # ── 러닝 8 (v5_mission_badges.json R-Q1~Q8) ────────────────────────────
    'running:Q1': ('쌓인 거리의 증명', '차곡차곡 쌓은 거리로 꾸준함을 증명하세요',
                   '2주 안에 80km 달리기',
                   {'activity_type': 'running', 'distance_km': 80}),
    'running:Q2': ('페이스의 증명', '4주 동안 달린 당신의 속도를 증명하세요',
                   '4주 안에 10km 이상을 5:30/km보다 빠르게, 3번 달리기',
                   {'activity_type': 'running', 'single_distance_km': 10,
                    'max_pace_sec_per_km': 330, 'repeat_count': 3}),
    'running:Q3': ('먼 하루의 증명', '하루를 통째로 내어 먼 길을 끝까지 달려 보세요',
                   '4주 안에 한 번에 25km 이상, 2번 달리기',
                   {'activity_type': 'running', 'single_distance_km': 25, 'repeat_count': 2}),
    'running:Q4': ('반복의 증명', '한 번의 열정이 아니라 되풀이되는 리듬을 증명하세요',
                   '3주 연속, 한 주에 4번 달리기',
                   {'activity_type': 'running', 'weekly_streak': 3, 'weekly_streak_min_count': 4}),
    'running:Q5': ('시간표의 증명', '이른 새벽과 깊은 밤, 시간을 가리지 않고 달려 보세요',
                   '2주 안에 새벽(5~8시)과 밤(오후 8시~새벽 5시)에 각각 2번, 서로 다른 5개 요일에 달리기',
                   {'activity_type': 'running', 'distinct_weekday_count': 5, 'time_band_counts': [
                       dict(DAWN, count=2), dict(NIGHT_20, count=2),
                   ]}),
    'running:Q6': ('연이은 날의 증명', '하루도 거르지 않고 달려 낸 나날을 증명하세요',
                   '7일 연속 달리기',
                   {'activity_type': 'running', 'streak_days': 7}),
    'running:Q7': ('쉼표의 증명', '주마다 흐트러짐 없이 달린 박자를 증명하세요',
                   '4주 연속, 한 주에 4번 달리기',
                   {'activity_type': 'running', 'weekly_streak': 4, 'weekly_streak_min_count': 4}),
    'running:Q8': ('사계의 증명', '달력이 넘어가도 식지 않은 발걸음을 증명하세요',
                   '서로 다른 두 달에 각각 120km 달리기',
                   {'activity_type': 'running', 'distinct_months_required': 2,
                    'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 120}),

    # ── 자전거 8 (C-Q1~Q8) ──────────────────────────────────────────────────
    'cycling:Q1': ('바퀴 자국의 증명', '길 위에 길게 남긴 바퀴 자국을 증명하세요',
                   '2주 안에 330km 타기',
                   {'activity_type': 'cycling', 'distance_km': 330}),
    'cycling:Q2': ('속도의 증명', '멀리 가고도 속도를 놓지 않는 라이더임을 증명하세요',
                   '4주 안에 한 번에 30km 이상을 평균 25km/h 이상으로, 3번 타기',
                   {'activity_type': 'cycling', 'single_distance_km': 30,
                    'min_speed_kmh': 25, 'repeat_count': 3}),
    'cycling:Q3': ('지평선의 증명', '지평선이 보일 만큼 멀리 나가 보세요',
                   '4주 안에 한 번에 130km 이상, 2번 타기',
                   {'activity_type': 'cycling', 'single_distance_km': 130, 'repeat_count': 2}),
    'cycling:Q4': ('언덕의 증명', '언덕을 넘고 또 넘는 다리 힘을 증명하세요',
                   '4주 안에 한 번에 상승고도 1,200m 이상, 2번 타기',
                   {'activity_type': 'cycling', 'single_elevation_m': 1200, 'repeat_count': 2}),
    'cycling:Q5': ('주말의 증명', '주말마다 안장에 오르는 사람임을 증명하세요',
                   '3주 연속, 한 주에 3번 타고 매주 주말에 1번 이상 타기',
                   {'activity_type': 'cycling', 'weekly_streak': 3, 'weekly_streak_min_count': 3,
                    'streak_subset': {'day_of_week': WEEKEND, 'min_count': 1}}),
    'cycling:Q6': ('이어진 바퀴의 증명', '굴러가는 바퀴의 흐름이 끊기지 않았음을 보여 주세요',
                   '4주 동안 매주 1번 이상 타고, 3일 연속 타는 날을 한 번 만들기',
                   {'activity_type': 'cycling', 'streak_days': 3, 'weekly_streak': 4}),
    'cycling:Q7': ('빈 안장의 증명', '안장을 비워 두는 하루까지 증명하세요',
                   '8주 안에 한 번에 100km 이상 타고 다음 날 휴식이 있었던 경우 3번',
                   {'activity_type': 'cycling', 'single_distance_km': 100,
                    'rest_after_long': 1, 'repeat_count': 3}),
    'cycling:Q8': ('추위와 더위의 증명', '달을 바꿔 가며 굴린 페달의 뚝심을 보여 주세요',
                   '서로 다른 두 달에 각각 500km 타기',
                   {'activity_type': 'cycling', 'distinct_months_required': 2,
                    'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 500}),

    # ── 등산 8 (H-Q1~Q8) ────────────────────────────────────────────────────
    'hiking:Q1': ('쌓인 고도의 증명', '한 걸음씩 쌓아 올린 높이를 증명하세요',
                  '2개월 안에 상승고도 5,000m 산행하기',
                  {'activity_type': 'hiking', 'elevation_gain_m': 5000}),
    'hiking:Q2': ('높이의 증명', '발밑이 아득해지는 높이까지 한 번에 올라 보세요',
                  '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 산행하기',
                  {'activity_type': 'hiking', 'single_elevation_m': 1000,
                   'max_elevation_m': 1200, 'same_activity': True}),
    'hiking:Q3': ('긴 산행의 증명', '산에서 긴 하루를 보낸 날을 증명하세요',
                  '3개월 안에 한 번에 6시간 이상, 2번 산행하기',
                  {'activity_type': 'hiking', 'duration_minutes': 360, 'repeat_count': 2}),
    'hiking:Q4': ('발길의 증명', '주말의 산을 잊지 않은 발길을 보여 주세요',
                  '3개월 연속, 한 달에 4번 산행하고 그중 주말에 2번 이상 산행하기',
                  {'activity_type': 'hiking', 'monthly_streak': 3, 'monthly_streak_min_count': 4,
                   'streak_subset': {'day_of_week': WEEKEND, 'min_count': 2}}),
    'hiking:Q5': ('이어진 능선의 증명', '하루도 끊지 않고 산으로 향해 보세요',
                  '3일 연속 산행하기',
                  {'activity_type': 'hiking', 'streak_days': 3}),
    'hiking:Q6': ('돌아오는 산의 증명', '계절이 지나도 산으로 돌아오는 사람임을 증명하세요',
                  '6개월 연속, 한 달에 2번 이상 산행하기',
                  {'activity_type': 'hiking', 'monthly_streak': 6, 'monthly_streak_min_count': 2}),
    'hiking:Q7': ('하산 뒤의 증명', '산에서 내려온 다음 날, 몸을 내려놓는 하루까지 보여 주세요',
                  '3개월 안에 한 번에 5시간 이상 산행하고 다음 날 휴식이 있었던 경우 2번',
                  {'activity_type': 'hiking', 'duration_minutes': 300,
                   'rest_after_long': 1, 'repeat_count': 2}),
    'hiking:Q8': ('눈과 볕의 증명', '다른 달, 다른 얼굴의 산을 모두 올라 보세요',
                  '서로 다른 두 달에 각각 상승고도 1,800m 산행하기',
                  {'activity_type': 'hiking', 'distinct_months_required': 2,
                   'distinct_months_metric': 'elevation_gain_m', 'distinct_months_threshold': 1800}),

    # ── 트레일러닝 8 (T-Q1~Q8) ─────────────────────────────────────────────
    'trail_running:Q1': ('오르내린 거리의 증명', '오르고 내리며 채운 거리와 높이를 증명하세요',
                         '2주 안에 80km, 상승고도 1,600m 달리기',
                         {'activity_type': 'trail_running', 'distance_km': 80, 'elevation_gain_m': 1600}),
    'trail_running:Q2': ('오르막의 증명', '길고 가파른 오르막을 거듭 넘어 보세요',
                         '8주 안에 한 번에 25km 이상, 상승고도 800m 이상을 2번 달리기',
                         {'activity_type': 'trail_running', 'single_distance_km': 25,
                          'single_elevation_m': 800, 'repeat_count': 2}),
    'trail_running:Q3': ('울트라의 증명', '마라톤의 거리를 산길 위에서 한 번에 넘어 보세요',
                         '한 번에 42km 이상 달리기',
                         {'activity_type': 'trail_running', 'single_distance_km': 42}),
    'trail_running:Q4': ('수직의 증명', '한 번의 달리기로 하늘 가까이 닿아 보세요',
                         '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 달리기',
                         {'activity_type': 'trail_running', 'single_elevation_m': 1500,
                          'max_elevation_m': 1200, 'same_activity': True}),
    'trail_running:Q5': ('해뜨기 전의 증명', '이른 새벽 산길에서 하루를 열어 보세요',
                         '3주 연속, 한 주에 3번 달리고 매주 새벽 5시~아침 8시에 1번 이상 달리기',
                         {'activity_type': 'trail_running', 'weekly_streak': 3, 'weekly_streak_min_count': 3,
                          'streak_subset': {'time_range': DAWN, 'min_count': 1}}),
    'trail_running:Q6': ('이어 달린 산길의 증명', '산길을 향한 발걸음이 흐름을 놓치지 않았음을 보여 주세요',
                         '4주 동안 매주 1번 이상 달리고, 3일 연속 달리는 날을 한 번 만들기',
                         {'activity_type': 'trail_running', 'streak_days': 3, 'weekly_streak': 4}),
    'trail_running:Q7': ('내리막 뒤의 증명', '내리막이 끝난 다음 날, 발을 멈추는 하루까지 증명하세요',
                         '8주 안에 한 번에 25km 이상 달리고 다음 날 휴식이 있었던 경우 2번',
                         {'activity_type': 'trail_running', 'single_distance_km': 25,
                          'rest_after_long': 1, 'repeat_count': 2}),
    'trail_running:Q8': ('사철 산길의 증명', '달이 달라져도 산길을 꾸준히 달려 보세요',
                         '서로 다른 두 달에 각각 120km 달리기',
                         {'activity_type': 'trail_running', 'distinct_months_required': 2,
                          'distinct_months_metric': 'distance_km', 'distinct_months_threshold': 120}),
}

# 시딩 당시(티켓 20260906_2231)의 옛 설명 — 백필 SQL의 「옛 설명 일치」 조건에만 쓴다.
PREVIOUS_DESCRIPTION_BY_CODE = {
    'walking:M1': '2주 안에 20km 걷기',
    'walking:M2': '3주 연속 주 3회 유지',
    'walking:M3': '2주 안에 새벽·낮·밤에 각 2회 걷기',
    'walking:M4': '2주 안에 서로 다른 5개 요일에 걷기',
    'walking:M5': '7일 연속 걷기',
    'walking:M6': '한 번에 8km 이상 걷기',
    'walking:M7': '4주 동안 매주 하루 이상 쉬면서 주 3회 유지',
    'walking:M8': '서로 다른 두 달에 각각 30km 걷기',
    'running:Q1': '2주 안에 80km',
    'running:Q2': '4주 안에 한 번에 10km 이상, 5:30/km보다 빠르게 / 3회',
    'running:Q3': '4주 안에 한 번에 25km 이상 / 2회',
    'running:Q4': '3주(월~일) 연속 한 주에 4회',
    'running:Q5': '2주 안에 새벽·밤 각 2회, 서로 다른 5개 요일',
    'running:Q6': '7일 연속',
    'running:Q7': '4주(월~일) 연속 한 주에 4회, 매주 2일 이상 휴식',
    'running:Q8': '서로 다른 두 달에 각각 120km',
    'cycling:Q1': '2주 안에 330km',
    'cycling:Q2': '4주 안에 한 번에 30km 이상, 평균 속도 25km/h 이상 / 3회',
    'cycling:Q3': '4주 안에 한 번에 130km 이상 / 2회',
    'cycling:Q4': '4주 안에 한 번에 상승고도 1,200m 이상 / 2회',
    'cycling:Q5': '3주(월~일) 연속 한 주에 3회, 매주 주말 1회 이상',
    'cycling:Q6': '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상',
    'cycling:Q7': '8주 안에 한 번에 100km 이상, 다음 날 휴식 / 3회',
    'cycling:Q8': '서로 다른 두 달에 각각 500km',
    'hiking:Q1': '2개월 안에 상승고도 5,000m',
    'hiking:Q2': '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 / 1회',
    'hiking:Q3': '3개월 안에 한 번에 6시간 이상 / 2회',
    'hiking:Q4': '3개월 연속 한 달에 4회, 매달 주말 2회 이상',
    'hiking:Q5': '3일 연속',
    'hiking:Q6': '6개월 연속 한 달에 2회 이상',
    'hiking:Q7': '3개월 안에 한 번에 5시간 이상, 다음 날 휴식 / 2회',
    'hiking:Q8': '서로 다른 두 달에 각각 상승고도 1,800m',
    'trail_running:Q1': '2주 안에 80km, 상승고도 1,600m',
    'trail_running:Q2': '8주 안에 한 번에 25km 이상, 상승고도 800m 이상 / 2회',
    'trail_running:Q3': '한 번에 42km 이상 / 1회',
    'trail_running:Q4': '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 / 1회',
    'trail_running:Q5': '3주(월~일) 연속 한 주에 3회, 매주 새벽 5시~아침 8시 1회 이상',
    'trail_running:Q6': '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상',
    'trail_running:Q7': '8주 안에 한 번에 25km 이상, 다음 날 휴식 / 2회',
    'trail_running:Q8': '서로 다른 두 달에 각각 120km',
}

# 40종(코드 단위) 전부 정의됐는지 대조 — 걷기 8 + 4종목 32
assert len(CONDITION_BY_CODE) == 40, f'40종이어야 하는데 {len(CONDITION_BY_CODE)}종'
assert set(PREVIOUS_DESCRIPTION_BY_CODE) == set(CONDITION_BY_CODE), '옛 설명 표와 문안 표의 키가 다르다'
# 티켓 20260927_0025 최종 표 검증(티켓 20260927_0026): 40종 전부 새 설명·조건 문장이 있고,
# 한 문장 본문이라 마침표를 찍지 않으며(UX 라이팅 가이드 §3), 설명끼리 겹치지 않는다.
for _key, (_title, _desc, _ctext, _cjson) in CONDITION_BY_CODE.items():
    assert _desc and _ctext, f'{_key} 설명·조건 문장이 비어 있다'
    assert not _desc.rstrip().endswith('.') and not _ctext.rstrip().endswith('.'), f'{_key} 문장 끝에 마침표가 있다'
    assert _desc != PREVIOUS_DESCRIPTION_BY_CODE[_key], f'{_key} 설명이 옛 설명 그대로다'
    assert _desc == _desc.strip() and _ctext == _ctext.strip(), f'{_key} 앞뒤 공백이 있다'
assert len({v[1] for v in CONDITION_BY_CODE.values()}) == 40, '설명이 서로 겹친다'
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
        title, desc, condition_text, condition = CONDITION_BY_CODE[key]
        fks = family_keys_of_axis(sport, axis)
        assert fks, f'{sport}:{axis} family_keys_of_axis 결과 없음'
        rows.append({
            'sport': sport, 'axis': axis, 'code': code,
            'gate_axis': f'{sport}:{axis}',
            'title': title, 'description': desc,
            'previous_description': PREVIOUS_DESCRIPTION_BY_CODE[key],
            'condition_text': condition_text,
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
A('-- 티켓 20260927_0026: 설명은 산문, 달성 조건 문장은 condition_text 칸(193_missions_condition_text.sql)에 넣는다.')
A('-- 이 INSERT는 193 적용 뒤에만 실행할 수 있다. 이미 시딩된 운영 DB는 194_missions_condition_text_backfill.sql로 갱신한다.')
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
    vis_fams = [FAM_BY_KEY[fk] for fk in r['visibility_family_keys'] if fk in FAM_BY_KEY]
    # 티켓 20260908_1028: 대상 축이 레벨형(무한레벨, rarity 없음)이면 min_rarity가 영원히
    # 불충족이다(rarityTier(null)=0) — min_level로 교체한다. 값 산정 기준은 티켓 20260908_1017의
    # 수기 확정과 동일: hide_when_owned = 대상 계열 중 최단 사다리 상한, require_owned = 그 절반
    # (반올림 없이 내림).
    if vis_fams and all(f.kind == 'leveled' for f in vis_fams):
        max_levels = [max_level_of(f) for f in vis_fams]
        assert all(lv is not None for lv in max_levels), f"{r['gate_axis']} 레벨형 계열에 레벨 행 없음"
        shortest_max = min(max_levels)
        visibility_json = json.dumps({
            'require_owned': {'family_keys': r['visibility_family_keys'], 'min_level': shortest_max // 2},
            'hide_when_owned': {'family_keys': r['visibility_family_keys'], 'min_level': shortest_max},
        }, ensure_ascii=False)
    else:
        visibility_json = json.dumps({
            'require_owned': {'family_keys': r['visibility_family_keys'], 'min_rarity': 'epic'},
            'hide_when_owned': {'family_keys': r['visibility_family_keys'], 'min_rarity': 'mystic'},
        }, ensure_ascii=False)
    A(f"-- {r['gate_axis']} → {r['reward_family_key']} ({r['title']})")
    A("INSERT INTO public.missions (")
    A("  title, description, condition_text, mission_type, condition_json, reward_badge_ids,")
    A("  status_display_type, starts_at, ends_at, gate_axis, gate_stage, visibility_rule_json")
    A(") VALUES (")
    A(f"  {pg_str(r['title'])}, {pg_str(r['description'])}, {pg_str(r['condition_text'])}, 'engine_condition', '{condition_json}'::jsonb,")
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

# ─────────────────────────────────────────────────────────────────────────
# 백필 SQL (티켓 20260927_0026) — 이미 시딩된 53행의 description·condition_text 갱신.
# 제목·옛 설명·mission_type이 모두 일치하는 행만 갱신한다(어드민이 손댄 행은 건드리지 않는다).
OUT_BACKFILL = os.path.join(REPO, 'jam-web', 'supabase', 'migrations', '194_missions_condition_text_backfill.sql')
bf = []


def B(s=''):
    bf.append(s)


_pairs = [(v[0], PREVIOUS_DESCRIPTION_BY_CODE[k], v[1], v[2]) for k, v in CONDITION_BY_CODE.items()]

B('-- 194: 게이트 미션 53행의 설명(산문)·달성 조건 문장 반영 (티켓 20260927_0026)')
B('--')
B('-- 생성: docs/assets/content-seed/v5_mission_seed_build.py. 문안은 티켓 20260927_0025 「컨텐츠 관점」 최종 표(40종)다.')
B('--')
B('-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**')
B('--    실행은 사용자 승인 후 오케스트레이터가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB라')
B('--    실행하는 순간 프로덕션 화면에 나타난다.')
B('--')
B('-- 실행 순서(DB 실행 4단계 중 ③):')
B('--   ① 193_missions_condition_text.sql(컬럼 추가) 실행')
B('--   ② 화면 코드(condition_text 표시)가 staging에 머지·확인된 뒤에')
B('--   ③ 이 파일 실행 — 갱신 건수가 53이어야 한다(아래 SELECT 결과).')
B('--   ④ 조회로 검증')
B('--')
B('-- 갱신 조건: title·description(옛 설명)·mission_type이 모두 일치하는 행만 갱신한다. 어드민이 이미 고친 행은')
B('-- 옛 설명과 달라 갱신되지 않으므로, 갱신 건수가 53보다 작으면 COMMIT하지 말고 남은 행을 확인한다.')
B('-- 재실행해도 안전하다(이미 갱신된 행은 옛 설명이 아니라서 다시 갱신되지 않는다).')
B('')
B('BEGIN;')
B('')
B('CREATE TEMP TABLE _mission_text_backfill (')
B('  title TEXT NOT NULL, previous_description TEXT NOT NULL,')
B('  new_description TEXT NOT NULL, condition_text TEXT NOT NULL')
B(') ON COMMIT DROP;')
B('')
B('INSERT INTO _mission_text_backfill (title, previous_description, new_description, condition_text) VALUES')
B(',\n'.join(f"  ({pg_str(a)}, {pg_str(b)}, {pg_str(c)}, {pg_str(d)})" for a, b, c, d in _pairs) + ';')
B('')
B('WITH updated AS (')
B('  UPDATE public.missions m')
B('     SET description = b.new_description, condition_text = b.condition_text')
B('    FROM _mission_text_backfill b')
B("   WHERE m.mission_type = 'engine_condition'")
B('     AND m.gate_axis IS NOT NULL')
B('     AND m.title = b.title')
B('     AND m.description = b.previous_description')
B('  RETURNING m.id')
B(')')
B('SELECT count(*) AS updated_rows FROM updated;')
B(f'--   → {len(rows)} (축 기준 행 수. 다르면 COMMIT 대신 ROLLBACK하고 원인을 확인한다)')
B('')
B('COMMIT;')
B('')
B('-- 🧪 적용 후 검증')
B("--   SELECT count(*) FROM public.missions WHERE mission_type = 'engine_condition' AND condition_text IS NOT NULL;")
B(f'--     → {len(rows)}')
B("--   SELECT count(*) FROM public.missions WHERE condition_text ~ '[.]$' OR description ~ '[.]$';")
B('--     → 0 (마침표로 끝나는 문장 없음)')
B('')
B('-- 되돌림 SQL')
B('-- 위와 같은 VALUES 목록으로 임시 표(_mission_text_backfill)를 다시 만든 뒤 아래를 실행한다.')
B('-- UPDATE public.missions m SET description = b.previous_description, condition_text = NULL')
B("--   FROM _mission_text_backfill b WHERE m.mission_type = 'engine_condition' AND m.gate_axis IS NOT NULL")
B('--    AND m.title = b.title AND m.description = b.new_description;')
with open(OUT_BACKFILL, 'w', encoding='utf-8') as fp:
    fp.write('\n'.join(bf) + '\n')
print('백필 SQL 저장:', OUT_BACKFILL)

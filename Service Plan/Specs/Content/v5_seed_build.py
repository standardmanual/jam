# -*- coding: utf-8 -*-
"""
v5 액티비티 배지 카탈로그 → 시드 SQL 생성 + 드라이런 검증 (티켓 20260905_0035 B1)

입력 (전부 저장소 안, 한 줄도 수정하지 않는다)
  · v5_catalog_design.json    설계 원본 — 계열·축·사다리 값
  · v5_catalog_verified.json  A묶음 검증 정본 — 위상 조정 2건·필터키 조합
  · v5_catalog_writing.json   이름·설명·조건문 정본 (이름 분화 29건 반영본)
  · v5_mission_badges.json    4종목 미션 보상 배지 32종

출력
  · ../../../jam-web/supabase/migrations/seed_v5_activity_badges.sql
  · 콘솔 드라이런 리포트 (트리거·CHECK·family_key·중복·행 수)

⚠️ 이 스크립트는 SQL 파일을 «쓰기»만 한다. DB에 접속하지 않는다.

실행: python3 "Service Plan/Specs/Content/v5_seed_build.py"
"""
import json
import os
import re
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT_SQL = os.path.join(REPO, 'jam-web', 'supabase', 'migrations', 'seed_v5_activity_badges.sql')

design = json.load(open(os.path.join(HERE, 'v5_catalog_design.json'), encoding='utf-8'))
verified = json.load(open(os.path.join(HERE, 'v5_catalog_verified.json'), encoding='utf-8'))
writing = json.load(open(os.path.join(HERE, 'v5_catalog_writing.json'), encoding='utf-8'))
missions = json.load(open(os.path.join(HERE, 'v5_mission_badges.json'), encoding='utf-8'))

# ─────────────────────────────────────────────────────────────────────────
# 종목 키 — 구 카탈로그와 같은 값을 쓴다 (티켓 확정 ⑦)
SPORT_KEY = {
    '걷기': 'walking',
    '러닝': 'running',
    '자전거': 'cycling',
    '등산': 'hiking',
    '트레일': 'trail_running',
    '트레일러닝': 'trail_running',
}
CODE_PREFIX = re.compile(r'^[RCHT]-')

# 시간대 상수 — 조건문 정본의 표기를 그대로 옮긴다
DAWN = {'start': '05:00', 'end': '08:00'}          # 새벽 5시~아침 8시
NIGHT_22 = {'start': '22:00', 'end': '05:00'}      # 밤 10시~새벽 5시
NIGHT_20 = {'start': '20:00', 'end': '05:00'}      # 저녁 8시~새벽 5시
LUNCH = {'start': '12:00', 'end': '14:00'}         # 낮 12시~2시
MIDNIGHT = {'start': '23:00', 'end': '01:00'}      # 자정을 넘긴 활동 (근사)
SUN_MOON = {'start': '20:00', 'end': '08:00'}      # 아침 8시 이전 · 저녁 8시 이후 (근사)

WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
WEEKEND = ['saturday', 'sunday']
SUMMER = [7, 8]
WINTER = [12, 1, 2]
RAINY = [6, 7]

C, R, E, M = 'common', 'rare', 'epic', 'mystic'

# ─────────────────────────────────────────────────────────────────────────
# 시딩 제외 — 「표현 수단이 레지스트리에 아예 없다」인 계열만 뺀다.
#   (근사로 옮긴 계열은 빼지 않고 APPROX에 기록해 보고한다)
EXCLUDED = OrderedDict([
    ('R-S1', 'negative_split — splits 수집이 v5 1차에서 빠졌다 (티켓 20260905_0029 확정)'),
    ('K2', '누적 이동시간을 담는 조건 키가 레지스트리에 없다 (duration_minutes는 «단일 활동»)'),
    ('R-K2', '누적 이동시간 키 없음 (걷기 K2와 같은 사유)'),
    ('H-K2', '누적 이동시간 키 없음 — A묶음의 위상 조정(170→180시간)도 함께 소멸한다'),
    ('C-G2', '«한 달 활동 횟수» 키 없음 — monthly_km는 거리이고 weekly_count는 주 단위다'),
    ('H-C2', '«한 달 활동 횟수» 키 없음 (C-G2와 같은 사유)'),
])

# 조건을 근사로 옮긴 계열 — 시드 SQL에 주석으로 표시하고 보고서에도 싣는다
APPROX = {
    'A1': '「자정을 넘긴 활동」은 시작 시각 범위로만 근사할 수 있다 (23:00~01:00)',
    'A2': '「같은 날 아침 이전 + 저녁 이후 각 1회」를 20:00~08:00 한 구간으로 근사',
    'A5': '「토·일 0회」(부정 조건)를 표현할 수 없다 — 평일 요일 목록 + 연속 주로 근사',
    'R2': '「90분 이상 활동 다음 날 휴식」 — rest_after_long의 짝 필드가 single_distance_km 하나뿐이라 duration_minutes와 짝지을 수 없다',
    'R3': '「매주 하루 이상 휴식」을 표현할 수 없다 — 연속 주(weekly_streak)로만 근사',
    'D3': '「한 주에 평일 5일 모두」를 요일별 독립 카운터(day_of_week 배열 + total_count)로 근사',
    'R-T3': 'A2와 같은 근사',
    'R-D2': '「주말」을 요일별 독립 카운터로 근사 — 토·일 각각 N회를 요구한다',
    'C-D1': '「주말」을 요일별 독립 카운터로 근사',
    'C-D2': '「평일」을 요일별 독립 카운터로 근사',
    'H-D1': '「주말」을 요일별 독립 카운터로 근사',
    'H-X1': '「8시간 이상 산행 다음 날 휴식」 — R2와 같은 짝 필드 제약',
    'B2': '「최장 이동시간 갱신」과 「최장 거리 갱신」(B1)을 구분할 지표 지정 수단이 없다',
    'H-R2': 'H-R1과 같은 사유 — personal_record_break에 지표 지정이 없다',
    'T-R2': 'T-R1·T-R3와 같은 사유',
    'T-R3': 'T-R1·T-R2와 같은 사유',
    'R-R2': '「5km 이상 활동의 최고 페이스 갱신」 — 지표 지정 수단이 없어 single_distance_km로 대상만 좁혔다',
}


def cond(**kw):
    """조건 dict — 선언 순서를 유지한다"""
    return OrderedDict(kw)


class Fam:
    """계열 하나. rows = [(rarity, level, condition)]"""

    def __init__(self, sport, code, kind, rows, axis=''):
        self.sport = sport
        self.code = code
        self.kind = kind  # graded | repeatable | leveled | auto | mission
        self.rows = rows
        self.axis = axis

    @property
    def sport_key(self):
        return SPORT_KEY[self.sport]

    @property
    def family_key(self):
        return f'{self.sport_key}:{CODE_PREFIX.sub("", self.code)}'


FAMS = []


def add(sport, code, kind, rows, axis=''):
    FAMS.append(Fam(sport, code, kind, rows, axis))


def graded(sport, code, tiers, axis=''):
    """등급형 — [(rarity, condition), ...]"""
    add(sport, code, 'graded', [(r, None, c) for r, c in tiers], axis)


def repeatable(sport, code, base, ladder, axis=''):
    """반복형 — base 조건 + 등급별 repeat_count. ladder = [(rarity, n), ...]"""
    rows = []
    for rarity, n in ladder:
        c = cond(**base)
        c['repeat_count'] = n
        rows.append((rarity, None, c))
    add(sport, code, 'repeatable', rows, axis)


def leveled(sport, code, key, values, extra=None, axis=''):
    """무한레벨형(명시 임계값) — Lv.1..N"""
    rows = []
    for i, v in enumerate(values, start=1):
        c = cond(**(extra or {}))
        c[key] = v
        rows.append((None, i, c))
    add(sport, code, 'leveled', rows, axis)


AUTO_LEVELS = verified['규모_정본']['자동상승형_시드레벨수']  # = 8


def auto(sport, code, extra=None, axis=''):
    """자동 상승형(기록 갱신) — Lv.1..8, personal_record_break = 레벨"""
    rows = []
    for lv in range(1, AUTO_LEVELS + 1):
        c = cond(**(extra or {}))
        c['personal_record_break'] = lv
        rows.append((None, lv, c))
    add(sport, code, 'auto', rows, axis)


def mission(sport, code):
    """미션 보상 배지 — 동기화 평가 대상이 아니다(condition_json.mission_reward)"""
    c = cond(activity_type=SPORT_KEY[sport], mission_reward=True)
    add(sport, code, 'mission', [(E, None, c)], '미션')


# =========================================================================
# 걷기 (walking) — 48계열
# =========================================================================
W = '걷기'
AT = {'activity_type': 'walking'}

for i in range(1, 9):
    mission(W, f'M{i}')

leveled(W, 'K1', 'distance_km', [5, 15, 40, 75, 130, 210, 330, 550], AT, '누적')
# K2(누적 이동시간)는 EXCLUDED
leveled(W, 'K3', 'active_days_count', [3, 8, 22, 40, 70, 110], AT, '누적')

graded(W, 'P1', [(r, cond(**AT, active_days_count=v))
                 for r, v in [(C, 1), (R, 30), (E, 100), (M, 300)]], '주기')
repeatable(W, 'P2', cond(**AT, weekly_count=3),
           [(C, 1), (R, 8), (E, 26), (M, 52)], '주기')
graded(W, 'P3', [(r, cond(**AT, monthly_km=v))
                 for r, v in [(C, 30), (R, 52), (E, 85), (M, 130)]], '주기')
graded(W, 'P4', [(r, cond(**AT, season='all', distance_km=v))
                 for r, v in [(C, 100), (R, 156), (E, 250), (M, 400)]], '주기')

graded(W, 'A1', [(r, cond(**AT, time_range=MIDNIGHT, total_count=v))
                 for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '시간대')
graded(W, 'A2', [(r, cond(**AT, time_range=SUN_MOON, total_count=v))
                 for r, v in [(R, 1), (E, 8), (M, 25)]], '시간대')
repeatable(W, 'A3', cond(**AT, streak_days=3, distinct_time_bands=3),
           [(R, 1), (E, 3), (M, 10)], '시간대')
repeatable(W, 'A4', cond(**AT, activities_within_hours={'hours': 24, 'count': 3}),
           [(R, 1), (E, 4), (M, 12)], '시간대')
repeatable(W, 'A5', cond(**AT, day_of_week=WEEKDAYS, weekly_streak=4),
           [(R, 1), (E, 3), (M, 8)], '시간대')
graded(W, 'A6', [(r, cond(**AT, day_of_month=1, total_count=v))
                 for r, v in [(R, 1), (E, 3), (M, 12)]], '시간대')
graded(W, 'A8', [(r, cond(**AT, time_range=DAWN, total_count=v))
                 for r, v in [(R, 1), (E, 20), (M, 60)]], '시간대')
graded(W, 'A9', [(r, cond(**AT, time_range=NIGHT_22, total_count=v))
                 for r, v in [(C, 1), (R, 15), (E, 50), (M, 120)]], '시간대')
graded(W, 'A10', [(r, cond(**AT, time_range=LUNCH, total_count=v))
                  for r, v in [(C, 1), (R, 15), (E, 50), (M, 120)]], '시간대')

for code, day in [('D0', 'sunday'), ('D1', 'monday'), ('D2', 'friday')]:
    graded(W, code, [(r, cond(**AT, day_of_week=day, total_count=v))
                     for r, v in [(C, 1), (R, 10), (E, 30), (M, 52)]], '요일')
graded(W, 'D3', [(r, cond(**AT, day_of_week=WEEKDAYS, total_count=v))
                 for r, v in [(R, 1), (E, 3), (M, 10)]], '요일')

repeatable(W, 'S1', cond(**AT, streak_days=3), [(C, 1), (R, 5), (E, 20), (M, 50)], '연속')
repeatable(W, 'S2', cond(**AT, streak_days=10), [(R, 1), (E, 3), (M, 10)], '연속')
repeatable(W, 'S3', cond(**AT, streak_days=30), [(E, 1), (M, 2)], '연속')

auto(W, 'B1', AT, '기록')
auto(W, 'B2', AT, '기록')
auto(W, 'B3', cond(**AT, month_over_month_ratio=1.2), '기록')
auto(W, 'B4', cond(**AT, vs_personal_average=2), '기록')

graded(W, 'C1', [(R, cond(**AT, distance_km=100))], '이정표')
graded(W, 'C2', [(E, cond(**AT, distance_km=500))], '이정표')
graded(W, 'C3', [(M, cond(**AT, distance_km=1000))], '이정표')
graded(W, 'C4', [(R, cond(**AT, total_count=100))], '이정표')
graded(W, 'C5', [(M, cond(**AT, total_count=999))], '이정표')

repeatable(W, 'R1', cond(**AT, streak_days=6, rest_after_streak=1),
           [(R, 1), (E, 5), (M, 20)], '휴식')
repeatable(W, 'R2', cond(**AT, duration_minutes=90, rest_after_long=1),
           [(C, 1), (R, 10), (E, 30), (M, 100)], '휴식')
repeatable(W, 'R3', cond(**AT, weekly_streak=4), [(R, 1), (E, 3), (M, 12)], '휴식')
repeatable(W, 'R4', cond(**AT, return_gap_days=14), [(C, 1), (R, 3), (E, 10)], '휴식')

graded(W, 'W1', [(r, cond(**AT, month=SUMMER, total_count=v))
                 for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '달력')
graded(W, 'W2', [(r, cond(**AT, month=WINTER, total_count=v))
                 for r, v in [(R, 1), (E, 20), (M, 60)]], '달력')
graded(W, 'W3', [(E, cond(**AT, season_count_all=10)), (M, cond(**AT, season_count_all=20))], '달력')
repeatable(W, 'W4', cond(**AT, month=RAINY, monthly_km=80), [(E, 1), (M, 2)], '달력')

# =========================================================================
# 러닝 (running) — 34계열 (R-S1 · R-K2 제외)
# =========================================================================
RU = '러닝'
AT = {'activity_type': 'running'}

leveled(RU, 'R-K1', 'distance_km', [20, 60, 150, 320, 600, 1100, 1900, 3200], AT, '누적')
leveled(RU, 'R-K3', 'total_count', [10, 30, 60, 110, 190, 320], AT, '누적')

graded(RU, 'R-P1', [(r, cond(**AT, single_distance_km=5, max_pace_sec_per_km=v))
                    for r, v in [(C, 375), (R, 330), (E, 300), (M, 270)]], '강도')
graded(RU, 'R-L1', [(r, cond(**AT, single_distance_km=v))
                    for r, v in [(C, 15), (R, 21), (E, 32), (M, 42)]], '단일 최대')

graded(RU, 'R-C1', [(r, cond(**AT, active_days_count=v))
                    for r, v in [(C, 1), (R, 30), (E, 100), (M, 300)]], '주기')
repeatable(RU, 'R-C2', cond(**AT, weekly_count=4), [(C, 1), (R, 8), (E, 26), (M, 52)], '주기')
graded(RU, 'R-C3', [(r, cond(**AT, monthly_km=v))
                    for r, v in [(C, 120), (R, 217), (E, 350), (M, 550)]], '주기')
graded(RU, 'R-C4', [(r, cond(**AT, season='all', distance_km=v))
                    for r, v in [(C, 400), (R, 650), (E, 1100), (M, 1700)]], '주기')

graded(RU, 'R-T1', [(r, cond(**AT, time_range=DAWN, total_count=v))
                    for r, v in [(C, 1), (R, 15), (E, 50), (M, 120)]], '시간대')
graded(RU, 'R-T2', [(r, cond(**AT, time_range=NIGHT_20, total_count=v))
                    for r, v in [(C, 1), (R, 15), (E, 50), (M, 120)]], '시간대')
graded(RU, 'R-T3', [(r, cond(**AT, time_range=SUN_MOON, total_count=v))
                    for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '시간대')

graded(RU, 'R-D1', [(r, cond(**AT, day_of_week='monday', total_count=v))
                    for r, v in [(C, 1), (R, 10), (E, 30), (M, 52)]], '요일')
graded(RU, 'R-D2', [(r, cond(**AT, day_of_week=WEEKEND, single_distance_km=10, total_count=v))
                    for r, v in [(C, 1), (R, 8), (E, 25), (M, 52)]], '요일')

repeatable(RU, 'R-N1', cond(**AT, streak_days=3), [(C, 1), (R, 5), (E, 20), (M, 50)], '연속')
repeatable(RU, 'R-N2', cond(**AT, streak_days=7), [(C, 1), (R, 3), (E, 10)], '연속')
repeatable(RU, 'R-N3', cond(**AT, streak_days=30), [(E, 1), (M, 2)], '연속')

auto(RU, 'R-R1', AT, '기록')
auto(RU, 'R-R2', cond(**AT, single_distance_km=5), '기록')
auto(RU, 'R-R3', cond(**AT, month_over_month_ratio=1.2), '기록')

graded(RU, 'R-M1', [(R, cond(**AT, distance_km=500))], '이정표')
graded(RU, 'R-M2', [(E, cond(**AT, distance_km=2000))], '이정표')
graded(RU, 'R-M3', [(M, cond(**AT, distance_km=5000))], '이정표')
graded(RU, 'R-M4', [(R, cond(**AT, total_count=100))], '이정표')
graded(RU, 'R-M5', [(M, cond(**AT, single_distance_km=42.195))], '이정표')

repeatable(RU, 'R-X1', cond(**AT, streak_days=5, rest_after_streak=1),
           [(C, 1), (R, 5), (E, 20), (M, 50)], '휴식')
repeatable(RU, 'R-X2', cond(**AT, single_distance_km=25, rest_after_long=1),
           [(C, 1), (R, 10), (E, 30)], '휴식')
repeatable(RU, 'R-X3', cond(**AT, return_gap_days=14), [(C, 1), (R, 3), (E, 10)], '휴식')

graded(RU, 'R-W1', [(r, cond(**AT, month=SUMMER, total_count=v))
                    for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '달력')
graded(RU, 'R-W2', [(r, cond(**AT, month=WINTER, total_count=v))
                    for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '달력')
graded(RU, 'R-W3', [(E, cond(**AT, season_count_all=10)), (M, cond(**AT, season_count_all=20))], '달력')

repeatable(RU, 'R-H1', cond(**AT, avg_heartrate_bpm=160, duration_minutes=30),
           [(C, 1), (R, 10), (E, 30), (M, 100)], '보너스')
repeatable(RU, 'R-H2', cond(**AT, avg_cadence=180),
           [(C, 1), (R, 10), (E, 30), (M, 100)], '보너스')

for i in range(1, 9):
    mission(RU, f'R-Q{i}')

# =========================================================================
# 자전거 (cycling) — 32계열 (C-G2 제외)
# =========================================================================
CY = '자전거'
AT = {'activity_type': 'cycling'}

leveled(CY, 'C-K1', 'distance_km', [80, 250, 600, 1300, 2500, 4200, 8000, 14000], AT, '누적')
# A묶음 위상 조정: Lv.4 20,000 → 22,000m
leveled(CY, 'C-K2', 'elevation_gain_m', [1000, 3000, 8000, 22000, 38000, 70000], AT, '누적')
leveled(CY, 'C-K3', 'total_count', [8, 25, 55, 100, 170, 280], AT, '누적')

graded(CY, 'C-P1', [(r, cond(**AT, single_distance_km=30, min_speed_kmh=v))
                    for r, v in [(C, 22), (R, 25), (E, 28), (M, 32)]], '강도')
graded(CY, 'C-V1', [(r, cond(**AT, max_speed_kmh=v))
                    for r, v in [(C, 45), (R, 55), (E, 65), (M, 75)]], '최고 도달')
graded(CY, 'C-L1', [(r, cond(**AT, single_distance_km=v))
                    for r, v in [(C, 80), (R, 120), (E, 160), (M, 200)]], '단일 최대')
graded(CY, 'C-E1', [(r, cond(**AT, single_elevation_m=v))
                    for r, v in [(C, 500), (R, 1000), (E, 1600), (M, 2500)]], '고도')

graded(CY, 'C-C1', [(r, cond(**AT, active_days_count=v))
                    for r, v in [(C, 1), (R, 25), (E, 80), (M, 250)]], '주기')
repeatable(CY, 'C-C2', cond(**AT, weekly_count=3), [(C, 1), (R, 8), (E, 26), (M, 52)], '주기')
graded(CY, 'C-C3', [(r, cond(**AT, monthly_km=v))
                    for r, v in [(C, 400), (R, 867), (E, 1400), (M, 2200)]], '주기')
graded(CY, 'C-C4', [(r, cond(**AT, season='all', distance_km=v))
                    for r, v in [(C, 1300), (R, 2600), (E, 4200), (M, 6500)]], '주기')

graded(CY, 'C-D1', [(r, cond(**AT, day_of_week=WEEKEND, total_count=v))
                    for r, v in [(C, 1), (R, 10), (E, 35), (M, 100)]], '요일')
graded(CY, 'C-D2', [(r, cond(**AT, day_of_week=WEEKDAYS, single_distance_km=100, total_count=v))
                    for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '요일')

repeatable(CY, 'C-N1', cond(**AT, streak_days=3), [(C, 1), (R, 5), (E, 20), (M, 50)], '연속')
repeatable(CY, 'C-N2', cond(**AT, streak_days=7), [(C, 1), (R, 3), (E, 10)], '연속')
repeatable(CY, 'C-N3', cond(**AT, streak_days=21), [(E, 1), (M, 2)], '연속')

repeatable(CY, 'C-G1', cond(**AT, interval_days=14), [(C, 3), (R, 8), (E, 20), (M, 52)], '간격')

auto(CY, 'C-R1', AT, '기록')
auto(CY, 'C-R2', cond(**AT, month_over_month_ratio=1.2), '기록')

graded(CY, 'C-M1', [(R, cond(**AT, single_distance_km=100))], '이정표')
graded(CY, 'C-M2', [(E, cond(**AT, single_distance_km=160))], '이정표')
graded(CY, 'C-M3', [(M, cond(**AT, single_distance_km=200))], '이정표')
graded(CY, 'C-M4', [(E, cond(**AT, distance_km=10000))], '이정표')
graded(CY, 'C-M5', [(M, cond(**AT, elevation_gain_m=88480))], '이정표')

repeatable(CY, 'C-X1', cond(**AT, single_distance_km=150, rest_after_long=1),
           [(C, 1), (R, 10), (E, 30)], '휴식')
repeatable(CY, 'C-X2', cond(**AT, return_gap_days=30), [(C, 1), (R, 3), (E, 10)], '휴식')

graded(CY, 'C-W1', [(r, cond(**AT, month=SUMMER, total_count=v))
                    for r, v in [(C, 1), (R, 5), (E, 20), (M, 50)]], '달력')
graded(CY, 'C-W2', [(r, cond(**AT, month=WINTER, total_count=v))
                    for r, v in [(C, 1), (R, 3), (E, 12), (M, 30)]], '달력')
graded(CY, 'C-W3', [(E, cond(**AT, season_count_all=5)), (M, cond(**AT, season_count_all=10))], '달력')

repeatable(CY, 'C-H1', cond(**AT, avg_watts=200, duration_minutes=60),
           [(C, 1), (R, 10), (E, 30), (M, 100)], '보너스')
repeatable(CY, 'C-H2', cond(**AT, avg_heartrate_bpm=150, duration_minutes=60),
           [(C, 1), (R, 10), (E, 30), (M, 100)], '보너스')

for i in range(1, 9):
    mission(CY, f'C-Q{i}')

# =========================================================================
# 등산 (hiking) — 26계열 (H-K2 · H-C2 제외)
# =========================================================================
HI = '등산'
AT = {'activity_type': 'hiking'}

leveled(HI, 'H-K1', 'elevation_gain_m', [1500, 5000, 12000, 25000, 48000, 85000], AT, '누적')
leveled(HI, 'H-K3', 'total_count', [5, 15, 40, 80, 150, 260], AT, '누적')

graded(HI, 'H-P1', [(r, cond(**AT, single_elevation_m=v))
                    for r, v in [(C, 500), (R, 750), (E, 1200), (M, 1800)]], '강도')
graded(HI, 'H-A1', [(r, cond(**AT, max_elevation_m=v))
                    for r, v in [(C, 700), (R, 1200), (E, 1600), (M, 1900)]], '최고 도달')
graded(HI, 'H-L1', [(r, cond(**AT, duration_minutes=v))
                    for r, v in [(C, 180), (R, 300), (E, 480), (M, 720)]], '단일 최대')
graded(HI, 'H-L2', [(r, cond(**AT, single_distance_km=v))
                    for r, v in [(C, 12), (R, 18), (E, 25), (M, 35)]], '단일 최대')

graded(HI, 'H-C1', [(r, cond(**AT, active_days_count=v))
                    for r, v in [(C, 1), (R, 12), (E, 40), (M, 120)]], '주기')
graded(HI, 'H-C3', [(r, cond(**AT, season='all', elevation_gain_m=v))
                    for r, v in [(C, 4000), (R, 9000), (E, 15000), (M, 24000)]], '주기')

graded(HI, 'H-D1', [(r, cond(**AT, day_of_week=WEEKEND, total_count=v))
                    for r, v in [(C, 1), (R, 12), (E, 40), (M, 100)]], '요일')

repeatable(HI, 'H-N1', cond(**AT, streak_days=2), [(C, 1), (R, 5), (E, 20), (M, 50)], '연속')
repeatable(HI, 'H-N2', cond(**AT, streak_days=3), [(C, 1), (R, 3), (E, 10)], '연속')
repeatable(HI, 'H-N3', cond(**AT, streak_days=7), [(E, 1), (M, 2)], '연속')

repeatable(HI, 'H-G1', cond(**AT, interval_days=14), [(C, 3), (R, 8), (E, 20), (M, 52)], '간격')

auto(HI, 'H-R1', AT, '기록')
auto(HI, 'H-R2', AT, '기록')

graded(HI, 'H-M1', [(R, cond(**AT, elevation_gain_m=8848))], '이정표')
graded(HI, 'H-M2', [(E, cond(**AT, elevation_gain_m=44240))], '이정표')
graded(HI, 'H-M3', [(M, cond(**AT, elevation_gain_m=88480))], '이정표')
graded(HI, 'H-M4', [(E, cond(**AT, total_count=100))], '이정표')

repeatable(HI, 'H-X1', cond(**AT, duration_minutes=480, rest_after_long=1),
           [(C, 1), (R, 5), (E, 20)], '휴식')
repeatable(HI, 'H-X2', cond(**AT, return_gap_days=60), [(C, 1), (R, 3), (E, 8)], '휴식')

graded(HI, 'H-W1', [(r, cond(**AT, month=SUMMER, total_count=v))
                    for r, v in [(C, 1), (R, 4), (E, 12), (M, 30)]], '달력')
graded(HI, 'H-W2', [(r, cond(**AT, month=WINTER, total_count=v))
                    for r, v in [(C, 1), (R, 4), (E, 12), (M, 30)]], '달력')
graded(HI, 'H-W3', [(E, cond(**AT, season_count_all=3)), (M, cond(**AT, season_count_all=6))], '달력')

for i in range(1, 9):
    mission(HI, f'H-Q{i}')

# =========================================================================
# 트레일러닝 (trail_running) — 28계열
# =========================================================================
TR = '트레일러닝'
AT = {'activity_type': 'trail_running'}

leveled(TR, 'T-K1', 'distance_km', [20, 60, 150, 320, 600, 1100, 1900, 3200], AT, '누적')
leveled(TR, 'T-K2', 'elevation_gain_m', [700, 2200, 5000, 11000, 20000, 36000, 70000], AT, '누적')
leveled(TR, 'T-K3', 'total_count', [8, 25, 55, 100, 170, 280], AT, '누적')

graded(TR, 'T-P1', [(r, cond(**AT, single_distance_km=d, single_elevation_m=e))
                    for r, d, e in [(C, 15, 400), (R, 25, 800), (E, 35, 1500), (M, 50, 2500)]], '강도')
graded(TR, 'T-L1', [(r, cond(**AT, single_distance_km=v))
                    for r, v in [(C, 25), (R, 42), (E, 60), (M, 100)]], '단일 최대')
graded(TR, 'T-L2', [(r, cond(**AT, duration_minutes=v))
                    for r, v in [(C, 240), (R, 420), (E, 720), (M, 1080)]], '단일 최대')
graded(TR, 'T-E1', [(r, cond(**AT, single_elevation_m=v))
                    for r, v in [(C, 800), (R, 1500), (E, 2500), (M, 3500)]], '고도')
graded(TR, 'T-A1', [(r, cond(**AT, max_elevation_m=v))
                    for r, v in [(C, 700), (R, 1200), (E, 1600), (M, 1900)]], '최고 도달')

graded(TR, 'T-C1', [(r, cond(**AT, active_days_count=v))
                    for r, v in [(C, 1), (R, 25), (E, 80), (M, 250)]], '주기')
graded(TR, 'T-C2', [(r, cond(**AT, monthly_km=v))
                    for r, v in [(C, 120), (R, 217), (E, 350), (M, 550)]], '주기')
graded(TR, 'T-C3', [(r, cond(**AT, season='all', elevation_gain_m=v))
                    for r, v in [(C, 4000), (R, 13000), (E, 22000), (M, 35000)]], '주기')

graded(TR, 'T-T1', [(r, cond(**AT, time_range=DAWN, total_count=v))
                    for r, v in [(C, 1), (R, 15), (E, 50), (M, 120)]], '시간대')
graded(TR, 'T-T2', [(r, cond(**AT, time_range=NIGHT_20, total_count=v))
                    for r, v in [(C, 1), (R, 5), (E, 20)]], '시간대')

repeatable(TR, 'T-N1', cond(**AT, streak_days=3), [(C, 1), (R, 5), (E, 20), (M, 50)], '연속')
repeatable(TR, 'T-N2', cond(**AT, streak_days=7), [(C, 1), (R, 3), (E, 10)], '연속')

repeatable(TR, 'T-G1', cond(**AT, interval_days=14), [(C, 3), (R, 8), (E, 20), (M, 52)], '간격')

auto(TR, 'T-R1', AT, '기록')
auto(TR, 'T-R2', AT, '기록')
auto(TR, 'T-R3', AT, '기록')

graded(TR, 'T-M1', [(R, cond(**AT, single_distance_km=42.195))], '이정표')
graded(TR, 'T-M2', [(E, cond(**AT, single_distance_km=50))], '이정표')
graded(TR, 'T-M3', [(M, cond(**AT, single_distance_km=100))], '이정표')
graded(TR, 'T-M4', [(R, cond(**AT, elevation_gain_m=8848))], '이정표')

repeatable(TR, 'T-X1', cond(**AT, single_distance_km=35, rest_after_long=1),
           [(C, 1), (R, 5), (E, 20)], '휴식')
repeatable(TR, 'T-X2', cond(**AT, return_gap_days=30), [(C, 1), (R, 3), (E, 10)], '휴식')

graded(TR, 'T-W1', [(r, cond(**AT, month=WINTER, total_count=v))
                    for r, v in [(C, 1), (R, 3), (E, 12)]], '달력')
graded(TR, 'T-W2', [(E, cond(**AT, season_count_all=3)), (M, cond(**AT, season_count_all=6))], '달력')

repeatable(TR, 'T-H1', cond(**AT, avg_heartrate_bpm=155, duration_minutes=60),
           [(C, 1), (R, 8), (E, 25), (M, 70)], '보너스')

for i in range(1, 9):
    mission(TR, f'T-Q{i}')

# =========================================================================
# 이름 · 설명 — 정본에서 가져온다
# =========================================================================
TEXT = {}
for sport, arr in writing['계열'].items():
    for f in arr:
        TEXT[(SPORT_KEY[sport], f['code'])] = (f['이름'], f['설명'], f['조건'])
for b in missions['배지']:
    TEXT[(SPORT_KEY[b['sport']], b['code'])] = (b['이름'], b['설명'], b['조건'])

# =========================================================================
# 드라이런 검증
# =========================================================================
# 마이그레이션 134가 마지막으로 다시 쓴 CHECK 허용 키 45종 (파일에서 읽어 대조한다)
MIG134 = os.path.join(REPO, 'jam-web', 'supabase', 'migrations', '134_family_key_grouping.sql')
mig_src = open(MIG134, encoding='utf-8').read()
check_block = mig_src.split('condition_json - ARRAY[', 1)[1].split(']::text[]', 1)[0]
ALLOWED_KEYS = set(re.findall(r"'([a-z_]+)'", check_block))

trig_block = mig_src.split('measurable_keys TEXT[] := ARRAY[', 1)[1].split(']', 1)[0]
MEASURABLE_KEYS = set(re.findall(r"'([a-z_]+)'", trig_block))

problems = []
warnings_ = []


def is_valid_family_key(k):
    """src/lib/admin/badge-families.ts isValidFamilyKey()와 같은 규칙"""
    if not k or k != k.strip():
        return False
    if ',' in k:
        return False
    if k.startswith('#'):
        return False
    return ':' in k


# EXCLUDED 계열은 애초에 FAMS에 넣지 않았다 — 여기서 다시 걸러도 0건이어야 한다
seeded = [f for f in FAMS if f.code not in EXCLUDED]
assert len(seeded) == len(FAMS), '제외 계열이 FAMS에 섞여 들어왔다'
# 정본 규모 (A묶음 167계열 625종 + 미션 32종 = 199계열 657종)
CANON_FAMS = verified['규모_정본']['총계']['시딩_계열'] + len(missions['배지'])
CANON_ROWS = verified['규모_정본']['총계']['시딩_종'] + len(missions['배지'])
# 제외 계열이 정본에서 덜어내는 종 수 (설계 사다리 단 수)
EXCLUDED_ROWS = {'R-S1': 0, 'K2': 7, 'R-K2': 6, 'H-K2': 6, 'C-G2': 4, 'H-C2': 4}

# ① family_key 형식 · 유일성
keys = {}
for f in seeded:
    if not is_valid_family_key(f.family_key):
        problems.append(f'family_key 형식 위반: {f.family_key}')
    if f.family_key in keys:
        problems.append(f'family_key 중복: {f.family_key}')
    keys[f.family_key] = f

# ② CHECK 허용 키
for f in seeded:
    for _, _, c in f.rows:
        for k in c:
            if k not in ALLOWED_KEYS:
                problems.append(f'{f.code}: CHECK 허용 목록 밖의 키 «{k}»')

# ③ 계열 정합성 트리거 — 등급형(level IS NULL, mission_reward 아님) 형제의 측정 키 집합 일치
for f in seeded:
    graded_rows = [c for r, lv, c in f.rows if lv is None and c.get('mission_reward') is not True]
    key_sets = {tuple(sorted(k for k in c if k in MEASURABLE_KEYS)) for c in graded_rows}
    if len(key_sets) > 1:
        problems.append(f'{f.code}: 계열 내 측정 조건 필드 불일치 {key_sets}')
    for ks in key_sets:
        if not ks:
            problems.append(f'{f.code}: 측정 조건 필드 0개 — 「평가 가능한 조건 없음」으로 막힌다')

# ④ 배지 종류 3분기 — rarity/level 배타 · 반복형은 rarity + repeat_count
for f in seeded:
    for r, lv, c in f.rows:
        if (r is None) != (lv is not None):
            problems.append(f'{f.code}: badges_rarity_level_exclusive 위반 (rarity={r}, level={lv})')
        if lv is not None and 'repeat_count' in c:
            problems.append(f'{f.code} Lv.{lv}: 레벨형에 repeat_count가 들어 있다')
        if f.kind == 'repeatable' and (r is None or 'repeat_count' not in c):
            problems.append(f'{f.code}: 반복형인데 rarity 또는 repeat_count가 없다')

# ⑤ 계열 내 중복 — 등급형 (family_key, rarity) · 레벨형 (family_key, level)
for f in seeded:
    seen = set()
    for r, lv, _ in f.rows:
        sig = (f.family_key, r, lv)
        if sig in seen:
            problems.append(f'{f.code}: 계열 내 중복 {sig}')
        seen.add(sig)

# ⑥ 이름 유일성 — 발급 엔진이 등급형을 이름으로 묶는다
name_owner = {}
for f in seeded:
    name = TEXT[(f.sport_key, f.code)][0]
    if name in name_owner and name_owner[name] != f.family_key:
        problems.append(f'이름 중복: 「{name}」 — {name_owner[name]} / {f.family_key}')
    name_owner[name] = f.family_key

# ⑦ 미션 보상 배지 — mission_reward 누락 검사
mission_rows = [f for f in seeded if f.kind == 'mission']
for f in mission_rows:
    if f.rows[0][2].get('mission_reward') is not True:
        problems.append(f'{f.code}: 미션 보상 배지에 mission_reward가 없다')

# ⑧ 필터 키 + 측정 축 조합 (진행률이 필터를 무시한다 — 기존 결함)
FILTER_KEYS = {'time_range', 'month', 'day_of_week', 'season', 'day_of_month'}
MEASURED_AXIS = {'distance_km', 'elevation_gain_m', 'duration_minutes', 'min_speed_kmh',
                 'max_pace_sec_per_km', 'temperature_min_c', 'temperature_max_c',
                 'weekend_duration_hours', 'weekly_count', 'monthly_km', 'total_count',
                 'streak_days', 'active_days_count', 'season_count', 'season_count_all'}
filter_combo = OrderedDict()
for f in seeded:
    for _, _, c in f.rows:
        fk = sorted(FILTER_KEYS & set(c))
        ax = sorted(MEASURED_AXIS & set(c))
        if fk and ax:
            filter_combo[f.code] = (fk, ax)
            break

# ⑨ repeat_count 조합 — 회차 술어가 소비하지 않는 키가 있으면 회차가 0이 된다
CONSUMED_REPEAT = {'repeat_count', 'activity_type', 'day_of_week', 'same_activity', 'time_range',
                   'duration_minutes', 'min_speed_kmh', 'max_pace_sec_per_km',
                   'temperature_min_c', 'temperature_max_c', 'weekend_duration_hours',
                   'distance_km', 'elevation_gain_m',
                   'prerequisite_badge_names', 'cross_in_axis', 'cross_between_axis', 'gate_mission_badge'}
REST_KEYS = {'rest_after_streak', 'rest_after_long', 'return_gap_days', 'interval_days'}
repeat_blocked = OrderedDict()
for f in seeded:
    for _, _, c in f.rows:
        if 'repeat_count' not in c:
            continue
        unconsumed = sorted(set(c) - CONSUMED_REPEAT)
        rest = sorted(REST_KEYS & set(c))
        if unconsumed or rest:
            repeat_blocked[f.code] = (unconsumed, rest)
        break

# ⑨-2 서로 다른 계열이 완전히 같은 조건을 갖는가 — 한쪽이 발급되면 다른 쪽도 함께 발급된다
cond_owner = {}
same_cond = OrderedDict()
for f in seeded:
    if f.kind == 'mission':
        continue
    for r, lv, c in f.rows:
        sig = json.dumps(c, ensure_ascii=False, sort_keys=True)
        if sig in cond_owner and cond_owner[sig] != f.family_key:
            same_cond.setdefault((cond_owner[sig], f.family_key), 0)
            same_cond[(cond_owner[sig], f.family_key)] += 1
        else:
            cond_owner[sig] = f.family_key

# ⑩ pending 조건 필드 — 0030이 engine으로 뒤집기 전까지 발급되지 않는다
PENDING = {'route', 'max_elevation_m', 'max_speed_kmh', 'single_distance_km', 'single_elevation_m',
           'avg_heartrate_bpm', 'avg_watts', 'avg_cadence', 'daily_once_count', 'negative_split',
           'weekly_streak', 'distinct_time_bands', 'day_of_month', 'activities_within_hours',
           'personal_record_break', 'month_over_month_ratio', 'vs_personal_average'}
pending_fams = OrderedDict()
for f in seeded:
    for _, _, c in f.rows:
        p = sorted(PENDING & set(c))
        if p:
            pending_fams[f.code] = p
        break

total_rows = sum(len(f.rows) for f in seeded)

# =========================================================================
# SQL 생성
# =========================================================================


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def jsonb(c):
    return q(json.dumps(c, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'


lines = []
A = lines.append
A('-- seed_v5_activity_badges: v5 액티비티 배지 카탈로그 시딩 (티켓 20260905_0035 B1)')
A('--')
A('-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라')
A('--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 B2에서 처리한다.')
A('--')
A('-- ⚠️ **선행 조건 — 구 207종 폐기가 먼저다.** 구 배지에도 family_key가 이미 채워져 있고')
A('--    (`walking:밤의 보행자` 형태) v5 걷기가 같은 이름을 유지하는 계열이 5종 있다.')
A('--    티켓 0034의 일괄 도구로 구 카탈로그를 먼저 폐기하지 않으면 시딩 직후 구·신이')
A('--    한 성장 사다리로 합쳐진다 (티켓 0035 「실측 정정」 절).')
A('--')
A('-- ⚠️ 마이그레이션 130~134 실행이 선행 조건이다. 131이 CHECK 허용 키를 25→45종으로 넓히고')
A('--    132·133이 4종을 더해 현재 49종이며, 134가 그 배열과 계열 정합성 트리거를 마지막으로 다시 썼다.')
A('--')
A('-- ⚠️ `image_url`을 컬럼 목록에서 뺐다 — v5 배지 이미지 630종은 아직 제작되지 않았다')
A('--    (마스터 티켓 잔여 이슈). **이 630행이 image_url이 NULL인 첫 배지가 된다** —')
A('--    2026-09-05 프로덕션 실측 결과 현재 image_url이 NULL인 배지는 0건이다. INSERT가')
A('--    통과하는 근거는 「019_seed_worldview 선례」가 아니라 018에서 컬럼이 nullable로')
A('--    바뀐 것이다 — 게이트 리뷰 실측으로 근거를 정정했다. 화면은 안전하다: SafeImage가')
A('--    `if (!value || failed) return fallback`으로 null을 흡수하고 배지 경로가 전부 쓴다.')
A('--    실행 전에 확인할 것:')
A('--      SELECT is_nullable, column_default FROM information_schema.columns')
A("--       WHERE table_name='badges' AND column_name='image_url';")
A('--    NOT NULL이고 기본값이 없으면 이 INSERT는 첫 행에서 실패한다(데이터는 남지 않는다).')
A('--')
A('-- 생성: Service Plan/Specs/Content/v5_seed_build.py (재생성 가능 — 손으로 고치지 말 것)')
A(f'-- 규모: {len(seeded)}계열 · {total_rows}종')
A('--')
A('-- 멱등: 같은 (family_key, rarity, level) 행이 이미 있으면 넣지 않는다. 두 번 돌려도 안전하다.')
A('--')
A('-- ── 표기 규약 ──────────────────────────────────────────────────────────────')
A('--   [필터] 필터 키(time_range·month·day_of_week·season·day_of_month)를 측정 축과 함께 쓴다.')
A('--          진행률 계산이 필터를 보지 않아 실제보다 후하게 나온다 (티켓 0035 「필터 키」 절).')
A('--   [회차] repeat_count와 함께 쓴 키를 회차 술어가 소비하지 못한다 — 회차 0으로 fail-closed.')
A('--          `collectRepeatOccurrences`의 CONSUMED_REPEAT_KEYS 확장이 필요하다.')
A('--   [근사] 조건문 정본을 레지스트리 키로 정확히 옮길 수 없어 근사했다.')
A('')
A('BEGIN;')
A('')
A('INSERT INTO public.badges (')
A('  name, description, type, rarity, level, family_key, sort_order,')
A('  condition_json, activity_types, patch_available')
A(')')
A('SELECT v.name, v.description, v.type::badge_type, v.rarity::badge_rarity, v.level,')
A('       v.family_key, v.sort_order, v.condition_json, v.activity_types, false')
A('  FROM (VALUES')

value_rows = []
sport_order = ['walking', 'running', 'cycling', 'hiking', 'trail_running']
by_sport = OrderedDict((s, []) for s in sport_order)
for f in seeded:
    by_sport[f.sport_key].append(f)

comments = OrderedDict()
for sport in sport_order:
    fams = by_sport[sport]
    for idx, f in enumerate(fams, start=1):
        name, desc, cond_text = TEXT[(f.sport_key, f.code)]
        notes = []
        if f.code in filter_combo:
            fk, ax = filter_combo[f.code]
            notes.append(f'[필터] {"·".join(fk)} + {"·".join(ax)}')
        if f.code in repeat_blocked:
            un, rest = repeat_blocked[f.code]
            if rest:
                notes.append(f'[회차] 휴식 조건({"·".join(rest)})은 repeat_count와 함께 쓸 수 없다')
            if un:
                notes.append(f'[회차] 미소비 키 {"·".join(un)}')
        if f.code in APPROX:
            notes.append(f'[근사] {APPROX[f.code]}')
        comments[(sport, f.code)] = (name, cond_text, notes, idx)
        for rarity, level, c in f.rows:
            value_rows.append((
                sport, f.code, name, desc, rarity, level, f.family_key, idx, c
            ))

sql_rows = []
prev_key = None
for sport, code, name, desc, rarity, level, fkey, order, c in value_rows:
    if prev_key != (sport, code):
        nm, ct, notes, idx = comments[(sport, code)]
        sql_rows.append(f'    -- {fkey} · {nm} — {ct}')
        for n in notes:
            sql_rows.append(f'    --   {n}')
        prev_key = (sport, code)
    sql_rows.append(
        f"    ({q(name)}, {q(desc)}, 'activity', "
        f"{q(rarity) if rarity else 'NULL'}, {level if level is not None else 'NULL'}, "
        f"{q(fkey)}, {order}, {jsonb(c)}, ARRAY[{q(sport)}]::text[])"
    )

# 마지막 값 행에만 쉼표를 빼야 한다 — 주석 줄은 건너뛴다
last_value_idx = max(i for i, s in enumerate(sql_rows) if s.lstrip().startswith('('))
for i, s in enumerate(sql_rows):
    if s.lstrip().startswith('('):
        A(s + ('' if i == last_value_idx else ','))
    else:
        A(s)

A('  ) AS v(name, description, type, rarity, level, family_key, sort_order, condition_json, activity_types)')
A(' WHERE NOT EXISTS (')
A('   SELECT 1 FROM public.badges b')
A('    WHERE b.family_key = v.family_key')
A('      AND b.rarity IS NOT DISTINCT FROM v.rarity::badge_rarity')
A('      AND b.level  IS NOT DISTINCT FROM v.level')
A('      AND b.deleted_at IS NULL')
A(' );')
A('')
A('COMMIT;')
A('')
A('-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────')
A('--')
A(f'-- -- ① 행 수 — {total_rows}이어야 한다')
A("-- SELECT count(*) FROM public.badges")
A("--  WHERE type='activity' AND deleted_at IS NULL AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z]';")
A('--')
A(f'-- -- ② 계열 수 — {len(seeded)}이어야 한다')
A("-- SELECT count(DISTINCT family_key) FROM public.badges")
A("--  WHERE type='activity' AND deleted_at IS NULL AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z]';")
A('--')
A('-- -- ③ 계열 내 중복 — 0행이어야 한다 (등급형 (family_key, rarity) · 레벨형 (family_key, level))')
A('-- SELECT family_key, rarity, count(*) FROM public.badges')
A("--  WHERE type='activity' AND deleted_at IS NULL AND level IS NULL")
A('--  GROUP BY 1,2 HAVING count(*) > 1;')
A('-- SELECT family_key, level, count(*) FROM public.badges')
A("--  WHERE type='activity' AND deleted_at IS NULL AND level IS NOT NULL")
A('--  GROUP BY 1,2 HAVING count(*) > 1;')
A('--')
A('-- -- ④ 이름 중복 — 0행이어야 한다 (발급 엔진이 등급형을 이름으로 묶는다)')
A('-- SELECT name, count(DISTINCT family_key) FROM public.badges')
A("--  WHERE type='activity' AND deleted_at IS NULL")
A('--  GROUP BY 1 HAVING count(DISTINCT family_key) > 1;')
A('--')
A('-- -- ⑤ 미션 보상 배지 40종 — 걷기 8 + 4종목 32')
A("-- SELECT count(*) FROM public.badges")
A("--  WHERE type='activity' AND deleted_at IS NULL AND (condition_json->>'mission_reward')::boolean IS TRUE;")
A('--')
A('-- ── 부분 유니크 인덱스 (선택) — 티켓 20260905_0027이 검토를 요구한 항목 ────────')
A('--    시딩 «후에» 걸어야 한다. 구 207종에 중복이 남아 있으면 생성이 실패한다.')
A('--    사전 조회: SELECT family_key, rarity, count(*) FROM public.badges')
A("--                WHERE type='activity' AND deleted_at IS NULL GROUP BY 1,2 HAVING count(*) > 1;")
A('--')
A('-- CREATE UNIQUE INDEX IF NOT EXISTS uq_badges_family_rarity')
A('--   ON public.badges (family_key, rarity)')
A('--   WHERE family_key IS NOT NULL AND level IS NULL AND deleted_at IS NULL;')
A('-- CREATE UNIQUE INDEX IF NOT EXISTS uq_badges_family_level')
A('--   ON public.badges (family_key, level)')
A('--   WHERE family_key IS NOT NULL AND level IS NOT NULL AND deleted_at IS NULL;')
A('')
A('-- ── 시딩에서 뺀 계열 (표현 수단이 레지스트리에 없다) ────────────────────────')
for code, why in EXCLUDED.items():
    A(f'--   · {code} — {why}')
A('')
A('-- ↩️ 롤백 — 이 시드가 넣은 행만 지운다 (구 카탈로그는 family_key가 `{종목}:{한글이름}`이라 걸리지 않는다)')
A('-- DELETE FROM public.badges')
A("--  WHERE type='activity' AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z][0-9]*$';")

open(OUT_SQL, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')

# ── 조건 매핑표 (계열 → condition_json 키) — 산출물 ① ──────────────────────
OUT_MAP = os.path.join(HERE, 'v5_condition_mapping.json')
mapping = OrderedDict()
mapping['_meta'] = {
    '무엇': 'v5 계열별 condition_json 키 매핑표 (티켓 20260905_0035 B1 산출물 ①)',
    '생성': 'v5_seed_build.py — 손으로 고치지 말 것',
    '단일출처': 'jam-web/src/lib/badge-engine/conditionRegistry.ts (조건 필드) · '
             'jam-web/supabase/migrations/134_family_key_grouping.sql (DB CHECK·트리거)',
    '규모': f'정본 {CANON_FAMS}계열 {CANON_ROWS}종 → 시딩 {len(seeded)}계열 {total_rows}종',
    '표기': {
        '필터': '필터 키 + 측정 축 조합 — 진행률이 필터를 무시해 실제보다 후하게 나온다',
        '회차': 'repeat_count와 함께 쓴 키를 회차 술어가 소비하지 못한다 — 회차 0(fail-closed)',
        '근사': '조건문 정본을 레지스트리 키로 정확히 옮길 수 없어 근사했다',
        'pending': 'conditionRegistry의 evaluation:pending — 티켓 0030 구현 전까지 발급되지 않는다',
    },
}
mapping['시딩제외'] = [{'code': c, '사유': w, '종수': EXCLUDED_ROWS[c]} for c, w in EXCLUDED.items()]
mapping['계열'] = []
for f in seeded:
    name, desc, cond_text = TEXT[(f.sport_key, f.code)]
    keys = sorted({k for _, _, c in f.rows for k in c})
    entry = OrderedDict()
    entry['family_key'] = f.family_key
    entry['code'] = f.code
    entry['종목'] = f.sport_key
    entry['축'] = f.axis
    entry['이름'] = name
    entry['조건문'] = cond_text
    entry['배지종류'] = f.kind
    entry['종수'] = len(f.rows)
    entry['condition_keys'] = keys
    entry['사다리'] = [
        {'rarity': r, 'level': lv, 'condition': c} for r, lv, c in f.rows
    ]
    flags = []
    if f.code in filter_combo:
        flags.append('필터')
    if f.code in repeat_blocked:
        flags.append('회차')
    if f.code in APPROX:
        flags.append('근사')
    if f.code in pending_fams:
        flags.append('pending')
    entry['표기'] = flags
    if f.code in APPROX:
        entry['근사_사유'] = APPROX[f.code]
    mapping['계열'].append(entry)
mapping['같은_조건_짝'] = [{'계열': list(k), '행수': v} for k, v in same_cond.items()]
json.dump(mapping, open(OUT_MAP, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# =========================================================================
# 콘솔 리포트
# =========================================================================
print('=' * 72)
print('v5 시드 드라이런 — 티켓 20260905_0035 B1')
print('=' * 72)
print(f'출력: {os.path.relpath(OUT_SQL, REPO)}')
print()
print(f'정본 {CANON_FAMS}계열 · {CANON_ROWS}종 → 시딩 {len(seeded)}계열 · {total_rows}종')
print(f'  차이: 계열 -{CANON_FAMS - len(seeded)} / 종 -{CANON_ROWS - total_rows}'
      f'  (표현 불가 계열 {len(EXCLUDED) - 1}개 제외 = {sum(EXCLUDED_ROWS.values())}종)')
kinds = OrderedDict()
for f in seeded:
    kinds[f.kind] = kinds.get(f.kind, 0) + len(f.rows)
print('  종류별 종 수: ' + ', '.join(f'{k}={v}' for k, v in kinds.items()))
print(f'  미션 보상 배지: {len(mission_rows)}종')
print()
print(f'CHECK 허용 키(134에서 읽음): {len(ALLOWED_KEYS)}종 / 트리거 measurable_keys: {len(MEASURABLE_KEYS)}종')
print()
print('― 검증 결과 ―')
if problems:
    for p in problems:
        print('  [FAIL]', p)
else:
    print('  통과 — family_key 형식·유일성 / CHECK 허용 키 / 계열 정합성 트리거 /')
    print('        rarity·level 배타 / 계열 내 중복 / 이름 유일성 / 미션 플래그  전부 이상 없음')
print()
print(f'― 시딩 제외 {len(EXCLUDED)}계열 ―')
for code, why in EXCLUDED.items():
    print(f'  {code:6s} (-{EXCLUDED_ROWS[code]}종) {why}')
print()
print(f'― 필터 키 + 측정 축 조합 {len(filter_combo)}계열 (진행률이 필터를 무시한다) ―')
for code, (fk, ax) in filter_combo.items():
    print(f'  {code:6s} {"·".join(fk)} + {"·".join(ax)}')
print()
print(f'― repeat_count 회차 술어가 막는 조합 {len(repeat_blocked)}계열 ―')
for code, (un, rest) in repeat_blocked.items():
    print(f'  {code:6s} 휴식={"·".join(rest) or "-"} 미소비={"·".join(un) or "-"}')
print()
print(f'― evaluation: pending 필드를 쓰는 계열 {len(pending_fams)} (0030 구현 전까지 미발급) ―')
agg = OrderedDict()
for code, ks in pending_fams.items():
    for k in ks:
        agg.setdefault(k, []).append(code)
for k, codes in agg.items():
    print(f'  {k:24s} {len(codes)}계열')
print()
print(f'― 서로 다른 계열이 같은 조건을 갖는 짝 {len(same_cond)} ―')
for (a, b), n in same_cond.items():
    print(f'  {a} ↔ {b}  ({n}행)')
print()
print(f'― 근사로 옮긴 계열 {len(APPROX)} ―')
for code, why in APPROX.items():
    print(f'  {code:6s} {why}')

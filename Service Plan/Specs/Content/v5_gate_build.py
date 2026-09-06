# -*- coding: utf-8 -*-
"""
2단 교차 게이트 — 축→계열 확장 매핑·시딩 SQL 생성 (티켓 20260906_1947)

입력 (전부 저장소 안, 한 줄도 수정하지 않는다)
  · v5_catalog_design.json    설계 원본 — 걷기 계열의 ladder 태그(cross/cross2/mission),
                               걷기 축간교차·축내교차짝, four종목 교차짝
  · v5_catalog_verified.json  교차게이트_정정 7건(러닝 이정표 스플릿→휴식 대체 등)
  · v5_mission_badges.json    4종목 미션 보상 배지 32종의 「여는축」
  · v5_seed_build.py          family_key 규칙·계열별 axis 재사용(FAMS 추출)

출력
  · v5_gate_mapping.json (정본 매핑표 — 감사용)
  · ../../../jam-web/supabase/migrations/seed_v5_gate_conditions.sql (UPDATE, 미실행)

⚠️ 이 스크립트는 SQL 파일을 «쓰기»만 한다. DB에 접속하지 않는다.

## 기계적 추출 vs 수기 인코딩 (감사 노트)
- **계열→axis 소속, 등급 존재 여부, family_key**: FAMS(v5_seed_build.py 재사용)에서
  100% 기계적으로 추출한다.
- **걷기의 게이트 유무(cross/cross2/mission 태그)**: design JSON의 `ladder` 3번째 원소를
  그대로 파싱한다 — 100% 기계적. 이 태그가 「어느 계열이 실제로 게이트를 가지는가」의
  단일 진실이다(축내교차짝·교차짝 표는 참고용 폭넓은 후보 나열이라 W3·W4처럼 표에는
  있어도 실제 게이트가 없는 계열이 있다 — ladder 태그만 신뢰한다).
- **걷기의 축내 짝(어느 계열과 짝짓는가)**: `축내교차짝` 배열에서 정규식으로 코드를
  추출한다(예: "A1 자정의 경계인" → "A1") — 기계적.
- **축 간 교차의 대상 축 이름 매핑(강도/단일최대/최고도달 등 종목별 이명)**: 이 부분만
  수기로 확정했다. 종목마다 같은 축을 다른 한글로 표기해(예: 등산 "고도"=강도,
  "단일고도"=P1축, "긴 산행"=단일최대축, "최고도달"=A1축) 기계적 문자열 매칭이 불가능
  하다고 판단했다(교차짝 표의 라벨과 축구성 표의 라벨이 다르다). `AXIS_RULES`에
  종목별로 canonical script axis(`add()` 호출의 axis 인자값)를 직접 대응시키고, 각
  항목에 출처 행을 주석으로 남긴다. 4종목은 걷기처럼 per-family ladder 태그가 없어
  (design JSON `종목` 섹션에 태그 필드가 없음) 이 축 단위 규칙을 해당 축의 모든
  계열에 균일 적용한다(이정표 단일-rung 계열도 자신의 rarity가 존재하는 rung에만 적용).
- **`season_count_all` 계열 제외**: 걷기 W3(사계절)가 ladder에 태그가 없는 것과 같은
  패턴이 러닝·자전거·등산 W3에도 있다(모두 season_count_all 조건). 4종목은 태그가
  없으므로 이 조건 키 존재로 기계적으로 같은 예외를 적용한다.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT_SQL = os.path.join(REPO, 'jam-web', 'supabase', 'migrations', 'seed_v5_gate_conditions.sql')
OUT_MAP = os.path.join(HERE, 'v5_gate_mapping.json')

design = json.load(open(os.path.join(HERE, 'v5_catalog_design.json'), encoding='utf-8'))
verified = json.load(open(os.path.join(HERE, 'v5_catalog_verified.json'), encoding='utf-8'))
# 교차게이트_정정 7건은 AXIS_RULES/WITHIN_PAIRS에 손으로 반영했다(스플릿 행 삭제·러닝 이정표
# cross2 스플릿→휴식·T3 축내→축간·휴식 짝 X3↔X1 확정 4건 + 겹침비율/헤더 표기 오류 3건은
# 게이트 로직에 영향 없음). 파일이 바뀌면 이 개수부터 다시 확인한다.
assert len(verified['교차게이트_정정']) == 7, '교차게이트_정정 건수가 바뀌었다 — AXIS_RULES 재검토 필요'

# ─────────────────────────────────────────────────────────────────────────
# ① FAMS 추출 — v5_seed_build.py의 family 정의부(1~493행, mission()까지)를 그대로 실행해
#    재사용한다. family_key 규칙·axis 소속·rarity 존재 여부가 이 한 곳에서만 정의된다.
SEED_BUILD = os.path.join(HERE, 'v5_seed_build.py')
_seed_src = open(SEED_BUILD, encoding='utf-8').read()
_cut = _seed_src.index("for i in range(1, 9):\n    mission(TR, f'T-Q{i}')") + len(
    "for i in range(1, 9):\n    mission(TR, f'T-Q{i}')"
)
_fams_ns = {'__file__': SEED_BUILD, '__name__': '__v5_seed_build_fams_only__'}
exec(compile(_seed_src[:_cut], SEED_BUILD, 'exec'), _fams_ns)
FAMS = _fams_ns['FAMS']
CODE_PREFIX_RE = _fams_ns['CODE_PREFIX']  # v5_seed_build.py의 family_key 접두어 제거 규칙, 재사용


def rarities_of(fam):
    return set(r for r, lv, c in fam.rows if r is not None)


def uses_season_count_all(fam):
    return any('season_count_all' in c for r, lv, c in fam.rows if r is not None)


MYSTIC_FAMS = [f for f in FAMS if 'mystic' in rarities_of(f)]
assert len(MYSTIC_FAMS) == 98, f'정본 98과 어긋남: {len(MYSTIC_FAMS)}'

# ─────────────────────────────────────────────────────────────────────────
# ② 걷기 — ladder 태그를 그대로 파싱한다(기계적, 단일 진실).
#    {(code, rarity): tag_list}
walking_tags = {}
for grp in design['걷기']['계열']:
    for f in grp['fams']:
        for rung in f.get('ladder', []):
            if len(rung) >= 3:
                walking_tags[(f['code'], rung[0])] = rung[2]

# 축내교차짝 — "A1 자정의 경계인" 형태에서 코드만 추출(정규식, 기계적)
CODE_RE = re.compile(r'^([A-Z][0-9]+)')


def code_of(label):
    m = CODE_RE.match(label)
    return m.group(1) if m else None


walking_within_pair = {}  # code -> target code (걷기 전용, family_key 접두어 없음)
for row in design['걷기']['축내교차짝']:
    src, dst = code_of(row[0]), code_of(row[1])
    if src and dst:
        walking_within_pair[src] = dst

# ─────────────────────────────────────────────────────────────────────────
# ③ 축 간 교차 대상 축 — 종목별 규칙표 (수기 확정, 출처는 각 줄 주석)
#
# 값 형태: {'re': (kind, target axis 또는 within-pair dict), 'em': (kind, target axis[, 'min_level']),
#           'mission': 미션 코드(axis=='미션'인 mission() family의 code, 접두어 제외)}
# kind: 'between'(축 간, 다른 축 전체를 대상) | 'within'(축 내, 계열별 1:1 짝)
#
# 걷기는 축간교차(9행) + 축내교차짝(20행)을 그대로 옮겼다. 4종목은 four종목.교차짝
# (46→45행, 정정 반영)을 그대로 옮기되 종목마다 다른 라벨(강도="페이스"/"속도"/"고도"/
# "거리×고도" 등)을 축 script 라벨로 치환했다(축구성 표 대조로 확정).
AXIS_RULES = {
    'walking': {
        # design['걷기']['축간교차'] 행 순서 그대로(주석은 원문 col1~4)
        '누적':   {'re': ('between', '주기'), 'em': ('between', '휴식')},               # 누적,양,주기,휴식
        '이정표': {'re': ('between', '주기'), 'em': ('between', '달력')},               # 이정표,양,주기,달력
        '주기':   {'re': ('between', '시간대'), 'em': ('between', '누적', 'min_level')},  # 주기,규칙성,시간대,누적
        '연속':   {'re': ('between', '시간대'), 'em': ('between', '휴식')},             # 연속,규칙성,시간대,휴식
        '요일':   {'re': ('within', None), 'em': ('between', '시간대')},               # 요일,규칙성,축내,시간대
        '시간대': {'re': ('within', None), 'em': ('between', '연속')},                 # 시간대,변화,축내,연속
        '달력':   {'re': ('within', None), 'em': ('between', '누적', 'min_level')},      # 달력,변화,축내,누적
        '휴식':   {'re': ('within', None), 'em': ('between', '누적', 'min_level')},      # 휴식,회복,축내,누적
        '기록':   None,  # 자동 상승형 — 게이트 자체가 불필요(원문 그대로)
    },
    # ── 러닝 (four종목.교차짝, 정정 3건 반영: 스플릿행 삭제·이정표 cross2 스플릿→휴식·T3 축내→축간) ──
    'running': {
        '누적':      {'re': ('between', '주기'), 'em': ('between', '휴식')},
        '강도':      {'re': ('between', '단일 최대'), 'em': ('between', '연속')},
        '단일 최대': {'re': ('between', '강도'), 'em': ('between', '달력')},
        '주기':      {'re': ('between', '시간대'), 'em': ('between', '단일 최대')},
        '시간대': {'re': ('within', None), 'em': ('between', '이정표')},  # within: T1↔T2. T3는 OVERRIDES로 축간(주기)
        '요일':   {'re': ('within', None), 'em': ('between', '주기')},  # within: D1↔D2(월요일↔주말 장거리)
        '연속':   {'re': ('between', '요일'), 'em': ('between', '휴식')},
        '이정표': {'re': ('between', '달력'), 'em': ('between', '휴식')},  # 정정: cross2 스플릿→휴식
        '휴식':   {'re': ('within', None), 'em': ('between', '누적', 'min_level')},  # within: X1↔X3. X2는 OVERRIDES로 축간(누적)
        '달력':   {'re': ('within', None), 'em': ('between', '강도')},  # within: W1↔W2(한여름↔한겨울)
        '기록': None,
        '보너스': None,  # 축_커버리지에서 게이트 대상 축 제외 확인됨
    },
    # ── 자전거 ──
    'cycling': {
        '누적':      {'re': ('between', '주기'), 'em': ('between', '휴식')},
        '강도':      {'re': ('between', '단일 최대'), 'em': ('between', '연속')},
        '최고 도달': {'re': ('between', '고도'), 'em': ('between', '간격')},
        '단일 최대': {'re': ('between', '강도'), 'em': ('between', '달력')},
        '고도':      {'re': ('between', '최고 도달'), 'em': ('between', '누적', 'min_level')},
        '주기':      {'re': ('between', '요일'), 'em': ('between', '단일 최대')},
        '요일':      {'re': ('within', None), 'em': ('between', '주기')},  # within: D1↔D2(주말↔평일)
        '연속':      {'re': ('between', '간격'), 'em': ('between', '휴식')},
        '간격':      {'re': ('between', '연속'), 'em': ('between', '고도')},
        '이정표':    {'re': ('between', '달력'), 'em': ('between', '강도')},
        '휴식':      {'re': ('within', None), 'em': ('between', '누적', 'min_level')},  # within: X1↔X2
        '달력':      {'re': ('within', None), 'em': ('between', '이정표')},  # within: W1↔W2
        '기록': None,
        '보너스': None,
    },
    # ── 등산 ── (축 라벨: 강도="고도"(단일고도, P1) · 단일 최대="긴 산행"(L1,L2) · 최고 도달="최고도달"(A1))
    'hiking': {
        '누적':      {'re': ('between', '주기'), 'em': ('between', '휴식')},
        '강도':      {'re': ('between', '단일 최대'), 'em': ('between', '연속')},  # "단일고도"→"긴 산행"
        '최고 도달': {'re': ('between', '강도'), 'em': ('between', '달력')},  # "최고도달"→"단일고도"
        '단일 최대': {'re': ('between', '최고 도달'), 'em': ('between', '누적', 'min_level')},  # "긴 산행"→"최고도달"
        '주기':      {'re': ('between', '요일'), 'em': ('between', '단일 최대')},
        '요일':      {'re': ('between', '강도'), 'em': ('between', '주기')},  # 등산 요일은 계열 1개뿐 — 축내 불가, 원문 col3="단일고도"
        '연속':      {'re': ('between', '간격'), 'em': ('between', '휴식')},
        '간격':      {'re': ('between', '연속'), 'em': ('between', '최고 도달')},
        '이정표':    {'re': ('between', '달력'), 'em': ('between', '강도')},
        '휴식':      {'re': ('within', None), 'em': ('between', '누적', 'min_level')},  # within: X1↔X2
        '달력':      {'re': ('within', None), 'em': ('between', '이정표')},  # within: W1↔W2
        '기록': None,
        '보너스': None,
    },
    # ── 트레일러닝 ── (축 라벨: 강도="거리×고도"(P1) · 고도="버티컬"(E1) · 최고 도달="최고도달"(A1) · 단일 최대="울트라"(L1,L2))
    'trail_running': {
        '누적':      {'re': ('between', '주기'), 'em': ('between', '휴식')},
        '강도':      {'re': ('between', '고도'), 'em': ('between', '연속')},  # "거리×고도"→"버티컬"
        '단일 최대': {'re': ('between', '강도'), 'em': ('between', '달력')},  # "울트라"→"거리×고도"
        '고도':      {'re': ('between', '최고 도달'), 'em': ('between', '누적', 'min_level')},  # "버티컬"→"최고도달"
        '최고 도달': {'re': ('between', '단일 최대'), 'em': ('between', '간격')},  # "최고도달"→"울트라"
        '주기':      {'re': ('between', '시간대'), 'em': ('between', '단일 최대')},
        '시간대':    {'re': ('within', None), 'em': ('between', '주기')},  # within: T1↔T2(새벽의 산↔밤의 산)
        '연속':      {'re': ('between', '간격'), 'em': ('between', '휴식')},
        '간격':      {'re': ('between', '연속'), 'em': ('between', '고도')},
        '이정표':    {'re': ('between', '달력'), 'em': ('between', '강도')},
        '휴식':      {'re': ('within', None), 'em': ('between', '누적', 'min_level')},  # within: X1↔X2
        # 트레일 달력은 축내 불가(원문 col3="누적") — R→E도 축간(누적, min_level 대상)
        '달력':      {'re': ('between', '누적', 'min_level'), 'em': ('between', '이정표')},
        '기록': None,
        '보너스': None,
    },
}

# 4종목 축내 짝(계열 코드, 접두어 제외) — 교차게이트_정정·설명 텍스트에서 그대로 옮김
WITHIN_PAIRS = {
    'running': {'T1': 'T2', 'T2': 'T1', 'D1': 'D2', 'D2': 'D1', 'W1': 'W2', 'W2': 'W1'},
    'cycling': {'D1': 'D2', 'D2': 'D1', 'X1': 'X2', 'X2': 'X1', 'W1': 'W2', 'W2': 'W1'},
    'hiking': {'X1': 'X2', 'X2': 'X1', 'W1': 'W2', 'W2': 'W1'},
    'trail_running': {'T1': 'T2', 'T2': 'T1', 'X1': 'X2', 'X2': 'X1'},
}
# running 휴식은 정정으로 X3↔X1이 짝, X2는 짝이 없어 축간(누적)으로 대체
WITHIN_PAIRS['running']['X1'] = 'X3'
WITHIN_PAIRS['running']['X3'] = 'X1'

# 미션 코드 매핑 — v5_mission_badges.json 「여는축」(복수 축을 여는 미션도 있다: 누적+이정표 등)
MISSION_MAP = {
    'walking': {'누적': 'M1', '주기': 'M2', '시간대': 'M3', '요일': 'M4', '연속': 'M5',
                '이정표': 'M6', '휴식': 'M7', '달력': 'M8'},
    'running': {'누적': 'Q1', '이정표': 'Q1', '강도': 'Q2', '단일 최대': 'Q3', '주기': 'Q4',
                '시간대': 'Q5', '요일': 'Q5', '연속': 'Q6', '휴식': 'Q7', '달력': 'Q8'},
    'cycling': {'누적': 'Q1', '이정표': 'Q1', '강도': 'Q2', '최고 도달': 'Q2', '단일 최대': 'Q3',
                '고도': 'Q4', '주기': 'Q5', '요일': 'Q5', '연속': 'Q6', '간격': 'Q6',
                '휴식': 'Q7', '달력': 'Q8'},
    'hiking': {'누적': 'Q1', '이정표': 'Q1', '강도': 'Q2', '최고 도달': 'Q2', '단일 최대': 'Q3',
               '주기': 'Q4', '요일': 'Q4', '연속': 'Q5', '간격': 'Q6', '휴식': 'Q7', '달력': 'Q8'},
    'trail_running': {'누적': 'Q1', '이정표': 'Q1', '강도': 'Q2', '단일 최대': 'Q3', '고도': 'Q4',
                       '최고 도달': 'Q4', '주기': 'Q5', '시간대': 'Q5', '연속': 'Q6', '간격': 'Q6',
                       '휴식': 'Q7', '달력': 'Q8'},
}

MIN_LEVEL = 6  # 모든 종목의 누적 축 중 가장 짧은 사다리(카운트형 K3, 6단계)의 상한 — 근거는 완료기록 참고

# "98 Mystic + 해당 Epic" 범위 밖이지만 min_level 11건 목록(v5_catalog_verified.json
# 잔여_이슈)에 명시적으로 들어있는 예외 — 트레일 「달력」의 Rare→Epic 관문(트레일 3건 중 1건)은
# W1(Mystic 없음)에 걸린다.
MIN_LEVEL_EXTRA_SCOPE = {'trail_running:W1'}

# 4종목 R→E 단계의 축 내 규칙에 대한 계열별 예외(정정 반영) — within 짝이 없거나
# 겹침 위험으로 배제된 계열은 축 간으로 대체한다.
RE_OVERRIDES = {
    'running': {
        'T3': ('between', '주기'),   # 정정: 「해와 달 사이」 축내(밤↔새벽) → 축간(주기)로 대체
        'X2': ('between', '누적'),   # 정정: 「돌아온 러너」 짝이 X3↔X1로 확정되며 X2는 짝이 없어짐
    },
}

# ─────────────────────────────────────────────────────────────────────────
# ④ 대상 계열 목록 — 축 이름(script axis 라벨) → 그 축에 속한 family_key 리스트(종목 내)
def family_keys_of_axis(sport, axis_label):
    return [f.family_key for f in FAMS if f.sport_key == sport and f.axis == axis_label]


def gate_requirement(family_keys, min_rarity=None, min_level=None):
    req = {'family_keys': family_keys}
    if min_rarity:
        req['min_rarity'] = min_rarity
    if min_level:
        req['min_level'] = min_level
    return req


# ─────────────────────────────────────────────────────────────────────────
# ⑤ 계열 하나(등급형·반복형)의 epic/mystic 행에 대해 게이트 patch를 만든다.
# 반환: [(family_key, rarity, patch_dict, note), ...]
results = []
skipped_no_gate = []  # (family_key, rarity, 사유) — 감사용

for f in FAMS:
    if f.kind not in ('graded', 'repeatable'):
        continue  # leveled(누적 자기 자신의 Lv.5+/Lv.8+ 게이트)·auto(기록)·mission은 이 티켓 범위 밖
    sport = f.sport_key
    axis = f.axis
    rset = rarities_of(f)
    # 티켓 범위 엄수: "98 Mystic + 해당 Epic"만 다룬다. Mystic이 없는 계열(예: walking:R4
    # 「Epic까지만 있는 계열」)은 설계상 자체 게이트가 있어도 이번 티켓 범위 밖으로 남긴다
    # (완료 기록 alerts 참고) — 단, MIN_LEVEL_EXTRA_SCOPE(11건 중 R→E 단계 1건, 트레일 달력)는
    # 예외로 포함한다: 그 계열 자체가 Mystic이 없더라도 이 티켓이 "11건 전부"를 고치라고
    # 명시했고, 그 행이 정확히 이 계열(trail_running:W1)의 Rare→Epic 관문이기 때문이다.
    if 'mystic' not in rset and f.family_key not in MIN_LEVEL_EXTRA_SCOPE:
        continue

    if sport == 'walking':
        for rarity, stage in (('epic', 're'), ('mystic', 'em')):
            if rarity not in rset:
                continue
            tags = walking_tags.get((f.code, rarity))
            if not tags:
                skipped_no_gate.append((f.family_key, rarity, '설계 ladder에 태그 없음(의도된 예외)'))
                continue
            axis_rule = AXIS_RULES['walking'][axis]
            if stage == 're':
                kind, target = axis_rule['re']
                if kind == 'within':
                    target_code = walking_within_pair.get(f.code)
                    assert target_code, f'{f.family_key} 축내 짝 없음'
                    fk = f'walking:{target_code}'
                    patch = {'cross_in_axis': gate_requirement([fk])}
                else:
                    fks = family_keys_of_axis('walking', target)
                    patch = {'cross_between_axis': gate_requirement(fks)}
            else:
                em = axis_rule['em']
                target = em[1]
                need_min_level = len(em) > 2 and em[2] == 'min_level'
                fks = family_keys_of_axis('walking', target)
                # min_rarity·min_level은 상호 배타 — 대상이 무한레벨형(누적 축)이면 등급
                # 서열이 없어 min_rarity를 생략해야 한다(BadgeGateRequirement 문서 규약,
                # 안 지키면 rarityTier(null)=0이 항상 걸려 min_level을 채워도 영원히 미충족).
                req = gate_requirement(
                    fks,
                    min_rarity=None if need_min_level else 'rare',
                    min_level=MIN_LEVEL if need_min_level else None,
                )
                mission_code = MISSION_MAP['walking'][axis]
                patch = {
                    'cross_between_axis': req,
                    'gate_mission_badge': gate_requirement([f'walking:{mission_code}']),
                }
            results.append((f.family_key, rarity, patch, f'walking:{axis}:{f.code}'))
        continue

    # ── 4종목 ──
    if axis in (None, '기록', '보너스'):
        skipped_no_gate.append((f.family_key, 'epic/mystic', f'축({axis}) 게이트 대상 아님(축_커버리지 확인됨)'))
        continue
    if uses_season_count_all(f):
        skipped_no_gate.append((f.family_key, 'epic/mystic', 'season_count_all(사계절 보너스) — 걷기 W3와 같은 패턴, 게이트 없음'))
        continue
    axis_rule = AXIS_RULES[sport].get(axis)
    if axis_rule is None:
        continue
    scode = CODE_PREFIX_RE.sub('', f.code)  # 'R-T1' -> 'T1' 등, WITHIN_PAIRS/RE_OVERRIDES는 접두어 없는 코드로 키를 둔다

    for rarity, stage in (('epic', 're'), ('mystic', 'em')):
        if rarity not in rset:
            continue
        if stage == 're':
            override = RE_OVERRIDES.get(sport, {}).get(scode)
            re_rule = override if override else axis_rule['re']
            kind, target = re_rule[0], re_rule[1]
            re_min_level = len(re_rule) > 2 and re_rule[2] == 'min_level'
            if kind == 'within':
                target_code = WITHIN_PAIRS[sport].get(scode)
                if not target_code:
                    skipped_no_gate.append((f.family_key, rarity, '축내 짝 미정 — 카탈로그에 후속 필요'))
                    continue
                fk = f'{sport}:{target_code}'
                patch = {'cross_in_axis': gate_requirement([fk])}
            else:
                fks = family_keys_of_axis(sport, target)
                if not fks:
                    skipped_no_gate.append((f.family_key, rarity, f'대상 축({target}) 계열 없음'))
                    continue
                patch = {'cross_between_axis': gate_requirement(
                    fks, min_level=MIN_LEVEL if re_min_level else None
                )}
        else:
            em = axis_rule['em']
            target = em[1]
            need_min_level = len(em) > 2 and em[2] == 'min_level'
            fks = family_keys_of_axis(sport, target)
            if not fks:
                skipped_no_gate.append((f.family_key, rarity, f'대상 축({target}) 계열 없음'))
                continue
            req = gate_requirement(
                fks,
                min_rarity=None if need_min_level else 'rare',
                min_level=MIN_LEVEL if need_min_level else None,
            )
            mission_code = MISSION_MAP[sport].get(axis)
            assert mission_code, f'{sport}:{axis} 미션 매핑 없음'
            patch = {
                'cross_between_axis': req,
                'gate_mission_badge': gate_requirement([f'{sport}:{mission_code}']),
            }
        results.append((f.family_key, rarity, patch, f'{sport}:{axis}:{f.code}'))

epic_rows = [r for r in results if r[1] == 'epic']
mystic_rows = [r for r in results if r[1] == 'mystic']
assert len(mystic_rows) == 86, f'mystic 패치 수 어긋남: {len(mystic_rows)}'
assert len(epic_rows) == 79, f'epic 패치 수 어긋남: {len(epic_rows)}'
min_level_rows = [r for r in results if 'min_level' in json.dumps(r[2])]
assert len(min_level_rows) == 15, f'min_level 포함 행 수 어긋남: {len(min_level_rows)}'

print('총 패치 대상 행', len(results), '(epic', len(epic_rows), '/ mystic', len(mystic_rows), ')')
print('게이트 없음(의도된 예외) 행', len(skipped_no_gate))
print('min_level 포함 행', len(min_level_rows), '— 11건의 축쌍(row) 중 실제 배지가 존재하는', end=' ')
print(len({r[3].rsplit(":", 1)[0] for r in min_level_rows}), '개 축쌍에서 발생')

# ─────────────────────────────────────────────────────────────────────────
# ⑥ 정본 매핑표 JSON — 감사용
mapping_out = {
    '_meta': {
        '티켓': '20260906_1947',
        '생성': 'v5_gate_build.py',
        '총_패치_행': len(results),
        'epic_패치': len(epic_rows),
        'mystic_패치': len(mystic_rows),
        'min_level_값': MIN_LEVEL,
        'min_level_포함_행': len(min_level_rows),
        '게이트_없음_의도된_예외': [{'family_key': r[0], 'rarity': r[1], '사유': r[2]} for r in skipped_no_gate],
    },
    '패치': [
        {'family_key': fk, 'rarity': rarity, 'condition_patch': patch, '출처': note}
        for fk, rarity, patch, note in sorted(results, key=lambda r: (r[0], r[1]))
    ],
}
with open(OUT_MAP, 'w', encoding='utf-8') as fp:
    json.dump(mapping_out, fp, ensure_ascii=False, indent=2)
print('매핑표 저장:', OUT_MAP)

# ─────────────────────────────────────────────────────────────────────────
# ⑦ SQL 생성 — UPDATE badges SET condition_json = condition_json || 패치::jsonb
#    (jsonb 병합이라 기존 수치 조건은 그대로 두고 게이트 키 3종만 추가한다. 재실행해도
#    같은 값을 다시 넣을 뿐이라 멱등이다.)
sql_lines = []


def A(s=''):
    sql_lines.append(s)


A('-- seed_v5_gate_conditions.sql — 2단 교차 게이트 축→계열 매핑 (티켓 20260906_1947)')
A('--')
A(f'-- 생성: v5_gate_build.py. 대상: {len(results)}행 (Epic {len(epic_rows)} · Mystic {len(mystic_rows)}).')
A('-- 대상 범위: 98 Mystic 중 게이트가 있는 86종(연속·달력 축의 설계상 무관문 예외 12종 제외,')
A('--          v5_gate_mapping.json의 게이트_없음_의도된_예외 참고) + 그 86종과 같은 계열의 Epic 79종.')
A('-- 무한레벨형(누적 축) 계열 자신의 Lv.5+/Lv.8+ 게이트는 범위 밖 — 별도 콘텐츠 작업(완료기록 참고).')
A('--')
A('-- ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라')
A('--    **작성만 하고 실행하지 않았다.** 실행은 사용자 승인 후 오케스트레이터가 처리한다.')
A('--')
A('-- 실행 순서: 마이그레이션 133(cross_in_axis/cross_between_axis/gate_mission_badge 키)이')
A('--   이미 배포돼 있어야 한다 — 이미 배포됨(확인됨). min_level은 위 세 키의 값(jsonb 객체)')
A('--   내부 필드라 CHECK 제약 대상이 아니다(migration 133/135은 최상위 키만 검사) — 별도')
A('--   마이그레이션이 필요 없다(이 티켓 ④ "먼저 확인" 결과).')
A('--')
A('-- jsonb 병합(||)이라 기존 조건 필드는 그대로 두고 게이트 키만 추가/덮어쓴다. 재실행해도')
A('-- 안전하다(멱등) — 같은 값을 다시 병합할 뿐이다.')
A('--')
A('-- 검증(실행 후):')
A("--   SELECT count(*) FROM badges WHERE type='activity' AND deleted_at IS NULL")
A(f"--     AND condition_json ? 'cross_in_axis'; -- 예상 다수(within 대상)")
A(f"--   SELECT count(*) FROM badges WHERE type='activity' AND deleted_at IS NULL")
A(f"--     AND condition_json ? 'gate_mission_badge'; -- 예상 {len(mystic_rows)}")
A('')
A('BEGIN;')
A('')

for fk, rarity, patch, note in sorted(results, key=lambda r: (r[0], r[1])):
    patch_json = json.dumps(patch, ensure_ascii=False)
    # jsonb 리터럴 안의 작은따옴표(이름에 없음) 이스케이프 불필요 — family_key/영문 키만 사용
    A(f"-- {note} ({rarity})")
    A(
        "UPDATE public.badges SET condition_json = condition_json || "
        f"'{patch_json}'::jsonb "
        f"WHERE family_key = '{fk}' AND rarity = '{rarity}' AND type = 'activity' "
        "AND deleted_at IS NULL;"
    )
A('')
A('COMMIT;')

with open(OUT_SQL, 'w', encoding='utf-8') as fp:
    fp.write('\n'.join(sql_lines) + '\n')
print('SQL 저장:', OUT_SQL)

print('min_level 포함 행 상세:')
for r in min_level_rows:
    print('  -', r[0], r[1], r[3])

# 액티비티 배지 카탈로그 v5

> **정본은 DB다.** 이 문서는 `Service Plan/Specs/Content/`의 산출물에서 생성했다 —
> 손으로 고치지 말고 `v5_seed_build.py`가 만드는 데이터를 고친 뒤 다시 생성한다.
> 생성 스크립트: `Service Plan/Specs/Content/v5_doc_build.mjs` (티켓 20260905_0035 C묶음)
>
> **규모: 194계열 · 630종** — 2026-09-05 프로덕션 시딩 완료
>
> v4(162종)는 전량 폐기했다(`deleted_at`). 이 문서가 v4 문서를 대체한다.
>
> **설명문은 등급·레벨마다 다르다** — 2026-09-06 티켓 `20260906_1305`. 계열당 한 문장을
> 모든 등급이 공유하던 것을 131계열 436행에서 등급별로 분화했다. 최저 등급(또는 Lv1)만
> 종전 문장을 유지한다. 정본은 `v5_catalog_writing.json`의 `등급별설명`이며,
> **아래 계열 표의 「설명문」은 최저 등급 문장 하나만 싣는다** — 생성기(`v5_doc_build.mjs`)가
> 아직 `설명` 필드만 읽기 때문이다(후속 티켓 `20260906_1420`).

---

## 이 카탈로그를 읽는 법

| 개념 | 뜻 |
|---|---|
| **계열** | 같은 소재를 등급·레벨로 펼친 한 묶음. `family_key`(`{종목}:{코드}`)로 식별한다 |
| **종** | 실제 `badges` 행 하나. 한 계열이 2~8종을 갖는다 |
| **등급형** | `rarity`가 있고 `level`은 없다. Common→Mystic 사다리 |
| **레벨형** | `rarity`가 **없고** `level`이 있다. 무한레벨·자동 상승형 |
| **반복형** | `rarity` + `condition_json.repeat_count`. 같은 조건을 몇 번 달성했는가 |
| **미션 보상** | `condition_json.mission_reward = true`. 동기화로는 **절대 발급되지 않는다** |

**배지 이름은 카탈로그 전역에서 유일하다.** 발급 엔진이 등급형을 이름으로 묶어 성장
사다리를 만들기 때문이다(`badge-engine/index.ts` `badgesByName`). 같은 이름이 종목을 넘어
겹치면 한 종목에서 올린 등급이 다른 종목의 하위 등급을 영구히 가린다 —
그래서 v5는 종목마다 이름을 다르게 지었다(`v5_catalog_names.json`, 29건).

---

## 설계 원칙

| # | 원칙 | 내용 |
|---|---|---|
| 1 | **가입 시점부터 카운트** | 가입 이전 활동은 평가에 넣지 않는다. Strava `pr_count`를 쓰지 않는 이유이기도 하다 |
| 2 | **조건 전면 공개** | 모든 조건을 미리 보여준다. 배지 외형만 획득 후 개봉한다 |
| 3 | **강도 채점으로 등급 산정** | 행동 변경·소요 시간·실패 리스크·통제 불가 4축 채점. 첫 회는 4축, 반복 사다리는 3축 |
| 4 | **2단 교차 게이트** | Epic은 축 내 교차, Mystic은 축 간 교차 **AND** 미션 보상 배지 |
| 5 | **축은 종목을 넘지 않는다** | 러닝 Mystic을 위해 자전거를 타게 하지 않는다. 미션도 종목마다 따로 있다 |
| 6 | **fail-closed** | 엔진이 평가할 수 없는 조건은 발급을 **막는다**. 조용히 통과시키지 않는다 |
| 7 | **데이터가 없으면 계산하지 않는다** | 심박·파워·케이던스는 보너스 축이다. 없어도 모든 Mystic에 도달할 수 있다 |

---

## 종목별 규모

| 종목 | 계열 | 종 | 등급형 | 레벨형 | 반복형 | 미션 |
|---|---:|---:|---:|---:|---:|---:|
| 걷기 | 47 | 153 | 54 | 46 | 37 | 8 |
| 러닝 | 40 | 132 | 47 | 38 | 31 | 8 |
| 자전거 | 39 | 126 | 43 | 36 | 31 | 8 |
| 등산 | 32 | 97 | 34 | 28 | 19 | 8 |
| 트레일러닝 | 36 | 122 | 40 | 45 | 21 | 8 |
| **합계** | **194** | **630** | | | | **40** |

---

## 전체 배지 목록

### 걷기 (`walking`) — 47계열 · 153종

#### 미션

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:M1` | **누적의 증명** | 미션 '2주 안에 20km' 완료 | undefined | Epic |
| `walking:M2` | **리듬의 증명** | 미션 '3주(월~일) 연속 한 주에 3회' 완료 | undefined | Epic |
| `walking:M3` | **시간의 증명** | 미션 '2주 안에 새벽·낮·밤 각 2회' 완료 | undefined | Epic |
| `walking:M4` | **요일의 증명** | 미션 '2주 안에 서로 다른 5개 요일에 걷기' 완료 | undefined | Epic |
| `walking:M5` | **연속의 증명** | 미션 '7일 연속 걷기' 완료 | undefined | Epic |
| `walking:M6` | **이정표의 증명** | 미션 '한 번에 8km 이상 걷기' 완료 | undefined | Epic |
| `walking:M7` | **회복의 증명** | 미션 '4주(월~일) 연속 한 주에 3회, 매주 1일 휴식' 완료 | undefined | Epic |
| `walking:M8` | **계절의 증명** | 미션 '서로 다른 두 달에 각각 30km 걷기' 완료 | undefined | Epic |

<details><summary>설명문</summary>

- **누적의 증명** — 미션으로만 얻는 열쇠입니다. 누적 계열의 마지막 문을 엽니다.
- **리듬의 증명** — 미션으로만 얻는 열쇠입니다. 주기 계열의 마지막 문을 엽니다.
- **시간의 증명** — 미션으로만 얻는 열쇠입니다. 시간대 계열의 마지막 문을 엽니다.
- **요일의 증명** — 미션으로만 얻는 열쇠입니다. 요일 계열의 마지막 문을 엽니다.
- **연속의 증명** — 미션으로만 얻는 열쇠입니다. 연속 계열의 마지막 문을 엽니다.
- **이정표의 증명** — 미션으로만 얻는 열쇠입니다. 이정표 계열의 마지막 문을 엽니다.
- **회복의 증명** — 미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.
- **계절의 증명** — 미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.

</details>

#### 누적

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:K1` | **걸어온 거리** | 누적 거리 5km | 레벨형 | `distance_km` Lv.1 5 … Lv.8 550 (8) |
| `walking:K3` | **걸은 날들** | 누적 활동일수 3일 | 레벨형 | `active_days_count` Lv.1 3 … Lv.6 110 (6) |

<details><summary>설명문</summary>

- **걸어온 거리** — 발끝에 쌓인 거리는 지도가 되기 전에 기억이 됩니다.
- **걸은 날들** — 며칠을 걸었는지는 얼마나 걸었는지보다 정직합니다.

</details>

#### 주기

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:P1` | **오늘의 한 걸음** | 하루 1회 / 1회 | 등급형 | `active_days_count` Common 1 · Rare 30 · Epic 100 · Mystic 300 |
| `walking:P2` | **이번 주의 약속** <sup>회차</sup> | 한 주(월~일)에 3회 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 8 · Epic 26 · Mystic 52 |
| `walking:P3` | **이달의 걸음** | 한 달에 30km | 등급형 | `monthly_km` Common 30 · Rare 52 · Epic 85 · Mystic 130 |
| `walking:P4` | **계절의 보행자** <sup>필터</sup> | 한 계절에 100km | 등급형 | `distance_km` Common 100 · Rare 156 · Epic 250 · Mystic 400 |

<details><summary>설명문</summary>

- **오늘의 한 걸음** — 하루에 한 번이면 충분합니다. 그 하루가 쌓입니다.
- **이번 주의 약속** — 스스로와 한 약속을 일곱 밤 안에 지켜냈습니다.
- **이달의 걸음** — 한 달을 통째로 걸어낸 사람에게만 보이는 총량이 있습니다.
- **계절의 보행자** — 계절 하나를 걸어서 통과했습니다.

</details>

#### 시간대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:A1` | **자정의 경계인** <sup>필터·근사</sup> | 자정을 넘긴 활동 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `walking:A2` | **해와 달 사이** <sup>필터·근사</sup> | 같은 날 아침 8시 이전과 저녁 8시 이후 / 1회 | 등급형 | `total_count` Rare 1 · Epic 8 · Mystic 25 |
| `walking:A3` | **리듬 브레이커** <sup>회차·pending</sup> | 3일 연속 서로 다른 시간대 / 1회 | 반복형 | `repeat_count` Rare 1 · Epic 3 · Mystic 10 |
| `walking:A4` | **스물넷의 산책** <sup>회차·pending</sup> | 24시간 안에 3회 / 1회 | 반복형 | `repeat_count` Rare 1 · Epic 4 · Mystic 12 |
| `walking:A5` | **주말이 없다** <sup>회차·근사·pending</sup> | 4주(월~일) 연속 평일만 / 1회 | 반복형 | `repeat_count` Rare 1 · Epic 3 · Mystic 8 |
| `walking:A6` | **초하루의 사람** <sup>필터·pending</sup> | 매달 1일 / 1회 | 등급형 | `total_count` Rare 1 · Epic 3 · Mystic 12 |
| `walking:A8` | **새벽의 사람** <sup>필터</sup> | 새벽 5시~아침 8시 / 1회 | 등급형 | `total_count` Rare 1 · Epic 20 · Mystic 60 |
| `walking:A9` | **밤의 보행자** <sup>필터</sup> | 밤 10시~새벽 5시 / 1회 | 등급형 | `total_count` Common 1 · Rare 15 · Epic 50 · Mystic 120 |
| `walking:A10` | **점심의 탈출** <sup>필터</sup> | 낮 12시~2시 / 1회 | 등급형 | `total_count` Common 1 · Rare 15 · Epic 50 · Mystic 120 |

<details><summary>설명문</summary>

- **자정의 경계인** — 하루와 하루 사이를 걸어서 넘어간 사람입니다.
- **해와 달 사이** — 같은 하루의 양 끝을 모두 밟았습니다.
- **리듬 브레이커** — 몸에 밴 시간대를 사흘 내리 흔들었습니다.
- **스물넷의 산책** — 하루가 세 번의 산책을 견뎠습니다.
- **주말이 없다** — 쉬는 날에도 평일의 리듬을 지켰습니다.
- **초하루의 사람** — 달이 바뀌는 첫날마다 신발을 신었습니다.
- **새벽의 사람** — 아무도 깨지 않은 시간을 혼자 씁니다.
- **밤의 보행자** — 밤 10시가 넘은 골목에도 걷는 사람이 있습니다.
- **점심의 탈출** — 가장 짧은 자유 시간을 걸음에 씁니다.

</details>

#### 요일

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:D0` | **일요일의 의식** <sup>필터</sup> | 일요일 / 1회 | 등급형 | `total_count` Common 1 · Rare 10 · Epic 30 · Mystic 52 |
| `walking:D1` | **월요병 극복자** <sup>필터</sup> | 월요일 / 1회 | 등급형 | `total_count` Common 1 · Rare 10 · Epic 30 · Mystic 52 |
| `walking:D2` | **불금은 없다** <sup>필터</sup> | 금요일 / 1회 | 등급형 | `total_count` Common 1 · Rare 10 · Epic 30 · Mystic 52 |
| `walking:D3` | **주 5일 완주** <sup>필터·근사</sup> | 한 주(월~일)에 평일 5일 모두 / 1회 | 등급형 | `total_count` Rare 1 · Epic 3 · Mystic 10 |

<details><summary>설명문</summary>

- **일요일의 의식** — 한 주의 끝을 걸음으로 닫습니다.
- **월요병 극복자** — 가장 무거운 요일을 걸어서 넘깁니다.
- **불금은 없다** — 금요일 밤의 유혹보다 걸음을 골랐습니다.
- **주 5일 완주** — 평일 다섯 날을 하나도 빠뜨리지 않았습니다.

</details>

#### 연속

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:S1` | **작심삼일의 파괴자** <sup>회차</sup> | 3일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `walking:S2` | **열흘의 리듬** <sup>회차</sup> | 10일 연속 / 1회 | 반복형 | `repeat_count` Rare 1 · Epic 3 · Mystic 10 |
| `walking:S3` | **한 달의 궤도** <sup>회차</sup> | 30일 연속 / 1회 | 반복형 | `repeat_count` Epic 1 · Mystic 2 |

<details><summary>설명문</summary>

- **작심삼일의 파괴자** — 사흘째가 가장 어렵다는 말을 스스로 반박했습니다.
- **열흘의 리듬** — 열흘이면 습관이라 불러도 됩니다.
- **한 달의 궤도** — 한 달을 하루도 끊지 않았습니다.

</details>

#### 기록

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:B1` | **자기 초월** <sup>pending</sup> | 가장 긴 거리 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `walking:B2` | **더 오래** <sup>근사·pending</sup> | 가장 긴 이동시간 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `walking:B3` | **지난달의 나에게** <sup>pending</sup> | 한 달에 지난달 거리의 120% 이상 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `walking:B4` | **평균의 배신** <sup>pending</sup> | 한 번에 평소 평균 거리의 2배 이상 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |

<details><summary>설명문</summary>

- **자기 초월** — 어제의 자신을 이기는 일만 남았습니다.
- **더 오래** — 시간을 늘리는 일은 거리를 늘리는 일보다 조용합니다.
- **지난달의 나에게** — 지난달의 자신에게 20%를 더 얹었습니다.
- **평균의 배신** — 평소의 두 배를 한 번에 걸었습니다.

</details>

#### 이정표

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:C1` | **100km 클럽** | 누적 거리 100km | 등급형 | `distance_km` Rare 100 |
| `walking:C2` | **500km 클럽** | 누적 거리 500km | 등급형 | `distance_km` Epic 500 |
| `walking:C3` | **1000km 클럽** | 누적 거리 1,000km | 등급형 | `distance_km` Mystic 1000 |
| `walking:C4` | **백 번의 걸음** | 총 100회 | 등급형 | `total_count` Rare 100 |
| `walking:C5` | **분실물 센터 999** | 총 999회 | 등급형 | `total_count` Mystic 999 |

<details><summary>설명문</summary>

- **100km 클럽** — 세 자리 숫자에 처음 닿았습니다.
- **500km 클럽** — 지도 위의 선이 도시를 벗어났습니다.
- **1000km 클럽** — 네 자리 숫자를 걸어서 만들었습니다.
- **백 번의 걸음** — 백 번을 나섰다는 사실만으로 충분합니다.
- **분실물 센터 999** — 분실물 센터 999도 이 숫자는 처음 접수합니다.

</details>

#### 휴식

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:R1` | **완전한 하루** <sup>회차</sup> | 6일 연속 후 하루 휴식 / 1회 | 반복형 | `repeat_count` Rare 1 · Epic 5 · Mystic 20 |
| `walking:R2` | **회복의 기술** <sup>회차·근사</sup> | 한 번에 90분 이상 다음 날 휴식 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 · Mystic 100 |
| `walking:R3` | **쉬는 것도 훈련** <sup>회차·근사·pending</sup> | 4주(월~일) 연속 매주 1일 이상 휴식 / 1회 | 반복형 | `repeat_count` Rare 1 · Epic 3 · Mystic 12 |
| `walking:R4` | **겨울잠** <sup>회차</sup> | 14일 이상 쉬고 복귀 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |

<details><summary>설명문</summary>

- **완전한 하루** — 쉬는 것도 계획에 있었습니다.
- **회복의 기술** — 길게 걸은 다음 날을 비워두는 법을 압니다.
- **쉬는 것도 훈련** — 네 주 동안 쉬는 날을 한 번도 건너뛰지 않았습니다.
- **겨울잠** — 돌아왔다는 사실이 떠났던 사실을 덮습니다.

</details>

#### 달력

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `walking:W1` | **한여름의 보행자** <sup>필터</sup> | 7~8월 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `walking:W2` | **한겨울의 보행자** <sup>필터</sup> | 12~2월 / 1회 | 등급형 | `total_count` Rare 1 · Epic 20 · Mystic 60 |
| `walking:W3` | **사계절의 발걸음** | 네 계절 각 10회 / 1회 | 등급형 | `season_count_all` Epic 10 · Mystic 20 |
| `walking:W4` | **장마의 의지** <sup>필터·회차</sup> | 6~7월 중 한 달에 80km | 반복형 | `repeat_count` Epic 1 · Mystic 2 |

<details><summary>설명문</summary>

- **한여름의 보행자** — 가장 더운 두 달에도 걸음을 멈추지 않았습니다.
- **한겨울의 보행자** — 숨이 하얗게 보이는 날에도 나섰습니다.
- **사계절의 발걸음** — 일 년을 네 조각으로 나눠 모두 걸었습니다.
- **장마의 의지** — 빗소리를 배경음으로 한 달을 채웠습니다.

</details>

### 러닝 (`running`) — 40계열 · 132종

#### 누적

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:K1` | **달려온 거리** | 누적 거리 20km | 레벨형 | `distance_km` Lv.1 20 … Lv.8 3200 (8) |
| `running:K3` | **달린 횟수** | 총 10회 | 레벨형 | `total_count` Lv.1 10 … Lv.6 320 (6) |

<details><summary>설명문</summary>

- **달려온 거리** — 발이 지나온 길이는 지도보다 몸이 먼저 압니다.
- **달린 횟수** — 몇 번 나갔는지가 얼마나 갔는지보다 정직합니다.

</details>

#### 강도

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:P1` | **페이스 메이커** <sup>pending</sup> | 한 번에 5km 이상, 6:15/km보다 빠르게 | 등급형 | `max_pace_sec_per_km` Common 375 · Rare 330 · Epic 300 · Mystic 270 |

<details><summary>설명문</summary>

- **페이스 메이커** — 속도는 재능이 아니라 반복이 만든 결과입니다.

</details>

#### 단일 최대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:L1` | **긴 하루** <sup>pending</sup> | 한 번에 15km | 등급형 | `single_distance_km` Common 15 · Rare 21 · Epic 32 · Mystic 42 |

<details><summary>설명문</summary>

- **긴 하루** — 한 번에 갈 수 있는 거리가 그 사람의 그릇입니다.

</details>

#### 주기

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:C1` | **오늘의 한 발** | 하루 1회 / 1회 | 등급형 | `active_days_count` Common 1 · Rare 30 · Epic 100 · Mystic 300 |
| `running:C2` | **이번 주의 페이스** <sup>회차</sup> | 한 주(월~일)에 4회 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 8 · Epic 26 · Mystic 52 |
| `running:C3` | **이달의 러닝** | 한 달에 120km | 등급형 | `monthly_km` Common 120 · Rare 217 · Epic 350 · Mystic 550 |
| `running:C4` | **계절의 러너** <sup>필터</sup> | 한 계절에 400km | 등급형 | `distance_km` Common 400 · Rare 650 · Epic 1100 · Mystic 1700 |

<details><summary>설명문</summary>

- **오늘의 한 발** — 하루에 한 번, 그것으로 충분합니다.
- **이번 주의 페이스** — 네 번을 채운 주에는 몸이 먼저 알아차립니다.
- **이달의 러닝** — 한 달을 통째로 달린 총량이 여기 남습니다.
- **계절의 러너** — 계절 하나를 달려서 통과했습니다.

</details>

#### 시간대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:T1` | **새벽의 러너** <sup>필터</sup> | 새벽 5시~아침 8시 / 1회 | 등급형 | `total_count` Common 1 · Rare 15 · Epic 50 · Mystic 120 |
| `running:T2` | **밤의 러너** <sup>필터</sup> | 저녁 8시~새벽 5시 / 1회 | 등급형 | `total_count` Common 1 · Rare 15 · Epic 50 · Mystic 120 |
| `running:T3` | **해와 달의 주자** <sup>필터·근사</sup> | 같은 날 아침 8시 이전과 저녁 8시 이후 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |

<details><summary>설명문</summary>

- **새벽의 러너** — 해보다 먼저 나선 사람에게만 열리는 도시가 있습니다.
- **밤의 러너** — 하루를 끝낸 몸으로 다시 시작하는 사람입니다.
- **해와 달의 주자** — 같은 하루의 양 끝을 모두 달렸습니다.

</details>

#### 요일

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:D1` | **월요일의 시작** <sup>필터</sup> | 월요일 / 1회 | 등급형 | `total_count` Common 1 · Rare 10 · Epic 30 · Mystic 52 |
| `running:D2` | **주말 장거리** <sup>필터·근사·pending</sup> | 주말에 한 번에 10km 이상 / 1회 | 등급형 | `total_count` Common 1 · Rare 8 · Epic 25 · Mystic 52 |

<details><summary>설명문</summary>

- **월요일의 시작** — 한 주의 첫 단추를 달리기로 채웠습니다.
- **주말 장거리** — 쉬는 날에 가장 멀리 가는 사람이 있습니다.

</details>

#### 연속

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:N1` | **사흘의 리듬** <sup>회차</sup> | 3일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `running:N2` | **일주일의 궤도** <sup>회차</sup> | 7일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |
| `running:N3` | **런 스트릭** <sup>회차</sup> | 30일 연속 / 1회 | 반복형 | `repeat_count` Epic 1 · Mystic 2 |

<details><summary>설명문</summary>

- **사흘의 리듬** — 사흘째 아침이 가장 무겁다는 걸 이겨냈습니다.
- **일주일의 궤도** — 일곱 밤을 하루도 건너뛰지 않았습니다.
- **런 스트릭** — 매일 달리는 사람들의 오래된 전통에 합류했습니다.

</details>

#### 기록

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:R1` | **발끝의 한계** <sup>pending</sup> | 가장 긴 거리 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `running:R2` | **더 빠르게** <sup>근사·pending</sup> | 5km 이상 활동의 가장 빠른 페이스 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `running:R3` | **지난달의 주자** <sup>pending</sup> | 한 달에 지난달 거리의 120% 이상 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |

<details><summary>설명문</summary>

- **발끝의 한계** — 어제의 자신을 이기는 일만 남았습니다.
- **더 빠르게** — 같은 거리를 더 짧은 시간에 통과했습니다.
- **지난달의 주자** — 한 달 전의 자신에게 20%를 더 얹었습니다.

</details>

#### 이정표

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:M1` | **500km 주자** | 누적 거리 500km | 등급형 | `distance_km` Rare 500 |
| `running:M2` | **2000km 클럽** | 누적 거리 2,000km | 등급형 | `distance_km` Epic 2000 |
| `running:M3` | **5000km 클럽** | 누적 거리 5,000km | 등급형 | `distance_km` Mystic 5000 |
| `running:M4` | **백 번의 러닝** | 총 100회 | 등급형 | `total_count` Rare 100 |
| `running:M5` | **마라톤 완주** <sup>pending</sup> | 한 번에 42.195km | 등급형 | `single_distance_km` Mystic 42.195 |

<details><summary>설명문</summary>

- **500km 주자** — 세 자리 숫자가 몸에 새겨졌습니다.
- **2000km 클럽** — 지도 위의 선이 국경을 넘을 길이가 됐습니다.
- **5000km 클럽** — 이제 거리는 숫자가 아니라 시간의 단위입니다.
- **백 번의 러닝** — 백 번을 나섰다는 사실만으로 충분합니다.
- **마라톤 완주** — 42.195라는 숫자를 몸으로 통과했습니다.

</details>

#### 휴식

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:X1` | **비워둔 하루** <sup>회차</sup> | 5일 연속 후 하루 휴식 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `running:X2` | **다음 날의 여백** <sup>회차·pending</sup> | 한 번에 25km 이상 다음 날 휴식 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 |
| `running:X3` | **돌아온 러너** <sup>회차</sup> | 14일 이상 쉬고 복귀 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |

<details><summary>설명문</summary>

- **비워둔 하루** — 쉬는 것도 계획에 있었습니다.
- **다음 날의 여백** — 길게 달린 뒤에 무엇을 하지 않을지 아는 사람입니다.
- **돌아온 러너** — 돌아왔다는 사실이 떠났던 사실을 덮습니다.

</details>

#### 달력

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:W1` | **한여름의 러너** <sup>필터</sup> | 7~8월 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `running:W2` | **한겨울의 러너** <sup>필터</sup> | 12~2월 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `running:W3` | **사계절의 주자** | 네 계절 각 10회 / 1회 | 등급형 | `season_count_all` Epic 10 · Mystic 20 |

<details><summary>설명문</summary>

- **한여름의 러너** — 가장 더운 두 달에도 발을 멈추지 않았습니다.
- **한겨울의 러너** — 숨이 하얗게 보이는 날에도 나섰습니다.
- **사계절의 주자** — 일 년을 네 조각으로 나눠 모두 달렸습니다.

</details>

#### 보너스

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:H1` | **심박의 주인** <sup>회차·pending</sup> | 한 번에 30분 이상, 평균 심박 160bpm 이상 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 · Mystic 100 |
| `running:H2` | **180의 리듬** <sup>회차·pending</sup> | 평균 케이던스 180spm 이상 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 · Mystic 100 |

<details><summary>설명문</summary>

- **심박의 주인** — 심장이 어디까지 견디는지 아는 사람입니다.
- **180의 리듬** — 발이 땅에 닿는 간격까지 관리하는 단계입니다.

</details>

#### 미션

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `running:Q1` | **쌓인 거리의 증명** | 미션 '2주 안에 80km' 완료 | undefined | Epic |
| `running:Q2` | **페이스의 증명** | 미션 '4주 안에 한 번에 10km 이상, 5:30/km보다 빠르게 / 3회' 완료 | undefined | Epic |
| `running:Q3` | **먼 하루의 증명** | 미션 '4주 안에 한 번에 25km 이상 / 2회' 완료 | undefined | Epic |
| `running:Q4` | **반복의 증명** | 미션 '3주(월~일) 연속 한 주에 4회' 완료 | undefined | Epic |
| `running:Q5` | **시간표의 증명** | 미션 '2주 안에 새벽·밤 각 2회, 서로 다른 5개 요일' 완료 | undefined | Epic |
| `running:Q6` | **연이은 날의 증명** | 미션 '7일 연속' 완료 | undefined | Epic |
| `running:Q7` | **쉼표의 증명** | 미션 '4주(월~일) 연속 한 주에 4회, 매주 2일 이상 휴식' 완료 | undefined | Epic |
| `running:Q8` | **사계의 증명** | 미션 '서로 다른 두 달에 각각 120km' 완료 | undefined | Epic |

<details><summary>설명문</summary>

- **쌓인 거리의 증명** — 미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.
- **페이스의 증명** — 미션으로만 얻는 열쇠입니다. 페이스 계열의 마지막 문을 엽니다.
- **먼 하루의 증명** — 미션으로만 얻는 열쇠입니다. 롱런 계열의 마지막 문을 엽니다.
- **반복의 증명** — 미션으로만 얻는 열쇠입니다. 주기 계열의 마지막 문을 엽니다.
- **시간표의 증명** — 미션으로만 얻는 열쇠입니다. 시간대·요일 계열의 마지막 문을 엽니다.
- **연이은 날의 증명** — 미션으로만 얻는 열쇠입니다. 연속 계열의 마지막 문을 엽니다.
- **쉼표의 증명** — 미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.
- **사계의 증명** — 미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.

</details>

### 자전거 (`cycling`) — 39계열 · 126종

#### 누적

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:K1` | **굴러온 거리** | 누적 거리 80km | 레벨형 | `distance_km` Lv.1 80 … Lv.8 14000 (8) |
| `cycling:K2` | **바퀴로 오른 고도** | 누적 상승고도 1,000m | 레벨형 | `elevation_gain_m` Lv.1 1000 … Lv.6 70000 (6) |
| `cycling:K3` | **안장에 오른 횟수** | 총 8회 | 레벨형 | `total_count` Lv.1 8 … Lv.6 280 (6) |

<details><summary>설명문</summary>

- **굴러온 거리** — 바퀴가 지나온 길이는 다른 종목과 자릿수가 다릅니다.
- **바퀴로 오른 고도** — 평지만 달렸다면 이 숫자는 오르지 않습니다.
- **안장에 오른 횟수** — 얼마나 멀리 갔는지보다 몇 번 나섰는지가 정직합니다.

</details>

#### 강도

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:P1` | **속도의 주인** <sup>pending</sup> | 한 번에 30km 이상, 평균 속도 22km/h 이상 | 등급형 | `min_speed_kmh` Common 22 · Rare 25 · Epic 28 · Mystic 32 |

<details><summary>설명문</summary>

- **속도의 주인** — 평균 속도는 다리보다 페이스 감각이 만듭니다.

</details>

#### 최고 도달

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:V1` | **다운힐** <sup>pending</sup> | 한 번에 최고 속도 45km/h 이상 | 등급형 | `max_speed_kmh` Common 45 · Rare 55 · Epic 65 · Mystic 75 |

<details><summary>설명문</summary>

- **다운힐** — 내리막에서 브레이크를 놓아본 적이 있습니다.

</details>

#### 단일 최대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:L1` | **안장 위의 하루** <sup>pending</sup> | 한 번에 80km | 등급형 | `single_distance_km` Common 80 · Rare 120 · Epic 160 · Mystic 200 |

<details><summary>설명문</summary>

- **안장 위의 하루** — 해가 뜰 때 나가 질 무렵 돌아오는 거리가 있습니다.

</details>

#### 고도

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:E1` | **언덕의 사람** <sup>pending</sup> | 한 번에 상승고도 500m 이상 | 등급형 | `single_elevation_m` Common 500 · Rare 1000 · Epic 1600 · Mystic 2500 |

<details><summary>설명문</summary>

- **언덕의 사람** — 오르막을 피하지 않는 사람이 따로 있습니다.

</details>

#### 주기

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:C1` | **오늘의 바퀴** | 하루 1회 / 1회 | 등급형 | `active_days_count` Common 1 · Rare 25 · Epic 80 · Mystic 250 |
| `cycling:C2` | **이번 주의 바퀴** <sup>회차</sup> | 한 주(월~일)에 3회 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 8 · Epic 26 · Mystic 52 |
| `cycling:C3` | **이달의 라이더** | 한 달에 400km | 등급형 | `monthly_km` Common 400 · Rare 867 · Epic 1400 · Mystic 2200 |
| `cycling:C4` | **계절의 라이더** <sup>필터</sup> | 한 계절에 1,300km | 등급형 | `distance_km` Common 1300 · Rare 2600 · Epic 4200 · Mystic 6500 |

<details><summary>설명문</summary>

- **오늘의 바퀴** — 하루에 한 번, 그것으로 충분합니다.
- **이번 주의 바퀴** — 세 번을 채운 주에는 다리가 먼저 알아차립니다.
- **이달의 라이더** — 한 달의 총량은 하루의 컨디션을 이깁니다.
- **계절의 라이더** — 계절 하나를 바퀴로 통과했습니다.

</details>

#### 요일

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:D1` | **주말 라이더** <sup>필터·근사</sup> | 주말 / 1회 | 등급형 | `total_count` Common 1 · Rare 10 · Epic 35 · Mystic 100 |
| `cycling:D2` | **평일의 반란** <sup>필터·근사·pending</sup> | 평일에 한 번에 100km 이상 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |

<details><summary>설명문</summary>

- **주말 라이더** — 주말의 도로는 이 사람들의 것입니다.
- **평일의 반란** — 평일에 100km를 타려면 무언가를 포기해야 합니다.

</details>

#### 연속

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:N1` | **사흘의 바퀴** <sup>회차</sup> | 3일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `cycling:N2` | **일곱 바퀴의 궤도** <sup>회차</sup> | 7일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |
| `cycling:N3` | **삼 주의 바퀴** <sup>회차</sup> | 21일 연속 / 1회 | 반복형 | `repeat_count` Epic 1 · Mystic 2 |

<details><summary>설명문</summary>

- **사흘의 바퀴** — 사흘 연속은 다리보다 일정이 먼저 무너집니다.
- **일곱 바퀴의 궤도** — 일곱 밤을 하루도 건너뛰지 않았습니다.
- **삼 주의 바퀴** — 삼 주를 끊지 않는 것은 훈련이 아니라 생활입니다.

</details>

#### 간격

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:G1` | **격주의 약속** <sup>회차</sup> | 2주 안에 다시 활동 / 3회 | 반복형 | `repeat_count` Common 3 · Rare 8 · Epic 20 · Mystic 52 |

<details><summary>설명문</summary>

- **격주의 약속** — 끊기지 않는 것이 멀리 가는 것보다 어렵습니다.

</details>

#### 기록

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:R1` | **바퀴의 한계** <sup>pending</sup> | 가장 긴 거리 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `cycling:R2` | **지난달의 라이더** <sup>pending</sup> | 한 달에 지난달 거리의 120% 이상 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |

<details><summary>설명문</summary>

- **바퀴의 한계** — 어제의 자신을 이기는 일만 남았습니다.
- **지난달의 라이더** — 한 달 전의 자신에게 20%를 더 얹었습니다.

</details>

#### 이정표

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:M1` | **센추리 라이드** <sup>pending</sup> | 한 번에 100km | 등급형 | `single_distance_km` Rare 100 |
| `cycling:M2` | **그란폰도** <sup>pending</sup> | 한 번에 160km | 등급형 | `single_distance_km` Epic 160 |
| `cycling:M3` | **브레베** <sup>pending</sup> | 한 번에 200km | 등급형 | `single_distance_km` Mystic 200 |
| `cycling:M4` | **10000km 클럽** | 누적 거리 10,000km | 등급형 | `distance_km` Epic 10000 |
| `cycling:M5` | **바퀴로 쌓은 열 채** | 누적 상승고도 88,480m | 등급형 | `elevation_gain_m` Mystic 88480 |

<details><summary>설명문</summary>

- **센추리 라이드** — 하루에 100km — 라이더들이 첫 목표로 삼는 숫자입니다.
- **그란폰도** — 160km는 대회의 거리이자 하루의 한계입니다.
- **브레베** — 200km를 하루에 끝내는 사람은 많지 않습니다.
- **10000km 클럽** — 다섯 자리 숫자를 바퀴로 만들었습니다.
- **바퀴로 쌓은 열 채** — 누적 고도가 세계 최고봉의 열 배가 됐습니다.

</details>

#### 휴식

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:X1` | **안장의 휴일** <sup>회차·pending</sup> | 한 번에 150km 이상 다음 날 휴식 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 |
| `cycling:X2` | **돌아온 라이더** <sup>회차</sup> | 30일 이상 쉬고 복귀 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |

<details><summary>설명문</summary>

- **안장의 휴일** — 길게 탄 다음 날을 비워두는 법을 압니다.
- **돌아온 라이더** — 돌아왔다는 사실이 떠났던 사실을 덮습니다.

</details>

#### 달력

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:W1` | **한여름의 라이더** <sup>필터</sup> | 7~8월 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `cycling:W2` | **한겨울의 라이더** <sup>필터</sup> | 12~2월 / 1회 | 등급형 | `total_count` Common 1 · Rare 3 · Epic 12 · Mystic 30 |
| `cycling:W3` | **사계절의 라이더** | 네 계절 각 5회 / 1회 | 등급형 | `season_count_all` Epic 5 · Mystic 10 |

<details><summary>설명문</summary>

- **한여름의 라이더** — 아스팔트가 달아오른 날에도 나섰습니다.
- **한겨울의 라이더** — 손끝이 얼어붙는 계절에 타는 사람은 드뭅니다.
- **사계절의 라이더** — 일 년을 네 조각으로 나눠 모두 탔습니다.

</details>

#### 보너스

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:H1` | **와트의 주인** <sup>회차·pending</sup> | 한 번에 1시간 이상, 평균 파워 200W 이상 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 · Mystic 100 |
| `cycling:H2` | **안장 위의 심장** <sup>회차·pending</sup> | 한 번에 1시간 이상, 평균 심박 150bpm 이상 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 10 · Epic 30 · Mystic 100 |

<details><summary>설명문</summary>

- **와트의 주인** — 출력을 숫자로 관리하는 단계에 들어섰습니다.
- **안장 위의 심장** — 다리보다 먼저 한계를 말하는 기관이 있습니다.

</details>

#### 미션

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `cycling:Q1` | **바퀴 자국의 증명** | 미션 '2주 안에 330km' 완료 | undefined | Epic |
| `cycling:Q2` | **속도의 증명** | 미션 '4주 안에 한 번에 30km 이상, 평균 속도 25km/h 이상 / 3회' 완료 | undefined | Epic |
| `cycling:Q3` | **지평선의 증명** | 미션 '4주 안에 한 번에 130km 이상 / 2회' 완료 | undefined | Epic |
| `cycling:Q4` | **언덕의 증명** | 미션 '4주 안에 한 번에 상승고도 1,200m 이상 / 2회' 완료 | undefined | Epic |
| `cycling:Q5` | **주말의 증명** | 미션 '3주(월~일) 연속 한 주에 3회, 매주 주말 1회 이상' 완료 | undefined | Epic |
| `cycling:Q6` | **이어진 바퀴의 증명** | 미션 '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상' 완료 | undefined | Epic |
| `cycling:Q7` | **빈 안장의 증명** | 미션 '8주 안에 한 번에 100km 이상, 다음 날 휴식 / 3회' 완료 | undefined | Epic |
| `cycling:Q8` | **추위와 더위의 증명** | 미션 '서로 다른 두 달에 각각 500km' 완료 | undefined | Epic |

<details><summary>설명문</summary>

- **바퀴 자국의 증명** — 미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.
- **속도의 증명** — 미션으로만 얻는 열쇠입니다. 속도·최고속도 계열의 마지막 문을 엽니다.
- **지평선의 증명** — 미션으로만 얻는 열쇠입니다. 롱라이드 계열의 마지막 문을 엽니다.
- **언덕의 증명** — 미션으로만 얻는 열쇠입니다. 고도 계열의 마지막 문을 엽니다.
- **주말의 증명** — 미션으로만 얻는 열쇠입니다. 주기·주말 계열의 마지막 문을 엽니다.
- **이어진 바퀴의 증명** — 미션으로만 얻는 열쇠입니다. 연속·간격 계열의 마지막 문을 엽니다.
- **빈 안장의 증명** — 미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.
- **추위와 더위의 증명** — 미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.

</details>

### 등산 (`hiking`) — 32계열 · 97종

#### 누적

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:K1` | **올라온 고도** | 누적 상승고도 1,500m | 레벨형 | `elevation_gain_m` Lv.1 1500 … Lv.6 85000 (6) |
| `hiking:K3` | **오른 횟수** | 총 5회 | 레벨형 | `total_count` Lv.1 5 … Lv.6 260 (6) |

<details><summary>설명문</summary>

- **올라온 고도** — 산에서는 거리가 아니라 높이가 기록입니다.
- **오른 횟수** — 몇 번 올랐는지가 얼마나 높았는지보다 정직합니다.

</details>

#### 강도

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:P1` | **고도의 사람** <sup>pending</sup> | 한 번에 상승고도 500m 이상 | 등급형 | `single_elevation_m` Common 500 · Rare 750 · Epic 1200 · Mystic 1800 |

<details><summary>설명문</summary>

- **고도의 사람** — 한 번에 오른 높이가 그 사람의 기준입니다.

</details>

#### 최고 도달

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:A1` | **높은 곳** <sup>pending</sup> | 한 번에 최고 도달 고도 700m 이상 | 등급형 | `max_elevation_m` Common 700 · Rare 1200 · Epic 1600 · Mystic 1900 |

<details><summary>설명문</summary>

- **높은 곳** — 얼마나 올랐는가가 아니라 어디까지 닿았는가입니다.

</details>

#### 단일 최대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:L1` | **산에서의 하루** | 한 번에 3시간 | 등급형 | `duration_minutes` Common 180 · Rare 300 · Epic 480 · Mystic 720 |
| `hiking:L2` | **종주** <sup>pending</sup> | 한 번에 12km | 등급형 | `single_distance_km` Common 12 · Rare 18 · Epic 25 · Mystic 35 |

<details><summary>설명문</summary>

- **산에서의 하루** — 해가 뜨고 지는 동안 산에 있었습니다.
- **종주** — 능선을 따라 끝에서 끝까지 걸었습니다.

</details>

#### 주기

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:C1` | **산에 간 날** | 하루 1회 / 1회 | 등급형 | `active_days_count` Common 1 · Rare 12 · Epic 40 · Mystic 120 |
| `hiking:C3` | **계절의 등반자** <sup>필터</sup> | 한 계절에 상승고도 4,000m | 등급형 | `elevation_gain_m` Common 4000 · Rare 9000 · Epic 15000 · Mystic 24000 |

<details><summary>설명문</summary>

- **산에 간 날** — 하루에 한 번, 그것으로 충분합니다.
- **계절의 등반자** — 계절 하나를 고도로 통과했습니다.

</details>

#### 요일

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:D1` | **주말 산행** <sup>필터·근사</sup> | 주말 / 1회 | 등급형 | `total_count` Common 1 · Rare 12 · Epic 40 · Mystic 100 |

<details><summary>설명문</summary>

- **주말 산행** — 주말마다 도시를 벗어나는 사람이 있습니다.

</details>

#### 연속

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:N1` | **이틀 연속의 산** <sup>회차</sup> | 2일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `hiking:N2` | **사흘의 능선** <sup>회차</sup> | 3일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |
| `hiking:N3` | **일주일의 산** <sup>회차</sup> | 7일 연속 / 1회 | 반복형 | `repeat_count` Epic 1 · Mystic 2 |

<details><summary>설명문</summary>

- **이틀 연속의 산** — 하루 만에 회복하고 다시 올랐습니다.
- **사흘의 능선** — 사흘째 다리는 거짓말을 하지 않습니다.
- **일주일의 산** — 일곱 밤을 산으로 채웠습니다.

</details>

#### 간격

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:G1` | **산을 잊지 않는** <sup>회차</sup> | 2주 안에 다시 활동 / 3회 | 반복형 | `repeat_count` Common 3 · Rare 8 · Epic 20 · Mystic 52 |

<details><summary>설명문</summary>

- **산을 잊지 않는** — 끊기지 않는 것이 높이 오르는 것보다 어렵습니다.

</details>

#### 기록

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:R1` | **더 높이** <sup>pending</sup> | 가장 높은 도달 고도 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `hiking:R2` | **능선 위의 시간** <sup>근사·pending</sup> | 가장 긴 이동시간 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |

<details><summary>설명문</summary>

- **더 높이** — 닿아본 적 없는 높이에 처음 섰습니다.
- **능선 위의 시간** — 산에서 버틴 시간을 스스로 늘렸습니다.

</details>

#### 이정표

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:M1` | **에베레스트 한 채** | 누적 상승고도 8,848m | 등급형 | `elevation_gain_m` Rare 8848 |
| `hiking:M2` | **에베레스트 다섯 채** | 누적 상승고도 44,240m | 등급형 | `elevation_gain_m` Epic 44240 |
| `hiking:M3` | **에베레스트 열 채** | 누적 상승고도 88,480m | 등급형 | `elevation_gain_m` Mystic 88480 |
| `hiking:M4` | **백 번의 산** | 총 100회 | 등급형 | `total_count` Epic 100 |

<details><summary>설명문</summary>

- **에베레스트 한 채** — 누적 고도가 세계 최고봉과 같아졌습니다.
- **에베레스트 다섯 채** — 다섯 번 쌓아 올릴 높이를 걸어서 만들었습니다.
- **에베레스트 열 채** — 이제 높이는 목표가 아니라 이력입니다.
- **백 번의 산** — 백 번을 올랐다는 사실만으로 충분합니다.

</details>

#### 휴식

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:X1` | **하산 다음 날** <sup>회차·근사</sup> | 한 번에 8시간 이상 다음 날 휴식 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 |
| `hiking:X2` | **돌아온 등반자** <sup>회차</sup> | 60일 이상 쉬고 복귀 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 8 |

<details><summary>설명문</summary>

- **하산 다음 날** — 오래 걸은 몸이 무엇을 요구하는지 압니다.
- **돌아온 등반자** — 돌아왔다는 사실이 떠났던 사실을 덮습니다.

</details>

#### 달력

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:W1` | **한여름의 등반자** <sup>필터</sup> | 7~8월 / 1회 | 등급형 | `total_count` Common 1 · Rare 4 · Epic 12 · Mystic 30 |
| `hiking:W2` | **한겨울의 등반자** <sup>필터</sup> | 12~2월 / 1회 | 등급형 | `total_count` Common 1 · Rare 4 · Epic 12 · Mystic 30 |
| `hiking:W3` | **사계절의 등반자** | 네 계절 각 3회 / 1회 | 등급형 | `season_count_all` Epic 3 · Mystic 6 |

<details><summary>설명문</summary>

- **한여름의 등반자** — 가장 더운 두 달에도 능선에 섰습니다.
- **한겨울의 등반자** — 겨울 산은 장비와 판단을 함께 요구합니다.
- **사계절의 등반자** — 같은 산의 네 얼굴을 모두 봤습니다.

</details>

#### 미션

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `hiking:Q1` | **쌓인 고도의 증명** | 미션 '2개월 안에 상승고도 5,000m' 완료 | undefined | Epic |
| `hiking:Q2` | **높이의 증명** | 미션 '한 번에 상승고도 1,000m 이상, 최고 도달 고도 1,200m 이상 / 1회' 완료 | undefined | Epic |
| `hiking:Q3` | **긴 산행의 증명** | 미션 '3개월 안에 한 번에 6시간 이상 / 2회' 완료 | undefined | Epic |
| `hiking:Q4` | **발길의 증명** | 미션 '3개월 연속 한 달에 4회, 매달 주말 2회 이상' 완료 | undefined | Epic |
| `hiking:Q5` | **이어진 능선의 증명** | 미션 '3일 연속' 완료 | undefined | Epic |
| `hiking:Q6` | **돌아오는 산의 증명** | 미션 '6개월 연속 한 달에 2회 이상' 완료 | undefined | Epic |
| `hiking:Q7` | **하산 뒤의 증명** | 미션 '3개월 안에 한 번에 5시간 이상, 다음 날 휴식 / 2회' 완료 | undefined | Epic |
| `hiking:Q8` | **눈과 볕의 증명** | 미션 '서로 다른 두 달에 각각 상승고도 1,800m' 완료 | undefined | Epic |

<details><summary>설명문</summary>

- **쌓인 고도의 증명** — 미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.
- **높이의 증명** — 미션으로만 얻는 열쇠입니다. 단일고도·최고도달 계열의 마지막 문을 엽니다.
- **긴 산행의 증명** — 미션으로만 얻는 열쇠입니다. 긴 산행 계열의 마지막 문을 엽니다.
- **발길의 증명** — 미션으로만 얻는 열쇠입니다. 주기·주말 계열의 마지막 문을 엽니다.
- **이어진 능선의 증명** — 미션으로만 얻는 열쇠입니다. 연속 계열의 마지막 문을 엽니다.
- **돌아오는 산의 증명** — 미션으로만 얻는 열쇠입니다. 간격 계열의 마지막 문을 엽니다.
- **하산 뒤의 증명** — 미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.
- **눈과 볕의 증명** — 미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.

</details>

### 트레일러닝 (`trail_running`) — 36계열 · 122종

#### 누적

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:K1` | **산길을 달려온 거리** | 누적 거리 20km | 레벨형 | `distance_km` Lv.1 20 … Lv.8 3200 (8) |
| `trail_running:K2` | **달려서 오른 고도** | 누적 상승고도 700m | 레벨형 | `elevation_gain_m` Lv.1 700 … Lv.7 70000 (7) |
| `trail_running:K3` | **산을 달린 횟수** | 총 8회 | 레벨형 | `total_count` Lv.1 8 … Lv.6 280 (6) |

<details><summary>설명문</summary>

- **산길을 달려온 거리** — 포장되지 않은 길만 골라 쌓은 거리입니다.
- **달려서 오른 고도** — 같은 높이라도 걸어서 넘는 것과 무게가 다릅니다.
- **산을 달린 횟수** — 몇 번 산길에 들어섰는지가 기록의 시작입니다.

</details>

#### 강도

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:P1` | **산을 달리는 자** <sup>pending</sup> | 한 번에 15km 이상, 상승고도 400m 이상 | 등급형 | `single_distance_km` Common 15 · Rare 25 · Epic 35 · Mystic 50 |

<details><summary>설명문</summary>

- **산을 달리는 자** — 거리만으로도 고도만으로도 설명되지 않는 종목입니다.

</details>

#### 단일 최대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:L1` | **능선의 하루** <sup>pending</sup> | 한 번에 25km | 등급형 | `single_distance_km` Common 25 · Rare 42 · Epic 60 · Mystic 100 |
| `trail_running:L2` | **산에서의 시간** | 한 번에 4시간 | 등급형 | `duration_minutes` Common 240 · Rare 420 · Epic 720 · Mystic 1080 |

<details><summary>설명문</summary>

- **능선의 하루** — 산에서 하루를 통째로 쓴 사람입니다.
- **산에서의 시간** — 해가 움직이는 동안 계속 달렸습니다.

</details>

#### 고도

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:E1` | **버티컬** <sup>pending</sup> | 한 번에 상승고도 800m 이상 | 등급형 | `single_elevation_m` Common 800 · Rare 1500 · Epic 2500 · Mystic 3500 |

<details><summary>설명문</summary>

- **버티컬** — 1,000m를 한 번에 오르면 버티컬 킬로미터라 부릅니다.

</details>

#### 최고 도달

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:A1` | **높은 곳을 달리다** <sup>pending</sup> | 한 번에 최고 도달 고도 700m 이상 | 등급형 | `max_elevation_m` Common 700 · Rare 1200 · Epic 1600 · Mystic 1900 |

<details><summary>설명문</summary>

- **높은 곳을 달리다** — 능선 위에서 속도를 낸 적이 있습니다.

</details>

#### 주기

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:C1` | **산을 달린 날** | 하루 1회 / 1회 | 등급형 | `active_days_count` Common 1 · Rare 25 · Epic 80 · Mystic 250 |
| `trail_running:C2` | **이달의 트레일** | 한 달에 120km | 등급형 | `monthly_km` Common 120 · Rare 217 · Epic 350 · Mystic 550 |
| `trail_running:C3` | **계절의 트레일러** <sup>필터</sup> | 한 계절에 상승고도 4,000m | 등급형 | `elevation_gain_m` Common 4000 · Rare 13000 · Epic 22000 · Mystic 35000 |

<details><summary>설명문</summary>

- **산을 달린 날** — 하루에 한 번, 그것으로 충분합니다.
- **이달의 트레일** — 한 달의 총량이 산에서의 체력을 만듭니다.
- **계절의 트레일러** — 계절 하나를 고도로 통과했습니다.

</details>

#### 시간대

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:T1` | **새벽의 산** <sup>필터</sup> | 새벽 5시~아침 8시 / 1회 | 등급형 | `total_count` Common 1 · Rare 15 · Epic 50 · Mystic 120 |
| `trail_running:T2` | **밤의 산** <sup>필터</sup> | 저녁 8시~새벽 5시 / 1회 | 등급형 | `total_count` Common 1 · Rare 5 · Epic 20 |

<details><summary>설명문</summary>

- **새벽의 산** — 해뜨기 전 산길은 다른 세계입니다.
- **밤의 산** — 헤드램프 하나로 산길을 달려본 사람입니다.

</details>

#### 연속

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:N1` | **사흘의 산길** <sup>회차</sup> | 3일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 · Mystic 50 |
| `trail_running:N2` | **일주일의 산길** <sup>회차</sup> | 7일 연속 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |

<details><summary>설명문</summary>

- **사흘의 산길** — 하강 충격은 사흘째에 몰려옵니다.
- **일주일의 산길** — 일곱 밤을 산길로 채웠습니다.

</details>

#### 간격

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:G1` | **산길을 잊지 않는** <sup>회차</sup> | 2주 안에 다시 활동 / 3회 | 반복형 | `repeat_count` Common 3 · Rare 8 · Epic 20 · Mystic 52 |

<details><summary>설명문</summary>

- **산길을 잊지 않는** — 끊기지 않는 것이 멀리 가는 것보다 어렵습니다.

</details>

#### 기록

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:R1` | **더 멀리** <sup>pending</sup> | 가장 긴 거리 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `trail_running:R2` | **산길의 정점** <sup>근사·pending</sup> | 가장 높은 도달 고도 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |
| `trail_running:R3` | **산길 위의 시간** <sup>근사·pending</sup> | 가장 긴 이동시간 갱신 | 자동 상승형 | `personal_record_break` Lv.1 1 … Lv.8 8 (8) |

<details><summary>설명문</summary>

- **더 멀리** — 산에서의 거리는 도로의 거리와 무게가 다릅니다.
- **산길의 정점** — 닿아본 적 없는 높이를 달려서 올랐습니다.
- **산길 위의 시간** — 산에서 버틴 시간을 스스로 늘렸습니다.

</details>

#### 이정표

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:M1` | **트레일 마라톤** <sup>pending</sup> | 한 번에 42.195km | 등급형 | `single_distance_km` Rare 42.195 |
| `trail_running:M2` | **울트라** <sup>pending</sup> | 한 번에 50km | 등급형 | `single_distance_km` Epic 50 |
| `trail_running:M3` | **백 킬로미터** <sup>pending</sup> | 한 번에 100km | 등급형 | `single_distance_km` Mystic 100 |
| `trail_running:M4` | **달려서 쌓은 한 채** | 누적 상승고도 8,848m | 등급형 | `elevation_gain_m` Rare 8848 |

<details><summary>설명문</summary>

- **트레일 마라톤** — 포장도로의 42km와는 다른 42km입니다.
- **울트라** — 50km부터를 울트라라 부릅니다.
- **백 킬로미터** — 하루와 밤을 이어 붙여야 닿는 거리입니다.
- **달려서 쌓은 한 채** — 산길에서 모은 높이가 세계 최고봉과 같아졌습니다.

</details>

#### 휴식

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:X1` | **내리막의 대가** <sup>회차·pending</sup> | 한 번에 35km 이상 다음 날 휴식 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 5 · Epic 20 |
| `trail_running:X2` | **돌아온 트레일러** <sup>회차</sup> | 30일 이상 쉬고 복귀 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 3 · Epic 10 |

<details><summary>설명문</summary>

- **내리막의 대가** — 올라간 만큼 내려온 다리에는 시간이 필요합니다.
- **돌아온 트레일러** — 돌아왔다는 사실이 떠났던 사실을 덮습니다.

</details>

#### 달력

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:W1` | **한겨울의 트레일러** <sup>필터</sup> | 12~2월 / 1회 | 등급형 | `total_count` Common 1 · Rare 3 · Epic 12 |
| `trail_running:W2` | **사계절의 트레일러** | 네 계절 각 3회 / 1회 | 등급형 | `season_count_all` Epic 3 · Mystic 6 |

<details><summary>설명문</summary>

- **한겨울의 트레일러** — 얼어붙은 산길을 달리는 사람은 드뭅니다.
- **사계절의 트레일러** — 같은 산길의 네 얼굴을 모두 달렸습니다.

</details>

#### 보너스

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:H1` | **오르막의 심장** <sup>회차·pending</sup> | 한 번에 1시간 이상, 평균 심박 155bpm 이상 / 1회 | 반복형 | `repeat_count` Common 1 · Rare 8 · Epic 25 · Mystic 70 |

<details><summary>설명문</summary>

- **오르막의 심장** — 숨이 가빠지는 구간에서도 페이스를 놓지 않습니다.

</details>

#### 미션

| 계열 키 | 이름 | 조건문 | 종류 | 사다리 (변하는 값) |
|---|---|---|---|---|
| `trail_running:Q1` | **오르내린 거리의 증명** | 미션 '2주 안에 80km, 상승고도 1,600m' 완료 | undefined | Epic |
| `trail_running:Q2` | **오르막의 증명** | 미션 '8주 안에 한 번에 25km 이상, 상승고도 800m 이상 / 2회' 완료 | undefined | Epic |
| `trail_running:Q3` | **울트라의 증명** | 미션 '한 번에 42km 이상 / 1회' 완료 | undefined | Epic |
| `trail_running:Q4` | **수직의 증명** | 미션 '한 번에 상승고도 1,500m 이상, 최고 도달 고도 1,200m 이상 / 1회' 완료 | undefined | Epic |
| `trail_running:Q5` | **해뜨기 전의 증명** | 미션 '3주(월~일) 연속 한 주에 3회, 매주 새벽 5시~아침 8시 1회 이상' 완료 | undefined | Epic |
| `trail_running:Q6` | **이어 달린 산길의 증명** | 미션 '4주(월~일) 안에 3일 연속 1회, 매주 1회 이상' 완료 | undefined | Epic |
| `trail_running:Q7` | **내리막 뒤의 증명** | 미션 '8주 안에 한 번에 25km 이상, 다음 날 휴식 / 2회' 완료 | undefined | Epic |
| `trail_running:Q8` | **사철 산길의 증명** | 미션 '서로 다른 두 달에 각각 120km' 완료 | undefined | Epic |

<details><summary>설명문</summary>

- **오르내린 거리의 증명** — 미션으로만 얻는 열쇠입니다. 누적·이정표 계열의 마지막 문을 엽니다.
- **오르막의 증명** — 미션으로만 얻는 열쇠입니다. 거리×고도 계열의 마지막 문을 엽니다.
- **울트라의 증명** — 미션으로만 얻는 열쇠입니다. 울트라 계열의 마지막 문을 엽니다.
- **수직의 증명** — 미션으로만 얻는 열쇠입니다. 버티컬·최고도달 계열의 마지막 문을 엽니다.
- **해뜨기 전의 증명** — 미션으로만 얻는 열쇠입니다. 주기·시간대 계열의 마지막 문을 엽니다.
- **이어 달린 산길의 증명** — 미션으로만 얻는 열쇠입니다. 연속·간격 계열의 마지막 문을 엽니다.
- **내리막 뒤의 증명** — 미션으로만 얻는 열쇠입니다. 휴식 계열의 마지막 문을 엽니다.
- **사철 산길의 증명** — 미션으로만 얻는 열쇠입니다. 달력 계열의 마지막 문을 엽니다.

</details>

---

## 표기 뜻

| 표기 | 뜻 |
|---|---|
| `필터` | 필터 키(`time_range`·`month`·`day_of_week`·`season`)를 측정 축과 함께 쓴다. **진행률이 실제보다 후하게 나온다** — 진행 계산이 그 필터를 보지 않기 때문이다 |
| `회차` | `repeat_count`를 쓰지만 회차 술어가 그 조합을 세지 못한다. **지금은 발급되지 않는다**(fail-closed) |
| `근사` | 설계 조건문을 엔진이 표현할 수 있는 형태로 옮기며 의미가 약간 달라졌다. 사유는 `v5_condition_mapping.json` |
| `pending` | 조건 필드가 아직 `evaluation: pending`이다. **지금은 발급되지 않는다**(fail-closed) |

---

## 시딩하지 않은 것

| 코드 | 계열 | 종 | 사유 |
|---|---|---:|---|
| `R-S1` | 후반의 사람 | 0 | negative_split — splits 수집이 v5 1차에서 빠졌다 (티켓 20260905_0029 확정) |
| `K2` |  | 7 | 누적 이동시간을 담는 조건 키가 레지스트리에 없다 (duration_minutes는 «단일 활동») |
| `R-K2` |  | 6 | 누적 이동시간 키 없음 (걷기 K2와 같은 사유) |
| `H-K2` |  | 6 | 누적 이동시간 키 없음 — A묶음의 위상 조정(170→180시간)도 함께 소멸한다 |
| `C-G2` |  | 4 | «한 달 활동 횟수» 키 없음 — monthly_km는 거리이고 weekly_count는 주 단위다 |
| `H-C2` |  | 4 | «한 달 활동 횟수» 키 없음 (C-G2와 같은 사유) |

합계 **5계열 27종 + `R-S1`**. 앞의 5건은 조건 키가 레지스트리에 없어 시딩 자체가 불가능하며,
티켓 `20260906_0110`이 필드를 추가하면 복구한다.

⚠️ **걷기·러닝·등산의 누적 축이 3레인에서 2레인으로 줄어든 상태다.** A묶음이 세 수열의
위상을 엇갈리게 배치한 설계가 절반만 살아 있다 — 필드 추가 후 위상 검사를 다시 돌려야 한다.

---

## 지금 발급되지 않는 것

**630종 중 엔진이 지금 평가할 수 있는 것은 약 269종이고, 그중 40종은 미션 전용이다.**
나머지는 전부 fail-closed라 **잘못 발급되는 경로는 없지만**, 조건은 보이는데 열리지 않는다.

| 막힌 이유 | 종 | 계열 |
|---|---:|---:|
| `회차` | 139 | 42 |
| `pending` | 223 | 49 |

**2단 교차 게이트가 0행이다.** 설계의 `cross`/`cross2` 표시가 걷기 사다리에만 있고 4종목에는
없어 지어내지 않았다. 지금 상태로 발급이 열리면 **모든 Mystic이 무관문으로 나간다.**

전부 티켓 `20260906_0110`「v5 카탈로그가 요구하는 엔진 확장 5건」에서 다룬다.

---

## 산출물 색인

`Service Plan/Specs/Content/` 아래 v5 산출물이 무엇이고 어느 것이 정본인지.

| 파일 | 역할 | 정본? |
|---|---|---|
| `v5_catalog_design.json` | claude.ai 아티팩트 2개의 설계 데이터 추출본 | 원본 (수정 금지) |
| `v5_catalog_verified.json` | A묶음 검증 — 계열/종 수 확정 · 위상 조정 2건 · 겹침 전수 대조 | 검증 결과 |
| `v5_catalog_names.json` | 이름 종목별 분화 매핑 29건 | **정본** |
| `v5_catalog_writing.json` | 168계열의 이름·설명·조건문 | **정본** |
| `v5_mission_axis_groups.json` | 게이트 미션 축 묶음 32개 | 확정본 |
| `v5_mission_badges.json` | 미션 보상 배지 32종 (4종목) | **정본** |
| `v5_condition_mapping.json` | 조건문 → `condition_json` 매핑 194계열 | **정본** |
| `seed_v5_activity_badges.rows.json` | 시딩한 630행 (SQL과 같은 데이터) | 생성물 |
| `v5_catalog_verify.py` · `v5_mission_badges_verify.py` · `v5_seed_build.py` | 재현 가능한 검증·생성 스크립트 | — |
| `v5_badge_name_split.md` | 이름 분화 근거와 설명문 재작성 11건 | 기록 |

시드 SQL은 `jam-web/supabase/migrations/seed_v5_activity_badges.sql`이다.

---

## 조건문 ≠ 화면 표기

**이 문서의 조건문은 DB에 저장되지 않는다.** 화면은 `condition_json` + `badge_metric_labels`
조합으로 조건을 렌더한다. 따라서 「한 주(월~일)에 3회」 같은 표기 규칙의 실질 준수 지점은
시드가 아니라 `badge_metric_labels`의 라벨 문구다(마이그레이션 131이 그 규칙으로 채웠다).

조건문 표기 규칙(요소 순서 ①기간 ②맥락 ③지표 / ④횟수 · 「이상·이하」만 사용 ·
「주」에 `(월~일)` · 페이스는 부등호 없이 「보다 빠르게」)은 `v5_catalog_writing.json`의
`_meta.조건문_표기_규칙`에 있다.

---

## 관련 파일

- 엔진 로직 — `Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md`
- 조건 필드 스펙 — `Specs/BadgeEngine/CONDITION_JSON_SPEC.md`
- 조건 필드 단일 출처 — `jam-web/src/lib/badge-engine/conditionRegistry.ts`
- 설계·시딩 티켓 — `Tickets/20260905_0035_Content_액티비티배지-v5-카탈로그-5종목.md`
- 엔진 확장 — `Tickets/20260906_0110_BadgeEngine_v5-카탈로그가-요구하는-엔진-확장-5건.md`
- 마스터 — `Tickets/20260905_0026_*`

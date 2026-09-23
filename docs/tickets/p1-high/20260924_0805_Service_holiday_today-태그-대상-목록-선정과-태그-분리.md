---
id: "20260924_0805"
category: Service
priority: P1
status: OPEN
created: 2026-09-24
closed:
parent: "20260923_2252"
related:
  - "20260923_2254"
---

# [Service] `holiday_today` 태그가 켜지는 날의 목록을 선정하고 공휴일·기념일·절기 태그를 분리한다

> 사용자가 급하다고 요청한 티켓이다. 정기 배포(목요일) 전에 끝내야 한다.

## 핵심 요약

- 요구사항: 지금 `holiday_today`는 공휴일뿐 아니라 기념일·24절기에도 켜진다. "쉬는 날엔…" 같은 문안을 이 태그에 걸면 쉬지 않는 날(국군의 날 10/1, 한로 10/8 등)에도 나간다. **어떤 날을 홀리데이로 표시할지 목록을 정하고**, 태그를 그 목록에 맞게 분리한다.
- 구현 계획(결정 반영): 사용자가 선택표 [SPECIAL_DAYS.md](../../../jam-doc/planning/content/SPECIAL_DAYS.md)로 대상을 확정했다(2026-09-24). **날짜가 아니라 이름으로** 대상을 고른다. ① `jam-web/src/lib/inputs/special-days-config.ts`(신규): 허용·제외 이름 상수와 순수 함수 `specialDayTags(days)`(`holiday_today`·`seasonal_today`·`anniversary_today`를 돌려준다). ② `holidays.ts`: 잡절 오퍼레이션(`getSundryDayInfo`, 종류 `sundry`)을 조회에 추가. ③ `jam-web/src/lib/today/exposure.ts`: `specialDays.length > 0`이면 `holiday_today`를 켜던 268행 근방을 `specialDayTags`로 교체. ④ `jam-web/src/lib/admin/today-sections.ts`: `TODAY_EXPOSURE_TAG_OPTIONS`(143행)에 새 태그 2종 추가. ⑤ 테스트: `inputs.test.ts` 확장 또는 `special-days-config.test.ts` 신규(이름 매칭, 대체공휴일, 제외 목록, 중복 켜짐, 빈 목록). 코드 5파일·약 180줄이라 크기 기준(5파일 초과 또는 100줄 이상)에 걸려 `planOnlyWaiver`가 필요하다. PRD §5와 선택표 문서는 카리나가 따로 갱신한다.
- 관련 파일: `jam-web/src/lib/inputs/holidays.ts`(오퍼레이션 3종 ENDPOINTS 25~29행, `normalizeSpecialDayItems`), `jam-web/src/lib/today/exposure.ts`(`holiday_today` 태그 268행 근방), `jam-web/src/lib/admin/today-sections.ts`(`TODAY_EXPOSURE_TAG_OPTIONS` 143행), `docs/specs/prd/content-automation/PRD.md` §5, 테스트 `jam-web/src/lib/inputs/__tests__/inputs.test.ts`

## 배경 / 문제 정의

혜린 점검(2026-09-24, 발견 10): `holiday_today`는 공휴일·기념일·24절기에 모두 켜진다. 이번 주 10/3(개천절) 카드는 날짜가 고정이라 무관하지만, 다음 주부터 위험하다. 10/5(월)은 개천절 대체공휴일이고 10/1(국군의 날)·10/8(한로)은 쉬는 날이 아닌데 태그가 켜진다. 사용자 요청: "홀리데이로 표시할 목록 선정 필요, 급한 티켓화".

**마감**: 10/1(목) 정기 배포 전. 다음 주 편성 카드(10/5~)가 이 태그를 쓰기 때문이다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 사용자가 승인한 목록(공휴일·대체공휴일 필수, 기념일·절기 중 포함할 날)에 맞게 `holiday_today`가 켜진다.
- 기념일·절기는 별도 태그로 분리되거나 목록에서 제외돼, 쉬는 날이 아닌 날에 "쉬는 날" 문안이 나가지 않는다.
- 이미 등록된 10/3(개천절) 카드(`holiday_today`)가 그대로 노출된다.
- 어드민 노출 태그 선택지와 PRD §5가 갱신된다.

### 확정된 대상 (사용자 결정, 2026-09-24)
- `holiday_today`: 공휴일 20일(전국동시지방선거·제헌절 제외, 대체공휴일 포함)
- `seasonal_today`(신설): 24절기 8개(입춘·경칩·대서·입추·처서·입동·대설·동지) + 잡절 3개(정월대보름·말복·칠석)
- `anniversary_today`(신설): 기념일 10개(식목일·근로자의 날·어린이 날·어버이 날·부부의 날·환경의 날·섬의 날·푸른 하늘의 날·청년의 날·스포츠의 날)

크기 상한: 4파일/60줄.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

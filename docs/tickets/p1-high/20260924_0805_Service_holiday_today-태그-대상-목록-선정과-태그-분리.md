---
id: "20260924_0805"
category: Service
priority: P1
status: CLOSED
created: 2026-09-24
closed: 2026-09-24
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

크기 상한: 코드 5파일·약 180줄(사용자가 계획을 검토하고 크기 초과 진행을 승인, 실제 코드 6파일 136줄).

---
## 완료 기록

### 구현 내용 요약
특일 이름 목록으로 태그를 나눴다. 공휴일은 `holiday_today`(전국동시지방선거·제헌절 제외, 대체공휴일 포함), 24절기 8개와 잡절 3개(정월대보름·말복·칠석)는 `seasonal_today`(신설), 기념일 10개는 `anniversary_today`(신설)로 켠다. 대상은 **날짜가 아니라 이름**으로 고르고 공백을 없앤 표기로 비교한다("어린이 날"도 매칭). 노동절·어린이날은 `holiday_today`와 `anniversary_today`가 함께 켜진다. 국군의 날·한로처럼 목록 밖인 날은 어떤 태그도 켜지지 않는다. cron 조회에 잡절(`getSundryDayInfo`, 종류 `sundry`)을 추가했다. `exposure.ts`의 "특일이 하나라도 있으면 `holiday_today`" 일괄 켜기는 `specialDayTags` 호출로 교체했다. 어드민 노출 태그 선택지에 새 태그 2종을 추가하고 `holiday_today` 라벨을 "오늘 쉬는 공휴일"로 고쳤다.

### 변경된 파일
```
jam-web/src/lib/inputs/special-days-config.ts (신규 49줄)
jam-web/src/lib/inputs/holidays.ts
jam-web/src/lib/today/exposure.ts
jam-web/src/lib/admin/today-sections.ts
jam-web/src/lib/inputs/__tests__/special-days-config.test.ts (신규 68줄)
jam-web/src/lib/inputs/__tests__/inputs.test.ts
docs/specs/prd/content-automation/PRD.md §5 (카리나)
jam-doc/planning/content/SPECIAL_DAYS.md (카리나, 사용자 선택 확정본)
```

### 테스트 결과
- [x] CI `verify` 성공(run 35934370928, 커밋 dc96c74f)
- [x] 민지 게이트 PASS. 신규 테스트 11건(빈 목록, 공휴일, 대체공휴일, 제외 목록, 절기 허용·비허용, 잡절, 기념일과 국군의 날 제외, 띄어쓰기 흡수, 어린이날 중복 켜짐, 태그 중복 제거, 종류 불일치)
- [x] 10/3 개천절 카드가 `holiday_today`로 그대로 켜지는 것을 테스트로 확인
- [x] 병합 뒤 통합 `verify.sh` 전항목 통과
- [x] 잡절·제외 대상 이름이 특일정보 API 실제 응답(2026 조회)과 일치함을 카리나가 대조

### 배포 정보
- 배포일: 2026-09-24 staging 반영. 프로덕션은 2026-10-01 정기 배포에 포함 예정
- 환경: staging
- 커밋: dc96c74f(브랜치), 병합 커밋 e322df72

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지(2명) | 94,295 | 17,271 / 4,318 | 약 7분 51초 | 47 |
| 합계 |  | 94,295 | 17,271 / 4,318 | 약 7분 51초 | 47 |

### 주요 의사결정 / 핵심 메모
- 사용자가 선택표(SPECIAL_DAYS.md)로 대상을 확정했고(2026-09-24), 잡절은 별도 태그를 정하지 않아 `seasonal_today`에 합쳤다.
- 크기 초과는 사용자가 계획을 검토·승인해 `planOnlyWaiver`로 진행했다. 티켓 본문의 옛 크기 상한 문구는 실제 계획에 맞게 정리했다.
- 제외 이름은 공백 제거 후 포함 여부로 판정해 "제9회 전국동시지방선거" 같은 표기 변형도 걸러낸다. 종류가 일치해야 켜진다(기념일 종류의 "입춘"은 무시).
- 이미 저장된 `special_days` 값은 잡절이 없어도 그대로 읽힌다. 잡절은 다음 cron 실행부터 저장된다.
- 민지가 리뷰 중 메인 작업 폴더를 잠시 detached HEAD로 체크아웃했다가 되돌렸다(영향 없음, 확인함).

### 잔여 이슈
- 잡절 조회만 실패하면 잡절 3개가 조용히 빠진 채 저장된다(기존 부분 실패 처리 방식 그대로).
- 프로덕션 반영 전에는 옛 코드대로 `holiday_today` 하나가 공휴일·기념일·24절기 전체에 켜진다(PRD §5 안내 문단 참고).

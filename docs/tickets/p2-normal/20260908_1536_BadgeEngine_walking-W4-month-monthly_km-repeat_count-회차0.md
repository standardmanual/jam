---
id: 20260908_1536
category: BadgeEngine
priority: P2
status: CLOSED
created: 2026-09-08
closed: 2026-09-08
---

# [BadgeEngine] walking:W4 「장마의 의지」 month+monthly_km+repeat_count 회차 0 버그

## 배경 / 문제 정의

`walking:W4`("장마의 의지", epic·mystic 2종)의 조건
`{month:[6,7], monthly_km:80, repeat_count:N, activity_type:"walking"}`이
`repeatOccurrences.ts`의 세 회차 경로(활동 1건 단위 `CONSUMED_REPEAT_KEYS`, 기간 단위
`detectPeriodOccurrenceDriver`의 `PERIOD_DRIVER_KEYS`=`streak_days`/`weekly_count`/
`monthly_count`/`weekly_streak`, 휴식 단위) 중 어디에도 걸리지 않아
`unconsumedRepeatConditionKeys`가 `month`·`monthly_km`를 미소비 키로 판정해 회차가 영원히
0으로 fail-closed된다. 단발 판정(`repeat_count` 없이 `month`+`monthly_km`만)은 정상
지원되므로 `repeat_count`와 결합할 때만 문제다.

전수 감사(2026-09-08)로 확인 — DB 실측: epic `{month:[6,7], monthly_km:80, repeat_count:1}`,
mystic `{month:[6,7], monthly_km:80, repeat_count:2}`. 이 조합을 쓰는 배지는 walking:W4
2종뿐이다.

## 상세 요구사항

`repeatOccurrences.ts`에 `month`+`monthly_km` 조합을 위한 "기간 단위 회차" 계산을 추가한다.
`Service Plan/Specs/Content/ACTIVITY_BADGES.md`의 walking:W4 조건문("6~7월 중 한 달에
80km")과 등급별 설명("비가 그치기를 기다린 달은 한 번도 없습니다" — mystic)으로
"month 배열 중 해당 조건(monthly_km)을 채운 연-월 각각이 사건 하나"라는 해석을 확인했다
(epic repeat_count 1·mystic repeat_count 2가 정확히 [6,7] 두 달 중 한 달/두 달을 채우는
것과 일치 — 애매하지 않음).

## 구현 계획

- `repeatOccurrences.ts`에 `collectMonthlyKmOccurrences`를 추가한다 — 기존
  `collectPeriodCountOccurrences`(연-월별 그룹핑 → 대표 활동 선정) 패턴을 따르되, 활동
  횟수가 아니라 연-월별 `distanceKm` 합산으로 임계값을 판정한다(단발 판정 `index.ts`
  761~785행과 동일한 그룹핑 규칙 — `month` 배열은 "그중 한 달", `monthly_km`는 개별
  연-월 합산 최댓값 기준).
- `detectPeriodOccurrenceDriver`에 `month`+`monthly_km` 2키 조합을 특례로 추가한다
  (`streak_days`+`distinct_time_bands` 특례 패턴 참고).
- `badgeProgress.ts`의 `classifyConditionKind`는 `isPeriodDrivenRepeatCondition`을 공유
  판정으로 이미 먼저 확인하므로 별도 수정 없이 발급·진행률이 함께 `repeat`로 열린다.
- 회귀 테스트: 회차 정상 카운트, `month` 목록 밖 활동이 그 달 합산에 안 들어가는지,
  기존 단발 판정(반복 없음)이 이번 변경으로 바뀌지 않는지, `classifyBadgeProgressKind`가
  `repeat`/`periodic`을 올바르게 분류하는지.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

`repeatOccurrences.ts`에 `collectMonthlyKmOccurrences` 함수를 신규 추가하고,
`detectPeriodOccurrenceDriver`에 `month`+`monthly_km` 2키 조합 특례를 추가해 이 조합을
기간 단위 회차 드라이버로 인식하도록 했다(`streak_days`+`distinct_time_bands` 특례와
동일한 형태). `badgeProgress.ts`는 이미 `isPeriodDrivenRepeatCondition`을 먼저 확인하므로
수정 불필요 — 발급·진행률이 자동으로 함께 `repeat`로 분류됨을 회귀 테스트로 확인했다.

그룹핑 규칙은 단발 판정(`index.ts` `evaluateConditionDetailed`)의 `month`+`monthly_km`
블록과 동일하게 맞췄다 — `month` 배열로 활동을 먼저 필터링한 뒤 연-월(`YYYY-M`)별로
`distanceKm`를 합산하고, 그 합계가 `monthly_km` 이상인 연-월마다 대표 활동(그 달 임계값을
완성한 마지막 활동) 하나를 사건으로 잡는다. 걷기 하루 1회 상한(`dedupeOnePerDay`)은
단발 판정의 `monthly_km` 블록도 적용하지 않으므로 여기서도 적용하지 않았다(횟수 축인
`monthly_count`만 적용 대상).

### 변경된 파일
```
jam-web/src/lib/badge-engine/repeatOccurrences.ts   (collectMonthlyKmOccurrences 추가, detectPeriodOccurrenceDriver 특례 추가)
jam-web/src/lib/badge-engine/__tests__/v5-extension.test.ts   (회귀 테스트 6건 추가)
```

### 테스트 결과
- [x] `npx vitest run src/lib/badge-engine/__tests__/v5-extension.test.ts` — 31건 통과
- [x] `npx vitest run` (전체) — 68 파일 · 1191건 통과
- [x] `npx tsc --noEmit` — 에러 없음
- [x] `npm run lint` (전체) — 에러 0건, 경고 13건(전부 design-system 사전 존재, 이번 변경과 무관)

### 배포 정보
- 배포일: 2026-09-08 (staging)
- 환경: staging → production은 `/jam-ship`으로 별도 진행
- 커밋: `8e3cdd79` staging에 fast-forward 병합

### 게이트 리뷰 PASS — staging 병합 완료 (2026-09-08)

conservative-reviewer가 격리 워크트리에서 재검증(`vitest` 전체 69파일 1204건, `tsc --noEmit`
0건, `lint` 0 errors + 단발 판정과의 그룹핑 규칙 일치 여부 코드 대조)해 PASS 판정. DB 변경
불필요(순수 엔진 로직 확장). 이로써 액티비티 배지 전수 재감사에서 발견된 마지막 2종
(`walking:W4` epic·mystic)도 정상 발급 가능해졌다 — 오늘(2026-09-08) 세 티켓(20260908_1318·
1438·1512·1536)으로 액티비티 배지 593종(미션보상 제외) **전량 발급 가능 상태 확인**.

### 주요 의사결정 / 핵심 메모

- `month`+`monthly_km` 조합의 "사건 하나"는 연-월 단위다(각 월 독립 카운트) — `month` 배열이
  6~7월을 하나의 기간으로 묶는 게 아니라는 점을 `ACTIVITY_BADGES.md`의 등급 사다리
  (Epic 1·Mystic 2 = 정확히 [6,7] 두 달 중 한 달/두 달)로 확인했다.
- 걷기 하루 1회 상한은 이 조합에 적용하지 않는다 — 단발 판정과 동일 규칙 유지가 발급-진행률
  일관성보다 우선한다(발급 로직을 새로 만드는 게 아니라 기존 단발 판정을 반복형으로
  확장하는 것이므로).

### 잔여 이슈
- 없음

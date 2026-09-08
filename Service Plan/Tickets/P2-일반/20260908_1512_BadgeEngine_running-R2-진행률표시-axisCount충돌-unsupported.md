---
id: 20260908_1512
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-08
---

# [BadgeEngine] running:R2 진행률 표시 — axisCount 충돌로 unsupported

## 배경 / 문제 정의
> 분리 출처: `20260908_1438`(반복형+게이트결합 회차0 및 personal_record_break_metric 누락 수정)
> 게이트 리뷰 alerts.

`running:R2`("더 빠르게")의 실제 조건 형태는
`{ activity_type: "running", single_distance_km: 5, personal_record_break: N,
personal_record_break_metric: 'max_pace_sec_per_km' }`이다. 티켓 `20260908_1438`로
**발급 판정(`checkCondition`/`evaluateConditionDetailed`)은 정상 동작**하게 됐지만,
**진행률 화면(`classifyBadgeProgressKind`)은 여전히 `'unsupported'`("진행 표시 준비 중")를
반환한다.**

원인: `single_distance_km`이 `conditionAxes.ts`의 `SCALAR_AXIS_KEYS`(측정 축)에도 속해
있는데, `personal_record_break`(`COUNTER_AXIS_KEYS`)와 함께 있으면 `classifyConditionKind`의
`axisCount` 계산이 축을 2개로 세면서 `scalarKeys.length`도 기대와 어긋나 `unsupported`로
떨어진다(`badgeProgress.ts` 518~634행 부근). `cycling:R1`·`running:R1`은 이 필터
(`single_distance_km`)가 조건에 없어 정상적으로 `cumulative`로 분류되므로 영향받지 않는다 —
`running:R2`에만 해당하는 문제다.

**사용자 영향**: 발급 자체는 정상이라 배지는 정확한 조건에서 나온다. 다만 배지 상세 화면의
진행바가 "진행 표시 준비 중"으로만 뜨고 실제 진행 수치(예: N회 중 M회)를 보여주지 못한다 —
사용자 입장에서 갑자기 배지가 튀어나온 것처럼 보일 수 있다(progressive-reviewer 지적).

## 상세 요구사항

### 서비스/코드베이스 관점

- `jam-web/src/lib/badge-engine/conditionAxes.ts`·`badgeProgress.ts`의 `classifyConditionKind`가
  `single_distance_km`을 `personal_record_break`의 **흡수 축(필터)** 으로 예외 처리할 수 있는지
  검토한다 — `personal_record_break`가 이미 짝 필드(`personal_record_break_metric`)로 지표를
  지정하는 구조이므로, 조건에 남는 `single_distance_km`은 "무엇을 기록으로 볼지"가 아니라
  "어떤 활동만 포함할지"를 정하는 필터라는 게 발급 판정 쪽(`countPersonalRecordBreaks`)의
  기존 해석과 일치한다. 진행률 쪽도 같은 해석을 적용할 수 있는지 판단한다.
- 예외 처리가 다른 계열(다른 `personal_record_break` + 필터 조합)에 영향을 주는지 전수 확인
- 회귀 테스트: `running:R2` 형태가 정상적으로 `cumulative`(또는 적절한 kind)로 분류되고,
  기존 `cycling:R1`/`running:R1`/그 외 `personal_record_break` 단독 계열의 분류가 바뀌지
  않는지

## 구현 계획
- `running:R2`가 실제 시즌 콘텐츠에 노출되기 전까지 배포를 서두르지 않아도 되지만(현재도
  발급은 정상), 노출 전에는 처리하는 것을 권장한다(progressive-reviewer 제안).

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

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

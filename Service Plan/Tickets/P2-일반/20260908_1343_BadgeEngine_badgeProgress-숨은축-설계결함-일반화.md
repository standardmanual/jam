---
id: 20260908_1343
category: BadgeEngine
priority: P2
status: OPEN
created: 2026-09-08
---

# [BadgeEngine] badgeProgress.ts 「숨은 축」 설계 결함의 일반적 해소

## 배경 / 문제 정의
> 분리 출처: `20260908_1318`(v5 잔여 5종 조건 필드 평가엔진 구현) 게이트 리뷰 sideFindings.

`badgeProgress.ts`의 `classifyConditionKind`는 조건에 여러 축이 결합돼 있을 때, 그중 진행률
계산 로직이 아직 모르는 축이 섞여 있으면 그 축을 **조용히 무시하고** 나머지 축만으로
`cumulative`/`periodic` 등으로 분류하는 설계 결함이 있다. 이러면 실제로는 판정에 반영되는
조건이 진행바 화면에는 반영되지 않아 「진행률은 채워졌다고 나오는데 실제로는 발급 안 되는
배지」로 보일 수 있다.

`20260908_1318`에서 `{distance_km, month_over_month_ratio}` 조합이 `month_over_month_ratio`
축을 숨긴 채 `cumulative`로 잘못 분류되는 것을 실측으로 확인했고, 그 조합에 한해 안전하게
`unsupported`(「진행 표시 준비 중」)로 떨어뜨리는 가드만 추가했다. **근본 원인(신규 축 추가 시
`classifyConditionKind`가 미지의 축을 기본적으로 무시하는 구조)은 해소되지 않았다** — 이후
새 조건 필드를 추가할 때마다 같은 유형의 버그가 재발할 수 있다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `badgeProgress.ts`의 `classifyConditionKind`를 감사해, "아는 축들의 조합"으로만 분류를
  확정하고 **미지의 축이 하나라도 남으면 fail-safe로 `unsupported`를 반환**하는 구조로
  일반화할 수 있는지 검토한다(화이트리스트 방식 전환).
- 가능하면 회귀 테스트로 "신규 조건 필드를 추가했는데 `classifyConditionKind`가 그 축을
  놓치면 테스트가 실패한다"는 안전망을 만든다(예: `conditionRegistry.ts`에 등록된 전체
  measurable 키 목록과 `classifyConditionKind`가 다루는 축 목록을 대조하는 테스트).
- `20260908_1318`에서 추가한 개별 가드(`NO_PROGRESS_AXIS_YET` 등)가 이 일반화로 대체
  가능한지, 아니면 그대로 남겨도 되는지 확인한다.

## 구현 계획
> 진행률 계산 오분류가 사용자에게 잘못된 「거의 다 채웠어요」 신호를 줄 수 있는 리스크이므로,
> 화이트리스트 전환의 영향 범위(기존에 정상 분류되던 조합이 갑자기 unsupported로 떨어지지
> 않는지)를 먼저 실측한 뒤 진행한다.

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

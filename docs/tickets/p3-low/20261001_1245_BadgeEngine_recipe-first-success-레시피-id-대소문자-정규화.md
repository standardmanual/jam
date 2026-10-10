---
id: "20261001_1245"
category: BadgeEngine
priority: P3
status: OPEN
created: 2026-10-01
closed:
---

# [BadgeEngine] 배지 조건 `recipe_first_success.recipe_id`가 대문자로 저장되면 발급도 가드도 놓친다

> 티켓 20261001_1200 게이트 리뷰(민지)의 범위 밖 발견물 `[정확성/참고]`

## 핵심 요약

- 요구사항: 어드민 검증은 `recipe_first_success.recipe_id`의 uuid를 대소문자 구분 없이 받는다(`jam-web/src/lib/admin/badge-validation.ts`의 `UUID_PATTERN`, `/i`). 그런데 엔진은
  `Set.has`로 정확히 비교하고(`jam-web/src/lib/badge-engine/jamActionBadges.ts:241` 근처), 레시피 삭제 가드는 text 비교(`->>recipe_id IN (...)`)로 센다. 대문자로 저장된 배지는
  발급되지 않고 가드도 세지 못한다. 라이브에 해당 배지는 0개다(2026-10-01).
- 구현 계획: 저장 시점에 `recipe_id`를 소문자로 맞춘다(검증 함수 또는 저장 정규화 한 곳). 가드 쪽은 1200 패치에서 입력 id를 소문자로 맞췄다.
- 관련 파일: `jam-web/src/lib/admin/badge-validation.ts`(87-113 `recipe_first_success` 검증), `jam-web/src/lib/badge-engine/jamActionBadges.ts`(조건 읽기), 테스트.

## 완료 조건

- 대문자 uuid로 입력한 `recipe_first_success.recipe_id`가 소문자로 저장되고, 그 배지가 발급된다(테스트).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `docs/service/writing/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일: 
- 환경: production
- 커밋: 

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-

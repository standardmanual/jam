---
id: "20260924_0037"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-24
closed: 2026-09-24
related:
  - "20260923_2253"
---

# [Infra] vitest.config.ts 기존 주석의 금칙어 정리 + 로컬 slop 검사 기준이 CI와 다른지 확인

> 티켓 20260923_2253 2차 게이트(민지)의 범위 밖 발견물 [가독성/참고]에서 자동 생성. 같은 실행에서 드러난 검사 기준 차이도 함께 다룬다.

## 핵심 요약

- 요구사항: (1) `jam-web/vitest.config.ts` 38행 기존 주석의 "진짜"(SLOP_DICTIONARY §4 반복 강조)를 대체 표현으로 고친다.
  (2) 아현이 워크트리에서 `scripts/verify.sh`를 "전항목 통과"로 보고했는데 CI `verify`는 같은 커밋에서 slop 실패였다. 로컬 slop 검사의
  비교 기준 커밋(격리 워크트리의 `origin/staging`이 main 기준으로 낡아 있을 가능성)이 CI와 다른지 확인하고, 다르면 `check-slop.mjs` 또는
  `verify.sh`가 `git fetch origin staging` 뒤 최신 기준으로 검사하게 한다.
- 관련 파일: `jam-web/vitest.config.ts` 38행, `scripts/check-slop.mjs`(diff 기준 계산부), `scripts/verify.sh`(slop 단계), `.claude/workflows/jam-work.js`(아현 첫 명령 `git fetch origin staging`).

## 완료 조건

- 38행 주석에서 금칙어가 사라지고 `node scripts/check-slop.mjs`가 통과한다.
- 로컬 slop 검사와 CI의 비교 기준이 같음을 확인하거나(원인 기록), 다르면 고쳐서 같은 커밋에서 두 결과가 일치한다.

크기 상한: 파일 3개, 40줄 이내.

---
## 완료 기록

### 구현 내용 요약
(1) `vitest.config.ts` 38행의 "진짜"를 "실제"로 바꿨다. (2) 로컬 `verify.sh`가 통과했는데 CI slop이 실패한 원인을 확인하고 검사 스크립트를 고쳤다. 원인은 비교 기준 커밋이 아니라, `check-slop.mjs`가 커밋된 변경만 검사해서 커밋 전에는 수정·스테이징·미추적 파일의 금칙어가 빠지는 점이었다(`git fetch origin staging`은 이미 하고 있었다). `collectAddedLines`가 `merge-base origin/staging HEAD`와 워킹트리를 비교하고 미추적 새 파일도 검사하게 했다. 커밋된 깨끗한 상태의 결과는 기존과 같다.

### 변경된 파일
```
jam-web/vitest.config.ts (38행 1줄)
scripts/check-slop.mjs (`collectAddedLines`)
scripts/check-slop.test.mjs (신규)
```

### 테스트 결과
- [x] CI `verify` 성공(run 35924165586, 커밋 98da3cd1)
- [x] 민지 게이트 PASS
- [x] 미추적 새 파일·추적 파일 미커밋 수정 모두 exit 1로 잡히고 원복 뒤 통과(수동 확인)
- [x] 병합 뒤 통합 `verify.sh` 전항목 통과

### 배포 정보
- 배포일: 2026-09-24 (staging 반영. 프로덕션은 `/jam-ship` 때)
- 환경: staging
- 커밋: 98da3cd1(브랜치), 병합 커밋 7901ac8b

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지(2명) | 75,105 | 44,271 / 10,929 | 약 8분 44초 | 48 |
| 합계 |  | 75,105 | 44,271 / 10,929 | 약 8분 44초 | 48 |

### 주요 의사결정 / 핵심 메모
- 원인은 재현으로 확인한 메커니즘이다. 당시 아현이 실행한 순서는 로그가 없어 그 경로였다는 것은 추정이다.
- `verify.sh`와 `jam-work.js`는 이미 fetch를 하고 있어 고치지 않았다.

### 잔여 이슈
- 민지 참고 2건은 후속 티켓 20260924_0700으로 분리했다(미추적 바이너리 파일 읽기, 테스트가 전체 저장소 검사에 의존).

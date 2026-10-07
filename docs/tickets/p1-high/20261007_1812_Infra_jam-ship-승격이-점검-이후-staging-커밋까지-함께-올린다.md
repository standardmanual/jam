---
id: "20261007_1812"
category: Infra
priority: P1
status: CLOSED
created: 2026-10-07
closed: 2026-10-07
parent: "20260918_1101"
---

# [Infra] /jam-ship 승격이 점검 이후 staging에 올라온 커밋까지 함께 올린다

> 출처: 2026-10-07 세 번째 `/jam-ship` 배포에서 카리나가 직접 겪은 사고. 기록은 티켓 20260930_1450 배포 기록 줄.

## 핵심 요약

- 요구사항: `/jam-ship` 7단계가 `git merge --ff-only origin/staging`으로 **승격 시점의** 원격 staging을 병합한다. 1단계에서 사용자에게 보여 주고 3·5단계에서 점검한 범위는
  **1단계 시점의** `origin/staging`이다. 그 사이 다른 세션이 staging에 push하면, 점검하지 않았고 사용자가 승인하지 않은 커밋이 함께 main으로 나간다. 승격 대상을 1단계에서 고정한 커밋으로 묶는다.
- 구현 계획: (가) 1단계에서 `origin/staging`의 커밋 해시를 기록하고, 7단계는 `git merge --ff-only <그 해시>`로 병합한다. (나) 7단계 직전에 `git rev-parse origin/staging`을 다시 보고
  1단계 해시와 다르면 멈추고 늘어난 커밋을 보고한다(새 커밋을 포함할지는 사용자가 정하고, 포함하면 3·5단계를 그 범위에 다시 돈다). 둘 다 넣는 것을 추천한다.
  무인 배포 경로(`.claude/skills/jam-work/references/scheduled-jobs.md` 「배포 실행」)에도 같은 문제가 있는지 함께 확인한다.
- 관련 파일: `.claude/skills/jam-ship/SKILL.md` 1단계·7단계, `.claude/skills/jam-work/references/scheduled-jobs.md` 「주간 배포 승인」 절.

## 배경 / 문제 정의

- 2026-10-07 18:00 무렵 1단계에서 `origin/main..origin/staging`(edc979e7e → f5aef986c, 커밋 14개)을 보여 주고 점검을 시작했다. 18:07~18:08에 다른 세션이 티켓 20261007_1745의
  커밋 4개(관리자 운영 묶음 API 변경, jam-web 14개 파일)를 staging에 push했다. 18:09에 7단계가 원격 staging을 다시 가져와 병합하면서 이 4개가 main(53335ddda)으로 함께 나갔다.
- 4개는 티켓 단계의 게이트 리뷰(민지 PASS)와 CI는 거쳤지만, 배포 전 점검(배포 게이트·`verify.sh`·민지 모드 ②·③)과 사용자 승인 없이 승격됐다. 사후에 같은 점검을 돌려 중단급 0건을 확인했다.
- 세션 여러 개가 동시에 staging에 push하는 일이 흔해서(같은 날에도 있었다) 재발 가능성이 높다. 사람 승인 관문을 우회하는 경로라 P1로 둔다.

## 완료 조건

- `/jam-ship` 7단계가 1단계에서 고정한 커밋만 승격한다. 그 뒤 staging이 앞서 나가 있으면 멈추고 보고한다.
- 무인 배포 경로가 같은 문제를 갖는지 확인하고, 있으면 같은 방식으로 막는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `/jam-ship` 1단계에서 승격 대상 끝 커밋(`SHIP_SHA`)을 고정하고, 3단계 게이트·`verify.sh`, 5단계 민지 병렬 점검, 7단계 병합이 모두 그 커밋을 쓰게 했다. 7단계 직전에 staging이 앞서 있으면 멈추고 사용자가 고른다.
- 무인 경로는 처리하지 않고 닫는다: 사용자가 2026-10-07 예약 루틴을 모두 삭제했고, `RemoteTrigger list`로 cron 루틴이 0개(남은 것은 꺼진 일회성 알림 7개)임을 확인했다. 목요일 무인 배포가 돌지 않으므로 이 티켓의 남은 범위가 없다.

### 변경된 파일
```
.claude/skills/jam-ship/SKILL.md
```

### 테스트 결과
- [x] `node scripts/check-skills.mjs` 통과(스킬 11개·에이전트 8개), `node scripts/check-contract.mjs` 통과, 커밋 훅 정합성 검사 통과

### 배포 정보
- 배포일: 2026-10-07
- 환경: staging
- 커밋: 637c90bb9

### 실행 지표
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 카리나 직접 수정(워크플로 없음) | - | - | - | - |
| 합계 | 카리나 직접 수정(워크플로 없음) | - | - | - | - |

### 주요 의사결정 / 핵심 메모
- 2026-10-07 사용자 승인(「승인」)으로 `/jam-ship` 쪽을 고쳤다. 1단계에서 `git rev-parse origin/staging`으로 `SHIP_SHA`를 고정하고, 3단계 `deploy-gate.mjs check --head <SHIP_SHA>`·`verify.sh`(로컬 staging을 `SHIP_SHA`에 맞춘 뒤),
  5단계 민지 범위·첫 명령(`git checkout --detach <SHIP_SHA>`)·생략 조건, 7단계 병합(`git merge --ff-only <SHIP_SHA>`)이 모두 그 커밋을 쓴다. 7단계 직전에 `<SHIP_SHA>..origin/staging`이 비어 있지 않으면
  멈추고 사용자가 ① `SHIP_SHA`까지만 승격 ② 늘어난 커밋까지 포함(점검·승인 다시) 중에서 고른다.
- 무인 경로에도 같은 문제가 있다: 확인 루틴(목 15:00)이 보여 준 목록과 실행 루틴(목 23:59)이 병합하는 `origin/staging` 사이에 시간 차가 있다. 실행 루틴(`trig_01JRRY1cXt6uWGin8xbtS1Sk`)의
  저장 프롬프트를 `RemoteTrigger get`으로 읽어(읽기 전용, 2026-10-07) `git merge --ff-only origin/staging`이 그대로 들어 있고 「문서와 충돌하면 이 지시가 우선한다」고 적힌 것을 확인했다.
  그래서 `scheduled-jobs.md`만 고치면 문서와 실제 동작이 어긋난다. 무인 경로는 두 루틴의 저장 프롬프트 교체가 필요하고, 이는 사용자 승인 뒤에 한다(이 티켓의 남은 범위).

### 잔여 이슈
- 예약 루틴을 다시 만들 때 주간 배포 실행 루틴은 확인 메시지에 적은 커밋까지만 병합해야 한다(이 티켓의 무인 경로 분석 참고). 루틴 삭제에 맞춘 문서·코드 정리는 별도로 다룬다.

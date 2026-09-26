---
id: "20260926_1535"
category: Infra
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260926_1513"
  - "20260926_1410"
  - "20260924_1512"
---

# [Infra] 점검 스크립트의 경계 결함 3건: 공개 미션 점검의 null 응답, 배포 게이트 쿠키 `Expires`, 계약 검사의 임시 폴더 생성

> 티켓 20260926_1513 게이트 리뷰에서 민지와 아현이 낸 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 테스트는 이미 현재 동작을 기록해 두었다.

## 핵심 요약

- 요구사항: 배포 전후 점검에 쓰는 스크립트 세 곳의 경계 결함을 고친다. 세 건 모두 정상 경로에서는 드러나지 않는다.
  1. **`scripts/public-mission-check.mjs:69`** `[주의]`: `buildPublicMissionCheckLines`에 배지 응답이 `null`·`undefined`로 들어오면 `badgesResult.badges`에서 `TypeError`가 난다(`{}`·`{badges:null}`은 정상). 바로 위 줄은 `?.`를 쓰는데 마지막 줄만 무방비다.
  2. **`scripts/deploy-gate.mjs:653`** `[참고]`: 쿠키 저장소가 `Expires`만으로는 쿠키를 지우지 않는다(`Max-Age<=0`·빈 값만 삭제). 서버가 `Expires` 과거 값으로 쿠키를 지우는 경우 게이트가 낡은 쿠키를 계속 보낸다.
  3. **`scripts/check-contract.mjs:537`** `[참고]`: `probeWorkflowFreeze`의 `mkdtempSync`가 try 밖이라 임시 폴더 생성이 예외를 던지면 검사기가 종료한다(`git init` 실패만 「참고」로 건너뛴다).
- 구현 계획: (1) `badgesResult?.badges`로 바꾸고 null 입력을 「응답 없음」 줄로 출력한다. (2) `Expires`가 현재 시각 이전이면 삭제하도록 파서를 고치고, 1513이 남긴 「현재 동작」 테스트의 기대값을 함께 바꾼다. (3) `mkdtempSync`를 try 안으로 옮기고 실패 시 참고 줄로 건너뛴다.
- 관련 파일: `scripts/public-mission-check.mjs:69`, `scripts/deploy-gate.mjs:653`, `scripts/check-contract.mjs:537`, `scripts/public-mission-check.test.mjs`, `scripts/deploy-gate.test.mjs`, `scripts/doc-check-hook.test.mjs`

## 완료 조건

- 세 건이 고쳐지고 각 케이스를 고정하는 테스트가 있다(2번은 1513이 적어 둔 「현재 동작」 기대값을 새 동작으로 바꾼다).
- `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

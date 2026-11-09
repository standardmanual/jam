---
id: "20261001_1416"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-01
closed: 2026-11-09
---

# [Admin] 전체 재평가 라우트(reevaluate-all)에 라우트 테스트를 더한다

> `/jam-ship` 2026-10-01 병렬 점검(민지 모드 ③) 범위 밖 발견물. 점검 범위 `efd7be8d..946ebad7`(origin/main → origin/staging).

## 핵심 요약

- 요구사항: `POST /api/admin/badges/reevaluate-all`의 발급 대상이 JAM! 행동 지표와 사용량 지표 6종(포인트 지급 포함)까지 넓어졌는데 라우트 테스트가 없다. `dryRun` 기본값 true, 비관리자 403, `userIds` 형식 400, 500명 상한 400, 대상 0명 응답의 새 필드 6개가 테스트 밖이다. 소요 시간 상한은 20261001_1036이 따로 맡는다. [정확성/주의]
  2026-10-05 E1(20261001_2203)이 미리보기 분기를 더해 경로가 늘었다: `includeUpcoming: true` 미리보기 응답(대상 0명이어도 미리보기 형식), 400 세 가지(`includeUpcoming`이 불리언이 아님, `includeUpcoming: true` + `dryRun: false`, `includeUpcoming` 없는 `badgeIds`), 미리보기 함수가 던질 때 500(E1 게이트 범위 밖 발견물).
- 구현 계획: 라우트 테스트 파일을 새로 만들어 위 다섯 경로와 E1이 더한 미리보기 경로(응답·400 세 가지·500)를 고정한다.
- 관련 파일: `jam-web/src/app/api/admin/badges/reevaluate-all/route.ts:42`, `jam-web/src/lib/badge-engine/reevaluateCatalog.ts`(`previewUpcomingJamBadges`, E1)

## 완료 조건

- `dryRun` 기본값·권한·입력 검증·상한·빈 대상 응답이 라우트 테스트로 고정된다.
- `includeUpcoming` 미리보기 응답과 400 세 가지, 미리보기 실패 500이 라우트 테스트로 고정된다.

---
## 완료 기록

### 구현 내용 요약
전체 재평가 라우트(`reevaluate-all/route.ts`)의 시험 파일에 빠져 있던 분기를 더했다. 깨진 JSON·빈 본문에서도 dryRun이 true로 남는지(53행), includeUpcoming이 불리언이 아닐 때 400(59행, 4가지와 dryRun:false 동반), userIds 형식 400(76행, 6가지), userIds 중복 제거와 입력 순서 유지(84행, 빈 배열이면 전체 유저 조회), 대상 유저 상한 500명(112행, 501명 400, 500명 통과, 중복 제거 뒤 수로 계산, 미리보기에도 적용)이다. 기존 시험에 있던 항목은 중복해서 쓰지 않았다. 같은 라우트의 티켓 20261007_0950(입력 검증 분기 시험 없음)도 이 변경으로 함께 닫는다. 동작 변경은 없다.

### 변경된 파일
```
jam-web/src/app/api/admin/badges/reevaluate-all/__tests__/route.test.ts (+137줄)
```

### 테스트 결과
- [x] `route.test.ts` 34건 통과(민지가 직접 실행). 모의 함수만 쓰므로 실제 발급 경로는 없다.
- [x] CI verify는 spacing만 실패했고 staging 기존 문제였다(이번 push에서 티켓 20261109_1448로 수정).

### 배포 정보
- 배포일: 2026-11-09
- 환경: staging
- 커밋: 머지 커밋(해시는 push 뒤 git log 참고)

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | jam-developer, jam-reviewer (경로 ③, 채원 생략: admin) | 94,282 | 63,199 / 15,116 | 23분 40초 | 40 |
| 합계 |  | 94,282 | 63,199 / 15,116 | 23분 40초 | 40 |

### 주요 의사결정 / 핵심 메모
- 두 티켓(1416, 0950)을 한 번의 실행으로 처리했다. 계획 반환 면제를 사전에 부여했다.
- 20261007_0950이 말한 «다섯 분기»는 53·59·76·84·112행으로 해석했다.

### 잔여 이슈
- 없음

---
id: "20261007_1510"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-07
closed: 2026-11-09
parent: "20261006_1806"
---

# [Admin] make-home-feed-card 인자 파서가 값 자리의 `--` 인자와 빈 문자열을 통과시킨다

> 상위: 20261006_1806 ⑥-A(20261007_1600)의 게이트 주의 발견물. 이번 범위 밖이라 분리했다.

## 핵심 요약

- 요구사항: `jam-web/scripts/asset-generator/makeHomeFeedCardArgs.mjs`(82줄 근처)의 인자 파서도 ⑥-A의 `renderArgs.mjs`와 같은 규칙을 따르게 한다. 알 수 없는 인자는 오류로 멈추고, 값이 없거나 빈 문자열이거나 `--`로 시작하면 「--키 값이 필요해요」 계열 오류로 멈춘다.
- 문제: 지금은 값 자리에 다른 `--` 인자가 오면 값으로 삼키고 빈 문자열 값도 통과시켜, 남은 검사로만 거른다. 윤진 예약 루틴(`.claude/agents/jam-marketer.md` 140~183줄)이 이 스크립트를 쓴다.
- 구현 계획: `makeHomeFeedCardArgs.mjs`를 `renderArgs.mjs`와 같은 규칙으로 고치고 `makeHomeFeedCard.test.ts`(또는 새 `makeHomeFeedCardArgs.test.ts`)에 같은 케이스를 더한다. 루틴이 쓰는 인자 조합은 그대로 동작해야 한다. 두 파서가 같은 로직이면 공용 함수로 뽑을지는 착수 때 판단한다.
- 관련 파일: `jam-web/scripts/asset-generator/makeHomeFeedCardArgs.mjs`, `jam-web/scripts/asset-generator/__tests__/makeHomeFeedCard.test.ts`, `jam-web/scripts/asset-generator/renderArgs.mjs`(기준).

## 완료 조건

- [ ] `make-home-feed-card`의 알 수 없는 인자·빈 문자열 값·값 자리의 `--` 인자가 오류로 멈춘다.
- [ ] 윤진 루틴이 쓰는 인자 조합은 그대로 동작한다(테스트).
- [ ] `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약
`makeHomeFeedCardArgs.mjs`의 `parseMakeCardArgs`가 값 자리 검사를 `next === undefined`로만 해서, `--text01 --text02 설명`처럼 값 자리에 온 `--` 인자와 빈 문자열을 값으로 삼켰다. 값이 없거나 빈 문자열이거나 `--`로 시작하면 「--키 값이 필요해요.」로 멈추도록 `renderArgs.mjs`와 같은 규칙으로 맞췄다. 음수 시드(-7)와 한 글자 값(-)은 그대로 받는다. 공용 함수는 만들지 않았다.

### 변경된 파일
```
jam-web/scripts/asset-generator/makeHomeFeedCardArgs.mjs
jam-web/scripts/asset-generator/__tests__/makeHomeFeedCard.test.ts
```

### 테스트 결과
- [x] `makeHomeFeedCard.test.ts` 23건 통과(값 없음·값 자리 `--`·빈 문자열·하이픈 시작 값 허용 3건 추가), `scripts/asset-generator` 23개 파일 581건 통과(민지 직접 실행).
- [x] CI verify는 spacing 한 항목만 실패했고 이는 staging 기존 문제였다(이번 push에서 티켓 20261109_1448로 수정).

### 배포 정보
- 배포일: 2026-11-09
- 환경: staging
- 커밋: 머지 커밋(해시는 push 뒤 git log 참고)

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | jam-developer, jam-reviewer (경로 ③, 채원 생략: admin) | 90,042 | 79,806 / 5,356 | 32분 12초 | 44 |
| 합계 |  | 90,042 | 79,806 / 5,356 | 32분 12초 | 44 |

### 주요 의사결정 / 핵심 메모
- 게이트 판정 WARN: 완료 조건 «verify 통과»가 staging 기존 spacing 실패 때문에 문자 그대로는 미충족이었다. 이번 변경의 회귀는 아니다.
- 윤진 루틴이 쓰는 인자 조합은 `HOME_FEED_REGISTRATION_BUNDLE.md`의 명령 예시를 기준으로 기존 정상 경로 시험이 계속 통과하는 것을 확인했다.

### 잔여 이슈
- 없음

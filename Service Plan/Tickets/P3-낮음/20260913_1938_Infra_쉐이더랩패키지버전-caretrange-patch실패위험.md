---
id: 20260913_1938
category: Infra
priority: P3
status: OPEN
created: 2026-09-13
---

# [Infra] `@basementstudio/shader-lab` 버전이 caret range라 향후 patch-package 실패 위험

## 배경

티켓 20260913_1901(텍스트 레이어 다중 줄 입력)에서 `patch-package`로
`@basementstudio/shader-lab`의 `text-pass.js`를 직접 수정했다. 게이트 리뷰
(conservative-reviewer)가 sideFinding으로 지적한 내용을 별도 티켓으로 분리한다.

## 문제

`jam-web/package.json`의 `"@basementstudio/shader-lab": "^3.0.2"`가 caret range라,
향후 `npm install`이 3.0.x 이후 마이너/패치 버전을 새로 끌어오면 `text-pass.js` 원본
내용이 바뀌어 있을 수 있다. `patch-package`는 패치 대상 파일이 자신이 알고 있는
diff 컨텍스트와 다르면 적용에 실패하는데, 이 실패가 조용히 넘어가지 않고
`postinstall` 자체를 에러로 멈춘다 — 안전한 실패이긴 하지만, 배포·CI 파이프라인이
갑자기 막히는 형태라 원인 파악 전까지 당황할 수 있다.

## 상세 요구사항

- `@basementstudio/shader-lab` 버전을 caret range(`^3.0.2`) 대신 정확한 버전
  고정(`3.0.2`)으로 바꾸는 방안을 검토한다.
- 또는 최소한 이 위험을 `THIRD_PARTY_NOTICES.md`나 `patches/` 근처에 문서화해,
  향후 버전을 올릴 때 패치 재검증이 필요함을 남긴다.

## 참고

- 발견 경위: 티켓 20260913_1901 게이트 리뷰(conservative-reviewer)의 sideFinding

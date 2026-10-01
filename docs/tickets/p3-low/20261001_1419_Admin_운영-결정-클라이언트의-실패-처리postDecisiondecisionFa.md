---
id: "20261001_1419"
category: Admin
priority: P3
status: OPEN
created: 2026-10-01
closed:
---

# [Admin] 운영 결정 클라이언트의 실패 처리(postDecision·decisionFailureMessage)를 테스트한다

> `/jam-ship` 2026-10-01 병렬 점검(민지 모드 ③) 범위 밖 발견물. 점검 범위 `efd7be8d..946ebad7`(origin/main → origin/staging).

## 핵심 요약

- 요구사항: `postDecision`·`decisionFailureMessage`에 테스트가 없다. 네트워크 실패(status 0), 비JSON 응답 폴백 문구, 409 접미사, `fieldErrors` 문자열 필터가 대상이다. jsdom 없이 `fetch` 스텁으로 검증할 수 있다. 클릭 흐름은 SSR 한계로 카리나 실렌더 대상이다. [정확성/참고]
- 구현 계획: `fetch` 스텁 단위 테스트를 새로 만든다.
- 관련 파일: `jam-web/src/components/admin/ops/decisionClient.ts:49-64`

## 완료 조건

- 네 가지 실패 경로의 문구가 테스트로 고정된다.

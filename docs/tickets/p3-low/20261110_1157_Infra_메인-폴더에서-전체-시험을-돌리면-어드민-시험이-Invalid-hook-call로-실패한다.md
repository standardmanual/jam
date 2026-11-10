---
id: "20261110_1157"
category: Infra
priority: P3
status: OPEN
created: 2026-11-10
closed:
---

# [Infra] 메인 폴더에서 전체 시험을 돌리면 어드민 시험이 Invalid hook call로 실패한다

## 핵심 요약

- 요구사항: 메인 작업 폴더(한글 경로 `뚝섬하드/시현/JAM!`)에서 `scripts/verify.sh`의 `test` 단계를 돌리면 어드민 시험 47개 파일 543건이 `Invalid hook call`(`Cannot read properties of null (reading 'useRef')`)로 실패한다. 이번 변경이 읽지 않는 파일이다. 원인을 가려 메인 폴더에서도 전체 검사가 통과하게 한다.
- 구현 계획: (미정 — 먼저 원인 확인) 실패 스택의 `react` 경로가 한글을 NFC로 적은 경로와 `%E1%84%84…` NFD 경로로 갈려 같은 React가 두 번 읽히는 것으로 보인다. `vitest.config`의 `resolve.dedupe`·`alias`로 `react`·`react-dom`을 한 경로로 고정하는 방안을 시험한다.
- 관련 파일: `jam-web/vitest.config.*`, 실패 예: `jam-web/src/components/admin/ops/__tests__/cancelItem.test.tsx`(`TooltipProvider`가 호출 지점)

## 배경 / 문제 정의

2026-11-10 티켓 20261110_1115 머지 뒤 메인 폴더 전체 검사에서 확인했다. 같은 날 앞서 `npm ci`로 설치한 워크트리의 전체 검사는 통과했다. 메모리 «한글 폴더명이 설정값은 NFC, git·pwd 경로는 NFD»와 같은 계열의 문제일 수 있다.

## 완료 조건

- 메인 폴더에서 `bash scripts/verify.sh`의 `test` 단계가 통과하거나, 통과하지 못하는 환경 조건이 문서에 적혀 있다.

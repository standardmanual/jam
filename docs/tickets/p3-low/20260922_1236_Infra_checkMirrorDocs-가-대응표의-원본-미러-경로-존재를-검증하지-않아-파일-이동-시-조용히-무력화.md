---
id: "20260922_1236"
category: Infra
priority: P3
status: OPEN
created: 2026-09-22
parent: "20260922_1030"
---

# [Infra] `checkMirrorDocs`가 대응표의 원본·미러 경로 존재를 검증하지 않아 파일 이동 시 조용히 무력화된다

## 핵심 요약

- 요구사항: `scripts/check-contract.mjs`의 `checkMirrorDocs`는 `mirror_docs.pairs`의 `source`·`mirror` 경로가 실제로 존재하는지 확인하지 않는다. 파일이 이동·삭제되면 검사가 아무 경고 없이 빠져나가 드리프트를 놓친다. 다른 규칙(`checkPathsExist`)처럼 경로 부재를 위반으로 처리한다.
- 구현 계획: `checkMirrorDocs` 진입부에서 pairs의 두 경로를 `existsSync`로 확인해 없으면 `violate('mirror_docs', ...)`한다. 테스트에 "존재하지 않는 경로 선언" 시나리오 1건을 추가한다.
- 관련 파일: `docs/agents/contract.json`, `scripts/check-contract.mjs`, `scripts/mirror-docs-hook.test.mjs`
- 상위 티켓: 20260922_1030(민지 게이트의 범위 밖 발견물). 경로: ① 경미

## 배경 / 문제 정의

민지 1030 게이트 발견물. 대응표는 파일 경로에 의존하므로 경로 검증이 없으면 규칙 자체가 침묵 실패한다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 경로 부재는 mode와 무관하게 위반(차단)이다 — 선언이 낡은 것이므로 고쳐야 통과한다.

## 구현 계획

1. 위 「구현 계획」대로.

## 완료 조건

- 존재하지 않는 경로를 선언한 임시 저장소 테스트가 위반으로 실패하고, 기존 6개 시나리오는 통과.

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
- 환경: staging (빌드 없음)
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

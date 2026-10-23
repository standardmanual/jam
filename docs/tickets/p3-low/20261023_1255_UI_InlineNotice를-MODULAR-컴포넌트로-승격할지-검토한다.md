---
id: "20261023_1255"
category: UI
priority: P3
status: OPEN
created: 2026-10-23
---

# [UI] InlineNotice를 MODULAR 컴포넌트로 승격할지 검토한다

## 핵심 요약

- 요구사항: 서비스 컴포넌트 `InlineNotice`가 9곳에서 쓰인다. 파일 주석이 정한 MODULAR 승격 기준(«3곳째»)을 이미 넘었다. 승격할지 판단한다.
- 구현 계획: 사용처 9곳의 모양과 문구 의존을 비교해 공통 부분이 같은지 확인한다. 승격하면 `jam-web/design-system/components/`에 옮기고 Story를 쓰고 사용처를 바꾼다. 승격하지 않으면 이유를 파일 주석에 남긴다.
- 관련 파일: `jam-web/src/components/ui/InlineNotice.tsx`, `jam-web/design-system/components/`

## 배경 / 문제 정의

티켓 `20261022_2119` 3회의 채원 사후 리뷰가 MODULAR 승격 후보로 짚었다(같은 리뷰의 BagItemCell은 한 폴더 안에서만 쓰고 서비스 문구에 기대어 보류).

## 완료 조건

- 승격 여부가 근거와 함께 정해졌다. 승격하면 Story와 사용처 교체가 끝났고 기존 시험이 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

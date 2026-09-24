---
id: "20260924_0812"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-24
closed: 2026-09-24
parent: "20260923_2252"
related:
---

# [Infra] `deploy-gate.mjs served`가 루트가 307 리다이렉트일 때 서빙 배포 id를 확인하지 못한다

> 배포 검증 절차의 도구 결함이다.

## 핵심 요약

- 요구사항: `node scripts/deploy-gate.mjs served`가 루트(`https://j-a-m.app`)의 307 응답을 따라가지 않아 "식별자 없음"(종료 코드 3)으로 끝난다. 리다이렉트를 따라가거나 `/login` 같은 공개 페이지를 대상으로 삼게 한다.
- 구현 계획: `served`의 기본 대상을 리다이렉트 후 최종 응답으로 하거나 `/login`으로 바꾸고 테스트를 추가한다.
- 관련 파일: `scripts/deploy-gate.mjs` 26·384~416행(`DPL_ID`, fetch)

## 배경 / 문제 정의

2026-09-24 첫 프로덕션 승격에서 루트가 `/login`으로 307 리다이렉트돼 `served`가 대조에 실패했고, `/login` 응답에서 직접 확인해야 했다.

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- `served`가 로그인 리다이렉트가 있는 프로덕션에서 서빙 배포 id를 출력한다(테스트로 확인).

크기 상한: 2파일/30줄.

---
## 완료 기록

### 구현 내용 요약
경로 ① 경미 수정(카리나 직접). **원인은 티켓 제목과 달랐다.** `served`는 리다이렉트를 따라가(`redirect: 'follow'`) `/login`의 200 응답을 받고 있었다. 실패 원인은 프로덕션 `/login`이 배포 식별자를 정적 자원의 `?dpl=dpl_…`가 아니라 `<html data-dpl-id="dpl_…">` 속성으로만 내보낸다는 점이었다. 정규식을 `/(?:dpl=|data-dpl-id=")(dpl_[A-Za-z0-9]+)/`로 넓히고 해당 형태의 테스트를 추가했다.

### 변경된 파일
```
scripts/deploy-gate.mjs (정규식·주석·오류 문구)
scripts/deploy-gate.test.mjs (data-dpl-id 페이지 케이스 1건)
```

### 테스트 결과
- [x] `node scripts/deploy-gate.test.mjs` 통과(check·served·contract 대조)
- [x] 실측: `node scripts/deploy-gate.mjs served`가 프로덕션 서빙 배포 id `dpl_ABYHWyVkhvwpSQBowu3FGgf1c7pe`를 출력(종료 코드 0, 2026-09-24 배포와 일치)

### 배포 정보
- 배포일: 2026-09-24 staging 반영(배포 스크립트라 서비스 배포와 무관)
- 환경: staging
- 커밋: c0fc161d

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 카리나 직접(경미 수정) | 없음 | 해당 없음 | 해당 없음 | 약 5분 | 4 |
| 합계 |  | 해당 없음 |  | 약 5분 | 4 |

### 주요 의사결정 / 핵심 메모
- 원인이 1:1로 드러나고 변경이 2파일·10줄 이내라 경미 수정으로 처리했다. 파일명(제목)은 기존 참조를 깨지 않도록 바꾸지 않았다.

### 잔여 이슈
- 없음.

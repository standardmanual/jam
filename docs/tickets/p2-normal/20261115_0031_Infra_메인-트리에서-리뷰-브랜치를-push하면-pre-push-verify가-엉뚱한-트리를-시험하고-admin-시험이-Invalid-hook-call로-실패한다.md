---
id: "20261115_0031"
category: Infra
priority: P2
status: OPEN
created: 2026-11-15
closed:
---

# [Infra] 메인 트리에서 리뷰 브랜치를 push하면 pre push verify가 엉뚱한 트리를 시험하고 admin 시험이 Invalid hook call로 실패한다

## 핵심 요약

- 요구사항: 두 문제를 고친다. ① .githooks/pre-push(263~295줄)의 리뷰 브랜치 verify 게이트가 push하는 커밋이 아니라 현재 작업 트리(메인 트리라면 staging 코드)를 시험한다. ② 메인 트리 jam-web에서 전체 vitest를 돌리면 admin 시험이 Invalid hook call 519건으로 실패한다(2026-11-15 00:00 KST 무렵 재현, 로그는 pre-push 임시 폴더).
- 관련 파일: .githooks/pre-push, scripts/verify.sh, jam-web/node_modules(React 중복 여부)
- 출처: 아이콘 1회차(20261114_2345) review 브랜치 push 때 카리나 발견. 아현 워크트리에서 push해 우회했다.
- 완료 조건: 메인 트리에서 리뷰 브랜치를 push할 때 해당 커밋을 시험하거나 그 사실을 알리고 건너뛴다. 메인 트리 전체 vitest에 Invalid hook call이 없다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

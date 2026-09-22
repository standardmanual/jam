---
id: "20260922_1818"
category: Infra
priority: P2
status: OPEN
created: 2026-09-22
closed:
---

# [Infra] CI `verify` 워크플로의 액션 버전을 올린다 — Node.js 20 사용 중단 경고

## 핵심 요약

- 요구사항: GitHub Actions `verify` 체크런에 "Node.js 20 is deprecated … forced to run on Node.js 24" 경고가 붙는다(`actions/checkout@v4`·`actions/setup-node@v4` 대상). GitHub 측 강제 전환 시점에 CI가 예고 없이 흔들릴 수 있으므로 액션 버전을 미리 올린다. `infra` 유형.
- 구현 계획: `.github/workflows/verify.yml`의 `actions/checkout`·`actions/setup-node`를 Node 24를 기본으로 하는 최신 메이저(v5 이상, 릴리스 노트로 확인)로 올리고, 리뷰 브랜치 push로 CI가 경고 없이 success인지 확인한다.
- 관련 파일: `.github/workflows/verify.yml`(`uses: actions/checkout@v4`·`uses: actions/setup-node@v4` 줄)
- 출처: 티켓 20260922_1755 민지 게이트 범위 밖 발견물 `[주의]` (자동 티켓화, `/jam-work` 3.2절)

## 배경 / 문제 정의

2026-09-22 18:10 KST 게이트 리뷰에서 `gh api repos/standardmanual/jam/commits/862836b1/check-runs`의 annotations에 위 경고 2건이 있음을 확인했다. 이번 변경과 무관한 기존 상태다.

## 완료 조건

- `.github/workflows/verify.yml`의 두 액션이 Node 24 기반 메이저로 올라가 있다.
- 리뷰 브랜치 push의 `verify` 체크런 annotations에 Node 20 사용 중단 경고가 없다.
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

### 배포 정보
- 배포일:
- 환경: staging (빌드 없음)
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

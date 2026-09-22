---
id: "20260922_2321"
category: Infra
priority: P1
status: OPEN
created: 2026-09-22
closed:
---

# [Infra] Next.js·sharp·postcss·nanoid 의존성 취약점 상향 (critical RCE 포함, 이미 프로덕션 배포됨)

## 핵심 요약

- 요구사항: `npm audit --omit=dev`에서 나온 critical 1건·high 3건을 해소할 상향 계획을 세우고
  적용한다.
- 구현 계획: (착수 전 조사 필요 — 아래 「구현 계획」 절 참고)
- 관련 파일: `jam-web/package.json`(`next`·`sharp` 버전 고정), `jam-web/package-lock.json`

## 배경 / 문제 정의

2026-09-22 `/jam-ship` 3단계 배포 전 점검표에서 `npm audit --omit=dev` 실행 중 발견했다(경위:
티켓 20260922_2207 배포 흐름 중).

```
5 vulnerabilities (1 moderate, 3 high, 1 critical)
```

| 패키지 | 등급 | 현재 고정 버전 | 요지 |
|---|---|---|---|
| next | critical | 16.2.10 | Middleware/Proxy 우회, Server Actions SSRF·DoS, 캐시 혼동, Windows 호스트 RCE, AVIF 이미지 최적화 API RCE 등 다건 |
| sharp | high | ^0.35.3 | libvips 상속 취약점(CVE-2026-33327 등), libheif 취약점 |
| postcss | high | (next 내부 의존) | CSS Stringify XSS, sourceMappingURL 경로 순회로 임의 .map 파일 노출 |
| nanoid | high | (next 내부 의존) | size=0일 때 커스텀 제너레이터가 무한 루프 |

**현재 프로덕션(origin/main)에도 이미 같은 고정 버전(`next 16.2.10`, `sharp ^0.35.3`)이 떠 있다**
(2026-09-22 `git show origin/main:jam-web/package.json` 대조 확인) — 이번 티켓 20260922_2207
배포가 새로 만든 취약점이 아니라 기존부터 있던 것이다. 사용자 결정으로 이번 배포는 그대로
진행하고 상향은 별도 티켓(이 티켓)으로 분리했다.

Vercel은 Linux 기반 서버리스 함수라 "Windows 호스트 RCE" 항목은 이 배포 환경에 해당하지 않을
가능성이 높지만, AVIF 이미지 최적화 RCE·SSRF·캐시 혼동 등 나머지 항목은 환경 무관하게 적용될 수
있다 — 착수 시 각 CVE의 적용 범위를 먼저 가린다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `next`를 패치 버전이 존재하는 안전 버전으로 올린다. `npm audit fix --force`가 제안하는
  `next@16.3.5`는 "stated dependency range 밖"이라는 경고가 함께 뜬다 — 메이저·마이너 폭이 큰
  상향일 수 있으므로 체인지로그 확인과 스테이징 실렌더 검증이 필요하다.
- `sharp`은 `^0.35.3` 고정을 상향한다. 이미지 배지 파이프라인(`/jam-img`)과 배경 제거·합성
  로직이 sharp API에 의존하므로 상향 후 배지 이미지 파이프라인 회귀 테스트가 필요하다.
- `postcss`·`nanoid`는 `next`의 내부 의존이라 `next` 상향에 따라 함께 해소될 가능성이 높다 —
  `next` 상향 뒤 `npm audit`을 다시 돌려 남는지 확인한다.

### UI/UX 관점 (해당 시)
- Next.js 상향이 빌드 출력·라우팅 동작을 바꿀 수 있으므로 상향 뒤 staging 전체 화면 실렌더
  확인이 필요하다(단순 유닛 테스트만으로는 부족).

### 컨텐츠 관점 (해당 시)
- 해당 없음.

## 구현 계획
> 착수 전 조사: 각 CVE가 Vercel 서버리스(Linux, Node 런타임) 환경에 실제로 적용되는지 확인하고,
> `next` 상향 대상 버전을 정한다(패치 버전 우선, 불가하면 마이너 상향 범위와 breaking change를
> 정리한다). 조사 결과에 따라 이 절을 채운 뒤 착수한다.

## 완료 조건
- `cd jam-web && npm audit --omit=dev`에서 critical·high 0건.
- `scripts/verify.sh` 통과, staging 배포 후 핵심 화면(홈피드·배지 상세·이미지 배지 표시) 실렌더
  확인.
- 배지 이미지 파이프라인(`/jam-img`) 회귀 확인(sharp 상향 영향).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 해당 없음 (사용자 노출 텍스트 변경 없음)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

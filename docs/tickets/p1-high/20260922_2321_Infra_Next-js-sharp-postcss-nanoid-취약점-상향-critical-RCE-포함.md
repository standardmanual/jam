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

카리나 사전 조사 완료(2026-09-23):

1. `cd jam-web && npm audit fix --force` 실행 — `next@16.2.10 → 16.3.6`(마이너 상향, 패치 버전
   없음. `npm audit`가 제시하는 유일한 해소 경로). `postcss`·`sharp`·`nanoid`는 next의 내부
   의존이라 이 한 번의 상향으로 함께 해소될 가능성이 높다 — 상향 직후 `npm audit --omit=dev`
   재실행해 실제로 5건 모두 사라졌는지 확인하고, `sharp`가 여전히 남으면 `sharp` 단독으로
   추가 상향(현재 `^0.35.3` 고정 — 최신 안전 버전으로 caret range 조정)한다.
2. moderate 1건(`baseline-browser-mapping`)도 `npm audit fix`(force 아님)로 같이 해소한다 —
   완료 조건에는 없지만 같은 작업 안에서 정리하는 편이 다음 감사 노이즈를 줄인다.
3. CVE 적용 범위 판단: Vercel은 Linux 기반 서버리스이므로 "Windows-hosted RCE"(GHSA-p293-qw3h-jr36)는
   해당 없다. 나머지(AVIF 이미지 최적화 RCE, Server Actions SSRF/DoS, 캐시 혼동, Middleware
   bypass, 미인증 Server Function 노출)는 환경 무관하게 적용되므로 상향이 필요하다.
4. 배지 이미지 파이프라인(`/jam-img`) 회귀: `sharp` API 변경 여부를 체인지로그로 먼저 확인하고,
   로컬에서 기존 배지 이미지 1건으로 배경 제거·합성 스크립트를 재실행해 결과 이미지가 상향
   전과 동일한지 확인한다.
5. staging 배포 후 실렌더 확인(홈피드·배지 상세·이미지 배지 표시)은 민지가 `curl`로 렌더된
   HTML까지만 확인하고, 시각적 확인이 필요하면 사용자에게 스테이징 링크로 안내한다.

**규모 사전 판정(계획 반환 면제, 티켓 20260922_1754 절차)**: 변경 파일은 `package.json`·
`package-lock.json` 2개뿐이나 `package-lock.json`은 npm이 자동 생성하는 산출물이라 변경 줄
수가 수백~수천 줄에 이를 수 있다. 실제로 판단이 들어가는 변경은 `package.json`의 버전 문자열
1~2줄뿐이므로, 아현 호출 시 `planOnlyWaiver`로 이 사유를 넘겨 `plan_only` 왕복을 막는다.

## 완료 조건
- `cd jam-web && npm audit --omit=dev`에서 critical·high 0건.
- `scripts/verify.sh` 통과, staging 배포 후 핵심 화면(홈피드·배지 상세·이미지 배지 표시) 실렌더
  확인.
- 배지 이미지 파이프라인(`/jam-img`) 회귀 확인(sharp 상향 영향).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
계획 그대로 `cd jam-web && npm audit fix --force` 1회 실행으로 `next 16.2.10 → 16.3.6`(caret
`^16.3.6`)으로 상향, 내부 의존인 `sharp`(0.35.3→0.35.4)·`postcss`(→8.5.26)·`nanoid`(→3.3.19)가
함께 해소됐다. moderate 1건(`baseline-browser-mapping`)도 같은 상향으로 함께 사라졌다
(계획 2번 항목). `npm audit --omit=dev` 재실행 결과 0건.
CVE 적용 범위: Vercel은 Linux 서버리스이므로 "Windows-hosted RCE"(GHSA-p293-qw3h-jr36)는
해당 없음을 확인, 나머지(AVIF 이미지 최적화 RCE·Server Actions SSRF/DoS·캐시 혼동·Middleware
bypass·미인증 Server Function 노출)는 환경 무관하게 적용되므로 이번 상향으로 해소.
`sharp` API 변경 여부는 0.35.3→0.35.4가 patch 버전이라 낮음으로 판단했고, 실제로
`scripts/recraft/compose-logo.js`(로컬 sharp 합성, Recraft 외부 API 미호출)를 샘플 배지
이미지(`public/itembooks/sample/b107.png`)+로고(`public/jam-logo-white.png`)로 상향 전(구
node_modules)·상향 후 각각 실행해 출력 PNG를 바이트 단위(`cmp`)로 비교 — 완전 동일(회귀 없음).

**작업 중 발견한 부작용(별도 조치, alerts 참고)**: 하네스가 연결한 `jam-web/node_modules`
심볼릭 링크(메인 체크아웃과 공유)로 `npm audit fix --force`를 실행하자 메인 체크아웃의
물리 `node_modules`가 중간에 손상됐다(`next`·`sharp` 폴더 유실, `esbuild` 바이너리 검증 실패).
메인 체크아웃의 `package.json`·`package-lock.json`은 git 추적 파일이라 영향 없음을 확인
(`diff`로 대조, 두 파일 모두 동일). `node_modules/esbuild`만 좁게 지우고 `npm install`로
메인 체크아웃을 원상 복구(`next 16.2.10`·`sharp 0.35.3` 재설치 확인). 이후 내 워크트리는
심볼릭 링크를 걷어내고 독립 `npm install`로 별도 `node_modules`를 구성해 작업을 이어갔다.

### 변경된 파일
```
jam-web/package.json       (next ^16.3.6, @storybook/addon-mcp ^10.6.0, @vitest/coverage-v8 ^4.1.11 — npm audit fix --force 자동 조정)
jam-web/package-lock.json  (자동 생성 산출물, npm audit fix --force 반영)
```

### 테스트 결과
- [x] `npm audit --omit=dev` → 0 vulnerabilities (완료 조건 충족)
- [x] `scripts/verify.sh` 전항목 통과 (lint·typecheck·test·ds:check·slop·scripts-test·contract·team-doc·team-map·skills)
- [x] sharp 이미지 파이프라인 회귀: `compose-logo.js` 상향 전/후 출력 PNG 바이트 단위 동일
- [ ] staging 배포 후 핵심 화면(홈피드·배지 상세·이미지 배지 표시) 실렌더 확인 — 이 티켓
      완료 기록 작성 시점에는 아직 staging에 배포되지 않아 미수행. 배포 후 민지가 `curl`로
      렌더된 HTML까지 확인하고, 시각적 확인은 사용자에게 스테이징 링크로 안내(계획 5번 항목)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 해당 없음 (사용자 노출 텍스트 변경 없음)

### 배포 정보
- 배포일: (미배포 — 이 브랜치는 staging에 push만 됨, `/jam-ship`은 별도)
- 환경: production
- 커밋: (StructuredOutput의 commitSha 참고)

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모
- `eslint-config-next`는 여전히 `16.2.10` 고정 — `npm audit`가 취약점으로 잡지 않았고 lint
  설정 패키지라 런타임 보안과 무관해 손대지 않음(티켓 범위 밖 확장 자제).
- `@vitest/mocker` 계열 moderate 3건은 `npm audit`(dev 포함) 기준 여전히 남아있음 —
  `npm audit fix --force`가 요구하는 상향(`@vitest/browser-playwright@4.1.11`, stated range
  밖)이 필요하고 완료 조건(`--omit=dev` 기준)·계획 어디에도 없어 손대지 않음.
- `@storybook/addon-mcp`(latest→^10.6.0)·`@vitest/coverage-v8`(4.1.10→^4.1.11)는 내가 직접
  고른 변경이 아니라 `npm audit fix --force` 1회 실행의 자동 결과다(계획에 명시된 그 명령을
  그대로 실행한 산출물).

### 잔여 이슈
- staging 배포 후 실렌더 확인(홈피드·배지 상세·이미지 배지 표시)이 아직 남아있음 — 계획 5번
  항목, 배포는 이 에이전트의 권한 밖.

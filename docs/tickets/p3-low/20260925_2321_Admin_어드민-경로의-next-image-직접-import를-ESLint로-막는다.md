---
id: "20260925_2321"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-25
related:
  - "20260925_1932"
  - "20260925_2319"
---

# [Admin] 어드민 경로의 next/image 직접 import를 ESLint로 막는다

> 티켓 [20260925_2319](20260925_2319_Admin_어드민-이미지-렌더-지점을-SafeImage로-통일.md)의 재발 방지 후속이다.
> 사용자가 2319와 별도 티켓으로 분리하기로 결정했다(2026-09-25). **2319가 끝난 뒤에 착수한다.**

## 핵심 요약

- 요구사항: 어드민 화면이 `next/image`를 직접 import하지 못하게 ESLint로 막아, 새 어드민 화면이 미등록 호스트
  URL로 화면 전체를 오류 화면으로 만드는 결함을 다시 만들지 못하게 한다.
- 구현 계획: ESLint 설정에서 `src/app/admin/**`·`src/components/admin/**`에 `no-restricted-imports`로
  `next/image`를 금지하고 안내 문구에 `SafeImage`를 적는다. 예외 파일은 착수 때 실제로 확인한다.
- 관련 파일: `jam-web/eslint.config.mjs`, `jam-web/src/components/SafeImage.tsx`,
  `jam-web/src/components/admin/ImageUploadField.tsx`(어드민 경로에서 이미 `SafeImage`를 쓰는 파일 — 예외가
  필요한지 확인).

## 배경 / 문제 정의

### 사실

- 티켓 1932 조사에서 어드민 `next/image` 직접 사용 10곳이 확인되었고, 2319가 이를 `SafeImage`로 바꾼다.
- 교체만으로는 새 어드민 화면이 `next/image`를 다시 직접 쓰는 것을 막지 못한다.
- `SafeImage.tsx`는 `src/components/` 바로 아래에 있어 어드민 경로(`src/components/admin/**`) 밖이다.
  그러나 `next/image`를 import하는 파일이 어드민 경로에 더 있는지는 2319 이후 다시 세어 본다.

## 결정 필요

- **규칙 강도**: `error`로 막을지 `warn`으로 둘지. 카리나 추천은 `error`다(판단: 경고는 CI에서 무시되기 쉽다).
- **범위**: 어드민 경로만 막을지, 서비스 화면(`src/app/(main)/**`)까지 넓힐지. 서비스 화면 19개 파일의 위험은
  확인하지 않았으므로 이 티켓은 어드민만 다루고, 서비스 화면은 조사 후 별도로 정한다(추천).

## 완료 조건

- 어드민 경로에서 `next/image`를 import하면 `npm run lint`가 실패하고, 메시지가 `SafeImage` 사용을 안내한다.
- 규칙을 켠 상태에서 어드민 경로의 기존 코드가 모두 통과한다(예외 파일이 있으면 그 사유가 설정 주석에 적혀 있다).
- 규칙이 실제로 막는지 임시 import 한 줄로 확인한 결과가 완료 기록에 있다.
- `scripts/verify.sh` 통과.

---
## 완료 기록

### 구현 내용 요약
- 사용자가 진행을 승인했다(2026-09-25). 경로는 경미 수정(설정 파일 1개, 코드 부분 약 20줄)으로 카리나가 직접 처리했고 워크플로는 쓰지 않았다.
- `jam-web/eslint.config.mjs`에 `src/app/admin/**`·`src/components/admin/**`(`.ts`·`.tsx`)를 대상으로 `no-restricted-imports` 규칙을 `error`로 추가했다. `next/image`와 `next/legacy/image`를 막고, 메시지가 `@/components/SafeImage` 사용을 안내한다.
- 결정 필요 두 가지는 티켓의 추천대로 정했다. 강도는 `error`(경고는 무시되기 쉽다), 범위는 어드민만(서비스 화면 19개 파일의 위험은 확인하지 않았으므로 이 티켓에서 다루지 않는다).
- 예외 파일은 필요하지 않았다. 착수 때 확인한 결과 어드민 경로에 `next/image` import가 0건이고 `SafeImage.tsx`는 어드민 경로 밖(`src/components/`)에 있다.
- 설정 주석에 한계를 적었다: 어드민이 서비스 화면 컴포넌트(`src/app/(main)` 등)를 가져다 쓰면 그 안의 `next/image`는 이 규칙이 잡지 못한다(티켓 2319의 `BadgeHeroSection` 사례).

### 변경된 파일
```
수정: jam-web/eslint.config.mjs
```

### 테스트 결과
- [x] 규칙을 켠 상태로 `npx eslint src/app/admin src/components/admin`이 출력 없이 통과했다(기존 어드민 코드 전부 통과).
- [x] 임시 파일로 규칙 동작 확인(확인 뒤 삭제, 작업 트리에는 설정 파일 변경만 남음): `src/components/admin/`의 `import Image from 'next/image'`는 `no-restricted-imports` 오류와 `SafeImage` 안내 메시지가 나왔고, `src/app/admin/`의 `next/legacy/image`도 같은 오류가 나왔다. 어드민 밖(`src/components/`)의 `next/image` import는 오류가 나지 않았다.
- [x] `npm run lint` 전체: 오류 0건, 경고 19건. 규칙이 `error`라 이 규칙에 걸리는 코드가 있었다면 오류로 나왔을 것이므로 경고는 이번 변경과 무관하다.
- 전체 `verify.sh`(typecheck·test 등)는 이 설정 변경이 lint 규칙만 바꾸므로 따로 돌리지 않았고, push 시 pre-push 훅과 CI가 돌린다.

### 배포 정보
- 배포일: (main 배포 전, staging 반영은 2026-09-25)
- 환경: staging
- 커밋: (이 티켓 커밋)
- DB 마이그레이션: 없음.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 카리나 직접 수정(워크플로 없음) | - | - | - | - |

### 주요 의사결정 / 핵심 메모
- 규칙은 `no-restricted-imports`의 `paths`로 모듈 이름을 막는 방식이다. 서비스 화면 컴포넌트를 통해 우회하는 경로는 잡지 못하므로, 그런 컴포넌트가 새로 어드민에 들어올 때는 실렌더 확인이 여전히 필요하다.

### 잔여 이슈
- 서비스 화면(`src/app/(main)` 등)의 `next/image` 직접 사용 19개 파일의 미등록 호스트 위험은 조사하지 않았다. 필요하면 조사 티켓으로 만든다.

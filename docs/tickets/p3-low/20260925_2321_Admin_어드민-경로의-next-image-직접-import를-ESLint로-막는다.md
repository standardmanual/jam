---
id: "20260925_2321"
category: Admin
priority: P3
status: OPEN
created: 2026-09-25
closed:
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
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

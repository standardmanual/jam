---
id: 20260906_1813
category: Infra
status: CLOSED
created: 2026-09-06
closed: 2026-09-06
---

# [Infra] v5_doc_build.mjs 경로 하드코딩 제거

## 배경 / 문제 정의
> 왜 이 작업이 필요한가. 현재 상태와 기대 상태의 차이.

`Service Plan/Specs/Content/v5_doc_build.mjs` 상단의 경로 상수 `R`이 특정 PC의 절대경로
(`/Volumes/뚝섬하드/시현/JAM!/Service Plan/Specs/Content/`)로 하드코딩되어 있었다.

CLAUDE.md 규칙에 따르면 이 프로젝트는 PC마다 작업 폴더 절대경로가 다르다
(외장 드라이브 PC: `/Volumes/뚝섬하드/시현/JAM!`, 그 외 PC: `~/Desktop/JAM!`). 이 상태로는
외장 드라이브가 아닌 PC나 워크트리에서 스크립트를 실행하면 즉시 `ENOENT`로 실패한다.

같은 폴더의 `v5_seed_build.py`는 이미 `os.path.dirname(os.path.abspath(__file__))`로
스크립트 파일 기준 상대경로를 쓰고 있어, `v5_doc_build.mjs`만 뒤처져 있던 상태였다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `v5_doc_build.mjs`가 `import.meta.url` 기반으로 자기 파일 위치를 계산해 그 디렉터리를
  입출력 기준 경로로 쓰도록 변경
- 산출물(`ACTIVITY_BADGES.md`) 내용은 절대 변경되지 않아야 한다 — 경로 해석 방식만 바꾼다

### UI/UX 관점 (해당 시)
- 해당 없음

### 컨텐츠 관점 (해당 시)
- 해당 없음 (컨텐츠 내용 변경 없음, 생성 스크립트의 경로 해석만 수정)

## 구현 계획
> 어떻게 구현할지. 접근 방법, 영향 범위, 주요 변경 포인트.

`v5_seed_build.py`와 동일한 패턴을 Node.js ESM 방식으로 이식한다:
`path.dirname(fileURLToPath(import.meta.url))`로 스크립트 파일 기준 디렉터리를 구해
기존 `R` 상수를 대체한다. `R`을 참조하는 3곳(입력 파일 3개 읽기, 출력 파일 1개 쓰기)은
그대로 유지된다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`v5_doc_build.mjs` 상단의 `const R = '/Volumes/뚝섬하드/...'` 하드코딩 절대경로를
`path.dirname(fileURLToPath(import.meta.url)) + path.sep`로 교체했다. `node:path`,
`node:url`의 `fileURLToPath`를 새로 import했다. 이 외 로직은 전혀 손대지 않았다.

### 변경된 파일
```
Service Plan/Specs/Content/v5_doc_build.mjs
Service Plan/Tickets/20260906_1813_Infra_v5_doc_build_경로_하드코딩_제거.md (본 티켓)
```

### 테스트 결과
- [x] `node "Service Plan/Specs/Content/v5_doc_build.mjs"` 실행 → 정상 종료
      (`생성: 1207 줄 · 194 계열 · 630 종`)
- [x] 산출물을 수정 전 커밋 상태의 `ACTIVITY_BADGES.md`와 diff — 수정 전 하드코딩 경로
      스크립트를 그대로(무수정) 실행했을 때와 **바이트 단위로 동일한 결과**임을 확인.
      (참고: 현재 git에 커밋된 `ACTIVITY_BADGES.md`에는 티켓 `20260906_1305`에서 수기로
      덧붙인 6줄짜리 한계 안내 문단이 있는데, 이는 원본 스크립트를 무수정 상태로 실행해도
      동일하게 빠지는 **기존부터 있던 별개 차이**다 — 후속 티켓 `20260906_1420`에서 생성기가
      등급별 설명을 읽도록 고치면 자연히 해소된다. 본 티켓은 경로 해석 방식만 다루므로
      이 문단 자체는 건드리지 않았고, 실행 후 산출물은 git 커밋 상태로 되돌려 두었다)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 해당 없음 — 내부 빌드 스크립트 경로 처리만 변경, 사용자 노출 텍스트 없음

### 배포 정보
- 배포일: 해당 없음 — 서비스 런타임 코드가 아닌 로컬 문서 생성 스크립트라 Vercel 배포 대상이
  아니다. staging 브랜치에 push하는 것으로 충분하다.
- 환경: N/A (개발 도구 스크립트)
- 커밋: (staging push 시 기록)

### 주요 의사결정 / 핵심 메모
- `v5_seed_build.py`가 이미 쓰던 "스크립트 파일 기준 디렉터리" 패턴을 그대로 따라, 팀
  내 두 빌드 스크립트의 경로 해석 방식을 통일했다.
- 산출물(`ACTIVITY_BADGES.md`)은 이번 작업으로 재생성하지 않고 git 커밋 상태를 유지했다 —
  경로 수정과 컨텐츠 재생성은 별개 관심사이고, 재생성 시 위에서 확인한 기존 6줄 차이가
  실제로 파일에 반영되어 버리면 이 티켓의 스코프를 벗어나는 컨텐츠 변경이 되기 때문이다.

### 잔여 이슈
- `v5_doc_build.mjs`가 등급별 설명(`등급별설명`)을 아직 읽지 못해 `ACTIVITY_BADGES.md`의
  최저 등급 문장만 싣는 한계는 이미 티켓 `20260906_1305`에서 후속 과제(`20260906_1420`)로
  넘겨져 있다 — 본 티켓과 무관하게 그대로 남아 있다.

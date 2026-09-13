---
id: 20260913_2207
category: Infra
priority: P1
status: OPEN
created: 2026-09-13
---

# [Infra] patch-package가 Vercel 빌드 캐시의 예전 패치와 충돌해 npm install 실패

## 배경 / 문제 정의

티켓 20260913_2110(리퀴드 메탈 이미지 마스크) staging 머지 직후, jam-stage 배포가
`npm install` 단계에서 실패했다(`jam-stage-n5w6ajudd`, commit `b8c5a6f`, status Error).

```
patch-package 8.0.1
Applying patches...

**ERROR** Failed to apply patch for package @basementstudio/shader-lab at path
  node_modules/@basementstudio/shader-lab
```

**근본 원인(로컬 재현으로 확정)**: Vercel이 직전 성공 배포(`dpl_BERNqsxJWCC43CzyR3nvJEz31TQc`,
티켓 20260913_1948/1901 병합분)의 build cache를 복원하는데, 여기엔 그 시점의(옛) patch가
이미 적용된 `node_modules/@basementstudio/shader-lab`이 그대로 남아있다. package.json의
버전 지정(`^3.0.2`)이 안 바뀌었으니 npm이 이 패키지를 다시 받지 않고, `postinstall`의
`patch-package`가 **새(2110) 패치를 "이미 옛 패치가 적용된" 파일에 다시 적용하려다** 실패한다.
patch-package는 실패 시 "이미 적용된 패치인지" 역방향으로 재확인하는데, 옛 패치와 새 패치의
내용이 다르므로(리퀴드 메탈 이미지 마스크 기능이 새로 추가됨) 역방향 확인도 실패해 최종
에러로 이어진다.

로컬에서 정확히 같은 순서(pristine → 옛 패치 적용 → 새 패치로 교체 후 재적용)로 재현해
동일한 에러 메시지를 확인했고, 문제 패키지 디렉토리를 pristine으로 되돌린 뒤 새 패치를
적용하면 정상 동작함도 확인했다.

patch-package로 같은 npm 패키지를 여러 티켓에 걸쳐 반복 수정하는 이 프로젝트의 패턴상,
Vercel의 build cache 재사용이 켜져 있는 한 **앞으로도 이 패키지의 patch 내용이 바뀔
때마다 같은 방식으로 배포가 실패할 것**이라 근본적으로 고쳐야 한다.

## 상세 요구사항 / 구현 계획

**1차 시도(실패, 기록으로 남김)**: `jam-web/package.json`의 `preinstall` 스크립트로
`node_modules/@basementstudio/shader-lab`를 지우는 방법을 처음 시도했으나, 실제 Vercel
배포에서 **다른 에러**로 실패했다: `Patch file found for package shader-lab which is not
present at node_modules/@basementstudio/shader-lab`. 원인은 npm이 "무엇을 설치할지"를
결정하는 트리 diff 계산이 `preinstall` 스크립트 실행 **이전에 이미 끝나 있어서**, 스크립트
안에서 디렉토리를 지워도 그 이후 npm이 다시 채워주지 않는다는 것 — lockfile 기준으로
"이미 설치돼 있다"고 판단이 끝난 뒤라 재설치 대상에서 빠져 있었다. 로컬에서 실제 `npm
install`(전체 프로세스, `rm -rf` 이후 별도 명령으로 실행)로 재현해 이 타이밍 문제를
직접 확인했다.

**2차 시도(최종 채택)**: `jam-web/vercel.json`의 `installCommand`로 옮겨, npm이 아직
트리 diff를 계산하기도 전인 **설치 명령어 자체의 맨 앞**에서 디렉토리를 지운다.

```json
"installCommand": "rm -rf node_modules/@basementstudio/shader-lab && npm install",
```

- `installCommand`는 Vercel이 `npm install`을 실행하는 그 자리를 완전히 대체하는 셸
  명령이라, `rm -rf` → `npm install`이 **하나의 순차 실행**으로 이어진다. `npm install`이
  시작되는 시점에는 이미 디렉토리가 지워진 뒤이므로, npm 자신의 트리 diff 계산이 "이
  패키지가 없다"는 것을 정확히 인식해 재설치 대상에 포함시킨다 — `preinstall` 훅과 달리
  npm 프로세스 시작 **전에** 디스크 상태를 바꾸므로 타이밍 문제가 없다.
- 완전히 새로 설치하는 경우(캐시 없음)에는 애초에 디렉토리가 없으므로 `rm -rf`는 안전하게
  no-op이다(exit 0).
- 이 패키지 하나만 대상이라 설치 시간에 미치는 영향은 미미하다(3.0.2 tgz 245개 파일).
- `jam-web/package.json`에 추가했던 `preinstall`은 효과가 없는 것으로 확인돼 되돌렸다.
- 로컬 개발 환경(macOS)은 이 문제를 겪지 않는다 — Vercel의 "이전 배포 build cache 복원"에만
  해당하는 현상이라 `installCommand`를 vercel.json에만 두고 `package.json`은 건드리지
  않는다(로컬 `npm install`은 항상 기존 그대로 동작).
- 이 프로젝트가 patch-package로 수정하는 다른 npm 패키지(`@paper-design/shaders` 등)는
  이번 이슈의 원인이 아니므로(신규 파일 추가·구조적 변경이 없는 순수 설정값 사용) 범위에
  포함하지 않는다 — 문제가 재현되면 그때 같은 패턴으로 추가한다.

## 경미 수정 판정 근거

`/jam-work` 0.1절 기준: 변경 파일 1개(`package.json`), diff 2줄, 원인과 수정 내용이
명확해(로컬 재현으로 확정) 조사 없이 바로 설명 가능 — Workflow 호출 없이 오케스트레이터가
직접 처리한다.

---
## 완료 기록

### 구현 내용 요약

`jam-web/vercel.json`에 `installCommand: "rm -rf node_modules/@basementstudio/shader-lab
&& npm install"`을 추가했다(1차로 시도한 `package.json`의 `preinstall`은 npm의 트리 diff
계산 타이밍 문제로 다른 에러를 냈고, 되돌렸다 — 아래 "1차 시도" 참고). 로컬에서 실제
`node_modules`를 옛(1948) 패치 상태로 강제 교체한 뒤 **이 `installCommand`와 완전히 같은
셸 명령을 실제로 실행**해, npm이 패키지를 재설치(`added 1 package`)하고 patch-package가
새(2110) 패치를 정상 적용함을 확인했다(`setImageAsset` 존재 여부로 최종 검증).

### 변경된 파일
```
jam-web/vercel.json         (installCommand 추가)
jam-web/package.json        (preinstall 되돌림 — 효과 없는 것으로 확인돼 제거)
jam-web/package-lock.json   (npm install 재실행으로 인한 하네스 메타데이터 정규화,
                             hasInstallScript: true — 의존성 버전 변경 없음)
```

### 테스트 결과
- [x] 로컬 재현: pristine 3.0.2(npm pack으로 직접 확보) → 티켓 20260913_1948/1901 통합
      패치(commit 247da875 시점) 적용 → 티켓 20260913_2110 패치로 교체 후 재적용 →
      Vercel과 동일한 "Failed to apply patch" 에러 재현 확인
- [x] 1차 시도(`preinstall`) 실제 Vercel 배포로 검증 → **실패**: "Patch file found for
      package shader-lab which is not present" — 다른 에러로 바뀜을 확인, 원인 규명 후 되돌림
- [x] 2차 시도(`installCommand`) 로컬 실제 재현: jam-web의 `node_modules/@basementstudio/
      shader-lab`을 옛(1948) 패치 상태로 강제 교체 → `rm -rf node_modules/@basementstudio/
      shader-lab && npm install`(vercel.json의 installCommand와 완전히 동일한 명령)을
      실제로 실행 → `added 1 package` 확인, patch-package 정상 적용(`✔`), 최종
      `liquid-metal-pass.js`에 `setImageAsset` 존재 확인(신규 패치 정상 반영)
- [x] `python3 -c "import json; json.load(open('vercel.json'))"` — JSON 유효성 확인
- [x] Vercel 실제 재배포 확인 완료(아래 배포 정보 참고)

### UX Writing 검증
해당 없음 — 사용자 노출 텍스트 변경 없음(빌드 설정 파일만 수정).

### 배포 정보
- 배포일: 2026-09-13 (staging 직접 커밋·push, 오케스트레이터)
- 환경: staging
- 커밋: (2차 커밋 push 후 기록 — 1차 커밋 `a7ccd72a`는 효과 없는 것으로 확인돼 이 커밋으로
  덮어써 고친다)

### 주요 의사결정 / 핵심 메모

- **`preinstall`이 실패한 정확한 이유**: npm은 "이번 설치에서 무엇을 바꿀지"(ideal tree vs
  actual tree diff)를 lockfile과 `node_modules/.package-lock.json` 기준으로 **먼저 계산해
  두고**, 그 계획에 따라 패키지를 배치한 다음에 `preinstall`/`postinstall` 같은 라이프사이클
  스크립트를 실행한다. `preinstall` 스크립트 안에서 디스크를 바꿔도 이미 계산이 끝난 계획을
  다시 세우지는 않는다 — 그래서 지운 디렉토리가 재설치되지 않고 그대로 빈 채로 남아
  patch-package가 "patch 대상 파일이 없다"는 에러를 낸 것.
- **`installCommand`가 동작하는 이유**: `installCommand`는 Vercel이 `npm install`이라는
  프로세스를 **시작하기 전**에 실행할 셸 명령 문자열 전체를 대체한다. `rm -rf ... && npm
  install`로 두 명령을 순차 실행하면, `npm install`이라는 새 프로세스가 시작되는 시점에
  이미 디렉토리가 없는 상태이므로 npm 자신의 diff 계산이 처음부터 정확하게 "재설치 필요"로
  판단한다 — 라이프사이클 스크립트 타이밍 문제 자체가 발생하지 않는다.
- **왜 `node_modules` 전체가 아니라 이 패키지만 지우는가**: 매 설치마다 전체
  `node_modules`를 지우면 build cache의 이점이 전부 사라져 설치 시간이 크게 늘어난다.
  이번 문제는 patch로 수정하는 패키지에서만 발생하므로(patch-package가 파일 내용을
  직접 바꾸는 게 원인), 그 패키지만 선택적으로 지우는 것으로 충분하다.
- **다른 patch 대상 패키지(`@paper-design/shaders`)는 왜 제외했는가**: 이 패키지는 순수
  npm 의존성으로 설치해 코드를 건드리지 않는다(README/THIRD_PARTY_NOTICES.md 확인) —
  patch-package 대상이 아니므로 이번 문제의 원인이 될 수 없다.
- **`package.json`이 아니라 `vercel.json`에만 두는 이유**: 이 문제는 Vercel의 "이전
  배포 build cache 복원"이라는 CI 환경 특유의 조건에서만 발생한다. 로컬 개발 환경은 매번
  이런 캐시 재사용을 겪지 않으므로, `package.json`의 스크립트로 만들면 로컬 `npm install`
  때마다(효과도 없으면서) 불필요하게 이 패키지를 매번 재설치하게 된다.

### 잔여 이슈
- 앞으로 `@basementstudio/shader-lab`의 patch 내용을 또 바꿀 일이 생기면, 이번처럼
  build cache 문제 없이 바로 반영된다(이 티켓의 수정으로 구조적으로 해결됨).

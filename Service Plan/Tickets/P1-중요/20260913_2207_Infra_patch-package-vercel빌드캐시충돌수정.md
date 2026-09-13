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

`jam-web/package.json`의 `preinstall` 스크립트로 `node_modules/@basementstudio/shader-lab`
디렉토리를 매 설치마다 강제로 삭제해, npm이 항상 이 패키지를 pristine 상태로 다시 받게
만든다 — `postinstall`의 patch-package가 항상 pristine 대상에 패치를 적용하도록 보장한다.

```json
"preinstall": "rm -rf node_modules/@basementstudio/shader-lab",
"postinstall": "patch-package",
```

- `preinstall`은 npm 라이프사이클상 의존성 설치(fetch/extract) **이전**에 실행되므로,
  Vercel의 build cache가 이 디렉토리를 이미 채워놓은 상태라도 삭제 후 npm의 정상 설치
  단계가 lockfile 기준으로 다시 채워 넣는다 — 매번 pristine 보장.
- 완전히 새로 설치하는 경우(캐시 없음)에는 애초에 디렉토리가 없으므로 `rm -rf`는 안전하게
  no-op이다.
- 이 패키지 하나만 대상이라 설치 시간에 미치는 영향은 미미하다(3.0.2 tgz 245개 파일).
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

`jam-web/package.json`에 `preinstall: "rm -rf node_modules/@basementstudio/shader-lab"`을
추가했다. 로컬 재현 테스트(pristine → 1948 패치 적용 → 2110 패치로 교체 후 재적용)로
정확히 같은 에러를 재현한 뒤, 문제 패키지 디렉토리를 pristine으로 되돌리고 재적용하면
정상 동작함을 확인해 이 수정이 근본 원인을 해결함을 검증했다.

### 변경된 파일
```
jam-web/package.json  (preinstall 스크립트 추가, 2줄)
```

### 테스트 결과
- [x] 로컬 재현: pristine 3.0.2(npm pack으로 직접 확보) → 티켓 20260913_1948/1901 통합
      패치(commit 247da875 시점) 적용 → 티켓 20260913_2110 패치로 교체 후 재적용 →
      Vercel과 동일한 "Failed to apply patch" 에러 재현 확인
- [x] 수정 검증: 위 실패 상태에서 문제 패키지 디렉토리를 pristine으로 재설치(= preinstall이
      할 일을 시뮬레이션) 후 재적용 → 정상 성공(`✔`) 확인
- [x] `python3 -c "import json; json.load(open('package.json'))"` — JSON 유효성 확인
- [ ] Vercel 실제 재배포 확인 (이 완료 기록 작성 직후 staging push로 트리거해 확인 예정)

### UX Writing 검증
해당 없음 — 사용자 노출 텍스트 변경 없음(빌드 설정 파일만 수정).

### 배포 정보
- 배포일: 2026-09-13 (staging 직접 커밋·push, 오케스트레이터)
- 환경: staging
- 커밋: (push 후 기록)

### 주요 의사결정 / 핵심 메모

- **왜 `preinstall`인가, `postinstall`에서 처리하지 않는가**: `postinstall`(patch-package)이
  실행되는 시점엔 이미 npm의 의존성 설치 단계가 끝난 뒤라, 그 시점에 디렉토리를 지워봐야
  다시 채워주는 주체가 없다(npm이 이미 "설치 끝났다"고 판단한 뒤이므로). `preinstall`은
  npm이 의존성을 설치하기 **이전**에 실행되므로, 이 시점에 디렉토리를 지우면 npm의 정상
  설치 로직이 lockfile 기준으로 다시 채워 넣는다.
- **왜 `node_modules` 전체가 아니라 이 패키지만 지우는가**: 매 설치마다 전체
  `node_modules`를 지우면 build cache의 이점이 전부 사라져 설치 시간이 크게 늘어난다.
  이번 문제는 patch로 수정하는 패키지에서만 발생하므로(patch-package가 파일 내용을
  직접 바꾸는 게 원인), 그 패키지만 선택적으로 지우는 것으로 충분하다.
- **다른 patch 대상 패키지(`@paper-design/shaders`)는 왜 제외했는가**: 이 패키지는 순수
  npm 의존성으로 설치해 코드를 건드리지 않는다(README/THIRD_PARTY_NOTICES.md 확인) —
  patch-package 대상이 아니므로 이번 문제의 원인이 될 수 없다.

### 잔여 이슈
- 앞으로 `@basementstudio/shader-lab`의 patch 내용을 또 바꿀 일이 생기면, 이번처럼
  build cache 문제 없이 바로 반영된다(이 티켓의 수정으로 구조적으로 해결됨).

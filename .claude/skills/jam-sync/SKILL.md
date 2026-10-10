---
name: jam-sync
description: JAM! 프로젝트를 로컬(여러 PC)과 GitHub 사이에 동기화한다. PC에서 작업을 마무리할 때(커밋+push) 또는 새 PC·오랜만에 여는 세션에서 작업을 이어갈 때(pull + 시크릿 링크 점검) 양방향으로 쓴다. "동기화해줘", "깃허브랑 맞춰줘", "여기서 이어서 작업할게", "작업 끝났으니 올려줘", "/jam-sync" 같은 요청에 사용.
---

# /jam-sync — 로컬 ↔ GitHub 동기화

이 프로젝트는 여러 PC를 오가며 작업하고, 작업 폴더는 아이클라우드 밖(`~/Desktop/JAM!`)에,
시크릿 파일(`.mcp.json`, `.vercel`, `jam-web/.env.local`)만 아이클라우드의 `JAM-secrets` 폴더에
두고 심볼릭 링크로 연결한 구조다. 이 스킬은 그 구조를 전제로 동작한다.

**저장소는 하나다.** 작업 폴더 자체가 `standardmanual/jam`(브랜치 `staging`)이고, 문서가 들어 있는
`docs/`도 그 안의 평범한 폴더다. 2026-09-18에 기획·운영 문서를 별도 저장소(`jam-doc`)로
분리했다가 2026-09-20에 되돌렸고(티켓 20260920_1412), 2026-10-10에 옛 `jam-doc/` 루트를 `docs/`로
합쳤다(티켓 20261010_1214). 따라서 커밋도 push도 한 번이면 된다.

> **2026-10-10 이후 처음 pull하는 PC.** 옛 `jam-doc/`·`docs/specs/` 안의 추적 파일은 새 경로로 옮겨진다.
> 추적 밖 파일(옵시디언이 만든 `.obsidian/` 등)이 남아 `jam-doc/` 폴더가 그대로 있어도 동작에는 문제가
> 없다. 옵시디언 볼트를 `jam-doc/`로 열고 있었다면 볼트 경로를 `docs/`(또는 작업 폴더 루트)로 바꾼다.

> **옛 분리 구조가 남아 있는 PC를 처음 여는 경우.** `jam-doc/.git`이 존재하면 그 PC는 아직
> 분리 시절 상태다. 그대로 pull하면 문서 파일이 충돌하므로 아래 「분리 구조 정리」를
> 먼저 수행한다(이 절차의 `jam-doc/`는 옛 PC에 남은 중첩 저장소 폴더를 가리킨다).

## 0. 상태 진단 (항상 먼저)

```bash
git -C "<repo>" status --short
git -C "<repo>" fetch origin --quiet
git -C "<repo>" log --oneline HEAD..origin/staging   # 로컬이 뒤쳐진 커밋
git -C "<repo>" log --oneline origin/staging..HEAD   # 로컬에만 있는(미푸시) 커밋
test -d "<repo>/jam-doc/.git" && echo "옛 분리 구조가 남아 있음 — 아래 절차 필요"
```

분기:
- **`jam-doc/.git`이 있음** → 「분리 구조 정리」를 먼저 하고 다시 진단한다
- **미커밋 변경이 있음** → A. 마무리(push) 흐름
- **미커밋 변경 없고, 로컬에만 있는 커밋이 있음** → A 흐름 중 push 단계만
- **미커밋 변경 없고, origin이 앞서있음** → B. 시작(pull) 흐름
- **양쪽 다 앞서있음(diverge)** → 자동 병합하지 않는다. 각 커밋 목록을 그대로 보고하고 사용자에게 묻는다
- **완전히 동일** → "이미 최신 상태입니다" 보고 후 종료

## 분리 구조 정리 (옛 PC를 처음 열 때 1회)

`jam-doc/`이 별도 저장소였던 흔적을 지우고, 문서를 `jam`이 관리하는 `docs/`로 되돌린다.

```bash
cd "<repo>/jam-doc"
git status --short                 # ① 커밋하지 않은 변경이 있는지 먼저 확인
git log --oneline origin/main..HEAD  # ② push하지 않은 커밋이 있는지 확인
```

①②에 내용이 있으면 **멈추고 사용자에게 보고한다.** 그 작업물은 재통합된 저장소로 옮겨야
하므로, 해당 파일을 따로 복사해 둔 뒤 진행 여부를 묻는다.

둘 다 비어 있으면(= 원격에 이미 다 올라가 있으면) 아래를 실행한다.

```bash
cd "<repo>"
rm -rf jam-doc                     # ③ 옛 복제본을 통째로 지운다
git fetch origin staging
git pull origin staging            # ④ 문서가 docs/ 아래로 새로 내려온다
ls docs/service/content/TRIBES.md   # ⑤ 확인
```

③이 불안하면 지우는 대신 `mv jam-doc ../jam-doc-backup`으로 옮겨 둬도 된다. 확인이 끝난 뒤
지우면 된다.

## A. 마무리(push) 흐름 — PC에서 작업 끝낼 때

1. `git status`로 바뀐 파일 목록을 사용자에게 보여준다.
2. **아이클라우드 중복 파일 패턴 감지**: 파일명이 `이름 2.확장자`, `이름 3.확장자`처럼 공백+숫자로
   끝나는 게 섞여 있으면 즉시 커밋하지 말고 먼저 보고한다. 과거 아이클라우드 동기화 충돌로
   이런 파일이 대량 발생한 적이 있다. `JAM-secrets` 폴더(계속 아이클라우드 동기화 중)에서 특히
   주의해서 확인한다.
   - 원래 이름 자리가 비어있으면: 접미사만 제거하고 정식 이름으로 복원
   - 원래 이름 파일도 존재하고 내용이 다르면: 둘 다 진짜 다른 파일이니 임의로 합치지 않는다
   - 내용이 완전히 같으면: 순수 중복이니 접미사 붙은 쪽을 삭제
3. 변경 내용을 요약해 한국어 커밋 메시지를 작성한다 (프로젝트 커밋 컨벤션 준수).
4. `git add -A && git commit -m "..." && git push origin staging`
   코드와 문서를 함께 바꿨어도 커밋 하나·push 하나로 끝난다.
5. push 후 가벼운 무결성 점검: `git fsck --no-progress`. 에러가 있으면 바로 보고한다.

## B. 시작(pull) 흐름 — 다른 PC에서 이어가거나 오랜만에 열 때

1. `git pull origin staging` (fast-forward만 허용한다. 안 되면 상황을 보고하고 판단을 구한다).
   - pull 뒤 `<repo>`에 `Service Plan/`이나 `Asset/` 폴더가 남아 있으면(옛 구조의 잔재로,
     `.DS_Store`나 무시 파일만 남은 빈 폴더다) 안에 추적 대상 파일이 없는지 확인하고 보고한 뒤 지운다.
2. **시크릿 심볼릭 링크 상태 확인**:
   ```bash
   ls -la "<repo>/.mcp.json" "<repo>/.vercel" "<repo>/jam-web/.env.local"
   ```
   깨져 있거나(broken symlink) 없으면, 아이클라우드 경로
   `~/Library/Mobile Documents/com~apple~CloudDocs/파일/Work/StandardManual/JAM-secrets/`가
   이 PC에 다운로드 완료됐는지 먼저 확인한 뒤, 아래로 재연결한다:
   ```bash
   ln -s "<JAM-secrets 경로>/.mcp.json" "<repo>/.mcp.json"
   ln -s "<JAM-secrets 경로>/.vercel" "<repo>/.vercel"
   ln -s "<JAM-secrets 경로>/jam-web/.env.local" "<repo>/jam-web/.env.local"
   ```
   (최초 셋업이 안 된 새 PC라면 이 단계에서 처음 만드는 것도 정상이다.)
3. `git config core.hooksPath`가 이 저장소의 `.githooks`로 해석되면 정상이다(상대·절대 모두). 아니면 `git config core.hooksPath .githooks`로 설정한다.
4. 이번 pull에 `jam-web/package-lock.json` 변경이 포함됐으면 `npm install` 필요 여부를 안내한다.

## 공통 — 항상 보고할 것

- 오간 커밋이 몇 개인지, 무슨 내용인지 (한국어 요약)
- 시크릿 심볼릭 링크 3개 상태 (정상/재연결함/문제있음)
- 문제가 있으면 무엇이 문제고 사용자가 뭘 해야 하는지 구체적으로

## 하지 않는 것

- diverge 상태에서 임의로 merge/rebase하지 않는다. 반드시 커밋 목록을 보여주고 지시를 받는다
- `.mcp.json` / `.vercel` / `jam-web/.env.local` 내용(토큰 등)을 절대 출력하거나 커밋하지 않는다
- `.claude/settings.local.json`은 동기화 대상이 아니다. 건드리지 않는다
- staging 외 다른 브랜치로 push하거나 main으로 승격하지 않는다 (그건 `/jam-ship`의 영역이다)

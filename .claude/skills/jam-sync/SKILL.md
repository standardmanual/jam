---
name: jam-sync
description: JAM! 프로젝트를 로컬(여러 PC)과 GitHub 사이에 동기화한다. 작업을 마무리하며 올릴 때(«올려줘·푸시해», 커밋+push) 또는 새 PC·오랜만에 여는 세션에서 작업을 이어갈 때(pull + 시크릿 링크 점검) 양방향으로 쓴다. «동기화해줘»만 있으면 상태 진단과 pull만 한다. "동기화해줘", "깃허브랑 맞춰줘", "여기서 이어서 작업할게", "작업 끝났으니 올려줘", "/jam-sync" 같은 요청에 사용.
---

# /jam-sync — 로컬 ↔ GitHub 동기화

작업 폴더는 **현재 저장소가 열린 경로**를 기준으로 삼는다. PC별 경로와 시크릿 링크 구조(아이클라우드
`JAM-secrets`)는 `docs/agents/orchestrator.md` §1·§2가 원천이다. 저장소는 `standardmanual/jam`
하나(브랜치 `staging`)라 코드와 `docs/`를 함께 바꿔도 커밋 하나로 끝난다.

**push는 사용자가 «올려줘·푸시해»처럼 올리라고 했을 때만 한다** (`CLAUDE.md` 규칙 3).
«동기화해줘»·«맞춰줘»만 들어오면 상태 진단과 pull까지만 하고, 미커밋 변경과 미푸시 커밋은 보고만 한다.

## 0. 상태 진단 (항상 먼저)

```bash
git -C "<repo>" status --short
git -C "<repo>" fetch origin --quiet
git -C "<repo>" log --oneline HEAD..origin/staging   # 로컬이 뒤쳐진 커밋
git -C "<repo>" log --oneline origin/staging..HEAD   # 로컬에만 있는(미푸시) 커밋
```

분기:
- **origin이 앞서 있음** → B. 시작(pull) 흐름
- **미커밋 변경 또는 미푸시 커밋이 있음** → push 요청이 있으면 A. 마무리(push) 흐름, 없으면 목록만 보고한다
- **양쪽 다 앞서 있음(diverge)** → 자동 병합하지 않는다. 각 커밋 목록을 그대로 보고하고 사용자에게 묻는다
- **완전히 동일** → "이미 최신 상태입니다" 보고 후 종료

## A. 마무리(push) 흐름 — 올리라는 요청이 있을 때

1. `git status`로 바뀐 파일 목록을 사용자에게 보여준다.
2. **아이클라우드 중복 파일 패턴 감지**: 파일명이 `이름 2.확장자`, `이름 3.확장자`처럼 공백+숫자로
   끝나는 게 섞여 있으면 즉시 커밋하지 말고 먼저 보고한다. 아이클라우드 동기화 충돌로 생기는
   파일이다. `JAM-secrets` 폴더(계속 아이클라우드 동기화 중)에서 특히 주의해서 확인한다.
   - 원래 이름 자리가 비어있으면: 접미사만 제거하고 정식 이름으로 복원
   - 원래 이름 파일도 존재하고 내용이 다르면: 둘 다 진짜 다른 파일이니 임의로 합치지 않는다
   - 내용이 완전히 같으면: 순수 중복이니 접미사 붙은 쪽을 삭제
3. 변경 내용을 요약해 한국어 커밋 메시지를 작성한다 (프로젝트 커밋 컨벤션 준수).
4. 파일을 경로로 적어 커밋한다: `git add -- <파일들> && git commit -m "..."`. 폴더째 넘기거나
   전체를 한꺼번에 담지 않는다. 병렬 세션이 도는 메인 폴더에서는
   `.claude/skills/jam-work/references/handling-rules.md` «메인 폴더에서 커밋» 행대로 `git commit --only`를 쓴다.
5. push 직전에 `git log --format='%h %s' origin/staging..HEAD`로 올라갈 커밋을 보여 주고
   `git push origin staging`.
6. push 후 가벼운 무결성 점검: `git fsck --no-progress`. 에러가 있으면 바로 보고한다.

## B. 시작(pull) 흐름 — 다른 PC에서 이어가거나 오랜만에 열 때

1. `git pull --ff-only origin staging`. fast-forward가 안 되면 상황을 보고하고 판단을 구한다.
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
3. 이번 pull에 `jam-web/package-lock.json` 변경이 포함됐으면 `npm install` 필요 여부를 안내한다.

훅 경로(`core.hooksPath`)는 세션 시작 때 자동으로 맞춰진다. 터미널에서 먼저 커밋하는 새 클론만
`docs/agents/orchestrator.md` §5대로 손으로 설정한다.

## 공통 — 항상 보고할 것

- 오간 커밋이 몇 개인지, 무슨 내용인지 (한국어 요약)
- 시크릿 심볼릭 링크 3개 상태 (정상/재연결함/문제있음)
- push하지 않고 남긴 미커밋 변경·미푸시 커밋
- 문제가 있으면 무엇이 문제고 사용자가 뭘 해야 하는지 구체적으로

## 하지 않는 것

- diverge 상태에서 임의로 merge/rebase하지 않는다. 반드시 커밋 목록을 보여주고 지시를 받는다
- `.mcp.json` / `.vercel` / `jam-web/.env.local` 내용(토큰 등)을 절대 출력하거나 커밋하지 않는다
- `.claude/settings.local.json`은 동기화 대상이 아니다. 건드리지 않는다
- staging 외 다른 브랜치로 push하거나 main으로 승격하지 않는다 (그건 `/jam-ship`의 영역이다)

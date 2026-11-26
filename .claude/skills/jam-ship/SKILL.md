---
name: jam-ship
description: JAM! staging 검증 후 프로덕션(main) 배포. staging 미반영 변경 확인 → 배포 전 점검표 → 롤백 계획 → 병렬 점검(민지 보안·테스트) → main 승격 → Vercel 배포 Ready·alias 검증 → 배포 후 검증 → 결과 보고까지 처리한다. "배포해줘", "프로덕션에 올려줘", "스테이징 확인했어 배포하자", "/jam-ship" 같은 요청에 사용.
---

# /jam-ship — 프로덕션 배포

사용자는 git을 직접 다루지 않는다. **"배포해줘" 한마디로 끝나야 한다.**
아래 절차를 오케스트레이터가 직접 수행하고, 각 관문에서 문제가 있으면 멈추고 보고한다.
무인 배포 경로가 이 가운데 어느 점검을 쓰는지는 `.claude/skills/jam-work/references/scheduled-jobs.md`
「무인 경로에 적용하는 점검」 한 곳에 있다.

## 1. 사전 확인 (배포 전 반드시)

```bash
git -C "<repo>" status --short          # 미커밋 변경이 있으면 먼저 처리
git -C "<repo>" fetch origin
git -C "<repo>" rev-parse origin/staging                  # 승격 대상 끝 커밋 SHIP_SHA — 여기서 고정한다
git -C "<repo>" log --oneline origin/main..<SHIP_SHA>     # 승격될 커밋 목록
```

- **승격 대상은 여기서 고정한 `SHIP_SHA`까지다.** 이후 단계(3단계 게이트·`verify.sh`, 5단계 병렬
  점검, 7단계 병합)는 모두 `origin/main..<SHIP_SHA>`를 쓴다. 점검 중 다른 세션이 staging에
  push한 커밋이 점검·승인 없이 함께 승격되는 일을 막기 위해서다.
- **미커밋 변경이 있으면**: 커밋할지 물어본다. 임의로 커밋하지 않는다.
- **승격될 커밋이 없으면**: "이미 최신입니다"라고 보고하고 종료한다.
- **승격될 커밋 목록을 사용자에게 먼저 보여준다** — 무엇이 프로덕션에 나가는지 알 수 있게.
- **JAM 2.0 출시 전에는 승격을 제안하거나 실행하지 않는다**(2026-10-15 사용자 결정, 상위 티켓
  20261015_2130). JAM 2.0 디자인 시스템을 별도 브랜치 없이 staging에 바로 쌓기로 해서 staging이 main보다
  크게 앞서 있다. 배포 요청이 오면 이 결정부터 알리고 출시를 결정한 것인지 확인한다. 프로덕션 긴급 수정은
  main에서 따로 하고, 방법은 그때 사용자와 정한다.
- **JAM 2.0 출시 승격 요청을 받으면** 절차에 들어가기 전에 `docs/plan/jam2/12 JAM 2.0 오픈 전후 적용 순서.md`
  5절 「출시」의 첫 항목(남은 오픈 직전 SQL 290·291 → 읽기 확인 → `/jam-ship`)을 먼저 알리고 그대로 따른다.
  같은 절의 «스테이징 테스트 계정 샘플 제외», 6절 「출시 직후」의 SQL(266~274), 티켓 20261031_1525에 남은
  «배포 뒤 크론 수동 호출 확인»(`CRON_SECRET`은 사용자가 준비)도 함께 알린다.

## 2. staging 검증 상태 확인

사용자가 staging 도메인(`stage.j-a-m.app`)에서 확인을 마쳤다는 전제로 진행한다.
확인 여부가 불분명하면 **묻는다** — "스테이징에서 확인하셨나요?"

staging 배포 자체가 실패한 상태면 프로덕션 승격은 의미가 없으므로 먼저 확인한다:

```bash
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel ls jam-stage --scope standard-manual
```

## 3. 배포 전 점검표

항목마다 확인 명령·방법을 붙인다. JAM에 해당하는 장치가 없는 항목은 건너뛰지 않고 「제외
목록」에 사유를 남긴다.

### 코드 품질
- [ ] `scripts/verify.sh` 통과 — main push에는 훅·CI의 재검증이 없어(`.githooks/pre-push`는 `JAM_SHIP=1`만
  본다) 이 단계가 승격 전 유일한 재검증이다.
  로컬 `staging`을 `SHIP_SHA`에 맞춘 뒤(`git merge --ff-only <SHIP_SHA>`, `git rev-parse HEAD`로 확인) 돌린다.

### 보안
- [ ] 비밀값 미노출·새 API 라우트 인증·마이그레이션 되돌림 SQL(아래 「인프라」·4단계가 같은 결과를
  쓴다) — `node scripts/deploy-gate.mjs check --head <SHIP_SHA>`. `git fetch origin` 뒤에 실행한다.
  범위는 `origin/main` → `SHIP_SHA`다. 종료 코드가 0이 아니면(1 차단 · 2 게이트 실행 오류) 승격을 멈춘다.
  - 비밀값: jam-web에서 추가된 줄의 실제 비밀 형태만 잡는다. 걸리면 실제 값이 커밋된 것이니
    승격을 멈추고, 출력이 알려 주는 파일·줄에서 값을 폐기·교체한다.
  - 새 API 라우트: 인증 확인 호출이 없는 라우트는 의도한 공개 라우트인지 해당 티켓에서 근거를
    확인한다. 근거가 있으면 `docs/agents/contract.json`의 `deploy_gate.public_routes`에 등록해
    staging에 반영한 뒤 다시 실행하고, 근거가 없으면 승격을 멈춘다. 인증을 공용 함수에 맡기는
    라우트는 `public_routes`가 아니라 `deploy_gate.auth_wrappers`에 그 함수를 선언한다(규칙은
    `contract.json`의 `deploy_gate._why`).
- [ ] 의존성 취약점 — `cd jam-web && npm audit --omit=dev` (critical·high 0건)
- [ ] (해당 시) 새 `SECURITY DEFINER` 함수가 있으면 `REVOKE ... FROM PUBLIC` 처리 여부 확인
  (가드레일 패턴 8)

### 성능
- [ ] Vercel 빌드 로그에 경고 없음 — 8단계 `vercel inspect <url> --logs`에서 겸해 확인한다.
- [ ] (해당 시) 새 쿼리에 인덱스가 필요하면 Supabase 성능 어드바이저로 확인

### 접근성
- [ ] (해당 시) 정본 컴포넌트(`jam-web/src/components/ui/`)를 변경했으면 Storybook `@storybook/addon-a11y`
  패널에서 확인한다 (전체 페이지 자동 검사는 없음 — 「제외 목록」 참고).

### 인프라
- [ ] 환경변수 —
  `NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel env ls production --scope standard-manual`을
  `jam-web/.env.example` 항목과 대조한다.
- [ ] 마이그레이션 적용 여부 — `jam-web/supabase/migrations/`의 신규 파일이 실제 운영 DB에
  적용됐는지 확인한다(가드레일 패턴 2). `supabase_migrations.schema_migrations`는 전수 기록이
  아니므로 의심되면 Supabase MCP로 실물을 대조한다. 되돌림 SQL의 동반 여부는 「보안」의
  `deploy-gate.mjs check`가 확인한다.
  **예외**: 이름에 `post_release`가 든 파일(예: `266_post_release_*.sql`)은 출시(main 승격) 뒤 사용자 승인으로 실행하는
  정리 SQL이라 **미적용이 정상**이다. 출시 전에 적용하면 옛 프로덕션 코드가 깨지므로 미적용으로 세지 않고 점검에서 뺀다.
  대신 10단계 보고에 «출시 뒤 실행 대기 목록»으로 올린다.
- [ ] 루트 응답(DNS·SSL 겸함) — 8단계의 `curl https://j-a-m.app` 확인으로 겸한다.

### 문서
- [ ] 이번에 승격되는 티켓들의 완료 기록·문서 갱신안이 커밋에 반영됐는지 확인한다
  (`docs/tickets/`).
- [ ] 이번 변경이 건드리는 PRD·컨텐츠·배지엔진 문서(`CLAUDE.md` 문서 체계 ①~⑤)가 최신인지
  확인한다.

### 제외 목록 (JAM에 해당 없음)

| 항목 | 사유 |
|---|---|
| 번들 크기 예산 | 정의된 기준이 없다 |
| Core Web Vitals 수치 게이트 | Lighthouse CI 등 자동 측정 도구를 도입하지 않았다 |
| 전체 페이지 자동 접근성 검사(axe-core·Lighthouse CI) | 미도입 — a11y addon은 Storybook 컴포넌트 단위만 커버한다 |
| 전용 헬스체크 엔드포인트 | 없다 — 루트 `curl` 응답 확인이 그 역할을 대신한다 |
| CDN 설정 | Vercel이 자동 처리하고 JAM이 별도로 설정하는 값이 없다 |
| 캐싱 설정 | Vercel·Next.js 기본값을 쓰고 JAM 자체 캐시 정책이 없다 |
| Changelog 파일 갱신 | 연속 배포 구조라 changelog를 두지 않는다 — 티켓이 이력을 대신한다 |

## 4. 롤백 계획 (main 승격 전 필수)

아래 네 칸이 채워지지 않으면 7단계(main 승격)로 진행하지 않는다.

- **트리거 조건**: 8단계에서 프로덕션 루트 응답이 200이 아니거나 타임아웃 / 9단계에서 배포
  시각 이후 오류성 이벤트나 동기화 실패가 새로 나타났고 이번 배포의 변경과 관련이 있어 보임 /
  사용자가 특정 기능 오류를 신고. 에러율 기준선이 아직 없으므로(「하지 않는 것」의 오류 예산
  항목) "기준 대비 몇 배" 같은 수치 조건은 쓰지 않는다.
- **절차**: 트리거 조건이 충족되면 먼저 사용자에게 상황을 보고하고 롤백 승인을 받는다(승인 없는
  롤백은 「하지 않는 것」에 해당한다). 승인되면 직전 Ready 배포 URL을
  `vercel ls --scope standard-manual`(8단계와 같은 명령)으로 확인한 뒤
  `NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel rollback <그 URL> --scope standard-manual`로
  alias를 되돌린다(확인 프롬프트가 없어 `--yes`는 필요 없다). 새 커밋·재빌드 없이 되돌리므로 main에
  `git revert`를 만들지 않는다. 되돌린 뒤 8단계를 다시 확인하고(`node scripts/deploy-gate.mjs served`가
  읽는 서빙 배포 id가 되돌린 배포의 id로 바뀌었는지 포함) 롤백 사실과 원인을 보고한다.
- **롤백 이후의 복구**: Vercel은 롤백을 실행한 뒤 프로덕션 도메인 자동 할당을 끈다. 그 상태에서는
  main에 push한 새 배포가 Ready가 돼도 공개되지 않는다. 원인을 고친 새 배포를 공개할 때는
  `NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel promote <새 배포 URL> --scope standard-manual`로
  승격한다. 이 명령이 자동 할당도 다시 켠다. 되돌린 배포는 그 배포를 만들 때의 환경변수와 cron
  설정으로 돌아간다는 점도 함께 보고한다(Vercel 문서 「Performing an Instant Rollback」). 자동 할당
  플래그는 CLI로 조회되지 않으므로, 복구 뒤 처음 만드는 배포가 자동으로 공개되는지 8단계로 확인한다.
- **목표 복구 시간**: 코드는 롤백 승인 후 1분 이내. DB는 되돌림 SQL이 있으면 바로 실행하고(`CLAUDE.md`
  규칙 6), 없으면 원래 이번 배포에 포함하지 않았어야 한다.
- **DB 고려**: Supabase는 staging·프로덕션 공용 단일 DB라 코드 롤백이 DB 변경을 되돌리지
  않는다. 이번 배포에 새 번호 마이그레이션이 있으면 되돌림 SQL이 동반돼 있는지는 3단계
  「보안」의 `node scripts/deploy-gate.mjs check`가 확인한다(`jam-developer.md`의 `db` 규칙과 같은
  기준이다. `seed_*.sql`은 1회성 데이터 스크립트라 요구하지 않는다).

## 5. 병렬 점검

4단계 롤백 계획 뒤, 6단계 완료 기준 전에 돈다. 카리나가 민지(`jam-reviewer`)를 **한 턴에 모드
②(배포 전 보안 점검)·③(배포 전 테스트 공백 점검)으로 동시에** 호출한다(순차 호출 금지).
커밋 범위는 1단계에서 고정한 `origin/main..<SHIP_SHA>`를 해시로 적어
넘긴다.

민지는 Agent 도구에 `isolation: "worktree"`를 주어 부르고, 프롬프트에 「지금 폴더는 너만의 격리
워크트리다」라고 밝힌 뒤 **첫 명령으로** `git fetch origin staging && git checkout --detach <SHIP_SHA>`를
실행하라고 지시한다. 민지 정의는 이 두 가지가 프롬프트에 함께 있을 때만 HEAD 이동을 허용한다. 격리
워크트리는 기본 브랜치(main) 기준으로 만들어져 staging에만 있는 변경이 보이지 않기 때문이다.

### 생략 조건
`git diff --numstat origin/main <SHIP_SHA> -- jam-web`의 추가+삭제 합계가 0줄이면(문서만
바뀐 배포) 병렬 점검을 건너뛰고 10단계 보고에 "해당 없음(jam-web 변경 0줄)"이라고 적는다. 그
밖의 유인 배포는 항상 돌린다 — 파일 수·줄 수 같은 규모 기준으로 생략하지 않는다(인증 관련 변경은
한 줄이어도 위험할 수 있다).

### 병합 규칙
- **보안 중단급 발견** → 승격을 차단한다. 사용자에게 보고하고 진행 여부는 사용자가 결정한다.
- **보안 주의급 발견** → 보고한다. 진행 여부는 사용자가 결정한다(차단하지 않는다).
- **테스트 공백** → 주의로 보고한다. 차단하지 않는다.
- 이번 배포에서 처리하지 않는 발견물은 `.claude/skills/jam-work/SKILL.md` 3.2절(범위 밖 발견물
  처리 — 자동 티켓화)과 같은 방식으로 티켓이 된다.

### `deploy-gate.mjs`와의 역할 구분
`node scripts/deploy-gate.mjs check`(3단계 「보안」)는 비밀값·신규 API 라우트 인증·되돌림 SQL을
기계로 잡는다. 민지 모드 ②·③은 그 기계 검사가 못 잡는, 판단이 필요한 위협 모델링·테스트
공백을 본다 — 서로 대체하지 않는다.

결과는 10단계 보고에 「병렬 점검」 항목으로 남긴다.

## 6. 완료 기준(Definition of Done) — 마지막 관문

7단계(main 승격) 직전, `definition-of-done.md`의 「배포 준비」 네 항목이 전부 충족돼야
진행한다. 하나라도 비어 있으면 멈추고 보고한다.

→ `.claude/skills/jam-work/references/definition-of-done.md` 「배포 준비」

## 7. main 승격

6단계 완료 기준을 통과한 뒤에만 진행한다.

먼저 로컬 `main`이 원격 `main`과 같은 이력인지 확인한다: `git -C "<repo>" fetch origin main staging &&
git -C "<repo>" merge-base --is-ancestor main origin/main`이 실패하면(공통 조상이 없거나 어긋남) 승격
명령을 실행하지 말고, 옛 `main`을 이름만 바꿔 보존한 뒤 원격에 맞춘다:
`git branch -m main main-backup-<날짜> && git branch main origin/main`. 그 뒤 아래를 진행한다.

1단계 뒤 staging에 새 커밋이 올라왔는지도 확인한다: `git -C "<repo>" log --oneline <SHIP_SHA>..origin/staging`이
비어 있지 않으면 승격하지 말고 늘어난 커밋을 사용자에게 보여 준 뒤 고르게 한다. ① `SHIP_SHA`까지만
승격한다(늘어난 커밋은 다음 배포로). ② 늘어난 커밋까지 포함한다 — `SHIP_SHA`를 새 끝으로 바꾸고 3단계
점검과 5단계 병렬 점검을 늘어난 범위에 다시 돈 뒤 승인을 다시 받는다.

```bash
git -C "<repo>" checkout main
git -C "<repo>" merge --ff-only <SHIP_SHA>       # 1단계에서 고정한 커밋. ff 불가 시 상태를 보고하고 판단을 구한다
JAM_SHIP=1 git -C "<repo>" push origin main      # pre-push 훅 통과용 환경변수
git -C "<repo>" checkout staging                 # 작업 브랜치로 복귀
```

`.githooks/pre-push`는 `JAM_SHIP=1`이 없는 main push를 차단한다. 이 스킬이 유일한 승인 경로다.

## 8. 배포 검증 (여기까지 해야 "배포 완료"다)

```bash
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel ls --scope standard-manual
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel inspect <최신-배포-url> --scope standard-manual
```

확인 항목:
- 최신 배포 상태가 **Ready**인가 (Building이면 완료까지 기다린다)
- **alias가 그 배포를 가리키는가** (`j-a-m.app` 등 프로덕션 도메인). 최신 배포가 Ready인데
  alias가 옛 배포에 머물러 있으면 이전 롤백으로 자동 할당이 꺼져 있는 상태다(4단계 「롤백
  이후의 복구」).
- Error면 빌드 로그를 확인해 원인을 보고한다 (`vercel inspect <url> --logs`)

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://j-a-m.app
node scripts/deploy-gate.mjs served
```

`served`는 프로덕션 도메인이 **실제로 서빙 중인 배포 id**를 출력한다(공개 페이지 응답 HTML의
`?dpl=dpl_…`, Vercel 인증 불필요). 이 id를 위 `vercel inspect`가 알려 주는 최신 배포의 id와
대조한다. 같으면 새 배포가 공개된 것이다. 다르면 아직 전환 전이거나 자동 할당이 꺼진 상태이므로
보고하고, 롤백 뒤라면 4단계 「롤백 이후의 복구」의 `vercel promote`가 필요한지 판단한다. `curl`의
200 응답은 옛 배포도 내므로 새 배포가 공개됐다는 증거가 되지 못한다. 종료 코드 2(네트워크 오류·
시간 초과)·3(응답은 왔으나 식별자 없음)이면 대조하지 못한 것이므로 "확인 불가"로 보고한다.

> TLS 오류(`unable to get local issuer certificate`)가 나면:
> `security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/system-ca.pem`

## 9. 배포 후 검증 (배포 직후)

카리나가 배포 직후 확인한다:
- 스테이징 자동 로그인 경로(`stage.j-a-m.app`, `/api/dev-login`)로 핵심 화면(홈피드·프로필
  등) 응답을 확인한다 — 프로덕션은 구글 로그인이 필수라 로그인 후 화면을 직접 볼 수 없으므로,
  같은 코드가 올라간 staging에서 대신 확인한다(`jam-developer.md` 규칙 10).
- `engine_decision_log`에서 배포 시각 이후 오류성 이벤트(`point_award_failed`·
  `tribe_constant_missing`·`drop_state_last_activity_mismatch`)가 급증했는지 확인한다.
- `strava_sync_failures` 테이블에서 배포 시각 이후 건수를 확인한다.

이후의 지속 관찰(Strava 동기화 실패율, 핵심 플로우 일일 점검)을 맡을 새 루틴은 여기서 만들지 않는다.
예약 루틴의 상태는 `.claude/skills/jam-work/references/scheduled-jobs.md`에 있다.

## 10. 보고

배포 완료 후 사용자에게:
- 프로덕션에 올라간 커밋 목록 (한국어 요약)
- 배포 URL과 Ready 확인 결과, alias 연결 상태
- 이번 배포에 포함된 DB 마이그레이션이 있으면 **실행 여부를 명시**
- **출시 뒤 실행 대기 목록**: 저장소에 있고 이름에 `post_release`가 든 마이그레이션 파일 가운데 아직 적용하지 않은 것(파일 이름, 선행 조건, 데이터를 잃는지). 사용자 승인으로 실행한다
- **롤백 계획 요약** (4단계에서 정한 트리거·절차·목표 시간·DB 고려) — 롤백 계획이 없으면
  7단계로 진행하지 않았어야 한다.
- **병렬 점검 결과** (5단계) — 민지 모드 ②·③의 발견물 개수·신호 분포, 생략했으면 사유
  ("해당 없음(jam-web 변경 0줄)"), 범위 밖 발견물로 만든 티켓 경로

## 하지 않는 것

- 로그인이 필요한 화면의 육안 확인 (구글 로그인 필수라 불가 — 사용자 몫)
- 사용자 승인 없는 재배포·롤백
- staging을 건너뛴 main 직접 커밋
- 단계 배포(카나리·퍼센트 롤아웃)와 기능 플래그 단계 전략 — Vercel은 프로덕션 별칭(alias)이
  하나뿐이라 트래픽을 퍼센트로 나눠 배포할 수 없다. 9단계 배포 후 검증과 4단계 롤백 계획으로
  대신한다.
- 오류 예산(Error Budget) 게이트 — 정상 에러율 기준선이 있어야 성립하는데, 카즈하의 지표 정상
  범위 정의가 아직 도입 후 과제로 남아 있다
  (`.claude/skills/jam-work/references/loop-improvements.md` 항목 7). 정해진 뒤 후속 티켓에서
  도입한다.

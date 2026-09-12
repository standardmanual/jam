---
name: jam-ship
description: JAM! staging 검증 후 프로덕션(main) 배포. staging 미반영 변경 확인 → main 승격 → Vercel 배포 Ready·alias 검증 → 결과 보고까지 처리한다. "배포해줘", "프로덕션에 올려줘", "스테이징 확인했어 배포하자", "/jam-ship" 같은 요청에 사용.
---

# /jam-ship — 프로덕션 배포

사용자는 git을 직접 다루지 않는다. **"배포해줘" 한마디로 끝나야 한다.**
아래 절차를 오케스트레이터가 직접 수행하고, 각 관문에서 문제가 있으면 멈추고 보고한다.

## 1. 사전 확인 (배포 전 반드시)

```bash
git -C "<repo>" status --short          # 미커밋 변경이 있으면 먼저 처리
git -C "<repo>" fetch origin
git -C "<repo>" log --oneline origin/main..origin/staging   # 승격될 커밋 목록
```

- **미커밋 변경이 있으면**: 커밋할지 물어본다. 임의로 커밋하지 않는다.
- **승격될 커밋이 없으면**: "이미 최신입니다"라고 보고하고 종료한다.
- **승격될 커밋 목록을 사용자에게 먼저 보여준다** — 무엇이 프로덕션에 나가는지 알 수 있게.

## 2. staging 검증 상태 확인

사용자가 staging 도메인(`jam-stage.vercel.app`)에서 확인을 마쳤다는 전제로 진행한다.
확인 여부가 불분명하면 **묻는다** — "스테이징에서 확인하셨나요?"

staging 배포 자체가 실패한 상태면 프로덕션 승격은 의미가 없으므로 먼저 확인한다:

```bash
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel ls jam-stage --scope standard-manual
```

## 3. main 승격

```bash
git -C "<repo>" checkout main
git -C "<repo>" merge --ff-only origin/staging   # ff 불가 시 상태를 보고하고 판단을 구한다
JAM_SHIP=1 git -C "<repo>" push origin main      # pre-push 훅 통과용 환경변수
git -C "<repo>" checkout staging                 # 작업 브랜치로 복귀
```

`.githooks/pre-push`는 `JAM_SHIP=1`이 없는 main push를 차단한다. 이 스킬이 유일한 승인 경로다.

## 4. 배포 검증 (여기까지 해야 "배포 완료"다)

```bash
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel ls --scope standard-manual
NODE_EXTRA_CA_CERTS=/tmp/system-ca.pem npx vercel inspect <최신-배포-url> --scope standard-manual
```

확인 항목:
- 최신 배포 상태가 **Ready**인가 (Building이면 완료까지 기다린다)
- **alias가 그 배포를 가리키는가** (`j-a-m.app` 등 프로덕션 도메인)
- Error면 빌드 로그를 확인해 원인을 보고한다

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://j-a-m.app
```

> TLS 오류(`unable to get local issuer certificate`)가 나면:
> `security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain > /tmp/system-ca.pem`

## 5. 보고

배포 완료 후 사용자에게:
- 프로덕션에 올라간 커밋 목록 (한국어 요약)
- 배포 URL과 Ready 확인 결과, alias 연결 상태
- 이번 배포에 포함된 DB 마이그레이션이 있으면 **실행 여부를 명시**

## 하지 않는 것

- 로그인이 필요한 화면의 육안 확인 (구글 로그인 필수라 불가 — 사용자 몫)
- 사용자 승인 없는 재배포·롤백
- staging을 건너뛴 main 직접 커밋

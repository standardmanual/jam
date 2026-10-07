---
id: "20261007_1620"
category: Admin
priority: P2
status: OPEN
created: 2026-10-07
closed:
parent: "20261006_1803"
---

# [Admin] 제출 토큰으로 넣은 image_spec.values의 외부 이미지 주소를 관리자 브라우저가 그대로 불러온다

> 출처: /jam-ship 2026-10-07 병렬 점검(민지 모드 ②)의 보안 주의 발견물. 이번 배포에서는 처리하지 않고 분리했다.

## 핵심 요약

- 요구사항: 운영 묶음 제출 경로가 받는 `image_spec.values`(레이어 번호별 값)에 외부 `https://` 이미지 주소가 들어와도, 관리자가 [이미지 만들기]를 눌렀을 때 브라우저가 임의 외부 주소를 불러오지 않게 한다.
- 문제: 제출 경로는 관리자 세션뿐 아니라 쓰기 토큰도 받는다. 브라우저 쪽 `applyLayerValues`(`jam-web/src/lib/asset-generator/renderPreset.ts` 88~104·159~166줄)는 절대 경로나 http(s) 주소 형식(`isImageSourceFormat`)만 검사하고, 관리자 브라우저가 `new Image()`(`crossOrigin='anonymous'`, `jam-web/src/lib/admin/opsInbox/imageRender.client.ts` 56~64줄)로 불러온다. 효과는 관리자 IP와 접속 시각이 외부 서버에 노출되는 것이다(토큰 보유자가 만든 항목을 관리자가 검토하다가 제작을 누르는 경우). 스크립트 실행은 없고 실패하면 캔버스가 오염되지 않고 오류가 난다.
- 구현 계획: 제출 검사(`jam-web/src/lib/admin/opsInbox/imageSpec.ts` `imageSpecWarnings`·`validate.ts`)에서 `values`의 이미지 주소를 이 프로젝트 저장소 호스트(`NEXT_PUBLIC_SUPABASE_URL`)의 https로 제한하는 경고 또는 오류를 더하고, 브라우저 렌더 입력 변환(`imageSpecToRenderArgs`)에서도 같은 호스트가 아니면 건너뛰거나 거절한다. 프리셋 저장 검증(`jam-web/src/lib/asset-generator/presetValidate.ts`)의 호스트 비교 함수를 공용으로 쓴다. 정책(경고만 vs 거절)은 착수 때 사용자에게 묻는다.
- 관련 파일: 위 경로, `docs/specs/prd/ops-tool/PRD.md` §3.1(`image_spec` 규칙).

## 완료 조건

- [ ] 제출된 `image_spec.values`에 이 프로젝트 저장소가 아닌 이미지 주소가 있으면 제출 검사가 알리고, 브라우저 렌더가 그 주소를 불러오지 않는다(테스트).
- [ ] 저장소 주소와 로컬 경로 값은 기존대로 동작한다.
- [ ] `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-

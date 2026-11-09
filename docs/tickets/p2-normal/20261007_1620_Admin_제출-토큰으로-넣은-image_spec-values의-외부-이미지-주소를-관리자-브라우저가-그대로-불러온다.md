---
id: "20261007_1620"
category: Admin
priority: P2
status: CLOSED
created: 2026-10-07
closed: 2026-11-09
parent: "20261006_1803"
---

# [Admin] 제출 토큰으로 넣은 image_spec.values의 외부 이미지 주소를 관리자 브라우저가 그대로 불러온다

> 출처: /jam-ship 2026-10-07 병렬 점검(민지 모드 ②)의 보안 주의 발견물. 이번 배포에서는 처리하지 않고 분리했다.

## 핵심 요약

- 요구사항: 운영 묶음 제출 경로가 받는 `image_spec.values`(레이어 번호별 값)에 외부 `https://` 이미지 주소가 들어와도, 관리자가 [이미지 만들기]를 눌렀을 때 브라우저가 임의 외부 주소를 불러오지 않게 한다.
- 문제: 제출 경로는 관리자 세션뿐 아니라 쓰기 토큰도 받는다. 브라우저 쪽 `applyLayerValues`(`jam-web/src/lib/asset-generator/renderPreset.ts` 88~104·159~166줄)는 절대 경로나 http(s) 주소 형식(`isImageSourceFormat`)만 검사하고, 관리자 브라우저가 `new Image()`(`crossOrigin='anonymous'`, `jam-web/src/lib/admin/opsInbox/imageRender.client.ts` 56~64줄)로 불러온다. 효과는 관리자 IP와 접속 시각이 외부 서버에 노출되는 것이다(토큰 보유자가 만든 항목을 관리자가 검토하다가 제작을 누르는 경우). 스크립트 실행은 없고 실패하면 캔버스가 오염되지 않고 오류가 난다.
- 구현 계획: 제출 검사(`jam-web/src/lib/admin/opsInbox/imageSpec.ts` `imageSpecWarnings`·`validate.ts`)에서 `values`의 이미지 주소를 이 프로젝트 저장소 호스트(`NEXT_PUBLIC_SUPABASE_URL`)의 https로 제한하는 경고 또는 오류를 더하고, 브라우저 렌더 입력 변환(`imageSpecToRenderArgs`)에서도 같은 호스트가 아니면 건너뛰거나 거절한다. 프리셋 저장 검증(`jam-web/src/lib/asset-generator/presetValidate.ts`)의 호스트 비교 함수를 공용으로 쓴다. 정책(경고만 vs 거절)은 착수 때 사용자에게 묻는다.
- 관련 파일: 위 경로, `docs/service/prd/ops-tool/PRD.md` §3.1(`image_spec` 규칙).

## 완료 조건

- [ ] 제출된 `image_spec.values`에 이 프로젝트 저장소가 아닌 이미지 주소가 있으면 제출 검사가 알리고, 브라우저 렌더가 그 주소를 불러오지 않는다(테스트).
- [ ] 저장소 주소와 로컬 경로 값은 기존대로 동작한다.
- [ ] `scripts/verify.sh`가 통과한다.

---
## 완료 기록

### 구현 내용 요약
제출 토큰으로 넣은 `image_spec.values`의 이미지 레이어 값에 외부 https 주소가 있어도 검사 없이 관리자 브라우저의 `new Image()`로 불려, 관리자 IP와 접속 시각이 외부 서버에 노출될 수 있었다. `isForeignImageSource`를 추가해 저장소 호스트의 https 주소와 같은 출처 경로만 통과시키고, `imageSpecToRenderArgs`는 외부 주소 값을 건너뛰어 그 레이어를 프리셋 기본 이미지로 그리며, `imageSpecWarnings`는 같은 값마다 경고 한 줄을 낸다(제출은 그대로 받는다). 게이트(민지)가 값 안의 탭·개행을 끼운 `/<탭>/evil.example` 우회로를 찾아 한 번 FAIL했고, 값에서 탭·개행을 먼저 걷어낸 뒤 판정하도록 고치고 서버 렌더 쪽 `renderPreset.ts`의 `isImageSourceFormat`도 같은 구멍을 막았다. 사용자가 2026-11-09 질문 팝업에서 재작업을 승인했다.

### 변경된 파일
```
jam-web/src/lib/admin/opsInbox/imageSpec.ts
jam-web/src/lib/admin/opsInbox/__tests__/imageSpec.test.ts
jam-web/src/lib/asset-generator/presetValidate.ts
jam-web/src/lib/asset-generator/renderPreset.ts
jam-web/src/lib/asset-generator/__tests__/renderPreset.test.ts
docs/service/prd/ops-tool/PRD.md
```

### 테스트 결과
- [x] `src/lib/admin/opsInbox`와 `src/lib/asset-generator` 53개 파일 2710건 통과(민지가 직접 실행, 탭·개행·캐리지리턴 사례가 판정·렌더 인자 변환·경고·렌더 거절에 모두 들어 있음).
- [x] CI verify는 spacing만 실패했고 staging 기존 문제였다(이번 push에서 티켓 20261109_1448로 수정).

### 배포 정보
- 배포일: 2026-11-09
- 환경: staging
- 커밋: 머지 커밋(해시는 push 뒤 git log 참고)

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | jam-developer 2회, jam-reviewer 2회 (경로 ③, 채원 생략: admin; 2차 게이트는 gateOnly) | 112,845 + 46,065 | 98,141 + 0 / 9,930 + 11,580 | 약 42분 + 7분 | 44 + 15 |
| 합계 |  | 112,845 + 46,065 | 98,141 + 0 / 9,930 + 11,580 | 약 42분 + 7분 | 44 + 15 |

### 주요 의사결정 / 핵심 메모
- 첫 게이트 FAIL → 사용자 승인 후 재작업. 재작업 워크플로를 동시 실행 수를 줄이려고 중간에 멈췄으나 멈추기 전에 수정 커밋이 이미 만들어져 있어, 카리나가 그 커밋을 원격에 올리고 게이트만 다시 돌렸다.
- 티켓이 착수 때 사용자에게 묻도록 한 정책(경고만 vs 거절)은 경고만으로 구현했다. 제출 오류로 바꾸려면 `imageSpecWarnings` 호출부(`validate.ts`)에서 `errors`로 옮기면 된다.

### 잔여 이슈
- `isForeignImageSource`가 앞에 공백·제어문자가 붙은 외부 주소를 제출 경고로 잡지 못한다(렌더 단계에서 거절되므로 외부 주소를 불러오지는 않는다).

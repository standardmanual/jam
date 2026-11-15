/**
 * 배지 공유 시트의 세 동작 — 복사·저장·더보기 (티켓 20261115_1249).
 *
 * 컴포넌트(`BadgeShareButton`)의 훅과 떼어 둔 이유는 시험이다. 저장소에 jsdom이 없어 브라우저 API
 * (`navigator.clipboard`·`navigator.share`·`<a download>`)를 대역으로 바꿔 이 함수들을 직접 부른다.
 */
import { d } from '@/lib/i18n'

type ToastType = 'success' | 'error' | 'info'
export type ShareToast = (message: string, type?: ToastType) => void

/** 공유·저장 파일명 접미사 */
const FILENAME_SUFFIX = 'badge'

export function shareFileName(badgeName: string): string {
  return `${badgeName}-${FILENAME_SUFFIX}.png`
}

export function makeShareFile(blob: Blob, badgeName: string): File {
  return new File([blob], shareFileName(badgeName), { type: 'image/png' })
}

/** `navigator.share`가 File 공유를 지원하는지 */
function supportsFileShare(): boolean {
  if (typeof navigator === 'undefined') return false
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
}

/** 이 파일을 OS 공유 시트로 보낼 수 있는지 — «더보기» 버튼을 그릴지 가르는 판정이다. */
export function canShareFile(blob: Blob, badgeName: string): boolean {
  return supportsFileShare() && navigator.canShare({ files: [makeShareFile(blob, badgeName)] })
}

/**
 * iOS(Safari 기반 웹뷰 포함) 판별 — "저장" 버튼의 동작 분기 전용.
 * iOS는 웹 표준상 사용자 승인 없이 Photos 라이브러리에 직접 쓰는 API가 없고, `<a download>`는
 * 사진 앱이 아니라 Files 앱(다운로드 폴더)에만 저장된다(플랫폼 제약 — 티켓 20260903_1122).
 * iPadOS 13+는 데스크톱 Safari와 동일한 UA 문자열을 쓰므로 UA 정규식만으로는 iPad를 못 잡는다 —
 * `MacIntel` + 멀티터치 여부로 보정한다(데스크톱 Mac은 마우스 전용이라 maxTouchPoints가 0~1).
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * «복사하기» — 이미지를 클립보드에 `image/png`로 쓴다. Safari는 사용자 동작 안에서 바로 불러야
 * 하므로 호출부는 클릭 핸들러에서 `await` 없이 이 함수를 부르고, 이 함수도 `write`를 시작하기 전에
 * `await`하지 않는다(blob은 이미 준비돼 있다). 반환하는 Promise는 쓰기가 끝나면 풀린다.
 */
export function copyImage(blob: Blob, toast: ShareToast): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') {
    toast(d.badges.shareCopyUnsupported, 'error')
    return Promise.resolve()
  }
  return navigator.clipboard
    .write([new ClipboardItem({ 'image/png': blob })])
    .then(() => toast(d.badges.shareCopySuccess, 'success'))
    .catch((err) => {
      console.error('[BadgeShareButton] 이미지 복사 실패:', err)
      toast(d.badges.shareCopyError, 'error')
    })
}

/** «더보기» — OS 공유 시트를 연다. 취소(`AbortError`)는 정상 흐름이라 조용히 넘긴다. */
export async function openShareSheet(blob: Blob, badgeName: string): Promise<void> {
  const file = makeShareFile(blob, badgeName)
  if (!supportsFileShare() || !navigator.canShare({ files: [file] })) return
  try {
    await navigator.share({ files: [file] })
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      console.error('[BadgeShareButton] 공유 실패:', err)
    }
  }
}

/**
 * «저장하기» — 배지 이미지를 스마트폰 사진 앱(카메라 롤)에 보관하려는 의도.
 *
 * 플랫폼 제약(실기기 검증 완료, 티켓 20260903_1122 참고):
 * - iOS: `navigator.share`도 `<a download>`도 사진 앱에 직접 쓰지 못한다. `<a download>`는 Files 앱
 *   다운로드 폴더에 저장될 뿐이다. 사용자가 실기기로 확인한 유일하게 동작하는 경로는
 *   `navigator.share` → OS 공유시트 → 시트 안의 "저장" 액션이므로 «더보기»(`openShareSheet`)와 같은
 *   호출을 재사용한다. 시트가 뜨면 화면 대부분을 덮으므로 열리기 직전에 토스트로 눌러야 할 액션을 안내한다.
 * - Android: `<a download>`로 다운로드 폴더에 저장하면 MediaStore가 스캔해 갤러리/사진 앱에 자동 노출된다.
 * - 데스크톱: 사진 앱 개념이 없어 `<a download>`로 파일을 내려받는 것이 곧 "저장"이다(브라우저 지정 폴더).
 */
export async function saveImage(blob: Blob, badgeName: string, toast: ShareToast): Promise<void> {
  if (isIOS()) {
    toast(d.badges.shareSaveIOSHint, 'info')
    await openShareSheet(blob, badgeName)
    return
  }

  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = shareFileName(badgeName)
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast(d.badges.shareSaveSuccess, 'success')
  } catch (err) {
    console.error('[BadgeShareButton] 이미지 저장 실패:', err)
    toast(d.badges.shareSaveError, 'error')
  }
}

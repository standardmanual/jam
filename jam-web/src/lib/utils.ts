/**
 * JAM! 공통 유틸리티
 */

/**
 * 한국 지역 목록 (시/도)
 */
export const KR_REGIONS = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
] as const

export type KrRegion = typeof KR_REGIONS[number]

/**
 * JAM! 활동 종목 레이블
 */
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  cycling: '자전거',
  running: '달리기',
  road_running: '로드러닝',
  trail_running: '트레일러닝',
  hiking: '등산',
  walking: '걷기',
}

/**
 * 배지 희귀도 레이블
 */
export const BADGE_RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  legendary: 'Legend',
  mythic: 'Mythic',
}

/**
 * 배지 희귀도 색상 (Tailwind class)
 */
export const BADGE_RARITY_COLORS: Record<string, string> = {
  common: 'text-gray-400',
  rare: 'text-blue-400',
  legendary: 'text-purple-400',
  mythic: 'text-yellow-400',
}

/**
 * 날짜 포맷 (한국어)
 */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * 상대 시간 (예: "3시간 전")
 */
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}일 전`
  return formatDate(isoString)
}

/**
 * AES-256-CBC 암호화 (서버 사이드 전용)
 * Strava access_token, refresh_token 암호화에 사용
 */
export async function encrypt(text: string): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error('encrypt()는 서버 사이드에서만 호출 가능합니다.')
  }
  const { createCipheriv, randomBytes } = await import('crypto')
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

/**
 * AES-256-CBC 복호화 (서버 사이드 전용)
 */
export async function decrypt(encryptedText: string): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error('decrypt()는 서버 사이드에서만 호출 가능합니다.')
  }
  const { createDecipheriv } = await import('crypto')
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex')
  const [ivHex, encryptedHex] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encryptedData = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * 에러 메시지 → 한국어 사용자 메시지
 */
export function getUserFriendlyError(error: unknown): string {
  console.error('[JAM!] 오류:', error)
  return '오류가 발생했어요. 잠시 후 다시 시도해주세요.'
}

/**
 * cn — Tailwind 클래스 병합 헬퍼 (clsx 없이 간단 버전)
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

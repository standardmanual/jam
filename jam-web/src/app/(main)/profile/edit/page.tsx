'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import TopNav from '@/components/ui/TopNav'
import { UserIcon } from '@/components/ui/icons'
import { useTextSwap, useErrorShake } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d } from '@/lib/i18n'

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same'

function validateFormat(value: string): string | null {
  if (value.length === 0) return d.onboarding.errorEmpty
  if (value.length > 30) return d.onboarding.errorTooLong
  if (!/^[a-z0-9._]+$/.test(value)) return d.onboarding.errorFormat
  if (value.startsWith('.') || value.endsWith('.')) return d.onboarding.errorDot
  if (value.includes('..')) return d.onboarding.errorDoubleDot
  return null
}

export default function ProfileEditPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loading, setLoading] = useState(true)
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  const [usernameInput, setUsernameInput] = useState('')
  const [checkStatus, setCheckStatus] = useState<CheckStatus>('idle')
  const [checkMessage, setCheckMessage] = useState('')

  // 이름(display_name) — 20260830_0113: username과 달리 필수값 아님·형식 제한 없음·
  // 수정 횟수 제한 없음. 중복확인도 없어 debounce·상태머신이 필요 없다.
  const [currentDisplayName, setCurrentDisplayName] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // 현재 유저 정보 로드
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) {
        router.replace('/login')
        return
      }
      supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data: raw }) => {
          if (cancelled) return
          const data = raw as { username: string | null; display_name: string | null; avatar_url: string | null } | null
          const uname = data?.username ?? null
          setCurrentUsername(uname)
          setUsernameInput(uname ?? '')
          const dname = data?.display_name ?? null
          setCurrentDisplayName(dname)
          setNameInput(dname ?? '')
          setAvatarUrl(data?.avatar_url ?? null)
          setLoading(false)
        })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 아바타 파일 선택 핸들러
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setUploadError(d.profileEdit.fileTypeError)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(d.profileEdit.fileSizeError)
      return
    }

    setUploadError('')
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      })
      const json = await res.json() as { avatar_url?: string; error?: string }
      if (json.avatar_url) {
        setAvatarUrl(json.avatar_url)
      } else {
        setUploadError(d.profileEdit.uploadError)
      }
    } catch {
      setUploadError(d.onboarding.networkError)
    } finally {
      setUploading(false)
      // 같은 파일 재선택 가능하도록 초기화
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // username 입력 핸들러 (debounce)
  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')
    setUsernameInput(raw)
    setCheckStatus('idle')
    setCheckMessage('')
    setSaveError('')

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (raw.length === 0) return

    // 현재 값과 같으면 별도 체크 불필요
    if (raw === currentUsername) {
      setCheckStatus('same')
      setCheckMessage('')
      return
    }

    const formatError = validateFormat(raw)
    if (formatError) {
      setCheckStatus('invalid')
      setCheckMessage(formatError)
      return
    }

    setCheckStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?username=${encodeURIComponent(raw)}`)
        const json = await res.json() as { available: boolean }
        if (json.available) {
          setCheckStatus('available')
          setCheckMessage(d.onboarding.available)
        } else {
          setCheckStatus('taken')
          setCheckMessage(d.onboarding.taken)
        }
      } catch {
        setCheckStatus('idle')
        setCheckMessage('')
      }
    }, 500)
  }

  // 이름 입력 핸들러 — 형식 제한 없음(인스타그램 정책 동일), maxLength로 30자에서 조용히 멈춘다
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNameInput(e.target.value)
    setSaveError('')
  }

  // username이 변경됐는지 확인
  const usernameChanged = usernameInput !== (currentUsername ?? '') && usernameInput !== ''
  // 이름은 필수값이 아니라 빈 문자열로 지우는 것도 유효한 변경(= 폴백 상태로 전환)이다
  const nameChanged = nameInput.trim() !== (currentDisplayName ?? '')

  const canSave = !saving && !uploading && (nameChanged || (usernameChanged && checkStatus === 'available'))

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    try {
      const payload: { username?: string; display_name?: string } = {}
      if (usernameChanged && checkStatus === 'available') payload.username = usernameInput
      if (nameChanged) payload.display_name = nameInput
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (json.success) {
        router.push('/profile')
      } else if (json.error === 'DUPLICATE') {
        setCheckStatus('taken')
        setCheckMessage(d.onboarding.taken)
      } else {
        setSaveError(d.profileEdit.saveError)
      }
    } catch {
      setSaveError(d.onboarding.networkError)
    } finally {
      setSaving(false)
    }
  }

  // 바이너리 컬러 원칙상 에러를 색으로 표현하지 않는다 — 보더 두께로만 상태를 구분하고 실제 안내는 메시지 텍스트로 전달
  const hasError = checkStatus === 'invalid' || checkStatus === 'taken'
  const inputBorderClass = hasError
    ? 'shadow-[inset_0_0_0_2px_var(--color-border)]'
    : 'shadow-[inset_0_0_0_1px_var(--color-border)]'

  // 중복확인 상태 메시지 — 즉시 전환 대신 Text states swap (04)
  const { ref: messageRef, initialText: initialMessage } = useTextSwap<HTMLParagraphElement>(checkMessage)
  // 유효하지 않거나 이미 사용 중인 아이디 — Error state shake (12).
  // `.is-error`는 선언적으로, `.is-shaking`은 훅이 명령형으로 재생한다.
  const inputShakeRef = useErrorShake<HTMLDivElement>(hasError ? checkStatus : null)

  if (loading) {
    return (
      <div className="min-h-full bg-surface text-text flex items-center justify-center">
        <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface text-text flex flex-col">
      <TopNav title={d.profile.title} />

      <div className="flex-1 flex flex-col px-[var(--spacing-16)] pt-0 pb-[var(--spacing-32)] gap-[var(--spacing-32)]">
        {/* 프로필 사진 */}
        <div className="flex flex-col items-center gap-[var(--spacing-16)]">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="relative active:scale-95 transition-transform duration-100"
            disabled={uploading}
            aria-label={d.profileEdit.changePhotoAlt}
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt={d.onboarding.avatarAlt} width={96} height={96} className="w-24 h-24 rounded-[var(--radius-cards)] object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-[var(--radius-cards)] bg-surface-elevated flex items-center justify-center">
                <UserIcon className="w-10 h-10 text-text/50" />
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-[var(--radius-cards)] bg-surface/70 flex items-center justify-center">
                <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.profileEdit.changePhoto}</p>
          {uploadError && (
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">{uploadError}</p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 아이디 편집 */}
        <div className={`t-input-wrap flex flex-col gap-2${hasError ? ' is-error' : ''}`}>
          <label className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/70">{d.profileEdit.usernameLabel}</label>
          <div
            ref={inputShakeRef}
            className={`t-input flex items-center w-full min-h-11 rounded-[var(--radius-inputs)] px-[var(--spacing-16)] transition-shadow ${inputBorderClass}${hasError ? ' is-error' : ''}`}
          >
            <span className="text-text/60 mr-1">@</span>
            <input
              type="text"
              value={usernameInput}
              onChange={handleUsernameChange}
              placeholder={currentUsername ?? d.onboarding.usernamePlaceholder}
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent placeholder:text-text/30 focus:outline-none"
            />
            {checkStatus === 'checking' && (
              <div className="w-4 h-4 border border-current border-t-transparent rounded-full animate-spin ml-2 shrink-0" />
            )}
          </div>
          {/* 메시지는 항상 마운트한 채 텍스트만 교체한다(빈 문자열 = 숨김).
              min-h-6로 자리를 잡아 스왑 중 레이아웃이 흔들리지 않게 한다. */}
          <p
            ref={messageRef}
            aria-live="polite"
            className="t-text-swap min-h-6 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] px-1 text-text/70"
          >
            {initialMessage}
          </p>
        </div>

        {/* 이름 편집 — 20260830_0113: username과 동일한 커스텀 t-input 마크업을 재사용한다
            (한 화면 안에서 입력 스타일이 갈라지지 않도록 — MODULAR Input 신규 도입 없음).
            필수값이 아니고 중복확인·형식 에러가 없어 상태머신 없이 단순 controlled input이다. */}
        <div className="t-input-wrap flex flex-col gap-2">
          <label className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/70">{d.profileEdit.nameLabel}</label>
          <div className="t-input flex items-center w-full min-h-11 rounded-[var(--radius-inputs)] px-[var(--spacing-16)] transition-shadow shadow-[inset_0_0_0_1px_var(--color-border)]">
            <input
              type="text"
              value={nameInput}
              onChange={handleNameChange}
              placeholder={currentDisplayName ?? d.profileEdit.namePlaceholder}
              maxLength={30}
              className="flex-1 bg-transparent placeholder:text-text/30 focus:outline-none"
            />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex flex-col gap-[var(--spacing-16)] mt-auto">
          {saveError && (
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-center">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full min-h-11 bg-surface-inverse text-text-inverse py-[14px] rounded-[var(--radius-pill-buttons)] active:scale-95 transition-transform duration-100 disabled:opacity-40 disabled:cursor-not-allowed text-[length:var(--text-body)] leading-[var(--leading-body)]"
          >
            {saving ? d.profileEdit.saving : d.profileEdit.saveButton}
          </button>
          <button
            onClick={() => router.back()}
            className="w-full min-h-11 text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:opacity-70 transition-opacity"
          >
            {d.profileEdit.cancelButton}
          </button>
        </div>
      </div>
    </div>
  )
}

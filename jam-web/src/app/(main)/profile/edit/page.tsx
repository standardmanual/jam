'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type CheckStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same'

function validateFormat(value: string): string | null {
  if (value.length === 0) return '아이디를 입력해 주세요'
  if (value.length > 30) return '30자 이하로 입력해 주세요'
  if (!/^[a-z0-9._]+$/.test(value)) return '영문, 숫자, ., _ 만 사용할 수 있어요'
  if (value.startsWith('.') || value.endsWith('.')) return '점(.)으로 시작하거나 끝날 수 없어요'
  if (value.includes('..')) return '점(.)을 연속으로 사용할 수 없어요'
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
          const data = raw as { username: string | null; avatar_url: string | null } | null
          const uname = data?.username ?? null
          setCurrentUsername(uname)
          setUsernameInput(uname ?? '')
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
      setUploadError('JPEG, PNG, WebP 파일만 업로드할 수 있어요')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('파일 크기가 5MB를 초과해요')
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
        setUploadError('업로드에 실패했어요. 다시 시도해 주세요.')
      }
    } catch {
      setUploadError('네트워크 오류가 발생했어요.')
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
          setCheckMessage('사용 가능한 아이디예요 ✓')
        } else {
          setCheckStatus('taken')
          setCheckMessage('이미 사용 중인 아이디예요')
        }
      } catch {
        setCheckStatus('idle')
        setCheckMessage('')
      }
    }, 500)
  }

  // username이 변경됐는지 확인
  const usernameChanged = usernameInput !== (currentUsername ?? '') && usernameInput !== ''
  const usernameValid =
    !usernameChanged ||
    checkStatus === 'available' ||
    checkStatus === 'same' ||
    usernameInput === currentUsername

  const canSave = !saving && !uploading && usernameChanged && (checkStatus === 'available')

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput }),
      })
      const json = await res.json() as { success?: boolean; error?: string }
      if (json.success) {
        router.push('/profile')
      } else if (json.error === 'DUPLICATE') {
        setCheckStatus('taken')
        setCheckMessage('이미 사용 중인 아이디예요')
      } else {
        setSaveError('저장에 실패했어요. 다시 시도해 주세요.')
      }
    } catch {
      setSaveError('네트워크 오류가 발생했어요.')
    } finally {
      setSaving(false)
    }
  }

  const inputBorder =
    checkStatus === 'available'
      ? 'border-jam-lime'
      : checkStatus === 'taken' || checkStatus === 'invalid'
        ? 'border-red-500'
        : 'border-jam-ink/30'

  const msgColor =
    checkStatus === 'available' ? 'text-jam-lime' : 'text-red-400'

  if (loading) {
    return (
      <div className="min-h-full bg-jam-ink flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-jam-ink text-white px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 flex flex-col gap-8">

      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 active:scale-95 transition-transform"
          aria-label="뒤로"
        >
          ←
        </button>
        <h1 className="font-black text-xl">프로필 편집</h1>
      </div>

      {/* 프로필 사진 */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="relative active:scale-95 transition-transform"
          disabled={uploading}
          aria-label="프로필 사진 변경"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt="프로필"
              className="w-24 h-24 rounded-3xl object-cover border-[3px] border-white/20"
            />
          ) : (
            <div className="w-24 h-24 rounded-3xl bg-white/10 border-[3px] border-white/20 flex items-center justify-center text-4xl">
              👤
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-3xl bg-black/50 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-jam-lime border-[2px] border-jam-ink flex items-center justify-center text-jam-ink text-xs font-black">
            ✎
          </div>
        </button>
        <p className="text-white/50 text-sm font-semibold">탭하여 사진 변경</p>
        {uploadError && (
          <p className="text-red-400 text-sm font-semibold text-center">{uploadError}</p>
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
      <div className="flex flex-col gap-2">
        <label className="text-white/70 text-sm font-black">아이디</label>
        <div className={`flex items-center w-full bg-white/10 border-[2px] ${inputBorder} rounded-xl px-4 py-3 transition-colors`}>
          <span className="text-white/60 font-semibold mr-1">@</span>
          <input
            type="text"
            value={usernameInput}
            onChange={handleUsernameChange}
            placeholder={currentUsername ?? 'username'}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-white font-semibold placeholder:text-white/30 focus:outline-none"
          />
          {checkStatus === 'checking' && (
            <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin ml-2 shrink-0" />
          )}
        </div>
        {checkMessage && (
          <p className={`text-sm font-semibold px-1 ${msgColor}`}>{checkMessage}</p>
        )}
      </div>

      {/* 저장 버튼 */}
      <div className="flex flex-col gap-3 mt-auto">
        {saveError && (
          <p className="text-red-400 text-sm font-semibold text-center">{saveError}</p>
        )}
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full bg-jam-lime text-jam-ink font-black py-4 rounded-2xl border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed text-lg"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={() => router.back()}
          className="w-full text-white/50 font-semibold py-3 text-sm active:text-white/80 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  )
}

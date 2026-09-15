import { FormEvent, useEffect, useRef, useState } from 'react'
import { adminClient } from '@/api/adminClient'
import { settingsApi } from '@/api/settings'
import { authApi } from '@/api/auth'
import { AppSettings } from '@/types/settings'
import { fetchAuthedBlob } from '@/utils/blob'

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [ownerName, setOwnerName] = useState('')
  const [defaultUpiId, setDefaultUpiId] = useState('')
  const [invoiceDueDays, setInvoiceDueDays] = useState(7)
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pwMessage, setPwMessage] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  async function load() {
    const s = await settingsApi.get()
    setSettings(s)
    setOwnerName(s.ownerName)
    setDefaultUpiId(s.defaultUpiId ?? '')
    setInvoiceDueDays(s.invoiceDueDays)
    if (s.hasPropertyPhoto) {
      setPhotoSrc(await fetchAuthedBlob(adminClient, '/settings/property-photo'))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    try {
      const s = await settingsApi.update({ ownerName, defaultUpiId, invoiceDueDays })
      setSettings(s)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await settingsApi.uploadPhoto(file)
    if (photoSrc) URL.revokeObjectURL(photoSrc)
    setPhotoSrc(await fetchAuthedBlob(adminClient, '/settings/property-photo'))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handlePhotoDelete() {
    await settingsApi.deletePhoto()
    if (photoSrc) URL.revokeObjectURL(photoSrc)
    setPhotoSrc(null)
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwMessage(null)
    setPwError(null)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setPwMessage('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err: any) {
      setPwError(err?.response?.data?.detail || 'Could not change password')
    }
  }

  if (!settings) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-bold">Settings</h1>

      <form onSubmit={handleSave} className="card p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Owner &amp; Invoice Defaults</h2>
        <div>
          <label className="field-label">Owner Name (shown as UPI payee)</label>
          <input className="field-input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Default UPI ID (pre-filled on new tenants)</label>
          <input className="field-input" value={defaultUpiId} onChange={(e) => setDefaultUpiId(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Invoice Due (days after invoice date)</label>
          <input
            className="field-input" type="number" min={1} value={invoiceDueDays}
            onChange={(e) => setInvoiceDueDays(parseInt(e.target.value || '7', 10))}
          />
        </div>

        <div>
          <label className="field-label">Property Photo (shown on invoices)</label>
          {photoSrc && <img src={photoSrc} alt="" className="w-20 h-20 object-cover rounded-lg mb-2" />}
          <div className="flex gap-2 flex-wrap">
            <label className="btn-secondary btn-compact cursor-pointer">
              {photoSrc ? 'Replace photo' : 'Upload photo'}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </label>
            {photoSrc && (
              <button type="button" className="btn-danger btn-compact" onClick={handlePhotoDelete}>Remove</button>
            )}
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </form>

      <form onSubmit={handleChangePassword} className="card p-4 sm:p-6 space-y-4">
        <h2 className="font-semibold">Change Password</h2>
        {pwMessage && <div className="rounded-lg bg-green-50 text-green-700 px-3 py-2 text-sm">{pwMessage}</div>}
        {pwError && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{pwError}</div>}
        <div>
          <label className="field-label">Current Password</label>
          <input className="field-input" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <label className="field-label">New Password</label>
          <input className="field-input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn-primary">Change Password</button>
      </form>
    </div>
  )
}

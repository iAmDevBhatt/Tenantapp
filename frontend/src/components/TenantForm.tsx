import { FormEvent, useState } from 'react'
import { TenantInput } from '@/types/tenant'

interface Props {
  initial?: Partial<TenantInput>
  submitLabel: string
  onSubmit: (data: TenantInput) => Promise<void>
  onCancel?: () => void
}

const empty: TenantInput = {
  name: '', phone: '', propertyAddress: '', monthlyRent: '0', roomRate: '',
  waterRate: '', waterDivisor: 1, upiId: '', moveInDate: new Date().toISOString().slice(0, 10),
}

export default function TenantForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<TenantInput>({ ...empty, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof TenantInput>(key: K, value: TenantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit(form)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Name</label>
          <input className="field-input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="field-label">Phone (for WhatsApp)</label>
          <input
            className="field-input" placeholder="+91XXXXXXXXXX"
            value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="field-label">Property Address</label>
        <textarea
          className="field-input min-h-[80px] py-2" required rows={3}
          value={form.propertyAddress} onChange={(e) => set('propertyAddress', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Monthly Rent (₹)</label>
          <input
            className="field-input" type="number" step="0.01" required
            value={form.monthlyRent} onChange={(e) => set('monthlyRent', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Move-in Date</label>
          <input
            className="field-input" type="date" required
            value={form.moveInDate} onChange={(e) => set('moveInDate', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Room Meter Rate (₹/unit)</label>
          <input
            className="field-input" type="number" step="0.01" required
            value={form.roomRate} onChange={(e) => set('roomRate', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Water Meter Rate (₹/unit)</label>
          <input
            className="field-input" type="number" step="0.01" required
            value={form.waterRate} onChange={(e) => set('waterRate', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Water Meter Shared By (tenants)</label>
          <input
            className="field-input" type="number" min={1} step="1" required
            value={form.waterDivisor} onChange={(e) => set('waterDivisor', parseInt(e.target.value || '1', 10))}
          />
        </div>
        <div>
          <label className="field-label">UPI ID</label>
          <input
            className="field-input" placeholder="name@bank"
            value={form.upiId ?? ''} onChange={(e) => set('upiId', e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

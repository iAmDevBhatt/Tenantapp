import { FormEvent, useEffect, useState } from 'react'
import { TenantInput } from '@/types/tenant'
import { Property } from '@/types/property'
import { propertiesApi } from '@/api/properties'
import { errorMessage } from '@/api/client'
import { useLabels } from '@/hooks/useLabels'

interface Props {
  initial?: Partial<TenantInput>
  submitLabel: string
  onSubmit: (data: TenantInput) => Promise<void>
  onCancel?: () => void
}

const empty: TenantInput = {
  name: '', phone: '', propertyAddress: '', monthlyRent: '0', roomRate: '',
  waterRate: '', waterDivisor: 1, upiId: '', moveInDate: new Date().toISOString().slice(0, 10),
  flatId: null, permanentAddress: null, emergencyContactName: null, emergencyContactPhone: null,
}

export default function TenantForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<TenantInput>({ ...empty, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const { l } = useLabels()

  // Determine the initially selected property from flatId
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(() => {
    if (initial?.flatId) {
      // We'll resolve this once properties load
      return '__pending__'
    }
    return ''
  })

  useEffect(() => {
    propertiesApi.list().then((props) => {
      setProperties(props)
      if (initial?.flatId) {
        const ownerProp = props.find((p) => p.flats.some((f) => f.id === initial.flatId))
        setSelectedPropertyId(ownerProp?.id ?? '')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof TenantInput>(key: K, value: TenantInput[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handlePropertyChange(propertyId: string) {
    setSelectedPropertyId(propertyId)
    set('flatId', null)
  }

  function handleFlatChange(flatId: string) {
    const flat = properties.find((p) => p.id === selectedPropertyId)?.flats.find((f) => f.id === flatId)
    const prop = properties.find((p) => p.id === selectedPropertyId)
    set('flatId', flatId || null)
    if (flat && prop) {
      set('propertyAddress', `${prop.address} - ${flat.label}`)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSubmit(form)
    } catch (err: any) {
      setError(errorMessage(err, l('error.generic', 'Something went wrong')))
    } finally {
      setSaving(false)
    }
  }

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">{l('form.label.name', 'Name')}</label>
          <input className="field-input" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="field-label">{l('form.label.phone', 'Phone (for WhatsApp)')}</label>
          <input
            className="field-input" placeholder={l('form.placeholder.phone', '+91XXXXXXXXXX')}
            value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)}
          />
        </div>
      </div>

      {properties.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">{l('form.label.property', 'Property')}</label>
            <select
              className="field-input"
              value={selectedPropertyId === '__pending__' ? '' : selectedPropertyId}
              onChange={(e) => handlePropertyChange(e.target.value)}
            >
              <option value="">{l('form.option.noProperty', '— None / Custom address —')}</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {selectedPropertyId && selectedPropertyId !== '__pending__' && selectedProperty && (
            <div>
              <label className="field-label">{l('form.label.flat', 'Flat / Unit')}</label>
              <select
                className="field-input"
                value={form.flatId ?? ''}
                onChange={(e) => handleFlatChange(e.target.value)}
              >
                <option value="">{l('form.option.noFlat', '— Select flat —')}</option>
                {selectedProperty.flats.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="field-label">{l('form.label.propertyAddress', 'Property Address')}</label>
        <textarea
          className="field-input min-h-[80px] py-2" required rows={3}
          value={form.propertyAddress} onChange={(e) => set('propertyAddress', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">{l('form.label.monthlyRent', 'Monthly Rent (₹)')}</label>
          <input
            className="field-input" type="number" step="0.01" required
            value={form.monthlyRent} onChange={(e) => set('monthlyRent', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">{l('form.label.moveInDate', 'Move-in Date')}</label>
          <input
            className="field-input" type="date" required
            value={form.moveInDate} onChange={(e) => set('moveInDate', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">{l('form.label.roomRate', 'Room Meter Rate (₹/unit)')}</label>
          <input
            className="field-input" type="number" step="0.01" required
            value={form.roomRate} onChange={(e) => set('roomRate', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">{l('form.label.waterRate', 'Water Meter Rate (₹/unit)')}</label>
          <input
            className="field-input" type="number" step="0.01" required
            value={form.waterRate} onChange={(e) => set('waterRate', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">{l('form.label.waterDivisor', 'Water Meter Shared By (tenants)')}</label>
          <input
            className="field-input" type="number" min={1} step="1" required
            value={form.waterDivisor} onChange={(e) => set('waterDivisor', parseInt(e.target.value || '1', 10))}
          />
        </div>
        <div>
          <label className="field-label">{l('form.label.upiId', 'UPI ID')}</label>
          <input
            className="field-input" placeholder={l('form.placeholder.upiId', 'name@bank')}
            value={form.upiId ?? ''} onChange={(e) => set('upiId', e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="field-label">{l('form.label.permanentAddress', 'Permanent Address')}</label>
        <textarea
          className="field-input min-h-[80px] py-2" rows={3}
          value={form.permanentAddress ?? ''} onChange={(e) => set('permanentAddress', e.target.value || null)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="field-label">{l('form.label.emergencyContactName', 'Emergency Contact Name')}</label>
          <input
            className="field-input"
            value={form.emergencyContactName ?? ''} onChange={(e) => set('emergencyContactName', e.target.value || null)}
          />
        </div>
        <div>
          <label className="field-label">{l('form.label.emergencyContactPhone', 'Emergency Contact Phone')}</label>
          <input
            className="field-input" type="tel"
            value={form.emergencyContactPhone ?? ''} onChange={(e) => set('emergencyContactPhone', e.target.value || null)}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? l('btn.saving', 'Saving…') : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={saving}>
            {l('btn.cancel', 'Cancel')}
          </button>
        )}
      </div>
    </form>
  )
}

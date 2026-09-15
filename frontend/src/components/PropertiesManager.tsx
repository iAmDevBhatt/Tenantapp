import { useEffect, useState } from 'react'
import { propertiesApi } from '@/api/properties'
import { Property } from '@/types/property'
import { useLabels } from '@/hooks/useLabels'

export default function PropertiesManager() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const { l } = useLabels()

  // Add-property form state
  const [showAddProp, setShowAddProp] = useState(false)
  const [newPropName, setNewPropName] = useState('')
  const [newPropAddress, setNewPropAddress] = useState('')
  const [savingProp, setSavingProp] = useState(false)

  // Edit-property form state
  const [editingPropId, setEditingPropId] = useState<string | null>(null)
  const [editPropName, setEditPropName] = useState('')
  const [editPropAddress, setEditPropAddress] = useState('')

  // Add-flat form state per property
  const [addFlatFor, setAddFlatFor] = useState<string | null>(null)
  const [newFlatLabel, setNewFlatLabel] = useState('')
  const [savingFlat, setSavingFlat] = useState(false)

  // Edit-flat state
  const [editingFlatId, setEditingFlatId] = useState<string | null>(null)
  const [editFlatLabel, setEditFlatLabel] = useState('')

  async function load() {
    setLoading(true)
    try {
      setProperties(await propertiesApi.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleAddProperty() {
    if (!newPropName.trim() || !newPropAddress.trim()) return
    setSavingProp(true)
    try {
      const p = await propertiesApi.create({ name: newPropName.trim(), address: newPropAddress.trim() })
      setProperties((prev) => [...prev, p])
      setNewPropName('')
      setNewPropAddress('')
      setShowAddProp(false)
    } finally {
      setSavingProp(false)
    }
  }

  async function handleUpdateProperty(id: string) {
    await propertiesApi.update(id, { name: editPropName.trim(), address: editPropAddress.trim() })
    setEditingPropId(null)
    await load()
  }

  async function handleDeleteProperty(id: string) {
    if (!confirm(l('confirm.deleteProperty', 'Delete this property? All its flats will also be deleted.'))) return
    await propertiesApi.delete(id)
    setProperties((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleAddFlat(propertyId: string) {
    if (!newFlatLabel.trim()) return
    setSavingFlat(true)
    try {
      const updated = await propertiesApi.createFlat(propertyId, { label: newFlatLabel.trim() })
      setProperties((prev) => prev.map((p) => (p.id === propertyId ? updated : p)))
      setNewFlatLabel('')
      setAddFlatFor(null)
    } finally {
      setSavingFlat(false)
    }
  }

  async function handleUpdateFlat(propertyId: string, flatId: string) {
    const updated = await propertiesApi.updateFlat(propertyId, flatId, { label: editFlatLabel.trim() })
    setProperties((prev) => prev.map((p) => (p.id === propertyId ? updated : p)))
    setEditingFlatId(null)
  }

  async function handleDeleteFlat(propertyId: string, flatId: string) {
    if (!confirm(l('confirm.deleteFlat', 'Delete this flat?'))) return
    await propertiesApi.deleteFlat(propertyId, flatId)
    await load()
  }

  if (loading) return <p className="text-sm text-slate-500">{l('status.loading', 'Loading…')}</p>

  return (
    <div className="space-y-4">
      {properties.length === 0 && !showAddProp && (
        <p className="text-sm text-slate-500">{l('property.empty', 'No properties yet.')}</p>
      )}

      {properties.map((prop) => (
        <div key={prop.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          {editingPropId === prop.id ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 space-y-2">
              <input
                className="field-input"
                value={editPropName}
                onChange={(e) => setEditPropName(e.target.value)}
                placeholder={l('form.label.propertyName', 'Property Name')}
              />
              <textarea
                className="field-input min-h-[60px] py-2"
                rows={2}
                value={editPropAddress}
                onChange={(e) => setEditPropAddress(e.target.value)}
                placeholder={l('form.label.addressField', 'Address')}
              />
              <div className="flex gap-2">
                <button className="btn-primary btn-compact" onClick={() => handleUpdateProperty(prop.id)}>{l('btn.saveChanges', 'Save changes')}</button>
                <button className="btn-secondary btn-compact" onClick={() => setEditingPropId(null)}>{l('btn.cancel', 'Cancel')}</button>
              </div>
            </div>
          ) : (
            <div className="p-3 flex items-start justify-between gap-2 bg-slate-50 dark:bg-slate-800">
              <div className="min-w-0">
                <p className="font-semibold text-sm">{prop.name}</p>
                <p className="text-xs text-slate-500 truncate">{prop.address}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  className="btn-secondary btn-compact"
                  onClick={() => { setEditingPropId(prop.id); setEditPropName(prop.name); setEditPropAddress(prop.address) }}
                >
                  {l('btn.editDetails', 'Edit')}
                </button>
                <button className="btn-danger btn-compact" onClick={() => handleDeleteProperty(prop.id)}>{l('btn.delete', 'Delete')}</button>
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {prop.flats.map((flat) => (
              <div key={flat.id} className="px-4 py-2 flex items-center justify-between gap-2">
                {editingFlatId === flat.id ? (
                  <>
                    <input
                      className="field-input py-1 text-sm"
                      value={editFlatLabel}
                      onChange={(e) => setEditFlatLabel(e.target.value)}
                    />
                    <div className="flex gap-2 flex-shrink-0">
                      <button className="btn-primary btn-compact" onClick={() => handleUpdateFlat(prop.id, flat.id)}>{l('btn.saveChanges', 'Save')}</button>
                      <button className="btn-secondary btn-compact" onClick={() => setEditingFlatId(null)}>{l('btn.cancel', 'Cancel')}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm">{flat.label}</span>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary btn-compact"
                        onClick={() => { setEditingFlatId(flat.id); setEditFlatLabel(flat.label) }}
                      >
                        {l('btn.editDetails', 'Edit')}
                      </button>
                      <button className="btn-danger btn-compact" onClick={() => handleDeleteFlat(prop.id, flat.id)}>{l('btn.delete', 'Delete')}</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {addFlatFor === prop.id ? (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex gap-2 items-center">
              <input
                className="field-input py-1 text-sm flex-1"
                placeholder={l('form.label.flat', 'Flat / Unit label, e.g. 1A')}
                value={newFlatLabel}
                onChange={(e) => setNewFlatLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddFlat(prop.id) }}
                autoFocus
              />
              <button className="btn-primary btn-compact" onClick={() => handleAddFlat(prop.id)} disabled={savingFlat}>
                {savingFlat ? l('btn.saving', 'Saving…') : l('btn.addFlat', '+ Add flat')}
              </button>
              <button className="btn-secondary btn-compact" onClick={() => { setAddFlatFor(null); setNewFlatLabel('') }}>{l('btn.cancel', 'Cancel')}</button>
            </div>
          ) : (
            <button
              className="w-full text-left px-4 py-2 text-xs text-brand-600 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-700"
              onClick={() => { setAddFlatFor(prop.id); setNewFlatLabel('') }}
            >
              {l('btn.addFlat', '+ Add flat')}
            </button>
          )}
        </div>
      ))}

      {showAddProp ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
          <input
            className="field-input"
            placeholder={l('form.label.propertyName', 'Property Name')}
            value={newPropName}
            onChange={(e) => setNewPropName(e.target.value)}
            autoFocus
          />
          <textarea
            className="field-input min-h-[60px] py-2"
            rows={2}
            placeholder={l('form.label.addressField', 'Address')}
            value={newPropAddress}
            onChange={(e) => setNewPropAddress(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-primary btn-compact" onClick={handleAddProperty} disabled={savingProp}>
              {savingProp ? l('btn.saving', 'Saving…') : l('btn.save', 'Save')}
            </button>
            <button className="btn-secondary btn-compact" onClick={() => { setShowAddProp(false); setNewPropName(''); setNewPropAddress('') }}>{l('btn.cancel', 'Cancel')}</button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary btn-compact" onClick={() => setShowAddProp(true)}>
          {l('btn.addProperty', '+ Add property')}
        </button>
      )}
    </div>
  )
}

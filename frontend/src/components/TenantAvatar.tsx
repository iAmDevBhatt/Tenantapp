import { useEffect, useState } from 'react'
import { adminClient } from '@/api/adminClient'
import { tenantsApi } from '@/api/tenants'
import { fetchAuthedBlob } from '@/utils/blob'

interface Props {
  tenantId: string
  hasProfilePhoto: boolean
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-12 h-12 text-sm',
  lg: 'w-16 h-16 text-base',
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function TenantAvatar({ tenantId, hasProfilePhoto, name, size = 'md' }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const sizeClass = SIZE_CLASSES[size]

  useEffect(() => {
    if (!hasProfilePhoto) {
      setSrc(null)
      return
    }
    let url: string | null = null
    fetchAuthedBlob(adminClient, tenantsApi.profilePhotoUrl(tenantId))
      .then((blobUrl) => {
        url = blobUrl
        setSrc(blobUrl)
      })
      .catch(() => setSrc(null))
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [tenantId, hasProfilePhoto])

  const base = `rounded-full flex-shrink-0 overflow-hidden ${sizeClass}`

  if (src) {
    return (
      <div className={base}>
        <img src={src} alt={name} className="w-full h-full object-cover" />
      </div>
    )
  }

  return (
    <div className={`${base} bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 flex items-center justify-center font-semibold`}>
      {initials(name)}
    </div>
  )
}

import { adminClient } from './adminClient'
import { AppSettings, Overview } from '@/types/settings'

export const settingsApi = {
  get: () => adminClient.get<AppSettings>('/settings').then((r) => r.data),

  update: (data: Partial<Pick<AppSettings, 'ownerName' | 'defaultUpiId' | 'invoiceDueDays'>>) =>
    adminClient.put<AppSettings>('/settings', data).then((r) => r.data),

  uploadPhoto: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return adminClient
      .post<AppSettings>('/settings/property-photo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  deletePhoto: () => adminClient.delete<AppSettings>('/settings/property-photo').then((r) => r.data),

  photoUrl: () => '/api/settings/property-photo',

  overview: () => adminClient.get<Overview>('/aggregate/overview').then((r) => r.data),
}

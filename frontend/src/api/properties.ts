import { adminClient } from './adminClient'
import { Property, PropertyCreateInput, FlatCreateInput } from '@/types/property'

export const propertiesApi = {
  list: () => adminClient.get<Property[]>('/properties').then((r) => r.data),

  create: (data: PropertyCreateInput) =>
    adminClient.post<Property>('/properties', data).then((r) => r.data),

  update: (id: string, data: Partial<PropertyCreateInput>) =>
    adminClient.put<Property>(`/properties/${id}`, data).then((r) => r.data),

  delete: (id: string) => adminClient.delete(`/properties/${id}`),

  createFlat: (propertyId: string, data: FlatCreateInput) =>
    adminClient.post<Property>(`/properties/${propertyId}/flats`, data).then((r) => r.data),

  updateFlat: (propertyId: string, flatId: string, data: FlatCreateInput) =>
    adminClient.put<Property>(`/properties/${propertyId}/flats/${flatId}`, data).then((r) => r.data),

  deleteFlat: (propertyId: string, flatId: string) =>
    adminClient.delete(`/properties/${propertyId}/flats/${flatId}`),
}

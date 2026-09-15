export interface PropertyFlat {
  id: string
  propertyId: string
  label: string
  createdAt: string
}

export interface Property {
  id: string
  name: string
  address: string
  createdAt: string
  flats: PropertyFlat[]
}

export interface PropertyCreateInput {
  name: string
  address: string
}

export interface FlatCreateInput {
  label: string
}

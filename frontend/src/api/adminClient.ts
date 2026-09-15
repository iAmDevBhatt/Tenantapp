import { createApiClient } from './client'

export const ADMIN_TOKEN_KEY = 'rentledger_admin_token'
export const adminClient = createApiClient(ADMIN_TOKEN_KEY, '/login')

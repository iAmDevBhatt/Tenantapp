import { createApiClient } from './client'

export const TENANT_TOKEN_KEY = 'rentledger_tenant_token'
export const portalClient = createApiClient(TENANT_TOKEN_KEY, '/portal/login')

import type { AppType } from '@flux/server'
import { hc } from 'hono/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
export const client = hc<AppType>(API_URL)

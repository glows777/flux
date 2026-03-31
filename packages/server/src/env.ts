/**
 * Environment loader — must be preloaded before any module import.
 * Resolves .env from project root regardless of cwd.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'

const envPath = resolve(import.meta.dir, '../../../.env')
config({ path: envPath })

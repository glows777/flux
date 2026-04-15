/**
 * Environment loader — must be preloaded before any module import.
 * Resolves .env from project root regardless of cwd.
 */

import { resolve } from 'node:path'
import { config } from 'dotenv'

const envPath = resolve(import.meta.dir, '../../../.env')
config({ path: envPath })

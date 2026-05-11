import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveServerSkillsDirectory } from '../../../src/core/ai/presets/paths'

describe('server package scripts', () => {
    test('server lifecycle scripts avoid package-cwd dependency resolution', () => {
        const packageJson = JSON.parse(
            readFileSync(
                join(import.meta.dir, '../../../package.json'),
                'utf8',
            ),
        ) as { scripts?: Record<string, string> }

        const scripts = packageJson.scripts ?? {}

        expect(scripts.dev).toBeDefined()
        expect(scripts.dev).toContain('cd ../..')
        expect(scripts.dev).not.toContain('--watch')
        expect(scripts.dev).not.toContain('--hot')
        expect(scripts.build).toContain('cd ../..')
        expect(scripts.build).toContain('packages/server/src/index.ts')
        expect(scripts.start).toContain('cd ../..')
        expect(scripts.start).toContain('packages/server/dist/index.js')
    })

    test('root dev script starts the server entry from the repo root', () => {
        const rootPackageJson = JSON.parse(
            readFileSync(
                join(import.meta.dir, '../../../../../package.json'),
                'utf8',
            ),
        ) as { scripts?: Record<string, string> }

        const devScript = rootPackageJson.scripts?.dev

        expect(devScript).toBeDefined()
        expect(devScript).toContain('bun packages/server/src/index.ts')
        expect(devScript).not.toContain("bun run --filter '*' dev")
    })

    test('AI SDK runtime version is pinned across workspaces', () => {
        const packagePaths = [
            '../../../../../package.json',
            '../../../package.json',
            '../../../../web/package.json',
        ]

        for (const packagePath of packagePaths) {
            const packageJson = JSON.parse(
                readFileSync(join(import.meta.dir, packagePath), 'utf8'),
            ) as { dependencies?: Record<string, string> }

            expect(packageJson.dependencies?.ai).toBe('6.0.73')
        }
    })

    test('server skills directory resolves in source and bundled cwd layouts', () => {
        const packageRoot = resolve(import.meta.dir, '../../..')
        const repoRoot = resolve(import.meta.dir, '../../../../..')

        expect(
            resolveServerSkillsDirectory(
                packageRoot,
                join(packageRoot, 'src/core/ai/presets'),
            ),
        ).toBe(join(packageRoot, 'skills'))
        expect(
            resolveServerSkillsDirectory(repoRoot, join(packageRoot, 'dist')),
        ).toBe(join(repoRoot, 'packages/server/skills'))
    })
})

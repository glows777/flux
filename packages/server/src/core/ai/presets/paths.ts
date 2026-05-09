import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function resolveServerSkillsDirectory(
    cwd = process.cwd(),
    metaDir = import.meta.dir,
): string {
    const candidates = [
        resolve(cwd, 'packages/server/skills'),
        resolve(cwd, 'skills'),
        resolve(metaDir, '../../../../skills'),
    ]

    return (
        candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
    )
}

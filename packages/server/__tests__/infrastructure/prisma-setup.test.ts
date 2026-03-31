/**
 * P2-01: Prisma 初始化测试
 *
 * 验收标准:
 * - prisma/schema.prisma 文件存在且语法正确
 * - .env.example 文件存在且包含 DATABASE_URL 模板
 * - Prisma CLI 命令可正常执行
 * - .gitignore 包含 .env
 */

import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT_DIR = join(import.meta.dir, '../..')

describe('P2-01: Prisma Setup', () => {
    describe('T01-01: Prisma CLI 可用', () => {
        it('should have prisma as a dependency', () => {
            const packageJson = JSON.parse(
                readFileSync(join(ROOT_DIR, 'package.json'), 'utf-8'),
            )

            const hasPrisma =
                packageJson.dependencies?.prisma ||
                packageJson.devDependencies?.prisma

            const hasPrismaClient =
                packageJson.dependencies?.['@prisma/client'] ||
                packageJson.devDependencies?.['@prisma/client']

            expect(hasPrisma).toBeTruthy()
            expect(hasPrismaClient).toBeTruthy()
        })
    })

    describe('T01-02: schema.prisma 语法正确', () => {
        it('should have prisma/schema.prisma file', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            expect(existsSync(schemaPath)).toBe(true)
        })

        it('should configure PostgreSQL datasource', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            const schemaContent = readFileSync(schemaPath, 'utf-8')

            expect(schemaContent).toContain('provider = "postgresql"')
        })

        it('should have prisma.config.ts with DATABASE_URL', () => {
            // Prisma 7 requires prisma.config.ts in project root
            const configPath = join(ROOT_DIR, 'prisma.config.ts')
            expect(existsSync(configPath)).toBe(true)

            const configContent = readFileSync(configPath, 'utf-8')
            expect(configContent).toContain('DATABASE_URL')
            expect(configContent).toContain('datasource')
        })

        it('should configure prisma-client-js generator', () => {
            const schemaPath = join(ROOT_DIR, 'prisma/schema.prisma')
            const schemaContent = readFileSync(schemaPath, 'utf-8')

            expect(schemaContent).toContain('generator client')
            expect(schemaContent).toContain('provider = "prisma-client-js"')
        })
    })

    describe('T01-03: .env.example 存在', () => {
        it('should have .env.example file', () => {
            const envExamplePath = join(ROOT_DIR, '.env.example')
            expect(existsSync(envExamplePath)).toBe(true)
        })

        it('should contain DATABASE_URL placeholder', () => {
            const envExamplePath = join(ROOT_DIR, '.env.example')
            const envContent = readFileSync(envExamplePath, 'utf-8')

            expect(envContent).toContain('DATABASE_URL=')
            expect(envContent).toContain('postgresql://')
        })
    })

    describe('Gitignore: 防止泄露密钥', () => {
        it('should have .env in .gitignore', () => {
            const gitignorePath = join(ROOT_DIR, '.gitignore')
            const gitignoreContent = readFileSync(gitignorePath, 'utf-8')

            // 检查 .env 被忽略 (可以是 .env 或 .env*)
            const hasEnvIgnore =
                gitignoreContent.includes('.env') ||
                gitignoreContent.includes('.env*')

            expect(hasEnvIgnore).toBe(true)
        })
    })
})

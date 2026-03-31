/**
 * Safety guard: prevent tests from running against non-test database.
 *
 * Call this at the top of any setup/preload file that connects to a real DB.
 * Throws immediately if DATABASE_URL does not point to `flux_test`.
 */
export function assertTestDatabase(): void {
    const dbUrl = process.env.DATABASE_URL ?? ''

    if (!dbUrl) {
        return // No DATABASE_URL set — tests that need DB will skip themselves
    }

    if (!dbUrl.includes('flux_test')) {
        // Mask credentials in error message
        const masked = dbUrl.replace(/\/\/[^@]*@/, '//***@')
        throw new Error(
            [
                'SAFETY GUARD: DATABASE_URL does not point to test database (flux_test).',
                `Current: ${masked}`,
                'Refusing to run tests against non-test database.',
                'Set DATABASE_URL to point to flux_test, e.g.:',
                "  DATABASE_URL='postgresql://flux_user:flux_password@localhost:5432/flux_test?schema=public'",
            ].join('\n'),
        )
    }
}

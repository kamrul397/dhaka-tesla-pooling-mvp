module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    verbose: true,
    forceExit: true,
    testTimeout: 35000,
};
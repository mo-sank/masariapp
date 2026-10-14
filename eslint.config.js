// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/__mocks__/**', 'jest.setup.*'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    // supabase/functions are Deno Edge Functions (npm:/jsr: specifiers, Deno
    // globals) with their own runtime; the Expo/React Native lint config cannot
    // resolve them. They are linted/typechecked by the Supabase CLI / Deno.
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'coverage/*', 'supabase/functions/*'],
  },
]);

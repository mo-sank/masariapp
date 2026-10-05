/** Jest configuration for the Masari Expo app. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.env.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.after-env.js'],
  // Edge Function tests under supabase/functions/ are Deno tests (jsr: imports,
  // .ts extension specifiers) run via `deno test`, not Jest. Exclude them from
  // Jest discovery so `npm test` and CI stay green.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/supabase/functions/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|expo-router|@testing-library/react-native)',
  ],
};

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// https://vite.dev/config/
const packageJsonPath = resolve(process.cwd(), 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const appVersion = `v${packageJson.version ?? '1.0.0'}-${packageJson.release ?? 'core'}`
const derivedBuildNumber = process.env.VERCEL_GIT_COMMIT_SHA
  ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  : process.env.GITHUB_RUN_NUMBER
    || process.env.BUILD_NUMBER
    || `${Date.now()}`

const buildDate = new Date().toISOString()

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_NAME__: JSON.stringify('ONE'),
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_NUMBER__: JSON.stringify(derivedBuildNumber),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
  },
})

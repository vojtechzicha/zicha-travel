import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

// Lint policy: zero warnings, zero errors, always (`pnpm lint` runs with
// --max-warnings 0 and is part of vercel-build). A rule is either enforced or
// absent — no violations left in the tree, no suppression comments. Rules
// below are switched off only where this codebase made a deliberate contrary
// decision; each one says why.
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Multi-host app: many `<a>` targets are deliberate full-page
      // navigations (API routes like /api/auth/logout, the admin panel's
      // BackToSiteLink, cross-subdomain paths resolved by the middleware).
      // The rule can't tell those from client-navigable pages.
      '@next/next/no-html-link-for-pages': 'off',
      // Receipts/backgrounds are served as originals on purpose (S3
      // clientUploads bypasses the server; no imageSizes) — see CLAUDE.md,
      // ExpenseAttachments.
      '@next/next/no-img-element': 'off',
      // Payload's depth-0 polymorphic reads make `any` sometimes the honest
      // type; at error level this rule breeds `as unknown as X` casts, which
      // are no safer.
      '@typescript-eslint/no-explicit-any': 'off',
      // Apostrophes and quotes are fine in bilingual prose pages; only flag
      // the characters that signal real JSX mistakes.
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    ignores: [
      '.next/',
      '.vercel/',
      'node_modules/',
      'media/',
      // Generated files
      'src/payload-types.ts',
      'src/app/(payload)/admin/importMap.js',
      'next-env.d.ts',
    ],
  },
]

export default eslintConfig

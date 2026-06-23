# Runtime-only image.
#
# IMPORTANT: the app is NOT built inside this image. Building Next.js inside
# the Docker container (whether on Fly's Depot remote builder or a local
# buildx) produced a broken server bundle for this Next 15.4 / Payload 3.85
# app — the admin's React Server Components flight rendered the page slot as
# null, so the admin hydrated to a blank screen (the client chunks were
# byte-identical to a working build; only the server render differed).
#
# A normal (non-container) build on the CI runner's OS renders correctly, so
# the app is built on the GitHub Actions runner (see .github/workflows/
# deploy.yml) and this image only packages the prebuilt standalone output.
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Create media directory for the Fly volume mount
RUN mkdir -p /app/media && chown nextjs:nodejs /app/media

# Copy the prebuilt output (built on the runner, not here).
# next.config.mjs uses `output: 'standalone'`, which emits a self-contained
# server in .next/standalone plus separate .next/static and public assets.
COPY --chown=nextjs:nodejs public ./public
COPY --chown=nextjs:nodejs .next/standalone ./
COPY --chown=nextjs:nodejs .next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000

# server.js is created by next build from the standalone output
CMD HOSTNAME="0.0.0.0" node server.js

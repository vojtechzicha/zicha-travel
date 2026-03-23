# Zicha Travel

Expense tracker for group trips and shared accommodations. Built with Payload CMS, Next.js, and PostgreSQL.

Features automatic expense splitting, QR payment codes (Czech banking), multi-domain routing, and a mobile-friendly glass-morphism UI.

## Quick Start

1. Clone the repo and install dependencies:
   ```bash
   pnpm install
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Start the development server (auto-starts a Docker PostgreSQL instance):
   ```bash
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) for the frontend and [http://localhost:3000/admin](http://localhost:3000/admin) for the Payload admin panel.

## Prerequisites

- Node.js 18.20+ or 20.9+
- pnpm 9+
- Docker (for local PostgreSQL)

## Development Commands

```bash
pnpm dev              # Start PostgreSQL + Next.js dev server
pnpm db               # Start only PostgreSQL in background
pnpm db:stop          # Stop PostgreSQL
pnpm build            # Build for production
pnpm generate:types   # Generate TypeScript types from collections
pnpm test             # Run integration and e2e tests
```

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 15
- **CMS**: [Payload CMS](https://payloadcms.com/) 3
- **Database**: PostgreSQL
- **Styling**: Tailwind CSS v4
- **Deployment**: Fly.io

## License

MIT

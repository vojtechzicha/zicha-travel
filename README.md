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

## Authentication

The admin panel supports two authentication modes:

### Bootstrap Mode (email/password)

On first deploy without Microsoft OAuth configured, the admin panel uses Payload's built-in email/password authentication. Use this to create your initial admin user and add other users with their email addresses.

### Microsoft OAuth Mode

Once configured, Microsoft OAuth becomes the **only** login method. Only users whose email already exists in the Users collection can sign in.

#### Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com/) > **App registrations** > **New registration**
2. Name: e.g. "Chata Admin"
3. Supported account types: **Personal Microsoft accounts only** (consumers tenant)
4. Redirect URI: `Web` > `http://localhost:3000/api/auth/callback` (for local dev)
5. After creation, go to **Certificates & secrets** > **New client secret** and copy the value

#### Environment Variables

| Variable                             | Description                             |
| ------------------------------------ | --------------------------------------- |
| `AZURE_CLIENT_ID`                    | Application (client) ID from Azure      |
| `AZURE_CLIENT_SECRET`                | Client secret value                     |
| `AZURE_REDIRECT_URI`                 | `https://your-domain/api/auth/callback` |
| `NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED` | Set to `true` to show Microsoft button  |

#### Fly.io Deployment

Add a production redirect URI in Azure Portal > your app > **Authentication** > **Add a redirect URI**:

```
https://your-app.fly.dev/api/auth/callback
```

Set the secrets on Fly.io:

```bash
fly secrets set \
  AZURE_CLIENT_ID=your-client-id \
  AZURE_CLIENT_SECRET=your-client-secret \
  AZURE_REDIRECT_URI=https://your-app.fly.dev/api/auth/callback \
  NEXT_PUBLIC_MICROSOFT_AUTH_ENABLED=true
```

> **Note:** After setting these secrets, the email/password login is disabled. Make sure you have at least one user in the Users collection with a matching Microsoft account email before enabling OAuth.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) 15
- **CMS**: [Payload CMS](https://payloadcms.com/) 3
- **Database**: PostgreSQL
- **Styling**: Tailwind CSS v4
- **Deployment**: Fly.io

## License

MIT

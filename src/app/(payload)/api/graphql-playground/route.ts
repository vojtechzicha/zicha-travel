/* Based on the Payload-generated route, with one change: the playground is
 * not served on production deployments (compliance blocker 1 — the GraphQL
 * API carries personal data and the playground has no business being
 * routable in production). */
import config from '@payload-config'
import '@payloadcms/next/css'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'

const playgroundHandler = GRAPHQL_PLAYGROUND_GET(config)

export const GET =
  process.env.NODE_ENV === 'production'
    ? () => new Response('Not found', { status: 404 })
    : playgroundHandler

import config from '@payload-config'
import { getPayload } from 'payload'
import { payloadMcpStore } from './store'

/** Payload plus the connector's store, for the route handlers. */
export async function mcpRuntime() {
  const payload = await getPayload({ config })
  return { payload, store: payloadMcpStore(payload) }
}

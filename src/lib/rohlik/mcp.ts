import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { CartLine, RohlikProduct } from '../shopping'
import { ROHLIK_MCP_URL } from './oauth'

// Thin client over Rohlík's official MCP server, authenticated with the
// banker's OAuth token (src/utils/rohlikConnection.ts). Tool names and
// shapes are pinned to the server's tools/list as captured on 2026-10-13
// (scripts/rohlik-tools.mts prints it again): `batch_search_products`,
// `add_items_to_cart`, `get_checkout_link`. Rohlík calls the server
// experimental, so a changed shape surfaces as an empty search or a failed
// cart line, never as a crash. Every tool takes a `context` sentence that
// Rohlík uses for analytics; ours never carries personal data.

export interface McpTool {
  name: string
  description?: string
  inputSchema?: JsonSchema
}

interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  description?: string
}

export interface McpCallResult {
  content?: unknown[]
  structuredContent?: unknown
  isError?: boolean
}

// ─── transport ────────────────────────────────────────────────────────────

/** One MCP session per operation: the serverless instance may not live long. */
async function withClient<T>(token: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: 'zicha.travel', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(ROHLIK_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  try {
    return await run(client)
  } finally {
    await client.close().catch(() => undefined)
  }
}

export async function listTools(token: string): Promise<McpTool[]> {
  return withClient(token, async (client) => {
    const result = await client.listTools()
    return result.tools as McpTool[]
  })
}

export async function callTool(
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  return withClient(token, async (client) => {
    return (await client.callTool({ name, arguments: args })) as McpCallResult
  })
}

// ─── Rohlík's contract (pure) ─────────────────────────────────────────────

export const ROHLIK_TOOLS = {
  search: 'batch_search_products',
  addToCart: 'add_items_to_cart',
  checkoutLink: 'get_checkout_link',
  details: 'get_product_details',
} as const

const CONTEXT = {
  search: 'Find products for a shared group shopping list for a cottage trip.',
  addToCart: "Put the group's shopping list into the shopper's cart before the trip.",
  checkoutLink: 'Let the shopper finish the order on Rohlik.',
  details: 'Check the product picked for a shared group shopping list.',
} as const

/** Rohlík's image CDN; search results carry a site-relative `imgPath`. */
const IMAGE_HOST = 'https://cdn.rohlik.cz'
/** A product page answers at the bare product id. */
const productUrl = (productId: string) => `https://www.rohlik.cz/${productId}`

/** Search arguments: one keyword, the fields the list needs (asking for any
 * field replaces the default set, so the list is complete). */
export function searchArgs(query: string): Record<string, unknown> {
  return {
    queries: [
      {
        keyword: query,
        include_fields: ['productName', 'price', 'textualAmount', 'inStock', 'imgPath'],
      },
    ],
    context: CONTEXT.search,
  }
}

/** One add-to-cart call for all lines; Rohlík wants integer product ids. */
export function cartArgs(
  lines: Pick<CartLine, 'productId' | 'quantity'>[],
): Record<string, unknown> {
  return {
    items: lines
      .filter((line) => /^\d+$/.test(line.productId))
      .map((line) => ({ productId: Number(line.productId), quantity: line.quantity })),
    context: CONTEXT.addToCart,
  }
}

// ─── result normalisation (pure) ─────────────────────────────────────────

/** JSON payloads of a tool result: structuredContent and any JSON text blocks. */
function payloadsOf(result: McpCallResult): unknown[] {
  const payloads: unknown[] = []
  if (result.structuredContent != null) payloads.push(result.structuredContent)
  for (const block of result.content ?? []) {
    const text = (block as { type?: unknown; text?: unknown }).text
    if ((block as { type?: unknown }).type !== 'text' || typeof text !== 'string') continue
    try {
      payloads.push(JSON.parse(text))
    } catch {
      // prose, not JSON — nothing to extract
    }
  }
  return payloads
}

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : null

/** 32.9, { full: 32.9 }, "32,90 Kč" → 32.9 (search sends the object form) */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const match = value
      .replace(/\s/g, '')
      .replace(',', '.')
      .match(/-?\d+(\.\d+)?/)
    return match ? Number(match[0]) : null
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    for (const key of ['full', 'amount', 'value']) {
      if (key in obj) {
        const parsed = parsePrice(obj[key])
        if (parsed != null) return parsed
      }
    }
  }
  return null
}

function toProduct(raw: Record<string, unknown>): RohlikProduct | null {
  const productId = str(raw.productId)
  const name = str(raw.productName ?? raw.name)
  if (!productId || !/^\d+$/.test(productId) || !name) return null
  const imgPath = str(raw.imgPath)
  return {
    productId,
    name,
    price: parsePrice(raw.price),
    amount: str(raw.textualAmount),
    // only a site-relative path is accepted, so the host stays Rohlík's CDN
    imageUrl:
      imgPath && imgPath.startsWith('/') && !imgPath.startsWith('//') ? IMAGE_HOST + imgPath : null,
    url: productUrl(productId),
    inStock: typeof raw.inStock === 'boolean' ? raw.inStock : null,
  }
}

/**
 * RohlikProduct[] from a batch_search_products result
 * ({ result: { results: [{ products: [...] }] } }), deduplicated by id.
 */
export function normalizeProducts(result: McpCallResult): RohlikProduct[] {
  if (result.isError) return []
  for (const payload of payloadsOf(result)) {
    const root = (payload as { result?: unknown })?.result ?? payload
    const results = (root as { results?: unknown })?.results
    if (!Array.isArray(results)) continue
    const seen = new Set<string>()
    const products: RohlikProduct[] = []
    for (const entry of results) {
      const list = (entry as { products?: unknown })?.products
      if (!Array.isArray(list)) continue
      for (const raw of list) {
        if (typeof raw !== 'object' || raw === null) continue
        const product = toProduct(raw as Record<string, unknown>)
        if (product && !seen.has(product.productId)) {
          seen.add(product.productId)
          products.push(product)
        }
      }
    }
    if (products.length > 0) return products
  }
  return []
}

/** A checkout URL out of get_checkout_link's result (https only). */
export function checkoutUrlOf(result: McpCallResult): string | null {
  if (result.isError) return null
  const texts: string[] = []
  for (const payload of payloadsOf(result)) texts.push(JSON.stringify(payload))
  for (const block of result.content ?? []) {
    const text = (block as { text?: unknown }).text
    if (typeof text === 'string') texts.push(text)
  }
  for (const text of texts) {
    const match = text.match(/https:\/\/[a-z0-9.-]*rohlik\.cz\/[^\s"'<>)]*/i)
    if (match) return match[0]
  }
  return null
}

/** Did the cart call fail? isError, or a `success: false` in the payload. */
export function cartCallFailed(result: McpCallResult): boolean {
  if (result.isError) return true
  return payloadsOf(result).some((payload) => {
    const root = (payload as { result?: unknown })?.result ?? payload
    return (root as { success?: unknown })?.success === false
  })
}

// ─── high-level operations ───────────────────────────────────────────────

/** An image URL is kept only on Rohlík's product image path (the details
 * call carries no image, so the picked product's image rides along). */
export function isRohlikProductImage(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    /^https:\/\/cdn\.rohlik\.cz\/images\/grocery\/products\/[\w./-]+$/.test(url)
  )
}

/**
 * Products out of a get_product_details result
 * ({ result: { "<id>": { productId, name, textualAmount, prices: {
 * salePrice, originalPrice } } } }), keyed by product id. No image here.
 */
export function normalizeProductDetails(result: McpCallResult): Map<string, RohlikProduct> {
  const products = new Map<string, RohlikProduct>()
  if (result.isError) return products
  for (const payload of payloadsOf(result)) {
    const root = (payload as { result?: unknown })?.result ?? payload
    if (typeof root !== 'object' || root === null) continue
    for (const raw of Object.values(root as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) continue
      const entry = raw as Record<string, unknown>
      const productId = str(entry.productId)
      const name = str(entry.name)
      if (!productId || !/^\d+$/.test(productId) || !name) continue
      const prices = (entry.prices ?? {}) as Record<string, unknown>
      products.set(productId, {
        productId,
        name,
        price: parsePrice(prices.salePrice) ?? parsePrice(prices.originalPrice),
        amount: str(entry.textualAmount),
        imageUrl: null,
        url: productUrl(productId),
      })
    }
    if (products.size > 0) return products
  }
  return products
}

/** Current details of one product, straight from Rohlík; null when unknown. */
export async function productDetails(
  token: string,
  productId: string,
): Promise<RohlikProduct | null> {
  if (!/^\d+$/.test(productId)) return null
  const result = await callTool(token, ROHLIK_TOOLS.details, {
    product_ids: [Number(productId)],
    include_description: false,
    context: CONTEXT.details,
  })
  return normalizeProductDetails(result).get(productId) ?? null
}

export async function searchProducts(token: string, query: string): Promise<RohlikProduct[]> {
  const result = await callTool(token, ROHLIK_TOOLS.search, searchArgs(query))
  return normalizeProducts(result).slice(0, 10)
}

export interface AddToCartReport {
  /** product ids the server accepted */
  added: string[]
  failed: { productId: string; reason: string }[]
  /** where the banker finishes the order; null when Rohlík gave none */
  checkoutUrl: string | null
}

export async function addToCart(
  token: string,
  lines: Pick<CartLine, 'productId' | 'quantity'>[],
): Promise<AddToCartReport> {
  if (lines.length === 0) return { added: [], failed: [], checkoutUrl: null }
  return withClient(token, async (client) => {
    const ids = lines.map((line) => line.productId)
    const report: AddToCartReport = { added: [], failed: [], checkoutUrl: null }
    try {
      const result = (await client.callTool({
        name: ROHLIK_TOOLS.addToCart,
        arguments: cartArgs(lines),
      })) as McpCallResult
      if (cartCallFailed(result)) {
        const reason = firstText(result) ?? 'rejected'
        for (const productId of ids) report.failed.push({ productId, reason })
      } else {
        report.added.push(...ids)
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'error'
      for (const productId of ids) report.failed.push({ productId, reason })
    }
    if (report.added.length > 0) {
      try {
        report.checkoutUrl = checkoutUrlOf(
          (await client.callTool({
            name: ROHLIK_TOOLS.checkoutLink,
            arguments: { context: CONTEXT.checkoutLink },
          })) as McpCallResult,
        )
      } catch {
        // the cart is filled either way; the UI falls back to rohlik.cz
      }
    }
    return report
  })
}

function firstText(result: McpCallResult): string | null {
  for (const block of result.content ?? []) {
    const text = (block as { text?: unknown }).text
    if (typeof text === 'string' && text.trim() !== '') return text.trim().slice(0, 200)
  }
  return null
}

import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { decryptToken, encryptToken } from '@/lib/rohlik/crypto'
import {
  ROHLIK_MCP_URL,
  buildAuthorizeUrl,
  callbackUrl,
  createPkce,
  parseTokenResponse,
  oauthErrorReason,
  pkceChallenge,
  registerClient,
  signConnectState,
  verifyConnectState,
  type RohlikConnectState,
} from '@/lib/rohlik/oauth'
import {
  cartArgs,
  cartCallFailed,
  checkoutUrlOf,
  isRohlikProductImage,
  normalizeProductDetails,
  normalizeProducts,
  parsePrice,
  searchArgs,
} from '@/lib/rohlik/mcp'

const SECRET = 'test-secret'

describe('token encryption', () => {
  it('round-trips', () => {
    const sealed = encryptToken('eyJ.access.token', SECRET)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('eyJ.access.token')
    expect(decryptToken(sealed, SECRET)).toBe('eyJ.access.token')
  })

  it('uses a fresh IV every time', () => {
    expect(encryptToken('same', SECRET)).not.toBe(encryptToken('same', SECRET))
  })

  it('refuses tampered ciphertext, a different key and junk', () => {
    const sealed = encryptToken('secret-token', SECRET)
    const parts = sealed.split('.')
    const flipped = Buffer.from(parts[3], 'base64url')
    flipped[0] ^= 0xff
    parts[3] = flipped.toString('base64url')
    expect(decryptToken(parts.join('.'), SECRET)).toBeNull()
    expect(decryptToken(sealed, 'other-secret')).toBeNull()
    expect(decryptToken('v2.a.b.c', SECRET)).toBeNull()
    expect(decryptToken('not-a-token', SECRET)).toBeNull()
    expect(decryptToken(null, SECRET)).toBeNull()
  })
})

describe('PKCE', () => {
  it('is base64url(SHA-256(verifier)) without padding', () => {
    // cross-checked with: printf %s <verifier> | openssl dgst -sha256 -binary | base64url
    expect(pkceChallenge('dBjftJeZ4CVP-mJ92-9oI8MOm4XeD1ac1dc6yy6Z1Yo')).toBe(
      'SBDE0n3UU4wbsG3vnbg8ss5zv7VdUoOmqBpiraULduw',
    )
  })

  it('creates a 43-char verifier with its matching challenge', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(challenge).toBe(pkceChallenge(verifier))
  })
})

describe('connect state', () => {
  const state: RohlikConnectState = {
    userId: '7',
    chataId: '10',
    clientId: 'client-abc',
    redirectUri: 'http://localhost:3000/api/shopping-items/rohlik/callback',
    verifier: 'verifier',
    nonce: 'nonce-1',
    returnTo: '/pratele?view=shopping',
  }

  it('verifies for the same user and nonce', () => {
    const token = signConnectState(state, SECRET)
    expect(verifyConnectState(token, SECRET, { userId: 7, nonce: 'nonce-1' })).toEqual({
      ok: true,
      state,
    })
  })

  it('refuses another user, another nonce and a missing cookie', () => {
    const token = signConnectState(state, SECRET)
    expect(verifyConnectState(token, SECRET, { userId: 8, nonce: 'nonce-1' })).toMatchObject({
      ok: false,
      code: 'wrong-user',
    })
    expect(verifyConnectState(token, SECRET, { userId: null, nonce: 'nonce-1' })).toMatchObject({
      ok: false,
      code: 'wrong-user',
    })
    expect(verifyConnectState(token, SECRET, { userId: 7, nonce: 'other' })).toMatchObject({
      ok: false,
      code: 'nonce-mismatch',
    })
    expect(verifyConnectState(undefined, SECRET, { userId: 7, nonce: 'nonce-1' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
  })

  it('refuses an expired token, a foreign purpose and a wrong secret', () => {
    const expired = jwt.sign({ ...state, purpose: 'rohlik-connect' }, SECRET, { expiresIn: -10 })
    expect(verifyConnectState(expired, SECRET, { userId: 7, nonce: 'nonce-1' })).toMatchObject({
      ok: false,
      code: 'expired',
    })
    const foreign = jwt.sign({ ...state, purpose: 'vote-intent' }, SECRET)
    expect(verifyConnectState(foreign, SECRET, { userId: 7, nonce: 'nonce-1' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
    const token = signConnectState(state, SECRET)
    expect(verifyConnectState(token, 'other', { userId: 7, nonce: 'nonce-1' })).toMatchObject({
      ok: false,
      code: 'invalid',
    })
  })
})

describe('authorize URL', () => {
  it('carries PKCE, the resource and the callback', () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: 'client-abc',
        redirectUri: callbackUrl('https://pratele.zicha.travel'),
        challenge: 'challenge-xyz',
        nonce: 'nonce-1',
      }),
    )
    expect(url.origin + url.pathname).toBe('https://identity.rohlik.cz/oauth2/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-abc',
      redirect_uri: 'https://pratele.zicha.travel/api/shopping-items/rohlik/callback',
      scope: 'openid email roles',
      state: 'nonce-1',
      code_challenge: 'challenge-xyz',
      code_challenge_method: 'S256',
      resource: ROHLIK_MCP_URL,
    })
  })
})

describe('token response', () => {
  it('computes the expiry and keeps the old refresh token when none rotates in', () => {
    const tokens = parseTokenResponse(
      { access_token: 'a', expires_in: 600 },
      1_000_000,
      'old-refresh',
    )
    expect(tokens).toEqual({
      accessToken: 'a',
      refreshToken: 'old-refresh',
      expiresAt: new Date(1_000_000 + 600_000),
    })
  })

  it('takes a rotated refresh token and refuses a response without access token', () => {
    expect(
      parseTokenResponse({ access_token: 'a', refresh_token: 'new' }, 0, 'old').refreshToken,
    ).toBe('new')
    expect(() => parseTokenResponse({ token_type: 'Bearer' })).toThrow()
  })
})

// Shapes captured from the real server on 2026-10-13 (scripts/rohlik-tools.mts)
const searchResult = {
  structuredContent: {
    result: {
      success: true,
      results: [
        {
          query: { keyword: 'pivo' },
          products: [
            {
              productName: 'Braník Pivo výčepní světlé PET',
              textualAmount: '2 l',
              inStock: true,
              imgPath: '/images/grocery/products/1290309/1290309-1759758165251.jpg',
              price: { full: 50.9, currency: 'Kč' },
              productId: 1290309,
              badges: ['promoted', 'mature-only'],
            },
            {
              productName: 'Staropramen nealkoholické pivo 4×0,5 l',
              textualAmount: '2 l',
              inStock: false,
              imgPath: '//evil.example/x.jpg',
              price: { full: 79.75, currency: 'Kč' },
              productId: 1378253,
            },
            { productName: 'Bez id' },
            { productId: 1290309, productName: 'duplicate' },
          ],
          total_found: 2,
          success: true,
        },
      ],
    },
  },
}

describe('Rohlík tool arguments', () => {
  it('asks for one keyword with every field the list shows', () => {
    expect(searchArgs('pivo')).toEqual({
      queries: [
        {
          keyword: 'pivo',
          include_fields: ['productName', 'price', 'textualAmount', 'inStock', 'imgPath'],
        },
      ],
      context: expect.any(String),
    })
  })

  it('adds all lines in one call with integer product ids', () => {
    expect(
      cartArgs([
        { productId: '1290309', quantity: 6 },
        { productId: '712705', quantity: 2 },
        { productId: 'not-a-number', quantity: 1 },
      ]),
    ).toEqual({
      items: [
        { productId: 1290309, quantity: 6 },
        { productId: 712705, quantity: 2 },
      ],
      context: expect.any(String),
    })
  })

  it('never puts personal data into the analytics context', () => {
    expect(String(searchArgs('x').context)).not.toMatch(/@|Vojt/)
    expect(String(cartArgs([]).context)).not.toMatch(/@|Vojt/)
  })
})

describe('normalizeProducts', () => {
  it('maps a real batch_search_products result', () => {
    expect(normalizeProducts(searchResult)).toEqual([
      {
        productId: '1290309',
        name: 'Braník Pivo výčepní světlé PET',
        price: 50.9,
        amount: '2 l',
        imageUrl: 'https://cdn.rohlik.cz/images/grocery/products/1290309/1290309-1759758165251.jpg',
        url: 'https://www.rohlik.cz/1290309',
        inStock: true,
      },
      {
        productId: '1378253',
        name: 'Staropramen nealkoholické pivo 4×0,5 l',
        price: 79.75,
        amount: '2 l',
        imageUrl: null,
        url: 'https://www.rohlik.cz/1378253',
        inStock: false,
      },
    ])
  })

  it('reads the same shape from a JSON text block', () => {
    const asText = {
      content: [{ type: 'text', text: JSON.stringify(searchResult.structuredContent.result) }],
    }
    expect(normalizeProducts(asText).map((p) => p.productId)).toEqual(['1290309', '1378253'])
  })

  it('returns nothing for errors and validation prose', () => {
    expect(normalizeProducts({ ...searchResult, isError: true })).toEqual([])
    expect(
      normalizeProducts({ content: [{ type: 'text', text: '2 validation errors for call' }] }),
    ).toEqual([])
  })

  it('parses prices in the shapes Rohlík uses', () => {
    expect(parsePrice(3.82)).toBe(3.82)
    expect(parsePrice({ full: 50.9, currency: 'Kč' })).toBe(50.9)
    expect(parsePrice('1 299,50 Kč')).toBe(1299.5)
    expect(parsePrice(null)).toBeNull()
  })
})

describe('cart and checkout results', () => {
  it('treats isError and success:false as a failed cart call', () => {
    expect(cartCallFailed({ isError: true })).toBe(true)
    expect(cartCallFailed({ structuredContent: { result: { success: false } } })).toBe(true)
    expect(cartCallFailed({ structuredContent: { result: { success: true } } })).toBe(false)
  })

  it('finds an https rohlik.cz checkout link and nothing else', () => {
    expect(
      checkoutUrlOf({
        content: [{ type: 'text', text: 'Hotovo: https://www.rohlik.cz/objednavka/kosik' }],
      }),
    ).toBe('https://www.rohlik.cz/objednavka/kosik')
    expect(checkoutUrlOf({ structuredContent: { url: 'https://evil.example/kosik' } })).toBeNull()
    expect(
      checkoutUrlOf({
        isError: true,
        content: [{ type: 'text', text: 'https://www.rohlik.cz/x' }],
      }),
    ).toBeNull()
  })
})

describe('product details (server-side verification)', () => {
  // shape captured from get_product_details on 2026-10-13
  const details = {
    structuredContent: {
      result: {
        '712705': {
          productId: 712705,
          name: 'Olma Čerstvé mléko polotučné 1,5 %',
          brand: null,
          textualAmount: '1 l',
          prices: { originalPrice: 34.9, salePrice: null, unitPrice: 34.9, currency: 'CZK' },
          stock: { availabilityStatus: 'AVAILABLE' },
        },
        '1406260': {
          productId: 1406260,
          name: 'Miil Selské mléko',
          textualAmount: '1 l',
          prices: { originalPrice: 39.9, salePrice: 29.9 },
        },
        broken: { name: 'no id' },
      },
    },
  }

  it('maps details by id, preferring the sale price', () => {
    const products = normalizeProductDetails(details)
    expect(products.get('712705')).toEqual({
      productId: '712705',
      name: 'Olma Čerstvé mléko polotučné 1,5 %',
      price: 34.9,
      amount: '1 l',
      imageUrl: null,
      url: 'https://www.rohlik.cz/712705',
      inStock: true,
    })
    expect(products.get('1406260')?.price).toBe(29.9)
    // no stock block in the answer: unknown, not sold out
    expect(products.get('1406260')?.inStock).toBeNull()
    expect(products.size).toBe(2)
  })

  it('returns nothing for an error result', () => {
    expect(normalizeProductDetails({ ...details, isError: true }).size).toBe(0)
  })

  it('keeps only Rohlík product image URLs', () => {
    expect(
      isRohlikProductImage('https://cdn.rohlik.cz/images/grocery/products/712705/712705-1.jpg'),
    ).toBe(true)
    expect(isRohlikProductImage('https://cdn.example.com/x.jpg')).toBe(false)
    expect(isRohlikProductImage('https://cdn.rohlik.cz/other/x.jpg')).toBe(false)
    expect(isRohlikProductImage('javascript:alert(1)')).toBe(false)
    expect(isRohlikProductImage(null)).toBe(false)
  })
})

describe('OAuth error reasons', () => {
  const response = (status: number, body: string) =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } })

  it("reads Rohlík's error and description", async () => {
    expect(
      await oauthErrorReason(
        response(
          400,
          JSON.stringify({
            error: 'invalid_request',
            error_description: 'Redirect URI is not allowed for dynamic client registration.',
          }),
        ),
      ),
    ).toBe('invalid_request: Redirect URI is not allowed for dynamic client registration.')
  })

  it("stays empty for a body that isn't OAuth JSON", async () => {
    expect(await oauthErrorReason(response(502, '<html>bad gateway</html>'))).toBe('')
  })

  it('puts the reason into the registration error for the logs', async () => {
    const refused = () =>
      Promise.resolve(
        response(400, JSON.stringify({ error: 'invalid_request', error_description: 'nope' })),
      )
    await expect(
      registerClient('https://pratele.zicha.travel/cb', refused as typeof fetch),
    ).rejects.toThrow('client registration failed (invalid_request: nope)')
  })
})

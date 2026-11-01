// Verified TLS for Supabase Postgres connections.
//
// Supabase signs its database and connection-pooler certificates with its own
// root CA ("Supabase Root 2021 CA"), which isn't in Node's trust store, so the
// usual `sslmode=require` fails with SELF_SIGNED_CERT_IN_CHAIN. Pinning that CA
// gives an encrypted connection AND an authenticated server (the hostname is
// checked too). The Supabase projects enforce SSL, so a connection without
// this is refused.
//
// The certificate is public: Supabase dashboard > Database settings > SSL, or
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
// SHA-256 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
// Valid until 2031-04-26.

export const SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`

const SUPABASE_HOST = /\.supabase\.(co|com)$/
// pg merges connection-string parameters OVER the `ssl` option, so any of
// these in DATABASE_URI would silently replace the pinned CA.
const SSL_URI_PARAMS = /[?&](sslmode|sslrootcert|sslcert|sslkey|uselibpqcompat)=/i

/**
 * The pg `ssl` option for a connection string: verified TLS for Supabase
 * hosts, `undefined` (plain TCP) for anything else such as the local Docker
 * database.
 *
 * @param {string | undefined} connectionString
 * @returns {{ ca: string, rejectUnauthorized: true } | undefined}
 */
export function pgSslFor(connectionString) {
  if (!connectionString) return undefined
  let host
  try {
    host = new URL(connectionString).hostname
  } catch {
    return undefined
  }
  if (!SUPABASE_HOST.test(host)) return undefined
  if (SSL_URI_PARAMS.test(connectionString)) {
    throw new Error(
      'DATABASE_URI must not set sslmode/sslrootcert/uselibpqcompat: they override the verified TLS settings in src/lib/db-ssl.mjs',
    )
  }
  return { ca: SUPABASE_ROOT_CA, rejectUnauthorized: true }
}

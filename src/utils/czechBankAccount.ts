/**
 * Czech bank account number <-> IBAN conversion utilities.
 *
 * Czech account format: [prefix-]number/bankCode  (e.g. "19-2000145399/0800")
 * Czech IBAN format:    CZkk BBBB PPPPPP AAAAAAAAAA  (24 chars total)
 *   B = bank code (4 digits)
 *   P = prefix (6 digits, zero-padded)
 *   A = account number (10 digits, zero-padded)
 */

/**
 * Convert a Czech account number to IBAN.
 * Returns null if the input is not a valid Czech account number.
 */
export function accountToIban(input: string): string | null {
  const clean = input.replace(/\s/g, '')
  const match = clean.match(/^(?:(\d{1,6})-)?(\d{1,10})\/(\d{4})$/)
  if (!match) return null

  const prefix = match[1] || '0'
  const accountNumber = match[2]
  const bankCode = match[3]

  const bban = bankCode + prefix.padStart(6, '0') + accountNumber.padStart(10, '0')

  // IBAN check digit calculation:
  // 1. Append country code numeric equivalent + "00": C=12, Z=35 -> "123500"
  // 2. checkDigit = 98 - (numericBBAN mod 97)
  const numericString = bban + '123500'
  const checkDigits = (98n - (BigInt(numericString) % 97n)).toString().padStart(2, '0')

  return 'CZ' + checkDigits + bban
}

/**
 * Convert a Czech IBAN to account number format.
 * Returns null if the input is not a valid Czech IBAN.
 */
export function ibanToAccount(input: string): string | null {
  const clean = input.replace(/\s/g, '').toUpperCase()

  if (!/^CZ\d{22}$/.test(clean)) return null

  // Validate check digits: rearrange, convert letters to numbers, mod 97 must equal 1
  const rearranged = clean.slice(4) + clean.slice(0, 4)
  const numericString = rearranged.replace(/[A-Z]/g, (c) =>
    (c.charCodeAt(0) - 55).toString(),
  )
  if (BigInt(numericString) % 97n !== 1n) return null

  const bankCode = clean.slice(4, 8)
  const prefix = clean.slice(8, 14).replace(/^0+/, '')
  const accountNumber = clean.slice(14, 24).replace(/^0+/, '')

  if (!accountNumber) return null

  if (prefix) {
    return `${prefix}-${accountNumber}/${bankCode}`
  }
  return `${accountNumber}/${bankCode}`
}

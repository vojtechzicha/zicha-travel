'use client'

import { QRCodeSVG } from 'qrcode.react'

interface QRPaymentProps {
  amount: number
  iban: string
  accountNumber?: string
  message: string
}

export function QRPayment({ amount, iban, accountNumber, message }: QRPaymentProps) {
  // Generate SPD (Structured Payment Description) string for Czech banking
  // Amount must be integer, message must be URL-encoded (matching Paylibo format)
  const qrString = `SPD*1.0*ACC:${iban}*AM:${Math.round(amount)}*CC:CZK*MSG:${encodeURIComponent(message)}`

  return (
    <div className="text-center inline-block">
      <QRCodeSVG value={qrString} size={160} />
    </div>
  )
}

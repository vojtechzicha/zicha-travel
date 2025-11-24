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
  const qrString = `SPD*1.0*ACC:${iban}*AM:${amount.toFixed(2)}*CC:CZK*MSG:${message}`

  return (
    <div className="bg-white p-5 rounded-2xl text-center shadow-lg inline-block">
      <div className="bg-white p-2 rounded-lg inline-block">
        <QRCodeSVG value={qrString} size={140} />
      </div>
      <p className="mt-3 font-mono text-sm text-gray-700">
        {accountNumber || iban}
      </p>
    </div>
  )
}

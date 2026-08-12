'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { track } from '@/lib/analytics'

interface QRPaymentProps {
  amount: number
  accountNumber: string // Czech format: "123456/0100"
  message: string
}

export function QRPayment({ amount, accountNumber, message }: QRPaymentProps) {
  const t = useTranslations('finance')
  // rendered = someone actually reached the "pay this" moment
  useEffect(() => {
    track('qr_payment_shown', {})
  }, [])
  // Parse Czech account number format "accountNumber/bankCode"
  const [accNum, bankCode] = accountNumber.split('/')

  const params = new URLSearchParams({
    compress: 'false',
    size: '440',
    accountNumber: accNum,
    bankCode: bankCode,
    amount: Math.round(amount).toString(),
    currency: 'CZK',
    message: message,
  })

  const url = `https://api.paylibo.com/paylibo/generator/czech/image?${params.toString()}`

  return (
    // The QR must stay on a white background in both themes to remain scannable
    <div className="text-center inline-block bg-white rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={t('qrPayment.alt')} className="w-full max-w-[220px]" />
    </div>
  )
}

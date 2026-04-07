interface QRPaymentProps {
  amount: number
  accountNumber: string // Czech format: "123456/0100"
  message: string
}

export function QRPayment({ amount, accountNumber, message }: QRPaymentProps) {
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
    <div className="text-center inline-block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="QR platba" className="w-full max-w-[220px]" />
    </div>
  )
}

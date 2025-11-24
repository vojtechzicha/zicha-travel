'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, QrCode } from 'lucide-react'
import { QRPayment } from './QRPayment'
import { formatCurrency } from '@/lib/formatCurrency'
import type { Participant, Chata } from '@/payload-types'

interface Creditor {
  name: string
  amount: number
}

interface Debtor {
  name: string
  amount: number
}

interface SettlementActionsProps {
  participant: Participant
  balance: number
  isBanker: boolean
  bankerAccount?: {
    number: string
    iban: string
  }
  chataShortName: string
  creditors: Creditor[]
  debtors: Debtor[]
  participants: Participant[]
}

export function SettlementActions({
  participant,
  balance,
  isBanker,
  bankerAccount,
  chataShortName,
  creditors,
  debtors,
  participants,
}: SettlementActionsProps) {
  const [showQr, setShowQr] = useState<string | null>(null)

  // Use 1 Kč threshold to match backend - avoids showing small rounding differences
  const isDebtor = balance < -1
  const isCreditor = balance > 1

  // Banker view - show debtors and creditors
  if (isBanker) {
    // Filter out the banker from creditors (backend already filters out < 1 Kč)
    const activeDebtors = debtors
    const activeCreditors = creditors.filter((c) => c.name !== participant.name)

    return (
      <div className="grid md:grid-cols-2 gap-6">
          {/* Debtors - people who owe money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 mb-3 flex items-center gap-2">
              <ArrowDown className="text-red-600" size={20} />
              Dluží ({activeDebtors.length})
            </h4>
            <div className="space-y-2">
              {activeDebtors.length > 0 ? (
                activeDebtors.map((debtor) => (
                  <div
                    key={debtor.name}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white border-2 border-gray-200"
                  >
                    <span className="font-medium">{debtor.name}</span>
                    <span className="font-bold text-red-600">
                      {formatCurrency(debtor.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Nikdo nedluží
                </p>
              )}
            </div>
          </div>

          {/* Creditors - people who are owed money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 mb-3 flex items-center gap-2">
              <ArrowUp className="text-green-600" size={20} />
              Zaplatit ({activeCreditors.length})
            </h4>
            <div className="space-y-2">
              {activeCreditors.length > 0 ? (
                activeCreditors.map((creditor) => {
                  // Find participant to get IBAN
                  const creditorParticipant = participants.find(
                    (p) => p.name === creditor.name
                  )
                  const hasIban = creditorParticipant?.iban

                  return (
                    <div
                      key={creditor.name}
                      className="bg-white border-2 border-gray-200 rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{creditor.name}</span>
                        <span className="font-bold text-green-600">
                          {formatCurrency(creditor.amount)}
                        </span>
                      </div>
                      {hasIban && (
                        <>
                          <button
                            onClick={() =>
                              setShowQr(showQr === creditor.name ? null : creditor.name)
                            }
                            className="mt-2 text-sm text-primary hover:text-primary-dark flex items-center gap-1"
                          >
                            <QrCode size={14} />
                            {showQr === creditor.name ? 'Skrýt QR' : 'Zobrazit QR'}
                          </button>
                          {showQr === creditor.name && (
                            <div className="mt-3">
                              <QRPayment
                                amount={creditor.amount}
                                iban={creditorParticipant.iban!}
                                accountNumber={creditorParticipant.accountNumber ?? undefined}
                                message={`Vyrovnani - ${chataShortName}`}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })
              ) : (
                <p className="text-gray-500 text-center py-4">
                  Nikomu nezaplatit
                </p>
              )}
            </div>
          </div>
        </div>
    )
  }

  // Regular participant view - only shown when not settled
  return (
    <div className="space-y-4">
      {isDebtor && bankerAccount && (
        <div className="bg-red-50 border-2 border-red-500 rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="bg-red-500 p-2 rounded-lg">
              <ArrowDown className="text-white" size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-lg text-red-800 mb-1">
                Zaplatit bankéři
              </h4>
              <p className="text-3xl font-bold text-red-600">
                {formatCurrency(Math.abs(balance))}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Číslo účtu:</span>
              <span className="font-mono font-semibold">
                {bankerAccount.number}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IBAN:</span>
              <span className="font-mono text-xs">
                {bankerAccount.iban}
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowQr(showQr ? null : 'payment')}
            className="mt-4 w-full bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <QrCode size={20} />
            {showQr ? 'Skrýt QR kód' : 'Zobrazit QR kód'}
          </button>

          {showQr && (
            <div className="mt-4 flex justify-center">
              <QRPayment
                amount={Math.abs(balance)}
                iban={bankerAccount.iban}
                accountNumber={bankerAccount.number}
                message={`Vyrovnani - ${chataShortName}`}
              />
            </div>
          )}
        </div>
      )}

      {isCreditor && (
        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <div className="bg-green-500 p-2 rounded-lg">
              <ArrowUp className="text-white" size={24} />
            </div>
            <div>
              <h4 className="font-semibold text-lg text-green-800 mb-1">
                Máte dostat od bankéře
              </h4>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(balance)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Bankéř vám pošle peníze po vyrovnání všech dluhů.
          </p>
        </div>
      )}
    </div>
  )
}

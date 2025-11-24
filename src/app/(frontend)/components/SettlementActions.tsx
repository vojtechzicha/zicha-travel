'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown, QrCode, Check } from 'lucide-react'
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
  const [checkedDebtors, setCheckedDebtors] = useState<Set<string>>(new Set())

  const isDebtor = balance < -0.01
  const isCreditor = balance > 0.01
  const isSettled = Math.abs(balance) <= 0.01

  const toggleDebtor = (name: string) => {
    setCheckedDebtors((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  // Banker view - show debtors and creditors
  if (isBanker) {
    // Filter out the banker from creditors (backend already filters out < 1 Kč)
    const activeDebtors = debtors
    const activeCreditors = creditors.filter((c) => c.name !== participant.name)

    return (
      <div className="space-y-6">
        <h3 className="font-serif text-2xl font-bold text-gray-900">
          Přehled vyrovnání
        </h3>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Debtors - people who owe money */}
          <div>
            <h4 className="font-semibold text-lg text-gray-900 mb-3 flex items-center gap-2">
              <ArrowDown className="text-red-600" size={20} />
              Dluží ({activeDebtors.length})
            </h4>
            <div className="space-y-2">
              {activeDebtors.length > 0 ? (
                activeDebtors.map((debtor) => {
                  const isChecked = checkedDebtors.has(debtor.name)
                  return (
                    <button
                      key={debtor.name}
                      onClick={() => toggleDebtor(debtor.name)}
                      className={`
                        w-full flex items-center justify-between p-3 rounded-xl
                        transition-all border-2
                        ${
                          isChecked
                            ? 'bg-green-50 border-green-500'
                            : 'bg-white border-gray-200 hover:border-gray-300'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`
                          w-5 h-5 rounded border-2 flex items-center justify-center
                          ${
                            isChecked
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300'
                          }
                        `}
                        >
                          {isChecked && <Check size={14} className="text-white" />}
                        </div>
                        <span className="font-medium">{debtor.name}</span>
                      </div>
                      <span className="font-bold text-red-600">
                        {formatCurrency(debtor.amount)}
                      </span>
                    </button>
                  )
                })
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
                                accountNumber={creditorParticipant.accountNumber}
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
      </div>
    )
  }

  // Regular participant view
  return (
    <div className="space-y-6">
      <h3 className="font-serif text-2xl font-bold text-gray-900">
        Vyrovnání
      </h3>

      {isSettled && (
        <div className="bg-green-50 border-2 border-green-500 rounded-xl p-6 text-center">
          <div className="inline-block bg-green-500 p-3 rounded-full mb-3">
            <Check className="text-white" size={32} />
          </div>
          <p className="text-lg font-semibold text-green-800">
            Vše je vyrovnáno!
          </p>
        </div>
      )}

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

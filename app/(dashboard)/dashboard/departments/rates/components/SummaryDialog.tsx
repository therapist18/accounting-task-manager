// @ts-nocheck
"use client"

import React from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Info } from "lucide-react"

interface SummaryDialogProps {
  currentPeriod: {
    description: string
    effectiveFrom: Date
    effectiveTo: Date | null
  }
}

export default function SummaryDialog({ currentPeriod }: SummaryDialogProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const summaryData = {
    currentChanges: [
      "Standardized fees across all networks",
      "Transfers to unregistered users discontinued",
      "Free transactions for amounts KSh 1-100",
      "Maximum transaction: KSh 250,000",
      "Daily limit: KSh 500,000"
    ],
    transactionTypes: [
      "Send Money (M-Pesa, Airtel, T-Kash)",
      "Till Number Payments",
      "Paybill Payments",
      "Agent Withdrawals",
      "ATM Withdrawals"
    ],
    keyFeatures: [
      "Real-time charge calculation",
      "Historical rate periods",
      "Editable transaction rates",
      "Export to Excel functionality",
      "Auto-save capabilities"
    ]
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild className="text-gray-500 align-middle cursor-pointer">
          <Info className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            M-Pesa Transaction Summary
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 text-sm">
          <div>
            <h4 className="font-semibold text-blue-700 mb-2">Current Changes ({currentPeriod.description})</h4>
            <ul className="space-y-1 text-muted-foreground">
              {summaryData.currentChanges.map((item, index) => (
                <li key={index}>
                  <span className="text-xs">•</span>
                  <span className="ml-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-blue-700 mb-2">Transaction Types</h4>
            <ul className="space-y-1 text-muted-foreground">
              {summaryData.transactionTypes.map((item, index) => (
                <li key={index}>
                  <span className="text-xs">•</span>
                  <span className="ml-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-blue-700 mb-2">Key Features</h4>
            <ul className="space-y-1 text-muted-foreground">
              {summaryData.keyFeatures.map((item, index) => (
                <li key={index}>
                  <span className="text-xs">•</span>
                  <span className="ml-1">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

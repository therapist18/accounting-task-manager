// @ts-nocheck
"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Calculator, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ChargeCalculatorDialogProps {
  transactionTypes: MPesaTransactionType[]
  onChargeCalculated?: (amount: number, transactionType: string, charge: number) => void
}

export default function ChargeCalculatorDialog({ transactionTypes, onChargeCalculated }: ChargeCalculatorDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [calculatorState, setCalculatorState] = useState({
    amount: '',
    type: '',
  })

  // Calculate charge for a given amount and transaction type
  const calculateCharge = (amount: number, transactionTypeId: string): number => {
    const transactionType = transactionTypes.find(t => t.id === transactionTypeId)
    if (!transactionType) return 0

    const range = transactionType.ranges.find(r => amount >= r.amountFrom && amount <= r.amountTo)
    return range ? range.charge : 0
  }

  // Handle calculator
  const handleCalculatorAmountChange = (amount: string) => {
    setCalculatorState(prev => ({ ...prev, amount }))
    
    if (amount && calculatorState.type) {
      const numAmount = parseFloat(amount)
      const charge = calculateCharge(numAmount, calculatorState.type)
      onChargeCalculated?.(numAmount, calculatorState.type, charge)
    }
  }

  const handleCalculatorTypeChange = (type: string) => {
    setCalculatorState(prev => ({ ...prev, type }))
    
    if (calculatorState.amount && type) {
      const numAmount = parseFloat(calculatorState.amount)
      const charge = calculateCharge(numAmount, type)
      onChargeCalculated?.(numAmount, type, charge)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8 flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Charge Calculator
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            Charge Calculator
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="calc-amount" className="text-xs">Amount (KSh)</Label>
              <Input
                id="calc-amount"
                type="number"
                placeholder="Enter amount"
                value={calculatorState.amount}
                onChange={(e) => handleCalculatorAmountChange(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="calc-type" className="text-xs">Transaction Type</Label>
              <Select value={calculatorState.type} onValueChange={handleCalculatorTypeChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {calculatorState.amount && calculatorState.type && (
            <div className="bg-blue-50 p-2 rounded text-center">
              <span className="text-xs text-blue-700">
                Charge: <strong>KSh {calculateCharge(parseFloat(calculatorState.amount), calculatorState.type)}</strong>
              </span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

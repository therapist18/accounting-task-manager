// @ts-nocheck
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { WizardData } from "../page"

interface StepThreeProps {
  data: WizardData
  updateData: (data: Partial<WizardData>) => void
  onNext: () => void
  onPrev: () => void
}

export default function StepThree({ data, updateData, onNext, onPrev }: StepThreeProps) {
  const [appliedBy, setAppliedBy] = useState(data.appliedBy || "")
  const [batch, setBatch] = useState(data.batch || "")
  const [accountUsed, setAccountUsed] = useState(data.accountUsed || "")
  const [referenceNumber, setReferenceNumber] = useState(data.referenceNumber || "")

  const handleNext = () => {
    updateData({
      appliedBy,
      batch,
      accountUsed,
      referenceNumber,
    })
    onNext()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3: Additional Metadata Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="appliedBy">Applied By</Label>
            <Input
              id="appliedBy"
              value={appliedBy}
              onChange={(e) => setAppliedBy(e.target.value)}
              placeholder="Enter who applied"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="batch">Batch</Label>
            <Input
              id="batch"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              placeholder="Enter batch number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountUsed">Account Used</Label>
            <Input
              id="accountUsed"
              value={accountUsed}
              onChange={(e) => setAccountUsed(e.target.value)}
              placeholder="Enter account used"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referenceNumber">Reference Number</Label>
            <Input
              id="referenceNumber"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="Enter reference number"
            />
          </div>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onPrev}>
            Previous
          </Button>
          <Button onClick={handleNext}>Next Step</Button>
        </div>
      </CardContent>
    </Card>
  )
}

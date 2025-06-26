"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { FileText, Calendar, Clock, CheckCircle } from "lucide-react"

interface DocumentSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement: any
  onSelect: (requirementId: string, selectedDocuments: any[]) => void
}

export default function DocumentSelectionDialog({
  open,
  onOpenChange,
  requirement,
  onSelect,
}: DocumentSelectionDialogProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>("")

  if (!requirement) return null

  const handleSelect = () => {
    const selectedDoc = requirement.existingDocuments.find((doc: any) => doc.id === selectedDocId)
    if (selectedDoc) {
      onSelect(requirement.id, [selectedDoc])
    }
  }

  // Sort documents by issue date (most recent first)
  const sortedDocuments = [...requirement.existingDocuments].sort((a, b) => {
    const dateA = new Date(a.issueDate || a.uploadedAt)
    const dateB = new Date(b.issueDate || b.uploadedAt)
    return dateB.getTime() - dateA.getTime()
  })

  // Set default selection to most recent if not already selected
  if (!selectedDocId && sortedDocuments.length > 0) {
    setSelectedDocId(sortedDocuments[0].id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">Select {requirement.name}</DialogTitle>
          <DialogDescription className="text-slate-600">
            Multiple documents found. Please select which one to use for this application. The most recent document is
            selected by default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={selectedDocId} onValueChange={setSelectedDocId}>
            {sortedDocuments.map((doc: any, index: number) => (
              <div
                key={doc.id}
                className="flex items-start space-x-3 p-4 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <RadioGroupItem value={doc.id} id={doc.id} className="mt-1" />
                <Label htmlFor={doc.id} className="flex-1 cursor-pointer">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <FileText className="h-5 w-5 text-slate-500 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <h4 className="font-medium text-slate-900">{doc.fileName}</h4>
                          {index === 0 && (
                            <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">Most Recent</Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-slate-600">
                          {doc.issueDate && (
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>Issue Date: {new Date(doc.issueDate).toLocaleDateString()}</span>
                            </div>
                          )}
                          {doc.expiryDate && (
                            <div className="flex items-center space-x-1">
                              <Calendar className="h-3 w-3" />
                              <span>Expiry Date: {new Date(doc.expiryDate).toLocaleDateString()}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>Added: {new Date(doc.uploadedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {selectedDocId === doc.id && <CheckCircle className="h-5 w-5 text-blue-600" />}
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSelect} disabled={!selectedDocId}>
              Select Document
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

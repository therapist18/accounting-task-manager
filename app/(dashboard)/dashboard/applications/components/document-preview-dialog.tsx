"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Download, Sparkles, Calendar, Clock } from "lucide-react"

interface DocumentPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: any
}

export default function DocumentPreviewDialog({ open, onOpenChange, document }: DocumentPreviewDialogProps) {
  if (!document) return null

  const handleDownload = () => {
    // Simulate download
    console.log("Downloading:", document.fileName)
  }

  const isUploadedDocument = !!document.file
  const fileName = document.fileName || document.uploadedFile

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-lg font-semibold text-slate-900">
            <FileText className="h-5 w-5" />
            <span>{fileName} Preview</span>
          </DialogTitle>
          <DialogDescription className="text-slate-600">Document details and information</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Document Info */}
          <Card className="border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base font-semibold text-slate-900">Document Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">File Name:</span>
                <span className="font-medium text-slate-900">{fileName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Status:</span>
                <Badge className="bg-green-50 text-green-700 border-green-200">
                  {isUploadedDocument ? "Uploaded" : "Selected"}
                </Badge>
              </div>
              {document.issueDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Issue Date:</span>
                  <span className="font-medium text-slate-900 flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(document.issueDate).toLocaleDateString()}</span>
                  </span>
                </div>
              )}
              {document.expiryDate && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Expiry Date:</span>
                  <span className="font-medium text-slate-900 flex items-center space-x-1">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(document.expiryDate).toLocaleDateString()}</span>
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Added:</span>
                <span className="font-medium text-slate-900 flex items-center space-x-1">
                  <Clock className="h-3 w-3" />
                  <span>{new Date(document.uploadedAt).toLocaleDateString()}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Document Preview */}
          <Card className="border-slate-200">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50">
              <CardTitle className="text-base font-semibold text-slate-900">Document Preview</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="bg-slate-100 rounded-lg p-8 text-center">
                <FileText className="h-16 w-16 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600">Document preview would appear here</p>
                <p className="text-sm text-slate-500 mt-2">
                  In a real implementation, this would show the actual document content
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Extracted Data */}
          {document.extractedData && (
            <Card className="border-slate-200">
              <CardHeader className="border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-base font-semibold text-slate-900 flex items-center space-x-2">
                  <Sparkles className="h-4 w-4 text-green-600" />
                  <span>AI Extracted Data</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(document.extractedData).map(([key, value]) => (
                    <div key={key} className="space-y-1">
                      <span className="text-sm text-slate-600 capitalize">{key.replace("_", " ")}:</span>
                      <p className="font-medium text-slate-900">{value as string}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

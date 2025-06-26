"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, X, CheckCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement: any
  onUpload: (requirementId: string, file: File) => void
}

export default function DocumentUploadDialog({ open, onOpenChange, requirement, onUpload }: DocumentUploadDialogProps) {
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !requirement) return

    setUploading(true)
    await onUpload(requirement.id, selectedFile)
    setUploading(false)
    setSelectedFile(null)
  }

  const acceptedTypes = ".pdf,.jpg,.jpeg,.png,.doc,.docx"

  if (!requirement) return null

  const currentCount = requirement.selectedDocuments.length + requirement.uploadedDocuments.length
  const remaining = requirement.quantity - currentCount

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-900">Upload {requirement.name}</DialogTitle>
          <DialogDescription className="text-slate-600">
            {requirement.description}
            {requirement.required && (
              <span className="block mt-2 text-red-600 font-medium text-sm">This document is required</span>
            )}
            {requirement.quantity > 1 && (
              <span className="block mt-2 text-blue-600 font-medium text-sm">
                {remaining} more document(s) needed ({currentCount}/{requirement.quantity})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Drop Zone */}
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
              dragActive ? "border-blue-400 bg-blue-50" : "border-slate-300",
              selectedFile ? "border-green-400 bg-green-50" : "",
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="space-y-3">
                <CheckCircle className="h-10 w-10 text-green-600 mx-auto" />
                <div>
                  <p className="font-medium text-green-900">{selectedFile.name}</p>
                  <p className="text-sm text-green-700">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <X className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Upload className="h-10 w-10 text-slate-400 mx-auto" />
                <div>
                  <p className="font-medium text-slate-900">Drop your file here</p>
                  <p className="text-sm text-slate-500">or click to browse</p>
                </div>
                <input
                  type="file"
                  accept={acceptedTypes}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button variant="outline" className="cursor-pointer" asChild>
                    <span>
                      <FileText className="h-4 w-4 mr-2" />
                      Choose File
                    </span>
                  </Button>
                </label>
              </div>
            )}
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Accepted formats: PDF, JPG, PNG, DOC, DOCX. Max size: 10MB.
              <br />
              <strong>AI Extraction:</strong> We'll automatically extract data from your document.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!selectedFile || uploading}>
              {uploading ? "Processing..." : "Upload & Extract"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

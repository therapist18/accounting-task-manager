"use client"

import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from './input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void
  maxFiles?: number
  accept?: Record<string, string[]>
  className?: string
  selectedFiles: Array<{
    file: File
    type: string
    expiryDate: string
  }>
  onRemoveFile: (file: File) => void
  onUpdateFile: (file: File, type: string, expiryDate: string) => void
  documentTypes: string[]
  showTypeSelect?: boolean
}

export function FileUpload({
  onFilesSelected,
  maxFiles = 10,
  accept = {
    'image/*': ['.jpg', '.jpeg', '.png'],
    'application/pdf': ['.pdf']
  },
  className,
  selectedFiles = [],
  onRemoveFile,
  onUpdateFile,
  documentTypes,
  showTypeSelect = true
}: FileUploadProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Filter files to ensure they match our accepted types
    const validFiles = acceptedFiles.filter(file => {
      const isValidType = Object.keys(accept).some(type => {
        if (type.includes('*')) {
          // Handle wildcard MIME types (e.g., 'image/*')
          const mainType = type.split('/')[0];
          return file.type.startsWith(mainType);
        }
        return type === file.type;
      });

      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
      const isValidExtension = Object.values(accept).flat().includes(extension);

      return isValidType && isValidExtension;
    });

    if (validFiles.length > 0 && typeof onFilesSelected === 'function') {
      onFilesSelected(validFiles);
    }
  }, [onFilesSelected, accept]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles,
    accept,
    multiple: false // Only allow one file at a time
  })

  const getFileSize = (size: number) => {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-500",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          {isDragActive ? (
            "Drop the files here"
          ) : (
            <>
              Drag & drop files here, or click to select files
              <br />
              <span className="text-xs text-gray-500">
                Supported formats: JPG, JPEG, PNG, PDF
              </span>
            </>
          )}
        </p>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-4">
          {selectedFiles.map((fileInfo, index) => (
            <div
              key={`${fileInfo.file.name}-${index}`}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">{fileInfo.file.name}</p>
                    <p className="text-xs text-gray-500">{getFileSize(fileInfo.file.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => onRemoveFile(fileInfo.file)}
                  className="text-gray-500 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {showTypeSelect && (
                <Select
                  value={fileInfo.type}
                  onValueChange={(value) => 
                    onUpdateFile(fileInfo.file, value, fileInfo.expiryDate)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select document type" />
                  </SelectTrigger>
                  <SelectContent>
                    {documentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Input
                type="date"
                value={fileInfo.expiryDate}
                onChange={(e) => 
                  onUpdateFile(fileInfo.file, fileInfo.type, e.target.value)
                }
                placeholder="Expiry Date"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

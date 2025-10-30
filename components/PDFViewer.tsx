"use client"

import React, { useState, useEffect } from 'react'

interface PDFViewerProps {
  url: string
}

const PDFViewer: React.FC<PDFViewerProps> = ({ url }) => {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return (
      <div className="w-full h-[70vh] bg-[#202124] rounded-lg flex items-center justify-center text-white">
        Loading PDF viewer...
      </div>
    )
  }

  return (
    <div className="w-full h-[70vh] bg-[#202124] rounded-lg">
      <iframe
        src={`${url}#view=FitH`}
        className="w-full h-full"
        title="PDF Viewer"
        allow="fullscreen"
        allowFullScreen
      />
    </div>
  )
}

export default PDFViewer

"use client"

import React from 'react'

interface PDFViewerProps {
  url: string
}

const PDFViewer: React.FC<PDFViewerProps> = ({ url }) => {
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

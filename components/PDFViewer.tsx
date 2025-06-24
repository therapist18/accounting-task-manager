"use client"

import React from 'react'

interface PDFViewerProps {
  url: string
}

const PDFViewer: React.FC<PDFViewerProps> = ({ url }) => {
  return (
    <div className="w-full h-[calc(98vh-8rem)] bg-[#202124] rounded-lg">
      <iframe
        src={`${url}#view=FitH`}
        className="w-full h-full"
        title="PDF Viewer"
      />
    </div>
  )
}

export default PDFViewer

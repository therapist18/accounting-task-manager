import { NextResponse } from 'next/server';
import jsPDF from 'jspdf';

export async function POST(request: Request) {
  try {
    const { message, documentType = 'message' } = await request.json();

    // Create PDF using jsPDF
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text(`${documentType.toUpperCase()} DOCUMENT`, 20, 20);
    
    // Add timestamp
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
    
    // Add message content
    doc.setFontSize(12);
    const splitMessage = doc.splitTextToSize(message, 170);
    doc.text(splitMessage, 20, 45);
    
    // Convert to buffer
    const pdfBuffer = doc.output('arraybuffer');
    
    // Create response with PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="document.pdf"',
      },
    });
    
  } catch (error) {
    console.error('Error converting message to PDF:', error);
    return NextResponse.json(
      { error: 'Failed to convert message to PDF' },
      { status: 500 }
    );
  }
}
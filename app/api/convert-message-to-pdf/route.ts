import { NextResponse } from 'next/server';
import jsPDF from 'jspdf';

export async function POST(request: Request) {
  try {
    const { message, documentType = 'message' } = await request.json();

    // Create PDF using jsPDF
    const doc = new jsPDF();
    
    // Add Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`${documentType.toUpperCase()}`, 20, 20);
    
    // Add Timestamp line
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, 30);
    doc.line(20, 35, 190, 35); // Horizontal line
    
    // Add Message Content
    doc.setTextColor(0);
    doc.setFontSize(12);
    
    // Split text to fit page width (A4 width is ~210mm, margins 20mm left/right)
    // 170mm max width
    const splitMessage = doc.splitTextToSize(message, 170);
    
    let verticalOffset = 45;
    
    // Simple pagination loop
    for(let i=0; i<splitMessage.length; i++){
        if(verticalOffset > 280) { // Check for end of page
            doc.addPage();
            verticalOffset = 20;
        }
        doc.text(splitMessage[i], 20, verticalOffset);
        verticalOffset += 7; // Line height
    }
    
    // Convert to buffer
    const pdfBuffer = doc.output('arraybuffer');
    
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
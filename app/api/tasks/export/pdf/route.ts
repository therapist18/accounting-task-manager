import { NextResponse } from "next/server";
import { buildExportFilename, createTaskPdf } from "@/lib/task-export";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { rows, title = "Task Manager Export" } = await request.json();
    const pdfBuffer = createTaskPdf(rows, title);
    const filename = buildExportFilename(title, "pdf");

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Task PDF export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export tasks to PDF" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { buildExportFilename, createTaskWord } from "@/lib/task-export";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { rows, title = "Task Manager Export" } = await request.json();
    const wordBuffer = await createTaskWord(rows, title);
    const filename = buildExportFilename(title, "docx");

    return new NextResponse(new Uint8Array(wordBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Task Word export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export tasks to Word" },
      { status: 500 }
    );
  }
}

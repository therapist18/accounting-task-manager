import { NextRequest, NextResponse } from "next/server"
import { authorize, fail } from "@/lib/email-center/api"
import { categoriesFor } from "@/lib/email-center/categories"

export async function GET(request: NextRequest) {
  try {
    const { sb } = await authorize(request)
    return NextResponse.json({ success: true, categories: (await categoriesFor(sb)).map((category) => ({ ...category, id: category.key })) })
  } catch (error) {
    return fail(error, "categories GET")
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sb, actor } = await authorize(request)
    const body = await request.json()
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : ""
    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ success: false, error: "Task type must be between 2 and 100 characters." }, { status: 400 })
    }
    const key = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80)
    if (key.length < 2) return NextResponse.json({ success: false, error: "Enter a more descriptive task type." }, { status: 400 })
    const { data: existing } = await sb.from("email_custom_task_types").select("key").eq("key", key).maybeSingle()
    if (existing || (await categoriesFor(sb)).some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ success: false, error: "That task type already exists." }, { status: 409 })
    }
    const { data, error } = await sb.from("email_custom_task_types").insert({ key, name, created_by_id: actor.id }).select("key, name").single()
    if (error) {
      if (error.code === "23505") return NextResponse.json({ success: false, error: "That task type already exists." }, { status: 409 })
      throw new Error(error.message)
    }
    return NextResponse.json({ success: true, category: { id: data.key, key: data.key, name: data.name, color: "#2563eb", disposition: "action_required", creates_case: true, attaches_to_case: false } }, { status: 201 })
  } catch (error) {
    return fail(error, "categories POST")
  }
}

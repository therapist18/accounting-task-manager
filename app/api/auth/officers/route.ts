import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

type OfficerRow = {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  username?: string | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  job_level?: any;
  job_levels?: any[];
  jobLevels?: any[];
  created_at?: string | null;
  createdAt?: string | null;
  last_login?: string | null;
  lastLogin?: string | null;
};

function toOfficer(row: OfficerRow) {
  return {
    id: row.id.toString(),
    firstName: row.first_name ?? row.firstName ?? "",
    lastName: row.last_name ?? row.lastName ?? "",
    email: row.email ?? undefined,
    username: row.username ?? undefined,
    isActive: row.is_active ?? row.isActive ?? true,
    jobLevels: Array.isArray(row.job_levels)
      ? row.job_levels
      : Array.isArray(row.jobLevels)
        ? row.jobLevels
        : row.job_level
          ? [row.job_level]
          : [],
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    lastLogin: row.last_login ?? row.lastLogin ?? undefined,
  };
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("scanner_users")
      .select("id, first_name, last_name, email, username, is_active, job_level, created_at, last_login")
      .eq("role", "officer")
      .eq("payroll_access_enabled", true)
      .order("first_name", { ascending: true, nullsFirst: false })
      .order("last_name", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("Failed to fetch officers from scanner_users:", error);
      return NextResponse.json({ error: "Failed to fetch officers", details: error.message }, { status: 500 });
    }

    return NextResponse.json(Array.isArray(data) ? data.map(toOfficer) : []);
  } catch (error) {
    console.error("Unexpected error in officers API:", error);
    return NextResponse.json(
      { error: "Failed to fetch officers", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

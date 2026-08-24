// Registry of the CV Builder's own "master-field-linkable" variables and the
// cv_field_links table that stores which tm_job_fields row(s) each one
// currently resolves from. This is CV Generator's much smaller counterpart
// to Employment Contracts' ec_placeholders - a fixed, code-defined set of
// scalar Contact/Demographics fields, not an admin-extensible token
// vocabulary, so there's no source_kind/group_label/editable machinery here.
import supabase from "@/lib/supabase/client";
import { FIELD_LABELS } from "./cvGeneratorData";

export interface CvFieldLink {
  id: string;
  field_key: string;
  master_field_ids: number[];
  created_at: string;
  updated_at: string;
}

export interface CvFieldVariable {
  key: string;
  label: string;
  group: "Contact" | "Demographics";
}

export const CV_MASTER_FIELD_VARIABLES: CvFieldVariable[] = [
  { key: "personalInfo.fullName", label: FIELD_LABELS.fullName, group: "Contact" },
  { key: "personalInfo.title", label: FIELD_LABELS.title, group: "Contact" },
  { key: "personalInfo.email", label: FIELD_LABELS.email, group: "Contact" },
  { key: "personalInfo.phone", label: FIELD_LABELS.phone, group: "Contact" },
  { key: "personalInfo.location", label: FIELD_LABELS.location, group: "Contact" },
  { key: "personalInfo.linkedin", label: FIELD_LABELS.linkedin, group: "Contact" },
  { key: "personalInfo.github", label: FIELD_LABELS.github, group: "Contact" },
  { key: "personalDetails.dateOfBirth", label: FIELD_LABELS.dateOfBirth, group: "Demographics" },
  { key: "personalDetails.nationality", label: FIELD_LABELS.nationality, group: "Demographics" },
  { key: "personalDetails.maritalStatus", label: FIELD_LABELS.maritalStatus, group: "Demographics" },
  { key: "personalDetails.residence", label: FIELD_LABELS.residence, group: "Demographics" },
];

export async function fetchCvFieldLinks(): Promise<CvFieldLink[]> {
  const { data, error } = await supabase.from("cv_field_links").select("*");
  if (error || !data) return [];
  return data as CvFieldLink[];
}

export async function upsertCvFieldLink(
  fieldKey: string,
  masterFieldIds: number[]
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("cv_field_links")
    .upsert(
      { field_key: fieldKey, master_field_ids: masterFieldIds, updated_at: new Date().toISOString() },
      { onConflict: "field_key" }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

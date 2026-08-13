"use client";

import React, { useState } from "react";
import { Plus, Sparkles, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import supabase from "@/lib/supabase/client";
import { CLEAR_PHOTO_ID } from "../../utils/cvGeneratorData";
import { CreatableCombobox, type ComboOption } from "../CreatableCombobox";
import { getVerifiedDateLabel } from "@/lib/documentTheme";

// ============================================================================
// 1. CORE ARCHITECTURE (Hooks)
// ============================================================================

function useFieldArray(cvData: any, setCvData: (updater: any) => void, arrayKey: string) {
  const items = cvData[arrayKey] || [];

  const add = (emptyItem: any) => {
    setCvData((prev: any) => ({ ...prev, [arrayKey]: [...(prev[arrayKey] || []), emptyItem] }));
  };

  const update = (idx: number, field: string, value: any) => {
    setCvData((prev: any) => {
      const updated = [...(prev[arrayKey] || [])];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, [arrayKey]: updated };
    });
  };

  const remove = (idx: number) => {
    setCvData((prev: any) => ({
      ...prev, [arrayKey]: (prev[arrayKey] || []).filter((_: any, i: number) => i !== idx)
    }));
  };

  return { items, add, update, remove };
}

function useAvatarUpload(applicantId: string | null, linkedIndividualId: number | null, onUploadSuccess: (url: string) => void) {
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const objectUrl = URL.createObjectURL(file);
    onUploadSuccess(objectUrl);

    if (!applicantId) return;

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `cv-builder/${applicantId}/photo.${ext}`;
      await supabase.storage.from('kyc-documents').upload(filePath, file, { upsert: true, contentType: file.type });
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${filePath}`;
      onUploadSuccess(publicUrl);

      if (linkedIndividualId) {
        const registryPath = `individual-documents/${linkedIndividualId}/${CLEAR_PHOTO_ID}/photo_${Date.now()}.${ext}`;
        await supabase.storage.from('kyc-documents').upload(registryPath, file, { upsert: true, contentType: file.type });
        await supabase.from('acc_portal_directors_documents').upsert({
          director_id: linkedIndividualId, document_id: CLEAR_PHOTO_ID,
          file_path: registryPath, status: 'active',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: 'director_id,file_path' });
      }
    } catch (err) {
      console.warn('Photo save failed:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return { handleUpload, isUploading };
}

// ============================================================================
// 2. TWO-COLUMN UI COMPONENTS
// ============================================================================

/**
 * The core building block for the two-column layout.
 * Left side: Label + Description + Action Buttons
 * Right side: The input fields
 */
function FormRow({ label, description, action, children, isLast = false }: any) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 py-5 ${isLast ? '' : 'border-b border-slate-100'} items-start`}>
      <div className="pt-1.5 flex flex-col gap-2">
        <div>
          <Label className="text-sm font-bold text-slate-700">{label}</Label>
          {description && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{description}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
      <div className="flex-1 w-full space-y-3">
        {children}
      </div>
    </div>
  );
}

/** Wraps a whole section containing an array of items (like Experience) */
function ArraySection({ title, count, onAdd, emptyMessage, children }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg border border-slate-200">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title} <span className="text-slate-400 normal-case">({count})</span></h3>
        <Button onClick={onAdd} variant="outline" size="sm" className="h-8 text-xs bg-white">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Entry
        </Button>
      </div>
      
      {count === 0 ? (
        <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-xl">
          <p className="text-sm text-slate-400 italic">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {children}
        </div>
      )}
    </div>
  );
}

/** Wraps an individual item inside an ArraySection */
function ArrayItemBlock({ index, title, onRemove, children }: any) {
  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
      <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-2.5 flex justify-between items-center">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {title ? title : `Entry #${index + 1}`}
        </span>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2">
          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
        </Button>
      </div>
      <div className="px-5">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// 3. THE EDITORS
// ============================================================================

export function ContactEditor({ cvData, setCvData, applicantId, linkedIndividualId }: any) {
  const updateInfo = (field: string, value: any) => setCvData((p: any) => ({ ...p, personalInfo: { ...p.personalInfo, [field]: value } }));
  const updateDetails = (field: string, value: any) => setCvData((p: any) => ({ ...p, personalDetails: { ...p.personalDetails, [field]: value } }));
  const { handleUpload, isUploading } = useAvatarUpload(applicantId, linkedIndividualId, (url) => updateInfo("photoUrl", url));

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5">
      <FormRow label="Profile Photo" description="Upload a professional headshot.">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {cvData.personalInfo?.photoUrl ? (
              <img src={cvData.personalInfo.photoUrl} className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6 text-slate-400" />
            )}
            <Input type="file" accept="image/*" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            {isUploading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center text-[9px] font-bold">...</div>}
          </div>
          <span className="text-xs text-slate-500">Click avatar to upload</span>
        </div>
      </FormRow>

      <FormRow label="Basic Information" description="Your core professional identity.">
        <Input placeholder="Full Name" value={cvData.personalInfo?.fullName ?? ""} onChange={e => updateInfo("fullName", e.target.value)} />
        <Input placeholder="Professional Title (e.g. Software Engineer)" value={cvData.personalInfo?.title ?? ""} onChange={e => updateInfo("title", e.target.value)} />
      </FormRow>

      <FormRow label="Contact Details" description="How employers can reach you.">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Email Address" type="email" value={cvData.personalInfo?.email ?? ""} onChange={e => updateInfo("email", e.target.value)} />
          <Input placeholder="Phone Number" value={cvData.personalInfo?.phone ?? ""} onChange={e => updateInfo("phone", e.target.value)} />
          <Input placeholder="Location (City, Country)" className="col-span-2" value={cvData.personalInfo?.location ?? ""} onChange={e => updateInfo("location", e.target.value)} />
        </div>
      </FormRow>

      <FormRow label="Web Links" description="Links to your professional portfolio or socials.">
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="LinkedIn URL" value={cvData.personalInfo?.linkedin ?? ""} onChange={e => updateInfo("linkedin", e.target.value)} />
          <Input placeholder="GitHub / Portfolio URL" value={cvData.personalInfo?.github ?? ""} onChange={e => updateInfo("github", e.target.value)} />
        </div>
      </FormRow>

      <FormRow label="Demographics" description="Optional personal details based on regional CV norms." isLast>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Date of Birth" value={cvData.personalDetails?.dateOfBirth ?? ""} onChange={e => updateDetails("dateOfBirth", e.target.value)} />
          <Input placeholder="Nationality" value={cvData.personalDetails?.nationality ?? ""} onChange={e => updateDetails("nationality", e.target.value)} />
          <Input placeholder="Marital Status" value={cvData.personalDetails?.maritalStatus ?? ""} onChange={e => updateDetails("maritalStatus", e.target.value)} />
          <Input placeholder="Residence" value={cvData.personalDetails?.residence ?? ""} onChange={e => updateDetails("residence", e.target.value)} />
        </div>
      </FormRow>
    </div>
  );
}

export function SummaryEditor({ cvData, setCvData, onOpenAiWriter }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5">
      <FormRow 
        label="Professional Summary" 
        description="A brief overview of your professional background and core strengths."
        isLast
        action={
          <Button size="sm" variant="outline" onClick={onOpenAiWriter} className="mt-2 h-7 text-xs text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100">
            <Sparkles className="h-3 w-3 mr-1.5" /> Auto-Write
          </Button>
        }
      >
        <Textarea 
          rows={6} 
          placeholder="Results-driven professional with expertise in..."
          value={cvData.summary ?? ""} 
          onChange={e => setCvData({ ...cvData, summary: e.target.value })} 
          className="leading-relaxed"
        />
      </FormRow>
    </div>
  );
}

export function ExperienceEditor({ cvData, setCvData, onOpenAiWriter }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "experience");

  return (
    <ArraySection 
      title="Work Experience" count={items.length} 
      emptyMessage="No work experience added yet."
      onAdd={() => add({ company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [] })}
    >
      {items.map((exp: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={exp.role || "New Position"} onRemove={() => remove(idx)}>
          <FormRow label="Job Details">
            <Input placeholder="Job Title (e.g. Senior Developer)" value={exp.role ?? ""} onChange={e => update(idx, "role", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Company Name" value={exp.company ?? ""} onChange={e => update(idx, "company", e.target.value)} />
              <Input placeholder="Location" value={exp.location ?? ""} onChange={e => update(idx, "location", e.target.value)} />
            </div>
          </FormRow>

          <FormRow label="Duration">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Start Date (e.g. Jan 2021)" value={exp.startDate ?? ""} onChange={e => update(idx, "startDate", e.target.value)} />
              <Input placeholder="End Date (e.g. Present)" value={exp.endDate ?? ""} onChange={e => update(idx, "endDate", e.target.value)} />
            </div>
          </FormRow>

          <FormRow label="Company Info" description="Optional brief description of what the company does.">
            <Input placeholder="E.g. A B2B SaaS startup..." value={exp.companyDesc ?? ""} onChange={e => update(idx, "companyDesc", e.target.value)} />
          </FormRow>

          <FormRow 
            label="Responsibilities" 
            description="List your key duties and achievements. Put each point on a new line."
            isLast
            action={
              <Button variant="outline" size="sm" onClick={onOpenAiWriter} className="mt-2 h-7 text-xs text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100">
                <Sparkles className="h-3 w-3 mr-1.5"/> AI Enhance
              </Button>
            }
          >
            <Textarea 
              rows={5} 
              placeholder="Led a team of 4 engineers...&#10;Increased revenue by 20%..."
              value={Array.isArray(exp.responsibilities) ? exp.responsibilities.join('\n') : (exp.responsibilities ?? "")} 
              onChange={e => update(idx, "responsibilities", e.target.value.split('\n'))} 
            />
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function InternshipsEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "internships");

  return (
    <ArraySection 
      title="Internships" count={items.length} 
      emptyMessage="No internships added yet."
      onAdd={() => add({ company: "", location: "", role: "", startDate: "", endDate: "", companyDesc: "", responsibilities: [] })}
    >
      {items.map((intern: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={intern.role || "New Internship"} onRemove={() => remove(idx)}>
          <FormRow label="Internship Details">
            <Input placeholder="Role / Title" value={intern.role ?? ""} onChange={e => update(idx, "role", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Company" value={intern.company ?? ""} onChange={e => update(idx, "company", e.target.value)} />
              <Input placeholder="Location" value={intern.location ?? ""} onChange={e => update(idx, "location", e.target.value)} />
            </div>
          </FormRow>
          
          <FormRow label="Duration">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Start Date" value={intern.startDate ?? ""} onChange={e => update(idx, "startDate", e.target.value)} />
              <Input placeholder="End Date" value={intern.endDate ?? ""} onChange={e => update(idx, "endDate", e.target.value)} />
            </div>
          </FormRow>

          <FormRow label="Responsibilities" description="One responsibility per line." isLast>
            <Textarea 
              rows={4} 
              placeholder="Assisted with campaigns...&#10;Conducted research..."
              value={Array.isArray(intern.responsibilities) ? intern.responsibilities.join('\n') : (intern.responsibilities ?? "")} 
              onChange={e => update(idx, "responsibilities", e.target.value.split('\n'))} 
            />
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function EducationEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "education");

  return (
    <ArraySection 
      title="Education" count={items.length} 
      emptyMessage="No education entries added."
      onAdd={() => add({ degree: "", institution: "", year: "", details: "" })}
    >
      {items.map((edu: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={edu.degree || "New Degree"} onRemove={() => remove(idx)}>
          <FormRow label="Academic Details" isLast>
            <Input placeholder="Degree / Certificate (e.g. BSc Computer Science)" value={edu.degree ?? ""} onChange={e => update(idx, "degree", e.target.value)} />
            <Input placeholder="Institution Name" value={edu.institution ?? ""} onChange={e => update(idx, "institution", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Graduation Year" value={edu.year ?? ""} onChange={e => update(idx, "year", e.target.value)} />
              <Input placeholder="Extra Details (GPA, Honors)" value={edu.details ?? ""} onChange={e => update(idx, "details", e.target.value)} />
            </div>
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function SkillsEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "skills");

  return (
    <ArraySection 
      title="Skills & Expertise" count={items.length} 
      emptyMessage="No skill categories added."
      onAdd={() => add({ category: "", items: "" })}
    >
      {items.map((skill: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={skill.category || "Skill Category"} onRemove={() => remove(idx)}>
          <FormRow label="Skill Group" description="Group your skills by category." isLast>
            <Input placeholder="Category Name (e.g. Programming Languages)" value={skill.category ?? ""} onChange={e => update(idx, "category", e.target.value)} />
            <Textarea 
              rows={2} 
              placeholder="Comma-separated items (e.g. JavaScript, Python, React)" 
              value={skill.items ?? ""} 
              onChange={e => update(idx, "items", e.target.value)} 
            />
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function ProjectsEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "projects");

  return (
    <ArraySection 
      title="Projects" count={items.length} 
      emptyMessage="No projects added."
      onAdd={() => add({ title: "", description: "", year: "" })}
    >
      {items.map((proj: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={proj.title || "New Project"} onRemove={() => remove(idx)}>
          <FormRow label="Project Details" isLast>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Input placeholder="Project Title" value={proj.title ?? ""} onChange={e => update(idx, "title", e.target.value)} />
              <Input placeholder="Year" value={proj.year ?? ""} onChange={e => update(idx, "year", e.target.value)} />
            </div>
            <Textarea 
              rows={3} 
              placeholder="Description of the project and technologies used..." 
              value={proj.description ?? ""} 
              onChange={e => update(idx, "description", e.target.value)} 
            />
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function LanguagesEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "languages");

  return (
    <ArraySection 
      title="Languages" count={items.length} 
      emptyMessage="No languages added."
      onAdd={() => add({ language: "", proficiency: "" })}
    >
      <div className="bg-white rounded-xl border border-slate-200 px-5">
        {items.map((lang: any, idx: number) => (
          <FormRow key={idx} label={`Language #${idx + 1}`} isLast={idx === items.length - 1}>
            <div className="flex gap-3 items-center">
              <Input placeholder="Language (e.g. French)" value={lang.language ?? ""} onChange={e => update(idx, "language", e.target.value)} className="flex-1" />
              <Input placeholder="Proficiency (e.g. Fluent)" value={lang.proficiency ?? ""} onChange={e => update(idx, "proficiency", e.target.value)} className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
            </div>
          </FormRow>
        ))}
      </div>
    </ArraySection>
  );
}

export function ReferencesEditor({ cvData, setCvData, companyOptions, onCreateCompany }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "references");

  return (
    <ArraySection 
      title="References" count={items.length} 
      emptyMessage="No references added."
      onAdd={() => add({ name: "", title: "", company: "", address: "", contact: "" })}
    >
      {items.map((ref: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={ref.name || "New Reference"} onRemove={() => remove(idx)}>
          <FormRow label="Reference Details" isLast>
            <Input placeholder="Full Name" value={ref.name ?? ""} onChange={e => update(idx, "name", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Title / Role" value={ref.title ?? ""} onChange={e => update(idx, "title", e.target.value)} />
              <CreatableCombobox
                options={companyOptions} value={ref.company ?? ""} onChange={(v) => update(idx, "company", v)}
                onCreateOption={onCreateCompany} placeholder="Select or create company..." createLabel="Use new company"
              />
            </div>
            <Input placeholder="Contact Info (Email or Phone)" value={ref.contact ?? ""} onChange={e => update(idx, "contact", e.target.value)} />
            <Input placeholder="Address / Office" value={ref.address ?? ""} onChange={e => update(idx, "address", e.target.value)} />
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function CertificationsEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "certifications");

  return (
    <ArraySection 
      title="Certifications" count={items.length} 
      emptyMessage="No certifications added."
      onAdd={() => add({ name: "", issuer: "", date: "", url: "" })}
    >
      {items.map((cert: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={cert.name || "New Certification"} onRemove={() => remove(idx)}>
          <FormRow label="Certification Details" isLast>
            <Input placeholder="Certification Name" value={cert.name ?? ""} onChange={e => update(idx, "name", e.target.value)} />
            <Input placeholder="Issuing Organization" value={cert.issuer ?? ""} onChange={e => update(idx, "issuer", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Date Achieved" value={cert.date ?? ""} onChange={e => update(idx, "date", e.target.value)} />
              <Input placeholder="Credential URL (Optional)" value={cert.url ?? ""} onChange={e => update(idx, "url", e.target.value)} />
            </div>
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function AchievementsEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "achievements");

  return (
    <ArraySection 
      title="Achievements" count={items.length} 
      emptyMessage="No achievements added."
      onAdd={() => add({ title: "", description: "", date: "" })}
    >
      {items.map((ach: any, idx: number) => (
        <ArrayItemBlock key={idx} index={idx} title={ach.title || "New Achievement"} onRemove={() => remove(idx)}>
          <FormRow label="Achievement Details" isLast>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Input placeholder="Title or Award Name" value={ach.title ?? ""} onChange={e => update(idx, "title", e.target.value)} />
              <Input placeholder="Date / Year" value={ach.date ?? ""} onChange={e => update(idx, "date", e.target.value)} />
            </div>
            <Textarea rows={2} placeholder="Description..." value={ach.description ?? ""} onChange={e => update(idx, "description", e.target.value)} />
          </FormRow>
        </ArrayItemBlock>
      ))}
    </ArraySection>
  );
}

export function AdditionalInfoEditor({ cvData, setCvData }: any) {
  const { items, add, update, remove } = useFieldArray(cvData, setCvData, "additionalInfo");

  return (
    <ArraySection 
      title="Additional Information" count={items.length} 
      emptyMessage="No additional info added."
      onAdd={() => add({ label: "", value: "" })}
    >
      <div className="bg-white rounded-xl border border-slate-200 px-5">
        {items.map((info: any, idx: number) => (
          <FormRow key={idx} label={`Entry #${idx + 1}`} isLast={idx === items.length - 1}>
            <div className="flex gap-3 items-center">
              <Input placeholder="Label (e.g. Availability)" value={info.label ?? ""} onChange={e => update(idx, "label", e.target.value)} className="flex-1" />
              <Input placeholder="Value (e.g. Immediate)" value={info.value ?? ""} onChange={e => update(idx, "value", e.target.value)} className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></Button>
            </div>
          </FormRow>
        ))}
      </div>
    </ArraySection>
  );
}

export function DeclarationEditor({ cvData, setCvData }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5">
      <FormRow label="Official Declaration" description="Adds a formal signature block at the end of the document.">
        <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
          <Checkbox id="includeDeclaration" checked={cvData.includeDeclaration !== false} onCheckedChange={(checked) => setCvData({ ...cvData, includeDeclaration: !!checked })} />
          <Label htmlFor="includeDeclaration" className="text-sm font-medium cursor-pointer">Include Declaration section on the CV</Label>
        </div>
      </FormRow>

      {cvData.includeDeclaration !== false && (
        <>
          <FormRow label="Declaration Statement" description="The text that appears above your signature.">
            <Textarea rows={3} value={cvData.declaration || ""} onChange={(e) => setCvData({ ...cvData, declaration: e.target.value })} />
          </FormRow>

          <FormRow label="Verification Badge" description="Shows employers the CV is current." isLast>
            <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
              <Checkbox id="verifiedBadge" checked={cvData.verifiedBadge} onCheckedChange={(checked) => setCvData({ ...cvData, verifiedBadge: !!checked })} />
              <Label htmlFor="verifiedBadge" className="text-sm font-medium cursor-pointer">Include "CV Verified & Up-to-date {getVerifiedDateLabel()}" line</Label>
            </div>
          </FormRow>
        </>
      )}
    </div>
  );
}
"use client";

import React from "react";
import { MapPin, Phone, Mail, Github, Linkedin } from "lucide-react";

// Color presets for CV design
export const COLOR_PRESETS = [
  { name: 'Ocean Blue', primary: '#2c3e50', accent: '#3498db' },
  { name: 'Forest', primary: '#1a3d2e', accent: '#27ae60' },
  { name: 'Royal Purple', primary: '#2c1654', accent: '#9b59b6' },
  { name: 'Crimson', primary: '#4a1515', accent: '#e74c3c' },
  { name: 'Slate', primary: '#2d3748', accent: '#64748b' },
  { name: 'Teal', primary: '#164e4e', accent: '#0d9488' },
  { name: 'Midnight', primary: '#0f172a', accent: '#6366f1' },
  { name: 'Copper', primary: '#3d1f10', accent: '#d97706' },
];

// Helper function to get verified date label
export function getVerifiedDateLabel(): string {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Threshold: if a category has more items than this, use compact layout
const COMPACT_THRESHOLD = 5;

// Compact skills renderer — uses tags/chips for large lists, bullets for small
function CompactSkillsList({ items, color, mode = 'bullets' }: { items: string; color?: string; mode?: 'bullets' | 'sidebar' | 'main' }) {
  const parsed = items.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (parsed.length === 0) return null;

  // Small list → bullet layout
  if (parsed.length <= COMPACT_THRESHOLD) {
    if (mode === 'main') {
      return (
        <div className="flex flex-wrap gap-1.5">
          {parsed.map((item: string, i: number) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{item}</span>
          ))}
        </div>
      );
    }
    return (
      <ul className="list-disc pl-4 space-y-0.5 marker:text-slate-400">
        {parsed.map((item: string, i: number) => (
          <li key={i} className="text-[10px] text-slate-600 leading-snug">{item}</li>
        ))}
      </ul>
    );
  }

  // Large list → compact tag layout
  if (mode === 'sidebar') {
    return (
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
        {parsed.map((item: string, i: number) => (
          <span key={i} className="text-[9px] text-white/80 leading-snug truncate" title={item}>• {item}</span>
        ))}
      </div>
    );
  }
  if (mode === 'main') {
    return (
      <div className="flex flex-wrap gap-1">
        {parsed.map((item: string, i: number) => (
          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-sm border border-slate-200 text-slate-600 whitespace-nowrap">{item}</span>
        ))}
      </div>
    );
  }
  // bullets fallback with compact style
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
      {parsed.map((item: string, i: number) => (
        <span key={i} className="text-[10px] text-slate-600 leading-snug">• {item}</span>
      ))}
    </div>
  );
}

// Compact skills renderer for sidebar (dark background) themes
function CompactSkillsSidebar({ items, accentColor }: { items: string; accentColor?: string }) {
  const parsed = items.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (parsed.length === 0) return null;

  if (parsed.length <= COMPACT_THRESHOLD) {
    return (
      <ul className="list-disc pl-4 space-y-0.5 marker:text-white/50">
        {parsed.map((item: string, i: number) => (
          <li key={i} className="text-[11px] text-white/90 leading-snug">{item}</li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
      {parsed.map((item: string, i: number) => (
        <span key={i} className="text-[9px] text-white/80 leading-snug truncate" title={item}>• {item}</span>
      ))}
    </div>
  );
}

// CV Layout Props Interface
export interface CVLayoutProps {
  cvData: any;
  cvSettings: any;
  selectedLayout: string;
}

// CV Layout Component
export function CVLayout({ cvData, cvSettings, selectedLayout }: CVLayoutProps) {
  const {
    personalInfo = {},
    personalDetails = {},
    summary = "",
    skills = [],
    experience = [],
    internships = [],
    projects = [],
    education = [],
    references = [],
    languages = [],
    certifications = [],
    achievements = [],
    additionalInfo = [],
    declaration = "",
    includeDeclaration = true,
    verifiedBadge = false
  } = cvData;

  const photoShapeStyle: React.CSSProperties = {
    borderRadius: cvSettings.photoShape === 'circle' ? '50%' : cvSettings.photoShape === 'rounded' ? '12px' : '0',
  };
  const fontScaleStyle: React.CSSProperties = { fontSize: `${cvSettings.fontScale}em`, fontFamily: (cvSettings as any).fontFamily || 'Inter, sans-serif' };

  if (selectedLayout === "theme1") {
    const acc = cvSettings.accentColor;
    const pri = cvSettings.primaryColor;
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white text-[#333] grid grid-cols-[280px_1fr] relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
        {/* Sidebar */}
        <aside style={{ backgroundColor: pri }} className="text-[#ecf0f1] p-[20px_15px] flex flex-col gap-6">
          {(cvSettings as any).showPhoto !== false && (
            <div
              style={{ width: cvSettings.photoSize, height: cvSettings.photoSize, borderColor: acc, ...photoShapeStyle }}
              className="bg-white border-[3px] mx-auto flex items-center justify-center overflow-hidden"
            >
              <img
                src={personalInfo.photoUrl || "https://via.placeholder.com/150x150?text=Photo"}
                alt="Profile"
                style={{ objectFit: cvSettings.photoFit, width: '100%', height: '100%' }}
              />
            </div>
          )}

          <div>
            <div style={{ color: acc, borderColor: `${acc}55` }} className="text-sm font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Contact Information</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold"><MapPin className="inline h-[1em] w-[1em] shrink-0" /></span> <span className={!personalInfo.location ? "italic opacity-50" : ""}>{personalInfo.location || "Location"}</span></div>
              <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold"><Phone className="inline h-[1em] w-[1em] shrink-0" /></span> <span className={!personalInfo.phone ? "italic opacity-50" : ""}>{personalInfo.phone || "Phone"}</span></div>
              <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold"><Mail className="inline h-[1em] w-[1em] shrink-0" /></span> <span className={!personalInfo.email ? "italic opacity-50" : ""}>{personalInfo.email || "Email"}</span></div>
              <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold"><Github className="inline h-[1em] w-[1em] shrink-0" /></span> <span className={`break-all ${!personalInfo.github ? "italic opacity-50" : ""}`}>{personalInfo.github || "GitHub"}</span></div>
              <div className="flex items-center gap-2"><span style={{ color: acc }} className="font-bold"><Linkedin className="inline h-[1em] w-[1em] shrink-0" /></span> <span className={`break-all ${!personalInfo.linkedin ? "italic opacity-50" : ""}`}>{personalInfo.linkedin || "LinkedIn"}</span></div>
            </div>
          </div>

          <div>
            <div style={{ color: acc, borderColor: `${acc}55` }} className="text-sm font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Personal Details</div>
            <div className="space-y-2 text-sm">
              <div><strong style={{ color: acc }}>Date of Birth:</strong> <span className={!personalDetails.dateOfBirth ? "italic opacity-50" : ""}>{personalDetails.dateOfBirth || "—"}</span></div>
              <div><strong style={{ color: acc }}>Nationality:</strong> <span className={!personalDetails.nationality ? "italic opacity-50" : ""}>{personalDetails.nationality || "—"}</span></div>
              <div><strong style={{ color: acc }}>Marital Status:</strong> <span className={!personalDetails.maritalStatus ? "italic opacity-50" : ""}>{personalDetails.maritalStatus || "—"}</span></div>
              <div><strong style={{ color: acc }}>Residence:</strong> <span className={!personalDetails.residence ? "italic opacity-50" : ""}>{personalDetails.residence || "—"}</span></div>
              <div><strong style={{ color: acc }}>Kenya Status:</strong> <span className={!personalDetails.kenyaStatus ? "italic opacity-50" : ""}>{personalDetails.kenyaStatus || "—"}</span></div>
              <div><strong style={{ color: acc }}>Nairobi Res:</strong> <span className={!personalDetails.nairobiRes ? "italic opacity-50" : ""}>{personalDetails.nairobiRes || "—"}</span></div>
              <div><strong style={{ color: acc }}>Driving:</strong> <span className={!personalDetails.drivingExperience ? "italic opacity-50" : ""}>{personalDetails.drivingExperience || "—"}</span></div>
            </div>
          </div>

          <div>
            <div style={{ color: acc, borderColor: `${acc}55` }} className="text-sm font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Core Competencies</div>
            {skills.length > 0 ? (
              <div className="space-y-3">
                {skills.map((grp: any, idx: number) => (
                  <div key={idx}>
                    <div className="text-white font-bold text-xs uppercase tracking-wider mb-1">{grp.category}</div>
                    <CompactSkillsSidebar items={grp.items || ''} accentColor={acc} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic opacity-60">No skills added yet.</p>
            )}
          </div>

          <div>
            <div style={{ color: acc, borderColor: `${acc}55` }} className="text-sm font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Languages</div>
            {languages.length > 0 ? (
              <div className="space-y-1.5 text-sm">
                {languages.map((l: any, idx: number) => (
                  <div key={idx}>{l.language} {l.proficiency ? `(${l.proficiency})` : ""}</div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic opacity-60">No languages added yet.</p>
            )}
          </div>

          {additionalInfo.length > 0 && (
            <div>
              <div style={{ color: acc, borderColor: `${acc}55` }} className="text-sm font-extrabold uppercase tracking-[1.5px] border-b pb-1.5 mb-3">Additional Info</div>
              <div className="space-y-1.5 text-sm">
                {additionalInfo.map((info: any, idx: number) => (
                  <div key={idx}><strong>{info.label}:</strong> {info.value}</div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main Area */}
        <main className="p-8 flex flex-col gap-6">
          <div style={{ borderColor: pri }} className="border-b-4 pb-5">
            <h1 style={{ color: pri }} className="text-4xl font-extrabold uppercase tracking-tight">{personalInfo.fullName || "Your Name"}</h1>
            <div style={{ color: acc }} className="text-lg font-bold uppercase tracking-wide mt-1.5">{personalInfo.title || "Professional Title"}</div>
          </div>

          <div>
            <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-3 break-after-avoid">Professional Profile</div>
            {summary ? (
              <p className="text-sm leading-relaxed text-justify">{summary}</p>
            ) : (
              <p className="text-sm italic text-gray-400">No profile summary added yet.</p>
            )}
          </div>

          <div>
            <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-4 break-after-avoid">Professional Experience</div>
            {experience.length > 0 ? (
              <div className="space-y-5">
                {experience.map((exp: any, idx: number) => (
                  <div key={idx} className="break-inside-avoid">
                    <div className="flex justify-between font-extrabold text-sm text-black">
                      <span>{exp.company}</span>
                      <span>{exp.startDate} – {exp.endDate}</span>
                    </div>
                    <div style={{ color: acc }} className="text-sm font-semibold mt-0.5">{exp.role} {exp.location ? `| ${exp.location}` : ""}</div>
                    {exp.companyDesc && <span className="text-[10.5px] text-gray-500 italic block mt-1 mb-2">{exp.companyDesc}</span>}
                    <ul className="list-disc pl-5 text-[11.5px] leading-relaxed text-gray-700 mt-2 space-y-1">
                      {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                        <li key={rIdx}>{resp}</li>
                      )) : <li>{exp.responsibilities}</li>}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">No work experience added yet.</p>
            )}
          </div>

          <div>
            <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-4 break-after-avoid">Internships</div>
            {internships.length > 0 ? (
              <div className="space-y-4">
                {internships.map((intern: any, idx: number) => (
                  <div key={idx} className="break-inside-avoid">
                    <div className="flex justify-between font-extrabold text-sm text-black">
                      <span>{intern.company}</span>
                      <span>{intern.startDate} – {intern.endDate}</span>
                    </div>
                    <div style={{ color: acc }} className="text-sm font-semibold mt-0.5">{intern.role} {intern.location ? `| ${intern.location}` : ""}</div>
                    {intern.companyDesc && <span className="text-[10.5px] text-gray-500 italic block mt-1 mb-1">{intern.companyDesc}</span>}
                    <ul className="list-disc pl-5 text-[11.5px] leading-relaxed text-gray-700 mt-1 space-y-1">
                      {Array.isArray(intern.responsibilities) ? intern.responsibilities.map((resp: string, rIdx: number) => (
                        <li key={rIdx}>{resp}</li>
                      )) : <li>{intern.responsibilities}</li>}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">No internships added yet.</p>
            )}
          </div>

          <div>
            <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-3 break-after-avoid">Key Projects</div>
            {projects.length > 0 ? (
              <div className="grid grid-cols-2 gap-3.5">
                {projects.map((proj: any, idx: number) => (
                  <div key={idx} className="border border-gray-100 p-3 rounded shadow-sm bg-white break-inside-avoid">
                    <strong style={{ color: pri }} className="text-sm block mb-1">{proj.title} {proj.year ? `(${proj.year})` : ""}</strong>
                    <p className="text-[10.5px] text-gray-600 leading-normal">{proj.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">No projects added yet.</p>
            )}
          </div>

          <div>
            <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-3 break-after-avoid">Education</div>
            {education.length > 0 ? (
              <div className="space-y-2">
                {education.map((edu: any, idx: number) => (
                  <div key={idx} className="text-[11.5px] break-inside-avoid">
                    <strong>{edu.degree}</strong> – {edu.institution} ({edu.year})
                    {edu.details && <p className="text-[10.5px] text-gray-500 mt-0.5">{edu.details}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">No education added yet.</p>
            )}
          </div>

          {certifications.length > 0 && (
            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-3 break-after-avoid">Certifications</div>
              <div className="space-y-2">
                {certifications.map((cert: any, idx: number) => (
                  <div key={idx} className="text-[11.5px] break-inside-avoid">
                    <strong>{cert.name}</strong> – {cert.issuer} {cert.date ? `(${cert.date})` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}

          {achievements.length > 0 && (
            <div>
              <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-3 break-after-avoid">Achievements</div>
              <div className="space-y-2">
                {achievements.map((ach: any, idx: number) => (
                  <div key={idx} className="text-[11.5px] break-inside-avoid">
                    <strong>{ach.title}</strong> {ach.date ? `(${ach.date})` : ""}
                    {ach.description && <p className="text-[10.5px] text-gray-500 mt-0.5">{ach.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ borderLeftColor: acc, color: pri, backgroundColor: `${acc}18` }} className="border-l-[5px] p-2 px-4 text-sm font-extrabold uppercase mb-3 break-after-avoid">References</div>
            {references.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {references.map((ref: any, idx: number) => (
                  <div key={idx} className="text-sm text-gray-700 leading-relaxed break-inside-avoid">
                    <strong className="text-black text-sm block">{ref.name}</strong>
                    {ref.title} | {ref.company}<br />
                    {ref.address && <span>{ref.address}<br /></span>}
                    <span style={{ color: acc }}>{ref.contact}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm italic text-gray-400">No references added yet.</p>
            )}
          </div>

          {includeDeclaration && declaration && (
            <div className="border-t border-gray-100 pt-4 mt-4">
              <p className="text-sm italic text-gray-500 leading-relaxed">{declaration}</p>
              {verifiedBadge && (
                <div style={{ backgroundColor: acc }} className="inline-flex items-center gap-1.5 text-white p-1 px-3 rounded text-sm font-extrabold uppercase mt-3">
                  ✓ CV Verified & Up-to-date {getVerifiedDateLabel()}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    );
  } else if (selectedLayout === "theme2") {
    // THEME 2: Modern Top-Header Layout
    const acc2 = cvSettings.accentColor;
    const pri2 = cvSettings.primaryColor;
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white text-slate-800 relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
        {/* Elegant Top Header with dynamic colors */}
        <header style={{ background: `linear-gradient(to right, ${pri2}, ${pri2}dd)`, borderBottomColor: acc2 }} className="text-white p-8 border-b-4 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">{personalInfo.fullName || "Your Name"}</h1>
            <div style={{ color: acc2 }} className="text-lg font-bold uppercase tracking-wider mt-1">{personalInfo.title || "Professional Title"}</div>
          </div>
          <div className="text-right text-xs space-y-1 text-slate-300">
            <div><Mail className="inline h-[1em] w-[1em] shrink-0" /> <span className={!personalInfo.email ? "italic opacity-50" : ""}>{personalInfo.email || "Email"}</span></div>
            <div><Phone className="inline h-[1em] w-[1em] shrink-0" /> <span className={!personalInfo.phone ? "italic opacity-50" : ""}>{personalInfo.phone || "Phone"}</span></div>
            <div><MapPin className="inline h-[1em] w-[1em] shrink-0" /> <span className={!personalInfo.location ? "italic opacity-50" : ""}>{personalInfo.location || "Location"}</span></div>
            <div style={{ color: acc2 }} className="flex gap-2 justify-end mt-1">
              <span className={`underline break-all ${!personalInfo.linkedin ? "italic opacity-50" : ""}`}>{personalInfo.linkedin || "LinkedIn"}</span>
              <span className={`underline break-all ${!personalInfo.github ? "italic opacity-50" : ""}`}>{personalInfo.github || "GitHub"}</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-[2fr_1fr] gap-6 p-8">
          {/* Left Area (Core details) */}
          <div className="space-y-6">
            <section>
              <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-3">Professional Profile</h2>
              {summary ? (
                <p className="text-sm leading-relaxed text-slate-600 text-justify">{summary}</p>
              ) : (
                <p className="text-sm italic text-slate-400">No profile summary added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-4">Professional Experience</h2>
              {experience.length > 0 ? (
                <div className="space-y-5">
                  {experience.map((exp: any, idx: number) => (
                    <div key={idx} className="relative pl-4 border-l border-slate-200">
                      <div style={{ backgroundColor: acc2 }} className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full" />
                      <div className="flex justify-between font-bold text-sm text-slate-900">
                        <span>{exp.company}</span>
                        <span className="text-slate-500 font-semibold">{exp.startDate} – {exp.endDate}</span>
                      </div>
                      <div style={{ color: acc2 }} className="text-sm font-semibold mt-0.5">{exp.role} {exp.location ? `| ${exp.location}` : ""}</div>
                      {exp.companyDesc && <p className="text-[10.5px] text-slate-400 italic mt-0.5">{exp.companyDesc}</p>}
                      <ul className="list-disc pl-4 text-[11.5px] text-slate-600 mt-2 space-y-1">
                        {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        )) : <li>{exp.responsibilities}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No work experience added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-4">Internships</h2>
              {internships.length > 0 ? (
                <div className="space-y-4">
                  {internships.map((intern: any, idx: number) => (
                    <div key={idx} className="relative pl-4 border-l border-slate-200">
                      <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-400" />
                      <div className="flex justify-between font-bold text-sm text-slate-900">
                        <span>{intern.company}</span>
                        <span className="text-slate-500 font-semibold">{intern.startDate} – {intern.endDate}</span>
                      </div>
                      <div className="text-slate-600 text-sm font-semibold mt-0.5">{intern.role} {intern.location ? `| ${intern.location}` : ""}</div>
                      {intern.companyDesc && <p className="text-[10.5px] text-slate-400 italic mt-0.5">{intern.companyDesc}</p>}
                      <ul className="list-disc pl-4 text-[11.5px] text-slate-600 mt-1 space-y-1">
                        {Array.isArray(intern.responsibilities) ? intern.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        )) : <li>{intern.responsibilities}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No internships added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-base font-bold text-slate-900 uppercase border-b-2 border-slate-200 pb-1.5 mb-3">Key Projects</h2>
              {projects.length > 0 ? (
                <div className="space-y-3">
                  {projects.map((proj: any, idx: number) => (
                    <div key={idx} className="text-[11.5px]">
                      <strong className="text-slate-800 text-sm">{proj.title} {proj.year ? `(${proj.year})` : ""}</strong>
                      <p className="text-slate-500 mt-0.5">{proj.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No projects added yet.</p>
              )}
            </section>
          </div>

          {/* Right Area (Sidebar / Meta) */}
          <div className="space-y-6 bg-slate-50 p-5 rounded border border-slate-100">
            <section>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Core Competencies</h2>
              {skills.length > 0 ? (
                <div className="space-y-3">
                  {skills.map((grp: any, idx: number) => (
                    <div key={idx}>
                      <div className="font-bold text-xs text-slate-800 mb-1">{grp.category}</div>
                      <CompactSkillsList items={grp.items || ''} mode="bullets" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No skills added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Personal Details</h2>
              <div className="space-y-2 text-[10.5px] text-slate-600">
                <div><strong>D.O.B:</strong> <span className={!personalDetails.dateOfBirth ? "italic text-slate-400" : ""}>{personalDetails.dateOfBirth || "—"}</span></div>
                <div><strong>Nationality:</strong> <span className={!personalDetails.nationality ? "italic text-slate-400" : ""}>{personalDetails.nationality || "—"}</span></div>
                <div><strong>Status:</strong> <span className={!personalDetails.maritalStatus ? "italic text-slate-400" : ""}>{personalDetails.maritalStatus || "—"}</span></div>
                <div><strong>Residence:</strong> <span className={!personalDetails.residence ? "italic text-slate-400" : ""}>{personalDetails.residence || "—"}</span></div>
                <div><strong>Kenya Work Status:</strong> <span className={!personalDetails.kenyaStatus ? "italic text-slate-400" : ""}>{personalDetails.kenyaStatus || "—"}</span></div>
                <div><strong>Nairobi Res:</strong> <span className={!personalDetails.nairobiRes ? "italic text-slate-400" : ""}>{personalDetails.nairobiRes || "—"}</span></div>
                <div><strong>Driving:</strong> <span className={!personalDetails.drivingExperience ? "italic text-slate-400" : ""}>{personalDetails.drivingExperience || "—"}</span></div>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Education</h2>
              {education.length > 0 ? (
                <div className="space-y-3">
                  {education.map((edu: any, idx: number) => (
                    <div key={idx} className="text-sm text-slate-600">
                      <strong className="text-slate-800 block">{edu.degree}</strong>
                      {edu.institution} ({edu.year})
                      {edu.details && <p className="text-[9.5px] text-slate-400 mt-0.5">{edu.details}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No education added yet.</p>
              )}
            </section>

            {certifications.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Certifications</h2>
                <div className="space-y-2 text-[10.5px] text-slate-600">
                  {certifications.map((cert: any, idx: number) => (
                    <div key={idx}><strong className="text-slate-800">{cert.name}</strong> – {cert.issuer} {cert.date ? `(${cert.date})` : ""}</div>
                  ))}
                </div>
              </section>
            )}

            {achievements.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Achievements</h2>
                <div className="space-y-2 text-[10.5px] text-slate-600">
                  {achievements.map((ach: any, idx: number) => (
                    <div key={idx}><strong className="text-slate-800">{ach.title}</strong> {ach.date ? `(${ach.date})` : ""}{ach.description ? `: ${ach.description}` : ""}</div>
                  ))}
                </div>
              </section>
            )}

            {additionalInfo.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">Additional Info</h2>
                <div className="space-y-1 text-[10.5px] text-slate-600">
                  {additionalInfo.map((info: any, idx: number) => (
                    <div key={idx}><strong className="text-slate-800">{info.label}:</strong> {info.value}</div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-2">Languages</h2>
              {languages.length > 0 ? (
                <div className="text-[10.5px] text-slate-600 space-y-1">
                  {languages.map((l: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span className="font-semibold">{l.language}</span>
                      <span className="text-slate-400">{l.proficiency}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No languages added yet.</p>
              )}
            </section>

            <section>
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-200 pb-1.5 mb-3">References</h2>
              {references.length > 0 ? (
                <div className="space-y-3 text-[10.5px] text-slate-600">
                  {references.map((ref: any, idx: number) => (
                    <div key={idx}>
                      <strong className="text-slate-800 block">{ref.name}</strong>
                      <span className="block italic text-[9.5px]">{ref.title} | {ref.company}</span>
                      <span style={{ color: acc2 }} className="break-all">{ref.contact}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm italic text-slate-400">No references added yet.</p>
              )}
            </section>
          </div>
        </div>

        {includeDeclaration && declaration && (
          <div className="p-8 pt-0 border-t border-slate-100 mt-4 text-sm italic text-slate-400">
            <p>{declaration}</p>
            {verifiedBadge && (
              <div style={{ backgroundColor: acc2 }} className="inline-flex items-center gap-1.5 text-white p-0.5 px-2.5 rounded text-xs font-extrabold uppercase mt-2">
                CV Verified & Up-to-date {getVerifiedDateLabel()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  } else if (selectedLayout === "theme3") {
    // THEME 3: Minimalist Professional Layout (matching Esha Yadav design)
    const pri = cvSettings.primaryColor || '#1a2a3a';
    const acc = cvSettings.accentColor || '#3498db';
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white text-[#333] relative shadow-2xl text-left font-sans leading-normal" style={{ ...fontScaleStyle, fontFamily: 'Inter, sans-serif' }}>
        <div style={{ padding: '40px 60px' }}>
          {/* Header */}
          <header style={{ textAlign: 'center', borderBottom: `2px solid ${pri}`, paddingBottom: '15px', marginBottom: '20px' }}>
            <h1 style={{ fontSize: '30px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px' }}>{personalInfo.fullName || "Your Name"}</h1>
            <p style={{ fontSize: '13px', fontWeight: 600, color: acc, textTransform: 'uppercase', letterSpacing: '3px', margin: '5px 0 10px' }}>{personalInfo.title || "Professional Title"}</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontSize: '10px', color: '#666', marginBottom: '6px', flexWrap: 'wrap' }}>
              {personalInfo.email && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ color: acc }}>✉</span> {personalInfo.email}</span>}
              {personalInfo.phone && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ color: acc }}><Phone className="inline h-[1em] w-[1em] shrink-0" /></span> {personalInfo.phone}</span>}
              {personalInfo.location && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ color: acc }}><MapPin className="inline h-[1em] w-[1em] shrink-0" /></span> {personalInfo.location}</span>}
              {personalInfo.linkedin && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ color: acc }}><Linkedin className="inline h-[1em] w-[1em] shrink-0" /></span> {personalInfo.linkedin}</span>}
              {personalInfo.github && <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ color: acc }}><Github className="inline h-[1em] w-[1em] shrink-0" /></span> {personalInfo.github}</span>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', fontSize: '9px', color: '#555', textTransform: 'uppercase', fontWeight: 600, flexWrap: 'wrap' }}>
              {personalDetails.dateOfBirth && <span>DOB: {personalDetails.dateOfBirth}</span>}
              {personalDetails.nationality && <span>{personalDetails.dateOfBirth ? '| ' : ''}Nationality: {personalDetails.nationality}</span>}
              {personalDetails.maritalStatus && <span>| Status: {personalDetails.maritalStatus}</span>}
              {personalDetails.drivingExperience && <span>| License: {personalDetails.drivingExperience}</span>}
            </div>
          </header>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Professional Profile */}
            <section>
              <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                Professional Profile
                <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
              </h2>
              {summary ? (
                <p style={{ fontSize: '11px', lineHeight: '1.6', color: '#333', textAlign: 'justify' }}>{summary}</p>
              ) : (
                <p style={{ fontSize: '11px', lineHeight: '1.6', color: '#999', fontStyle: 'italic' }}>No profile summary added yet.</p>
              )}
            </section>

            {/* Professional Experience */}
            <section>
              <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                Professional Experience
                <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
              </h2>
              {experience.length > 0 ? (
                <div>
                  {experience.map((exp: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: pri }}>{exp.company}</span>
                        <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#666' }}>{exp.startDate} – {exp.endDate}</span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: acc, marginBottom: '4px' }}>{exp.role}</div>
                      {exp.companyDesc && (
                        <span style={{ fontSize: '10px', color: '#7f8c8d', fontStyle: 'italic', background: '#f9fbfc', padding: '5px 10px', borderLeft: '3px solid #d5dbdb', marginBottom: '6px', display: 'block' }}>
                          {exp.companyDesc}
                        </span>
                      )}
                      <ul style={{ listStyle: 'none', paddingLeft: '5px', marginTop: '4px' }}>
                        {(Array.isArray(exp.responsibilities) ? exp.responsibilities : [exp.responsibilities]).filter(Boolean).map((resp: string, rIdx: number) => (
                          <li key={rIdx} style={{ fontSize: '10.5px', lineHeight: '1.5', color: '#333', marginBottom: '2px', paddingLeft: '15px', position: 'relative' }}>
                            <span style={{ color: acc, position: 'absolute', left: 0 }}>•</span>
                            {resp}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No work experience added yet.</p>
              )}
            </section>

            {/* Education */}
            <section>
              <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                Education
                <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
              </h2>
              {education.length > 0 ? (
                <div>
                  {education.map((edu: any, idx: number) => (
                    <div key={idx} style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: pri }}>{edu.institution}</span>
                        <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#666' }}>{edu.year}</span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: acc, marginBottom: '4px' }}>{edu.degree}</div>
                      {edu.details && <p style={{ fontSize: '10px', lineHeight: '1.5', color: '#333' }}>{edu.details}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No education added yet.</p>
              )}
            </section>

            {/* Skills */}
            <section>
              <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                Technical & Professional Skills
                <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
              </h2>
              {skills.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {skills.map((grp: any, idx: number) => (
                    <div key={idx}>
                      <h4 style={{ fontSize: '9px', textTransform: 'uppercase', color: acc, marginBottom: '4px', borderBottom: '1px solid #eee' }}>{grp.category}</h4>
                      <CompactSkillsList items={grp.items || ''} mode="main" />
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No skills added yet.</p>
              )}
            </section>

            {/* Languages */}
            {languages.length > 0 && (
              <section>
                <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  Languages
                  <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
                </h2>
                <p style={{ fontSize: '10px', lineHeight: '1.5', color: '#333' }}>
                  {languages.map((l: any) => `${l.language} (${l.proficiency})`).join(', ')}
                </p>
              </section>
            )}

            {/* Certifications */}
            {certifications.length > 0 && (
              <section>
                <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  Certifications
                  <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
                </h2>
                <div style={{ fontSize: '10px', lineHeight: '1.5', color: '#333' }}>
                  {certifications.map((cert: any, idx: number) => (
                    <div key={idx}><strong>{cert.name}</strong> – {cert.issuer} {cert.date ? `(${cert.date})` : ""}</div>
                  ))}
                </div>
              </section>
            )}

            {/* Achievements */}
            {achievements.length > 0 && (
              <section>
                <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  Achievements
                  <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
                </h2>
                <div style={{ fontSize: '10px', lineHeight: '1.5', color: '#333' }}>
                  {achievements.map((ach: any, idx: number) => (
                    <div key={idx}><strong>{ach.title}</strong> {ach.date ? `(${ach.date})` : ""} – {ach.description}</div>
                  ))}
                </div>
              </section>
            )}

            {/* Additional Info */}
            {additionalInfo.length > 0 && (
              <section>
                <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  Additional Info
                  <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
                </h2>
                <div style={{ fontSize: '10px', lineHeight: '1.5', color: '#333' }}>
                  {additionalInfo.map((info: any, idx: number) => (
                    <div key={idx}><strong>{info.label}:</strong> {info.value}</div>
                  ))}
                </div>
              </section>
            )}

            {/* References */}
            <section>
              <h2 style={{ fontSize: '12px', fontWeight: 800, color: pri, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                References
                <span style={{ flex: 1, height: '1px', background: '#e0e4e8' }}></span>
              </h2>
              {references.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {references.map((ref: any, idx: number) => (
                    <div key={idx} style={{ fontSize: '10px', lineHeight: '1.5', color: '#333' }}>
                      <strong>{ref.name}</strong><br />
                      {ref.title}, {ref.company}<br />
                      <Phone className="inline h-[1em] w-[1em] shrink-0" /> {ref.contact}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '11px', color: '#999', fontStyle: 'italic' }}>No references added yet.</p>
              )}
            </section>

            {/* Declaration & Badge */}
            {includeDeclaration && declaration && (
              <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #e0e4e8', textAlign: 'center' }}>
                <p style={{ fontSize: '8.5px', color: '#95a5a6', fontStyle: 'italic', marginBottom: '8px' }}>{declaration}</p>
                {verifiedBadge && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#2ecc71', color: 'white', padding: '5px 15px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase' }}>
                    ✓ CV Verified &nbsp;•&nbsp; {getVerifiedDateLabel()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else if (selectedLayout === "theme5") {
    // THEME 5: Creative Split – Bold left accent strip with colorful header
    const acc = cvSettings.accentColor;
    const pri = cvSettings.primaryColor;
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white text-[#333] flex relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
        {/* Thin accent strip */}
        <div style={{ backgroundColor: acc }} className="w-2 shrink-0" />
        {/* Left sidebar */}
        <aside style={{ backgroundColor: pri }} className="w-[200px] shrink-0 text-white p-5 flex flex-col gap-5">
          {(cvSettings as any).showPhoto !== false && (
            <div style={{ width: 90, height: 90, borderRadius: cvSettings.photoShape === 'circle' ? '50%' : '10px', borderColor: acc }} className="border-[3px] mx-auto overflow-hidden bg-white">
              <img src={personalInfo.photoUrl || 'https://via.placeholder.com/90'} alt="Profile" style={{ objectFit: cvSettings.photoFit, width: '100%', height: '100%' }} />
            </div>
          )}
          <div>
            <p style={{ color: acc }} className="text-xs font-black uppercase tracking-widest mb-2">Contact</p>
            <div className="space-y-1.5 text-xs opacity-90">
              {personalInfo.location && <div><MapPin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.location}</div>}
              {personalInfo.phone && <div><Phone className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.phone}</div>}
              {personalInfo.email && <div className="break-all"><Mail className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.email}</div>}
              {personalInfo.linkedin && <div className="break-all"><Linkedin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.linkedin}</div>}
              {personalInfo.github && <div className="break-all"><Github className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.github}</div>}
            </div>
          </div>
          <div>
            <p style={{ color: acc }} className="text-xs font-black uppercase tracking-widest mb-2">Skills</p>
            {skills.length > 0 ? skills.map((g: any, i: number) => (
              <div key={i} className="mb-2">
                <div style={{ color: acc }} className="text-xs font-bold mb-0.5">{g.category}</div>
                <CompactSkillsSidebar items={g.items || ''} accentColor={acc} />
              </div>
            )) : <p className="text-xs italic opacity-50">No skills.</p>}
          </div>
          <div>
            <p style={{ color: acc }} className="text-xs font-black uppercase tracking-widest mb-2">Languages</p>
            {languages.length > 0 ? languages.map((l: any, i: number) => (
              <div key={i} className="text-xs opacity-90">{l.language}{l.proficiency ? ` · ${l.proficiency}` : ''}</div>
            )) : <p className="text-xs italic opacity-50">No languages.</p>}
          </div>
          <div>
            <p style={{ color: acc }} className="text-xs font-black uppercase tracking-widest mb-2">Details</p>
            <div className="space-y-1 text-xs opacity-80">
              {personalDetails.dateOfBirth && <div><strong>DOB:</strong> {personalDetails.dateOfBirth}</div>}
              {personalDetails.nationality && <div><strong>Nationality:</strong> {personalDetails.nationality}</div>}
              {personalDetails.maritalStatus && <div><strong>Status:</strong> {personalDetails.maritalStatus}</div>}
              {personalDetails.kenyaStatus && <div><strong>Kenya:</strong> {personalDetails.kenyaStatus}</div>}
            </div>
          </div>
        </aside>
        {/* Main */}
        <main className="flex-1 p-6 flex flex-col gap-5 overflow-hidden">
          <div style={{ borderBottomColor: acc }} className="border-b-2 pb-3">
            <h1 style={{ color: pri }} className="text-3xl font-black uppercase tracking-tight leading-tight">{personalInfo.fullName || 'Your Name'}</h1>
            <div style={{ color: acc }} className="text-sm font-bold uppercase tracking-wide mt-1">{personalInfo.title || 'Professional Title'}</div>
          </div>
          {summary && (
            <div>
              <h2 style={{ color: pri }} className="text-xs font-black uppercase tracking-widest mb-1.5">Profile</h2>
              <p className="text-xs leading-relaxed text-slate-600 text-justify">{summary}</p>
            </div>
          )}
          <div>
            <h2 style={{ color: pri }} className="text-xs font-black uppercase tracking-widest mb-2">Experience</h2>
            {experience.length > 0 ? experience.map((exp: any, idx: number) => (
              <div key={idx} className="mb-3 pl-3" style={{ borderLeftColor: acc, borderLeftWidth: 2 }}>
                <div className="flex justify-between items-start">
                  <div><div className="text-sm font-bold text-slate-900">{exp.role}</div><div className="text-xs text-slate-500 font-semibold">{exp.company}{exp.location ? ` · ${exp.location}` : ''}</div></div>
                  <div style={{ color: acc }} className="text-xs font-bold whitespace-nowrap">{exp.startDate}–{exp.endDate}</div>
                </div>
                {exp.companyDesc && <p className="text-xs italic text-slate-400 mt-0.5">{exp.companyDesc}</p>}
                <ul className="list-disc pl-4 text-xs text-slate-600 mt-1 space-y-0.5">
                  {(Array.isArray(exp.responsibilities) ? exp.responsibilities : [exp.responsibilities]).filter(Boolean).map((r: string, ri: number) => <li key={ri}>{r}</li>)}
                </ul>
              </div>
            )) : <p className="text-xs italic text-slate-400">No experience added.</p>}
          </div>
          <div>
            <h2 style={{ color: pri }} className="text-xs font-black uppercase tracking-widest mb-2">Education</h2>
            {education.length > 0 ? education.map((edu: any, idx: number) => (
              <div key={idx} className="mb-1.5 text-xs"><strong className="text-slate-800">{edu.degree}</strong> — {edu.institution} ({edu.year})</div>
            )) : <p className="text-xs italic text-slate-400">No education.</p>}
          </div>
          {certifications.length > 0 && (
            <div>
              <h2 style={{ color: pri }} className="text-xs font-black uppercase tracking-widest mb-2">Certifications</h2>
              {certifications.map((c: any, i: number) => <div key={i} className="text-xs text-slate-600"><strong>{c.name}</strong> — {c.issuer} ({c.date})</div>)}
            </div>
          )}
          {achievements.length > 0 && (
            <div>
              <h2 style={{ color: pri }} className="text-xs font-black uppercase tracking-widest mb-2">Achievements</h2>
              {achievements.map((a: any, i: number) => <div key={i} className="text-xs text-slate-600 mb-1"><strong>{a.title}</strong>{a.date ? ` (${a.date})` : ''} — {a.description}</div>)}
            </div>
          )}
          {references.length > 0 && (
            <div>
              <h2 style={{ color: pri }} className="text-xs font-black uppercase tracking-widest mb-2">References</h2>
              <div className="grid grid-cols-2 gap-3">
                {references.map((ref: any, i: number) => <div key={i} className="text-xs"><strong>{ref.name}</strong><br />{ref.title} · {ref.company}<br /><span style={{ color: acc }}>{ref.contact}</span></div>)}
              </div>
            </div>
          )}
          {includeDeclaration && declaration && (
            <div className="mt-auto pt-2 text-xs italic text-slate-400 border-t border-slate-100">
              <p>{declaration}</p>
              {verifiedBadge && <p className="not-italic font-bold uppercase text-slate-500 mt-1">CV Verified & Up-to-date {getVerifiedDateLabel()}</p>}
            </div>
          )}
        </main>
      </div>
    );
  } else if (selectedLayout === "theme6") {
    // THEME 6: Academic – clean serif-inspired scholarly layout
    const acc = cvSettings.accentColor;
    const pri = cvSettings.primaryColor;
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white text-[#222] flex flex-col relative shadow-2xl text-left font-serif leading-normal" style={{ ...fontScaleStyle, fontFamily: (cvSettings as any).fontFamily || 'Georgia, serif' }}>
        {/* Top header band */}
        <header className="px-10 pt-8 pb-5 flex items-center gap-6" style={{ borderBottomColor: pri, borderBottomWidth: 3 }}>
          {(cvSettings as any).showPhoto !== false && (
            <div style={{ width: 100, height: 100, borderRadius: cvSettings.photoShape === 'circle' ? '50%' : '8px', borderColor: pri }} className="border-2 overflow-hidden shrink-0 bg-slate-100">
              <img src={personalInfo.photoUrl || 'https://via.placeholder.com/100'} alt="Profile" style={{ objectFit: cvSettings.photoFit, width: '100%', height: '100%' }} />
            </div>
          )}
          <div className="flex-1">
            <h1 style={{ color: pri }} className="text-3xl font-bold tracking-tight">{personalInfo.fullName || 'Your Name'}</h1>
            <div style={{ color: acc }} className="text-base italic mt-0.5">{personalInfo.title || 'Academic Title'}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-slate-500 font-sans">
              {personalInfo.email && <span>✉ {personalInfo.email}</span>}
              {personalInfo.phone && <span>☏ {personalInfo.phone}</span>}
              {personalInfo.location && <span>⌖ {personalInfo.location}</span>}
              {personalInfo.linkedin && <span><Linkedin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.linkedin}</span>}
            </div>
          </div>
        </header>
        <div className="flex-1 px-10 py-6 flex gap-8">
          {/* Main column */}
          <div className="flex-1 space-y-5">
            {summary && (
              <section>
                <h2 style={{ color: pri, borderBottomColor: `${acc}88` }} className="text-sm font-bold uppercase tracking-widest border-b pb-1 mb-2">Research Profile</h2>
                <p className="text-xs leading-relaxed text-justify">{summary}</p>
              </section>
            )}
            <section>
              <h2 style={{ color: pri, borderBottomColor: `${acc}88` }} className="text-sm font-bold uppercase tracking-widest border-b pb-1 mb-2">Professional Experience</h2>
              {experience.length > 0 ? experience.map((exp: any, idx: number) => (
                <div key={idx} className="mb-3">
                  <div className="flex justify-between items-baseline">
                    <div className="font-bold text-sm">{exp.role}</div>
                    <div style={{ color: acc }} className="text-xs font-sans">{exp.startDate} – {exp.endDate}</div>
                  </div>
                  <div className="text-xs italic text-slate-500">{exp.company}{exp.location ? `, ${exp.location}` : ''}</div>
                  <ul className="list-disc pl-5 text-xs mt-1 space-y-0.5 text-slate-700">
                    {(Array.isArray(exp.responsibilities) ? exp.responsibilities : [exp.responsibilities]).filter(Boolean).map((r: string, ri: number) => <li key={ri}>{r}</li>)}
                  </ul>
                </div>
              )) : <p className="text-xs italic text-slate-400">No experience.</p>}
            </section>
            <section>
              <h2 style={{ color: pri, borderBottomColor: `${acc}88` }} className="text-sm font-bold uppercase tracking-widest border-b pb-1 mb-2">Education</h2>
              {education.length > 0 ? education.map((edu: any, idx: number) => (
                <div key={idx} className="mb-2">
                  <div className="font-bold text-sm">{edu.degree}</div>
                  <div className="text-xs italic text-slate-500">{edu.institution} — <span className="font-sans not-italic">{edu.year}</span></div>
                  {edu.details && <p className="text-xs text-slate-600 mt-0.5">{edu.details}</p>}
                </div>
              )) : <p className="text-xs italic text-slate-400">No education.</p>}
            </section>
            {projects.length > 0 && (
              <section>
                <h2 style={{ color: pri, borderBottomColor: `${acc}88` }} className="text-sm font-bold uppercase tracking-widest border-b pb-1 mb-2">Publications & Projects</h2>
                {projects.map((p: any, i: number) => <div key={i} className="mb-1.5 text-xs"><strong>{p.title}</strong>{p.year ? ` (${p.year})` : ''} — {p.description}</div>)}
              </section>
            )}
          </div>
          {/* Right sidebar */}
          <aside className="w-[170px] shrink-0 space-y-4 font-sans">
            <div>
              <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-2">Personal</h3>
              <div className="space-y-1 text-xs text-slate-600">
                {personalDetails.dateOfBirth && <div><strong>DOB:</strong> {personalDetails.dateOfBirth}</div>}
                {personalDetails.nationality && <div><strong>Nat:</strong> {personalDetails.nationality}</div>}
                {personalDetails.maritalStatus && <div><strong>Status:</strong> {personalDetails.maritalStatus}</div>}
                {personalDetails.kenyaStatus && <div><strong>Kenya:</strong> {personalDetails.kenyaStatus}</div>}
              </div>
            </div>
            <div>
              <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-2">Competencies</h3>
              {skills.length > 0 ? skills.map((g: any, i: number) => (
                <div key={i} className="mb-2">
                  <div className="text-xs font-bold text-slate-700 mb-0.5">{g.category}</div>
                  <CompactSkillsList items={g.items || ''} mode="bullets" />
                </div>
              )) : <p className="text-xs italic text-slate-400">No skills.</p>}
            </div>
            <div>
              <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-2">Languages</h3>
              {languages.length > 0 ? languages.map((l: any, i: number) => (
                <div key={i} className="text-xs text-slate-600">{l.language} — {l.proficiency}</div>
              )) : <p className="text-xs italic text-slate-400">No languages.</p>}
            </div>
            {certifications.length > 0 && (
              <div>
                <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-2">Certifications</h3>
                {certifications.map((c: any, i: number) => <div key={i} className="text-xs text-slate-600 mb-1"><strong>{c.name}</strong><br />{c.issuer}</div>)}
              </div>
            )}
            {references.length > 0 && (
              <div>
                <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider border-b border-slate-200 pb-1 mb-2">References</h3>
                {references.map((ref: any, i: number) => <div key={i} className="text-xs text-slate-600 mb-1.5"><strong>{ref.name}</strong><br /><span className="italic">{ref.title}</span><br />{ref.company}<br /><span style={{ color: acc }}>{ref.contact}</span></div>)}
              </div>
            )}
          </aside>
        </div>
        {includeDeclaration && declaration && (
          <div className="px-10 pb-4 text-xs italic text-slate-400 font-sans border-t border-slate-100 pt-2">
            <p>{declaration}</p>
            {verifiedBadge && <p className="not-italic font-bold uppercase text-slate-500 mt-1">CV Verified & Up-to-date {getVerifiedDateLabel()}</p>}
          </div>
        )}
      </div>
    );
  } else if (selectedLayout === "theme7") {
    // THEME 7: Timeline – vertical chronological timeline layout
    const acc = cvSettings.accentColor;
    const pri = cvSettings.primaryColor;
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
        {/* Top header */}
        <header style={{ background: `linear-gradient(135deg, ${pri} 0%, ${acc} 100%)` }} className="text-white px-10 py-7">
          <div className="flex items-center gap-5">
            {(cvSettings as any).showPhoto !== false && (
              <div style={{ width: 90, height: 90, borderRadius: cvSettings.photoShape === 'circle' ? '50%' : '10px' }} className="border-2 border-white/50 overflow-hidden shrink-0 bg-white/20">
                <img src={personalInfo.photoUrl || 'https://via.placeholder.com/90'} alt="Profile" style={{ objectFit: cvSettings.photoFit, width: '100%', height: '100%' }} />
              </div>
            )}
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight leading-tight">{personalInfo.fullName || 'Your Name'}</h1>
              <div className="text-base font-medium opacity-90 mt-0.5">{personalInfo.title || 'Professional Title'}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs opacity-80">
                {personalInfo.email && <span>✉ {personalInfo.email}</span>}
                {personalInfo.phone && <span>☏ {personalInfo.phone}</span>}
                {personalInfo.location && <span><MapPin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.location}</span>}
                {personalInfo.linkedin && <span><Linkedin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.linkedin}</span>}
              </div>
            </div>
          </div>
        </header>
        <div className="px-10 py-6 flex gap-8">
          {/* Left: timeline content */}
          <div className="flex-1 space-y-5">
            {summary && (
              <section>
                <h2 style={{ color: pri }} className="text-sm font-extrabold uppercase tracking-widest mb-2">About</h2>
                <p className="text-xs leading-relaxed text-slate-600">{summary}</p>
              </section>
            )}
            <section>
              <h2 style={{ color: pri }} className="text-sm font-extrabold uppercase tracking-widest mb-3">Career Timeline</h2>
              <div className="relative pl-5" style={{ borderLeftColor: acc, borderLeftWidth: 2 }}>
                {experience.length > 0 ? experience.map((exp: any, idx: number) => (
                  <div key={idx} className="relative mb-4">
                    <div style={{ backgroundColor: acc, left: -22 }} className="absolute top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow" />
                    <div style={{ color: acc }} className="text-xs font-bold mb-0.5">{exp.startDate} – {exp.endDate}</div>
                    <div className="font-bold text-sm text-slate-900">{exp.role}</div>
                    <div className="text-xs text-slate-500 font-semibold">{exp.company}{exp.location ? ` · ${exp.location}` : ''}</div>
                    {exp.companyDesc && <p className="text-xs italic text-slate-400 mt-0.5">{exp.companyDesc}</p>}
                    <ul className="list-disc pl-4 text-xs text-slate-600 mt-1 space-y-0.5">
                      {(Array.isArray(exp.responsibilities) ? exp.responsibilities : [exp.responsibilities]).filter(Boolean).map((r: string, ri: number) => <li key={ri}>{r}</li>)}
                    </ul>
                  </div>
                )) : <p className="text-xs italic text-slate-400">No experience added.</p>}
              </div>
            </section>
            <section>
              <h2 style={{ color: pri }} className="text-sm font-extrabold uppercase tracking-widest mb-3">Education</h2>
              <div className="relative pl-5" style={{ borderLeftColor: acc, borderLeftWidth: 2 }}>
                {education.length > 0 ? education.map((edu: any, idx: number) => (
                  <div key={idx} className="relative mb-3">
                    <div style={{ backgroundColor: acc, left: -22 }} className="absolute top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow" />
                    <div style={{ color: acc }} className="text-xs font-bold">{edu.year}</div>
                    <div className="font-bold text-sm text-slate-900">{edu.degree}</div>
                    <div className="text-xs text-slate-500">{edu.institution}</div>
                  </div>
                )) : <p className="text-xs italic text-slate-400">No education.</p>}
              </div>
            </section>
          </div>
          {/* Right sidebar */}
          <aside className="w-[180px] shrink-0 space-y-4">
            <div>
              <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Personal</h3>
              <div className="space-y-1 text-xs text-slate-600">
                {personalDetails.dateOfBirth && <div><strong>DOB:</strong> {personalDetails.dateOfBirth}</div>}
                {personalDetails.nationality && <div><strong>Nat:</strong> {personalDetails.nationality}</div>}
                {personalDetails.maritalStatus && <div><strong>Status:</strong> {personalDetails.maritalStatus}</div>}
                {personalDetails.kenyaStatus && <div><strong>Kenya:</strong> {personalDetails.kenyaStatus}</div>}
                {personalDetails.nairobiRes && <div><strong>Nairobi:</strong> {personalDetails.nairobiRes}</div>}
                {personalDetails.drivingExperience && <div><strong>Driving:</strong> {personalDetails.drivingExperience}</div>}
              </div>
            </div>
            <div>
              <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Skills</h3>
              {skills.length > 0 ? skills.map((g: any, i: number) => (
                <div key={i} className="mb-2">
                  <div className="text-xs font-bold text-slate-700 mb-0.5">{g.category}</div>
                  <CompactSkillsList items={g.items || ''} mode="bullets" />
                </div>
              )) : <p className="text-xs italic text-slate-400">No skills.</p>}
            </div>
            <div>
              <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Languages</h3>
              {languages.length > 0 ? languages.map((l: any, i: number) => (
                <div key={i} className="text-xs text-slate-600">{l.language}{l.proficiency ? ` — ${l.proficiency}` : ''}</div>
              )) : <p className="text-xs italic text-slate-400">No languages.</p>}
            </div>
            {achievements.length > 0 && (
              <div>
                <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">Achievements</h3>
                {achievements.map((a: any, i: number) => <div key={i} className="text-xs text-slate-600 mb-1"><strong>{a.title}</strong> — {a.description}</div>)}
              </div>
            )}
            {references.length > 0 && (
              <div>
                <h3 style={{ color: acc }} className="text-xs font-bold uppercase tracking-wider mb-2 border-b border-slate-200 pb-1">References</h3>
                {references.map((ref: any, i: number) => <div key={i} className="text-xs text-slate-600 mb-1.5"><strong className="block">{ref.name}</strong>{ref.title} · {ref.company}<br /><span style={{ color: acc }}>{ref.contact}</span></div>)}
              </div>
            )}
          </aside>
        </div>
        {includeDeclaration && declaration && (
          <div className="px-10 pb-4 text-xs italic text-slate-400 border-t border-slate-100 pt-2">
            <p>{declaration}</p>
            {verifiedBadge && <p className="not-italic font-bold uppercase text-slate-500 mt-1">CV Verified & Up-to-date {getVerifiedDateLabel()}</p>}
          </div>
        )}
      </div>
    );
  } else {
    // THEME 4: Executive Layout
    const acc = cvSettings.accentColor;
    const pri = cvSettings.primaryColor;
    return (
      <div className="w-[210mm] min-h-[297mm] bg-white relative shadow-2xl text-left font-sans leading-normal" style={fontScaleStyle}>
        {/* Bold top banner */}
        <header style={{ backgroundColor: pri, borderBottomColor: acc }} className="text-white border-b-4">
          <div className="p-8 pb-4">
            <h1 className="text-4xl font-extrabold tracking-tight">{personalInfo.fullName || "Your Name"}</h1>
            <div style={{ color: acc }} className="text-lg font-semibold tracking-wide mt-1 uppercase">{personalInfo.title || "Professional Title"}</div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs px-8 pb-4 text-slate-300" style={{ backgroundColor: `${pri}dd` }}>
            {personalInfo.email && <span>✉ {personalInfo.email}</span>}
            {personalInfo.phone && <span><Phone className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.phone}</span>}
            {personalInfo.location && <span><MapPin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.location}</span>}
            {personalInfo.linkedin && <span><Linkedin className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.linkedin}</span>}
            {personalInfo.github && <span><Github className="inline h-[1em] w-[1em] shrink-0" /> {personalInfo.github}</span>}
          </div>
        </header>

        <div className="p-8 grid grid-cols-[1fr_280px] gap-8">
          <div className="space-y-6">
            <section>
              <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-3">Executive Profile</h2>
              {summary ? <p className="text-sm leading-relaxed text-slate-700 text-justify">{summary}</p> : <p className="text-sm italic text-slate-400">No profile summary.</p>}
            </section>

            <section>
              <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-4">Leadership Experience</h2>
              {experience.length > 0 ? (
                <div className="space-y-5">
                  {experience.map((exp: any, idx: number) => (
                    <div key={idx} className="border-l-2 pl-4" style={{ borderLeftColor: acc }}>
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-[14px] text-slate-900">{exp.role}</div>
                          <div className="text-sm text-slate-500 font-semibold">{exp.company} {exp.location ? `— ${exp.location}` : ""}</div>
                        </div>
                        <div style={{ color: acc }} className="text-sm font-bold whitespace-nowrap">{exp.startDate} – {exp.endDate}</div>
                      </div>
                      {exp.companyDesc && <p className="text-[10.5px] text-slate-400 italic mt-1">{exp.companyDesc}</p>}
                      <ul className="list-disc pl-5 text-[11.5px] text-slate-600 mt-2 space-y-1">
                        {Array.isArray(exp.responsibilities) ? exp.responsibilities.map((resp: string, rIdx: number) => (
                          <li key={rIdx}>{resp}</li>
                        )) : <li>{exp.responsibilities}</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm italic text-slate-400">No experience added.</p>}
            </section>

            <section>
              <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-3">Key Projects & Impact</h2>
              {projects.length > 0 ? (
                <div className="space-y-3">
                  {projects.map((proj: any, idx: number) => (
                    <div key={idx} className="text-sm"><strong className="text-slate-800">{proj.title}</strong> {proj.year ? `(${proj.year})` : ""} — <span className="text-slate-600">{proj.description}</span></div>
                  ))}
                </div>
              ) : <p className="text-sm italic text-slate-400">No projects added.</p>}
            </section>

            <section>
              <h2 style={{ borderBottomColor: acc, color: pri }} className="text-lg font-extrabold uppercase border-b-2 pb-1 mb-3">Education</h2>
              {education.length > 0 ? (
                <div className="space-y-2">
                  {education.map((edu: any, idx: number) => (
                    <div key={idx} className="text-sm"><strong>{edu.degree}</strong> — {edu.institution} ({edu.year}){edu.details ? ` — ${edu.details}` : ""}</div>
                  ))}
                </div>
              ) : <p className="text-sm italic text-slate-400">No education added.</p>}
            </section>
          </div>

          <aside className="space-y-5">
            <div className="text-center">
              {(cvSettings as any).showPhoto !== false && (
                <div style={{ width: 120, height: 120, borderRadius: '50%', borderColor: acc, objectFit: cvSettings.photoFit }} className="mx-auto border-2 overflow-hidden mb-3">
                  <img src={personalInfo.photoUrl || "https://via.placeholder.com/120"} alt="Profile" className="w-full h-full" style={{ objectFit: cvSettings.photoFit }} />
                </div>
              )}
            </div>

            <div>
              <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Core Competencies</h3>
              {skills.length > 0 ? skills.map((grp: any, idx: number) => (
                <div key={idx} className="mb-2">
                  <div className="text-xs font-bold text-slate-700 mb-0.5">{grp.category}</div>
                  <CompactSkillsList items={grp.items || ''} mode="bullets" />
                </div>
              )) : <p className="text-sm italic text-slate-400">No skills.</p>}
            </div>

            <div>
              <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Languages</h3>
              {languages.length > 0 ? languages.map((l: any, idx: number) => (
                <div key={idx} className="text-sm text-slate-600">{l.language} — {l.proficiency}</div>
              )) : <p className="text-sm italic text-slate-400">No languages.</p>}
            </div>

            {certifications.length > 0 && (
              <div>
                <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Certifications</h3>
                {certifications.map((c: any, idx: number) => (
                  <div key={idx} className="text-sm text-slate-600"><strong>{c.name}</strong> — {c.issuer}</div>
                ))}
              </div>
            )}

            {additionalInfo.length > 0 && (
              <div>
                <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">Details</h3>
                {additionalInfo.map((info: any, idx: number) => (
                  <div key={idx} className="text-sm text-slate-600"><strong>{info.label}:</strong> {info.value}</div>
                ))}
              </div>
            )}

            <div>
              <h3 style={{ color: acc, borderBottomColor: acc }} className="text-xs font-extrabold uppercase tracking-wider border-b pb-1 mb-2">References</h3>
              {references.length > 0 ? references.map((ref: any, idx: number) => (
                <div key={idx} className="text-sm text-slate-600 mb-2"><strong>{ref.name}</strong><br />{ref.title} | {ref.company}<br /><span style={{ color: acc }}>{ref.contact}</span></div>
              )) : <p className="text-sm italic text-slate-400">No references.</p>}
            </div>

            {includeDeclaration && declaration && (
              <div className="text-xs italic text-slate-400 border-t border-slate-200 pt-2 mt-4">
                <p>{declaration}</p>
                {verifiedBadge && <p className="not-italic font-bold uppercase text-slate-500 mt-1">CV Verified & Up-to-date {getVerifiedDateLabel()}</p>}
              </div>
            )}
          </aside>
        </div>
      </div>
    );
  }
}

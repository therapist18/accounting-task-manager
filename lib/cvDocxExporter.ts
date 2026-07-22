import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  VerticalAlign,
} from "docx";
import { saveAs } from "file-saver";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Fetches the profile photo and decodes its natural dimensions so the embedded
// image keeps its aspect ratio instead of being squashed into a fixed box.
async function loadPhotoImageRun(url?: string, targetWidth = 110): Promise<ImageRun | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();

    let type: "jpg" | "png" | "gif" | "bmp" = "png";
    const contentType = blob.type || "";
    if (contentType.includes("jpeg") || contentType.includes("jpg") || /\.jpe?g(\?|$)/i.test(url)) type = "jpg";
    else if (contentType.includes("gif") || /\.gif(\?|$)/i.test(url)) type = "gif";
    else if (contentType.includes("bmp") || /\.bmp(\?|$)/i.test(url)) type = "bmp";

    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        resolve({ w: 1, h: 1 });
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    });

    const targetHeight = Math.round((dims.h / dims.w) * targetWidth) || targetWidth;
    const data = await blob.arrayBuffer();

    return new ImageRun({
      data,
      type,
      transformation: { width: targetWidth, height: targetHeight },
    });
  } catch (e) {
    console.warn("CV DOCX export: failed to embed profile photo", e);
    return null;
  }
}

const toDocxColor = (hex?: string, fallback = "2c3e50"): string => (hex ? hex.replace("#", "") : fallback);

// Blends a hex color toward white - used to approximate the CSS `${accent}18`
// (~9% opacity) tinted section-header backgrounds used across the CV themes,
// since docx cell/paragraph shading doesn't support alpha.
function lightenHex(hex: string, factor: number): string {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const blend = (c: number) => Math.round(c + (255 - c) * factor).toString(16).padStart(2, "0");
  return `${blend(r)}${blend(g)}${blend(b)}`;
}

// A colored-left-border, tinted-background section header - the Word equivalent
// of the `.border-l-[5px] { background: accent+opacity }` boxes used across the
// CV preview themes (see cv-designs.tsx), instead of a plain heading style.
function sectionHeaderBox(text: string, primaryColor: string, accentColor: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 140 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: lightenHex(accentColor, 0.88) },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: accentColor, space: 6 } },
    indent: { left: 120 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 21, color: primaryColor })],
  });
}

// Dark-sidebar section heading: uppercase accent-colored text with a thin
// bottom rule, matching the sidebar `border-b` headings in theme1/theme5.
function sidebarHeading(text: string, accentColor: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accentColor, space: 4 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: accentColor })],
  });
}

function sidebarLine(value: string, opts?: { label?: string; accentColor?: string; muted?: boolean }): Paragraph {
  const children: TextRun[] = [];
  if (opts?.label) children.push(new TextRun({ text: `${opts.label}: `, bold: true, size: 17, color: opts.accentColor || "FFFFFF" }));
  children.push(new TextRun({ text: value || "—", size: 17, color: opts?.muted ? "C7CCD1" : "FFFFFF" }));
  return new Paragraph({ spacing: { after: 70 }, children });
}

type CvBlocks = ReturnType<typeof buildContentBlocks>;

// Builds the theme-agnostic content (experience, education, etc.) as Paragraph
// arrays so both the sidebar and banner layouts can share the exact same data
// mapping and only differ in header chrome/column structure.
function buildContentBlocks(cvData: any, primaryColor: string, accentColor: string) {
  const {
    summary = "",
    experience = [],
    internships = [],
    projects = [],
    education = [],
    references = [],
    certifications = [],
    achievements = [],
    declaration = "",
    includeDeclaration = true,
    verifiedBadge = false,
  } = cvData;

  const header = (text: string) => sectionHeaderBox(text, primaryColor, accentColor);

  const summaryBlock: Paragraph[] = summary
    ? [header("Professional Profile"), new Paragraph({ spacing: { after: 160 }, alignment: AlignmentType.BOTH, children: [new TextRun({ text: summary, size: 21 })] })]
    : [];

  const experienceBlock: Paragraph[] = experience.length
    ? [
        header("Professional Experience"),
        ...experience.flatMap((exp: any) => [
          new Paragraph({
            spacing: { before: 100, after: 30 },
            children: [
              new TextRun({ text: exp.company || "Company", bold: true, size: 21, color: "1a1a1a" }),
              new TextRun({ text: exp.location ? ` (${exp.location})` : "", italics: true, size: 19, color: "555555" }),
              new TextRun({ text: `\t\t\t${exp.startDate || ""} – ${exp.endDate || ""}`, bold: true, size: 19 }),
            ],
          }),
          new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: exp.role || "Role", bold: true, italics: true, size: 19, color: accentColor })] }),
          ...(exp.companyDesc ? [new Paragraph({ spacing: { after: 70 }, children: [new TextRun({ text: exp.companyDesc, italics: true, size: 18, color: "777777" })] })] : []),
          ...(exp.responsibilities || []).map(
            (resp: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: resp, size: 19 })] })
          ),
        ]),
      ]
    : [];

  const internshipsBlock: Paragraph[] = internships.length
    ? [
        header("Internships"),
        ...internships.flatMap((intern: any) => [
          new Paragraph({
            spacing: { before: 100, after: 30 },
            children: [
              new TextRun({ text: intern.company || "Company", bold: true, size: 21 }),
              new TextRun({ text: intern.location ? ` (${intern.location})` : "", italics: true, size: 19, color: "555555" }),
              new TextRun({ text: `\t\t\t${intern.startDate || ""} – ${intern.endDate || ""}`, bold: true, size: 19 }),
            ],
          }),
          new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: intern.role || "Role", bold: true, italics: true, size: 19, color: accentColor })] }),
          ...(intern.companyDesc ? [new Paragraph({ spacing: { after: 70 }, children: [new TextRun({ text: intern.companyDesc, italics: true, size: 18, color: "777777" })] })] : []),
          ...(intern.responsibilities || []).map(
            (resp: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: resp, size: 19 })] })
          ),
        ]),
      ]
    : [];

  const projectsBlock: Paragraph[] = projects.length
    ? [
        header("Key Projects"),
        ...projects.map(
          (proj: any) =>
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: proj.title || "Project Title", bold: true, size: 20, color: primaryColor }),
                new TextRun({ text: proj.year ? ` (${proj.year}): ` : ": ", bold: true, size: 20 }),
                new TextRun({ text: proj.description || "", size: 20 }),
              ],
            })
        ),
      ]
    : [];

  const educationBlock: Paragraph[] = education.length
    ? [
        header("Education"),
        ...education.map(
          (edu: any) =>
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: edu.degree || "Degree", bold: true, size: 20, color: accentColor }),
                new TextRun({ text: " - ", size: 20 }),
                new TextRun({ text: edu.institution || "Institution", size: 20 }),
                new TextRun({ text: ` (${edu.year || ""})`, italics: true, size: 20, color: "555555" }),
                ...(edu.details ? [new TextRun({ text: `\n${edu.details}`, size: 18, color: "777777" })] : []),
              ],
            })
        ),
      ]
    : [];

  const certificationsBlock: Paragraph[] = certifications.length
    ? [
        header("Certifications"),
        ...certifications.map(
          (cert: any) =>
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: cert.name || "Certification", bold: true, size: 20, color: accentColor }),
                ...(cert.issuer ? [new TextRun({ text: ` - ${cert.issuer}`, size: 20 })] : []),
                ...(cert.date ? [new TextRun({ text: ` (${cert.date})`, italics: true, size: 20, color: "555555" })] : []),
                ...(cert.url ? [new TextRun({ text: `\n${cert.url}`, size: 18, color: "777777" })] : []),
              ],
            })
        ),
      ]
    : [];

  const achievementsBlock: Paragraph[] = achievements.length
    ? [
        header("Achievements"),
        ...achievements.map(
          (ach: any) =>
            new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({ text: ach.title || "Achievement", bold: true, size: 20, color: accentColor }),
                ...(ach.date ? [new TextRun({ text: ` (${ach.date})`, italics: true, size: 20, color: "555555" })] : []),
                ...(ach.description ? [new TextRun({ text: `\n${ach.description}`, size: 20 })] : []),
              ],
            })
        ),
      ]
    : [];

  const referencesBlock: Paragraph[] = references.length
    ? [
        header("References"),
        ...references.map(
          (ref: any) =>
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({ text: ref.name || "Reference Name", bold: true, size: 20 }),
                new TextRun({ text: `\n${ref.title || ""} | ${ref.company || ""}`, italics: true, size: 19 }),
                ...(ref.address ? [new TextRun({ text: `\nAddress: ${ref.address}`, size: 18 })] : []),
                new TextRun({ text: `\nContact: ${ref.contact || ""}`, size: 18, color: accentColor }),
              ],
            })
        ),
      ]
    : [];

  const declarationBlock: Paragraph[] = includeDeclaration && declaration
    ? [
        new Paragraph({
          spacing: { before: 400, after: 100 },
          border: { top: { color: "e0e0e0", space: 10, style: BorderStyle.SINGLE, size: 6 } },
          children: [
            new TextRun({ text: "DECLARATION\n", bold: true, size: 20, color: "777777" }),
            new TextRun({ text: declaration, italics: true, size: 18, color: "777777" }),
            ...(verifiedBadge
              ? [
                  new TextRun({
                    text: `\nCV Verified & Up-to-date ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`,
                    bold: true,
                    size: 18,
                    color: accentColor,
                  }),
                ]
              : []),
          ],
        }),
      ]
    : [];

  return {
    summaryBlock,
    experienceBlock,
    internshipsBlock,
    projectsBlock,
    educationBlock,
    certificationsBlock,
    achievementsBlock,
    referencesBlock,
    declarationBlock,
  };
}

// ---------------------------------------------------------------------------
// Layout 1: dark colored sidebar + white main column (theme1 / theme5 / default)
// ---------------------------------------------------------------------------

function buildSidebarLayout(cvData: any, primaryColor: string, accentColor: string, photoImageRun: ImageRun | null): (Paragraph | Table)[] {
  const { personalInfo = {}, personalDetails = {}, skills = [], languages = [], additionalInfo = [] } = cvData;
  const blocks = buildContentBlocks(cvData, primaryColor, accentColor);

  const sidebarChildren: Paragraph[] = [
    ...(photoImageRun ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [photoImageRun] })] : []),

    sidebarHeading("Contact Information", accentColor),
    sidebarLine(personalInfo.location || "Location", { muted: !personalInfo.location }),
    sidebarLine(personalInfo.phone || "Phone", { muted: !personalInfo.phone }),
    sidebarLine(personalInfo.email || "Email", { muted: !personalInfo.email }),
    ...(personalInfo.github ? [sidebarLine(personalInfo.github)] : []),
    ...(personalInfo.linkedin ? [sidebarLine(personalInfo.linkedin)] : []),

    sidebarHeading("Personal Details", accentColor),
    ...(personalDetails.dateOfBirth ? [sidebarLine(personalDetails.dateOfBirth, { label: "Date of Birth", accentColor: "FFFFFF" })] : []),
    ...(personalDetails.nationality ? [sidebarLine(personalDetails.nationality, { label: "Nationality", accentColor: "FFFFFF" })] : []),
    ...(personalDetails.maritalStatus ? [sidebarLine(personalDetails.maritalStatus, { label: "Marital Status", accentColor: "FFFFFF" })] : []),
    ...(personalDetails.residence ? [sidebarLine(personalDetails.residence, { label: "Residence", accentColor: "FFFFFF" })] : []),
    ...(personalDetails.kenyaStatus ? [sidebarLine(personalDetails.kenyaStatus, { label: "Kenya Status", accentColor: "FFFFFF" })] : []),
    ...(personalDetails.nairobiRes ? [sidebarLine(personalDetails.nairobiRes, { label: "Nairobi Res", accentColor: "FFFFFF" })] : []),
    ...(personalDetails.drivingExperience ? [sidebarLine(personalDetails.drivingExperience, { label: "Driving", accentColor: "FFFFFF" })] : []),

    sidebarHeading("Core Competencies", accentColor),
    ...(skills.length
      ? skills.flatMap((grp: any) => [
          new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: grp.category || "", bold: true, size: 17, color: "FFFFFF" })] }),
          new Paragraph({
            spacing: { after: 90 },
            children: [new TextRun({ text: Array.isArray(grp.items) ? grp.items.join(", ") : grp.items || "", size: 16, color: "E5E7EB" })],
          }),
        ])
      : [new Paragraph({ children: [new TextRun({ text: "No skills added yet.", italics: true, size: 16, color: "C7CCD1" })] })]),

    sidebarHeading("Languages", accentColor),
    ...(languages.length
      ? languages.map(
          (l: any) => new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: `${l.language || ""}${l.proficiency ? ` (${l.proficiency})` : ""}`, size: 17, color: "FFFFFF" })] })
        )
      : [new Paragraph({ children: [new TextRun({ text: "No languages added yet.", italics: true, size: 16, color: "C7CCD1" })] })]),

    ...(additionalInfo.length
      ? [
          sidebarHeading("Additional Info", accentColor),
          ...additionalInfo
            .filter((i: any) => i.label || i.value)
            .map((i: any) => sidebarLine(i.value || "", { label: i.label, accentColor: "FFFFFF" })),
        ]
      : []),
  ];

  const mainChildren: Paragraph[] = [
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 32, color: primaryColor, space: 8 } },
      spacing: { after: 240 },
      children: [new TextRun({ text: personalInfo.fullName || "Your Name", bold: true, size: 40, color: primaryColor })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 32, color: primaryColor, space: 0 } },
      children: [new TextRun({ text: (personalInfo.title || "Professional Title").toUpperCase(), bold: true, size: 24, color: accentColor })],
    }),
    ...blocks.summaryBlock,
    ...blocks.experienceBlock,
    ...blocks.internshipsBlock,
    ...blocks.projectsBlock,
    ...blocks.educationBlock,
    ...blocks.certificationsBlock,
    ...blocks.achievementsBlock,
    ...blocks.referencesBlock,
    ...blocks.declarationBlock,
  ];

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: primaryColor },
            margins: { top: 200, bottom: 200, left: 160, right: 160 },
            verticalAlign: VerticalAlign.TOP,
            children: sidebarChildren,
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            margins: { top: 200, bottom: 200, left: 260, right: 200 },
            verticalAlign: VerticalAlign.TOP,
            children: mainChildren,
          }),
        ],
      }),
    ],
  });

  return [table];
}

// ---------------------------------------------------------------------------
// Layout 2: colored full-width header band + single column (theme2 / theme3 /
// theme6 / any other/unrecognized theme) - a lighter-weight fallback that still
// carries the chosen colors and photo instead of a flat, unbranded document.
// ---------------------------------------------------------------------------

function buildBannerLayout(cvData: any, primaryColor: string, accentColor: string, photoImageRun: ImageRun | null): (Paragraph | Table)[] {
  const { personalInfo = {}, personalDetails = {}, skills = [], languages = [], additionalInfo = [] } = cvData;
  const blocks = buildContentBlocks(cvData, primaryColor, accentColor);

  const contactLine = [personalInfo.location, personalInfo.phone, personalInfo.email].filter(Boolean).join("   |   ");

  const bannerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
    rows: [
      new TableRow({
        children: [
          ...(photoImageRun
            ? [
                new TableCell({
                  width: { size: 18, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, color: "auto", fill: primaryColor },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 160, bottom: 160, left: 160, right: 100 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [photoImageRun] })],
                }),
              ]
            : []),
          new TableCell({
            width: { size: photoImageRun ? 82 : 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: "auto", fill: primaryColor },
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 220, bottom: 220, left: 260, right: 260 },
            children: [
              new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: personalInfo.fullName || "Your Name", bold: true, size: 40, color: "FFFFFF" })] }),
              new Paragraph({
                spacing: { after: contactLine ? 140 : 0 },
                children: [new TextRun({ text: (personalInfo.title || "Professional Title").toUpperCase(), bold: true, size: 22, color: accentColor })],
              }),
              ...(contactLine ? [new Paragraph({ children: [new TextRun({ text: contactLine, size: 17, color: "E5E7EB" })] })] : []),
              ...(personalInfo.linkedin || personalInfo.github
                ? [
                    new Paragraph({
                      spacing: { before: 40 },
                      children: [
                        new TextRun({ text: [personalInfo.linkedin, personalInfo.github].filter(Boolean).join("   |   "), size: 16, color: "E5E7EB" }),
                      ],
                    }),
                  ]
                : []),
            ],
          }),
        ],
      }),
    ],
  });

  const detailEntries = [
    ["Date of Birth", personalDetails.dateOfBirth],
    ["Nationality", personalDetails.nationality],
    ["Marital Status", personalDetails.maritalStatus],
    ["Residence", personalDetails.residence],
    ["Kenya Status", personalDetails.kenyaStatus],
    ["Nairobi Res", personalDetails.nairobiRes],
    ["Driving", personalDetails.drivingExperience],
  ].filter(([, val]) => !!val) as [string, string][];

  const body: Paragraph[] = [
    new Paragraph({ spacing: { before: 260 }, children: [] }),
    ...blocks.summaryBlock,

    sectionHeaderBox("Core Competencies", primaryColor, accentColor),
    ...(skills.length
      ? skills.flatMap((grp: any) => [
          new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: grp.category || "", bold: true, size: 19, color: accentColor })] }),
          new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: Array.isArray(grp.items) ? grp.items.join(", ") : grp.items || "", size: 19 })] }),
        ])
      : [new Paragraph({ children: [new TextRun({ text: "No skills added yet.", italics: true, size: 19, color: "999999" })] })]),

    ...blocks.experienceBlock,
    ...blocks.internshipsBlock,
    ...blocks.projectsBlock,
    ...blocks.educationBlock,
    ...blocks.certificationsBlock,
    ...blocks.achievementsBlock,

    ...(languages.length
      ? [
          sectionHeaderBox("Languages", primaryColor, accentColor),
          new Paragraph({
            spacing: { after: 100 },
            children: languages.flatMap((l: any, idx: number) => [
              new TextRun({ text: l.language || "", bold: true, size: 20 }),
              new TextRun({ text: l.proficiency ? ` (${l.proficiency})` : "", size: 20, color: "555555" }),
              new TextRun({ text: idx < languages.length - 1 ? "   |   " : "", size: 20 }),
            ]),
          }),
        ]
      : []),

    ...(detailEntries.length
      ? [
          sectionHeaderBox("Personal Details", primaryColor, accentColor),
          ...detailEntries.map(
            ([label, val]) =>
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: `${label}: `, bold: true, size: 20, color: accentColor }), new TextRun({ text: val, size: 20 })],
              })
          ),
        ]
      : []),

    ...blocks.referencesBlock,

    ...(additionalInfo.filter((i: any) => i.label || i.value).length
      ? [
          sectionHeaderBox("Additional Information", primaryColor, accentColor),
          ...additionalInfo
            .filter((i: any) => i.label || i.value)
            .map(
              (i: any) =>
                new Paragraph({
                  spacing: { after: 60 },
                  children: [new TextRun({ text: `${i.label || ""}: `, bold: true, size: 20, color: accentColor }), new TextRun({ text: i.value || "", size: 20 })],
                })
            ),
        ]
      : []),

    ...blocks.declarationBlock,
  ];

  return [bannerTable, ...body];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// CV themes fall into two structural families in the preview (see cv-designs.tsx):
// a dark colored sidebar (theme1, theme5) or a single flowing column (theme2,
// theme3, theme6, and any future/unrecognized theme). We replicate whichever
// family the user actually has selected instead of always falling back to a
// generic, unbranded layout.
const SIDEBAR_THEMES = new Set(["theme1", "theme5"]);

export async function exportToDocx(
  cvData: any,
  cvSettings?: { primaryColor?: string; accentColor?: string; showPhoto?: boolean },
  selectedLayout?: string
) {
  const primaryColor = toDocxColor(cvSettings?.primaryColor);
  const accentColor = toDocxColor(cvSettings?.accentColor, "3498db");

  const showPhoto = cvSettings?.showPhoto !== false;
  const photoImageRun = showPhoto ? await loadPhotoImageRun(cvData?.personalInfo?.photoUrl) : null;

  const isSidebar = SIDEBAR_THEMES.has(selectedLayout || "theme1");
  const children = isSidebar
    ? buildSidebarLayout(cvData, primaryColor, accentColor, photoImageRun)
    : buildBannerLayout(cvData, primaryColor, accentColor, photoImageRun);

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 500, bottom: 500, left: 500, right: 500 } } },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${(cvData?.personalInfo?.fullName || "CV").replace(/\s+/g, "_")}_CV.docx`;
  saveAs(blob, fileName);
}

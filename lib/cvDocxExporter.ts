import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

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

export async function exportToDocx(cvData: any, cvSettings?: { primaryColor?: string; accentColor?: string; showPhoto?: boolean }) {
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
    verifiedBadge = false,
  } = cvData;

  // Convert hex color to docx format (remove # prefix)
  const toDocxColor = (hex?: string): string => {
    if (!hex) return "2c3e50";
    return hex.replace("#", "");
  };

  const primaryColor = toDocxColor(cvSettings?.primaryColor);
  const accentColor = toDocxColor(cvSettings?.accentColor);

  const showPhoto = cvSettings?.showPhoto !== false;
  const photoImageRun = showPhoto ? await loadPhotoImageRun(personalInfo.photoUrl) : null;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // PROFILE PHOTO
          ...(photoImageRun
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 150 },
                  children: [photoImageRun],
                }),
              ]
            : []),

          // HEADER - Name & Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: personalInfo.fullName || "Your Name",
                bold: true,
                size: 36, // 18pt
                color: primaryColor,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: (personalInfo.title || "Professional Title").toUpperCase(),
                bold: true,
                size: 24, // 12pt
                color: accentColor,
              }),
            ],
          }),

          // CONTACT INFO LINE
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            border: {
              bottom: {
                color: primaryColor,
                space: 10,
                style: BorderStyle.SINGLE,
                size: 12,
              },
            },
            children: [
              new TextRun({
                text: `${personalInfo.location || ""} | ${personalInfo.phone || ""} | ${personalInfo.email || ""}`,
                size: 19, // 9.5pt
                color: "555555",
              }),
              personalInfo.linkedin
                ? new TextRun({
                    text: `\nLinkedIn: ${personalInfo.linkedin}`,
                    size: 18,
                    color: accentColor,
                  })
                : new TextRun({ text: "" }),
              personalInfo.github
                ? new TextRun({
                    text: ` | GitHub: ${personalInfo.github}`,
                    size: 18,
                    color: accentColor,
                  })
                : new TextRun({ text: "" }),
            ],
          }),

          // PROFESSIONAL SUMMARY
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: "PROFESSIONAL PROFILE",
                bold: true,
                size: 24,
                color: primaryColor,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            alignment: AlignmentType.BOTH,
            children: [
              new TextRun({
                text: summary || "Enter professional summary...",
                size: 22, // 11pt
              }),
            ],
          }),

          // CORE COMPETENCIES / SKILLS
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 },
            children: [
              new TextRun({
                text: "CORE COMPETENCIES",
                bold: true,
                size: 24,
                color: primaryColor,
              }),
            ],
          }),
          ...skills.map((skillGroup: any) => {
            return new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: `${skillGroup.category}: `,
                  bold: true,
                  size: 20,
                  color: accentColor,
                }),
                new TextRun({
                  text: Array.isArray(skillGroup.items)
                    ? skillGroup.items.join(", ")
                    : skillGroup.items || "",
                  size: 20,
                }),
              ],
            });
          }),

          // WORK EXPERIENCE
          experience.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "PROFESSIONAL EXPERIENCE",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...experience.flatMap((exp: any) => {
            const paragraphs = [
              new Paragraph({
                spacing: { before: 100, after: 40 },
                children: [
                  new TextRun({
                    text: exp.company || "Company",
                    bold: true,
                    size: 22,
                    color: "000000",
                  }),
                  new TextRun({
                    text: ` (${exp.location || ""})`,
                    italics: true,
                    size: 20,
                    color: "555555",
                  }),
                  new TextRun({
                    text: `\t\t\t\t${exp.startDate || ""} – ${exp.endDate || ""}`,
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: exp.role || "Role",
                    bold: true,
                    italics: true,
                    size: 20,
                    color: accentColor,
                  }),
                ],
              }),
            ];

            if (exp.companyDesc) {
              paragraphs.push(
                new Paragraph({
                  spacing: { after: 80 },
                  children: [
                    new TextRun({
                      text: exp.companyDesc,
                      italics: true,
                      size: 19,
                      color: "777777",
                    }),
                  ],
                })
              );
            }

            const bullets = (exp.responsibilities || []).map((resp: string) => {
              return new Paragraph({
                bullet: {
                  level: 0,
                },
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: resp,
                    size: 20,
                  }),
                ],
              });
            });

            return [...paragraphs, ...bullets];
          }),

          // INTERNSHIPS
          internships.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "INTERNSHIPS",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...internships.flatMap((intern: any) => {
            const paragraphs = [
              new Paragraph({
                spacing: { before: 100, after: 40 },
                children: [
                  new TextRun({
                    text: intern.company || "Company",
                    bold: true,
                    size: 22,
                  }),
                  new TextRun({
                    text: ` (${intern.location || ""})`,
                    italics: true,
                    size: 20,
                    color: "555555",
                  }),
                  new TextRun({
                    text: `\t\t\t\t${intern.startDate || ""} – ${intern.endDate || ""}`,
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: intern.role || "Role",
                    bold: true,
                    italics: true,
                    size: 20,
                    color: accentColor,
                  }),
                ],
              }),
            ];

            if (intern.companyDesc) {
              paragraphs.push(
                new Paragraph({
                  spacing: { after: 80 },
                  children: [
                    new TextRun({
                      text: intern.companyDesc,
                      italics: true,
                      size: 19,
                      color: "777777",
                    }),
                  ],
                })
              );
            }

            const bullets = (intern.responsibilities || []).map((resp: string) => {
              return new Paragraph({
                bullet: {
                  level: 0,
                },
                spacing: { after: 40 },
                children: [
                  new TextRun({
                    text: resp,
                    size: 20,
                  }),
                ],
              });
            });

            return [...paragraphs, ...bullets];
          }),

          // PROJECTS
          projects.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "KEY PROJECTS",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...projects.map((proj: any) => {
            return new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: proj.title || "Project Title",
                  bold: true,
                  size: 20,
                  color: primaryColor,
                }),
                proj.year ? new TextRun({ text: ` (${proj.year}): `, bold: true, size: 20 }) : new TextRun({ text: ": ", size: 20 }),
                new TextRun({
                  text: proj.description || "",
                  size: 20,
                }),
              ],
            });
          }),

          // EDUCATION
          education.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "EDUCATION & CERTIFICATIONS",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...education.map((edu: any) => {
            return new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: edu.degree || "Degree",
                  bold: true,
                  size: 20,
                  color: accentColor,
                }),
                new TextRun({ text: " - ", size: 20 }),
                new TextRun({ text: edu.institution || "Institution", size: 20 }),
                new TextRun({ text: ` (${edu.year || ""})`, italics: true, size: 20, color: "555555" }),
                edu.details ? new TextRun({ text: `\n${edu.details}`, size: 18, color: "777777" }) : new TextRun({ text: "" }),
              ],
            });
          }),

          // CERTIFICATIONS
          certifications.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "CERTIFICATIONS",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...certifications.map((cert: any) => {
            return new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: cert.name || "Certification",
                  bold: true,
                  size: 20,
                  color: accentColor,
                }),
                cert.issuer ? new TextRun({ text: ` - ${cert.issuer}`, size: 20 }) : new TextRun({ text: "" }),
                cert.date ? new TextRun({ text: ` (${cert.date})`, italics: true, size: 20, color: "555555" }) : new TextRun({ text: "" }),
                cert.url ? new TextRun({ text: `\n${cert.url}`, size: 18, color: "777777" }) : new TextRun({ text: "" }),
              ],
            });
          }),

          // LANGUAGES
          languages.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "LANGUAGES",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          languages.length > 0
            ? new Paragraph({
                spacing: { after: 100 },
                children: languages.flatMap((lang: any, idx: number) => [
                  new TextRun({
                    text: `${lang.language || ""}`,
                    bold: true,
                    size: 20,
                  }),
                  new TextRun({
                    text: lang.proficiency ? ` (${lang.proficiency})` : "",
                    size: 20,
                    color: "555555",
                  }),
                  new TextRun({
                    text: idx < languages.length - 1 ? "   |   " : "",
                    size: 20,
                  }),
                ]),
              })
            : new Paragraph({ text: "" }),

          // ACHIEVEMENTS
          achievements.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "ACHIEVEMENTS",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...achievements.map((ach: any) => {
            return new Paragraph({
              spacing: { after: 80 },
              children: [
                new TextRun({
                  text: ach.title || "Achievement",
                  bold: true,
                  size: 20,
                  color: accentColor,
                }),
                ach.date ? new TextRun({ text: ` (${ach.date})`, italics: true, size: 20, color: "555555" }) : new TextRun({ text: "" }),
                ach.description ? new TextRun({ text: `\n${ach.description}`, size: 20 }) : new TextRun({ text: "" }),
              ],
            });
          }),

          // PERSONAL DETAILS (if relevant)
          Object.keys(personalDetails).length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "PERSONAL DETAILS",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...Object.entries(personalDetails)
            .filter(([_, val]) => !!val)
            .map(([key, val]) => {
              const label = key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase());
              return new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: `${label}: `,
                    bold: true,
                    size: 20,
                    color: accentColor,
                  }),
                  new TextRun({
                    text: String(val),
                    size: 20,
                  }),
                ],
              });
            }),

          // REFERENCES
          references.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "REFERENCES",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...references.map((ref: any) => {
            return new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({
                  text: ref.name || "Reference Name",
                  bold: true,
                  size: 20,
                }),
                new TextRun({
                  text: `\n${ref.title || ""} | ${ref.company || ""}`,
                  italics: true,
                  size: 19,
                }),
                ref.address ? new TextRun({ text: `\nAddress: ${ref.address}`, size: 18 }) : new TextRun({ text: "" }),
                new TextRun({ text: `\nContact: ${ref.contact || ""}`, size: 18, color: accentColor }),
              ],
            });
          }),

          // ADDITIONAL INFORMATION
          additionalInfo.length > 0
            ? new Paragraph({
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 300, after: 150 },
                children: [
                  new TextRun({
                    text: "ADDITIONAL INFORMATION",
                    bold: true,
                    size: 24,
                    color: primaryColor,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),

          ...additionalInfo
            .filter((info: any) => info.label || info.value)
            .map((info: any) => {
              return new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: `${info.label || ""}: `,
                    bold: true,
                    size: 20,
                    color: accentColor,
                  }),
                  new TextRun({
                    text: info.value || "",
                    size: 20,
                  }),
                ],
              });
            }),

          // DECLARATION
          includeDeclaration && declaration
            ? new Paragraph({
                spacing: { before: 400, after: 100 },
                border: {
                  top: {
                    color: "e0e0e0",
                    space: 10,
                    style: BorderStyle.SINGLE,
                    size: 6,
                  },
                },
                children: [
                  new TextRun({
                    text: "DECLARATION\n",
                    bold: true,
                    size: 20,
                    color: "777777",
                  }),
                  new TextRun({
                    text: declaration,
                    italics: true,
                    size: 18,
                    color: "777777",
                  }),
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
              })
            : new Paragraph({ text: "" }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `${(personalInfo.fullName || "CV").replace(/\s+/g, "_")}_CV.docx`;
  saveAs(blob, fileName);
}

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

export async function exportToDocx(cvData: any, cvSettings?: { primaryColor?: string; accentColor?: string }) {
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

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
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

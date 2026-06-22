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

export async function exportToDocx(cvData: any) {
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
  } = cvData;

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
                color: "2c3e50",
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
                color: "3498db",
              }),
            ],
          }),

          // CONTACT INFO LINE
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            border: {
              bottom: {
                color: "2c3e50",
                space: 10,
                value: BorderStyle.SINGLE,
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
                    color: "3498db",
                  })
                : new TextRun({ text: "" }),
              personalInfo.github
                ? new TextRun({
                    text: ` | GitHub: ${personalInfo.github}`,
                    size: 18,
                    color: "3498db",
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
                color: "2c3e50",
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
                color: "2c3e50",
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
                  color: "3498db",
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
                    color: "2c3e50",
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
                    italic: true,
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
                    italic: true,
                    size: 20,
                    color: "3498db",
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
                      italic: true,
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
                    color: "2c3e50",
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
                    italic: true,
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
                    italic: true,
                    size: 20,
                    color: "3498db",
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
                      italic: true,
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
                    color: "2c3e50",
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
                  color: "2c3e50",
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
                    color: "2c3e50",
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
                  color: "3498db",
                }),
                new TextRun({ text: " - ", size: 20 }),
                new TextRun({ text: edu.institution || "Institution", size: 20 }),
                new TextRun({ text: ` (${edu.year || ""})`, italic: true, size: 20, color: "555555" }),
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
                    color: "2c3e50",
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
                    color: "3498db",
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
                    color: "2c3e50",
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
                  italic: true,
                  size: 19,
                }),
                ref.address ? new TextRun({ text: `\nAddress: ${ref.address}`, size: 18 }) : new TextRun({ text: "" }),
                new TextRun({ text: `\nContact: ${ref.contact || ""}`, size: 18, color: "3498db" }),
              ],
            });
          }),

          // DECLARATION
          declaration
            ? new Paragraph({
                spacing: { before: 400, after: 100 },
                border: {
                  top: {
                    color: "e0e0e0",
                    space: 10,
                    value: BorderStyle.SINGLE,
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
                    italic: true,
                    size: 18,
                    color: "777777",
                  }),
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

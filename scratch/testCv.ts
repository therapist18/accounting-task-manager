import fs from 'fs';
import { buildCvDocument } from '../lib/cvThemeEngine';

async function run() {
  const data = { 
    personalInfo: { fullName: "TEST" },
    skills: [{ category: "Software", items: ["Python"] }],
    languages: [{ language: "English" }]
  };
  const res = await buildCvDocument(data, {}, "cv_corporate", { wordSafe: true });
  fs.writeFileSync("out.html", res.bodyHtml);
  fs.writeFileSync("out.css", res.css);
}
run();

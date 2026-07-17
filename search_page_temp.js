const fs = require('fs');
const path = require('path');

const filePath = "E:/GitHub/Payroll/app/(dashboard)/employees/page.tsx";
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log("Searching for salaryAssignments query references...");
lines.forEach((line, index) => {
  if (line.includes('salaryAssignmentsQuery') || line.includes('salaryAssignments') || line.includes('fetchSalaryAssignments')) {
    if (index > 1400) {
      console.log(`${index + 1}: ${line.trim()}`);
    }
  }
});

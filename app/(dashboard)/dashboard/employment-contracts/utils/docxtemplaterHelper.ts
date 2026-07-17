import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

// We format dates into dd/MM/yyyy or similar
function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export async function mergeContractDocx(
  templateArrayBuffer: ArrayBuffer,
  contractData: any
): Promise<Blob> {
  const zip = new PizZip(templateArrayBuffer);
  
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  const emp = contractData.employee || {};

  // Default parameters matching what the placeholders might be
  const data = {
    employee_name: emp.fullName || "",
    employee_number: emp.employeeNumber || "",
    kra_pin: emp.kraPin || "",
    national_id: emp.nationalId || "",
    nssf_number: emp.nssfNumber || "",
    nhif_number: emp.nhifNumber || "",
    shif_number: emp.shifNumber || "",
    position: emp.jobTitle || "",
    department: emp.department || "",
    basic_salary: emp.basicSalary?.toLocaleString() || "0",
    gross_salary: emp.grossSalary?.toLocaleString() || "0",
    bank_name: emp.bankName || "",
    bank_branch: emp.bankBranch || "",
    bank_account: emp.bankAccount || "",
    contact_email: emp.contactEmail || "",
    contact_phone: emp.contactPhone || "",
    
    contract_start: formatDate(contractData.startDate),
    contract_end: formatDate(contractData.endDate),
    probation_period: contractData.probationPeriod || "",
    notice_period: contractData.noticePeriod || "",
    leave_days: contractData.leaveDays || "",
    working_hours: contractData.workingHours || "",
    today_date: formatDate(new Date().toISOString()),
  };

  doc.render(data);

  const mergedBlob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  return mergedBlob;
}

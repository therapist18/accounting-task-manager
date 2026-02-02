export const COMPUTED_FUNCTIONS = [
    { value: "none", label: "None" },
    { value: "getLatestDocument", label: "Get Latest Document" },
    { value: "getAllDocuments", label: "Get All Documents" },
    { value: "getLatestDocumentNumber", label: "Get Document Number (e.g. Passport No)" },
    { value: "getLatestDocumentExpiryDate", label: "Get Expiry Date" },
    { value: "getLatestDocumentIssueDate", label: "Get Issue Date" },
    { value: "determineImmigrationStatus", label: "Determine Immigration Status" },
    { value: "getLatestWorkPermit", label: "Get Latest Work Permit No" },
    { value: "getEducationalDetails", label: "Extract Educational History (Array)" },
    { value: "calculateArithmetic", label: "Arithmetic Calculation (Plus, Minus, etc.)" },
    { value: "calculateDateDifference", label: "Date Difference (Days, Months, Years)" },
    { value: "extractCurrentJobTitle", label: "Extract Current Job Title" },
    { value: "extractCurrentJobDescription", label: "Extract Current Job Description" }
];

export const ARITHMETIC_OPERATIONS = [
    { value: "add", label: "Addition (+)" },
    { value: "subtract", label: "Subtraction (-)" },
    { value: "multiply", label: "Multiplication (×)" },
    { value: "divide", label: "Division (÷)" }
];

export const DATE_DIFF_UNITS = [
    { value: "days", label: "Days" },
    { value: "months", label: "Months" },
    { value: "years", label: "Years" }
];

export const LINKING_VARIABLES = [
    { value: "id", label: "ID" },
    { value: "individual_id", label: "Individual ID" },
    { value: "kyc_document_id", label: "KYC Document ID" },
    { value: "document_id", label: "Document ID" },
    { value: "director_id", label: "Director ID" },
    { value: "company_id", label: "Company ID" }
];

export const SOURCE_TYPES = [
    { value: "individual", label: "Individual" },
    { value: "document", label: "Document" },
    { value: "company", label: "Company" },
    { value: "field", label: "Field" }
];

export const EXECUTION_MODES = [
    { value: "all", label: "Fetch All Previous" },
    { value: "latest", label: "Latest Document Only" }
];

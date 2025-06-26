import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co"
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key"

export const supabase = createClient(supabaseUrl, supabaseKey)

// Mock data for demonstration
export const mockSubdepartments = [
  {
    id: "kep",
    name: "KEP",
    classes: [
      {
        id: "work-permit",
        name: "Work Permit",
        subclasses: [
          { id: "skilled", name: "Skilled Worker" },
          { id: "temporary", name: "Temporary Worker" },
        ],
      },
      { id: "residence", name: "Residence Permit", subclasses: [] },
    ],
  },
  {
    id: "passports",
    name: "Passports",
    classes: [
      { id: "new", name: "New Passport", subclasses: [] },
      { id: "renewal", name: "Passport Renewal", subclasses: [] },
    ],
  },
  {
    id: "permits",
    name: "Permits",
    classes: [
      { id: "business", name: "Business Permit", subclasses: [] },
      { id: "student", name: "Student Permit", subclasses: [] },
    ],
  },
]

export const mockOfficers = [
  { id: "1", name: "John Smith", role: "officer" },
  { id: "2", name: "Sarah Johnson", role: "officer" },
  { id: "3", name: "Mike Davis", role: "task_manager" },
  { id: "4", name: "Lisa Wilson", role: "task_manager" },
  { id: "5", name: "Tom Brown", role: "task_assistant" },
  { id: "6", name: "Emma Taylor", role: "task_assistant" },
]

export const mockIndividuals = [
  { id: "1", fullName: "Alice Cooper", nationality: "US", dateOfBirth: "1990-05-15" },
  { id: "2", fullName: "Bob Johnson", nationality: "UK", dateOfBirth: "1985-08-22" },
  { id: "3", fullName: "Carol Smith", nationality: "CA", dateOfBirth: "1992-12-10" },
  { id: "4", fullName: "David Wilson", nationality: "AU", dateOfBirth: "1988-03-07" },
]

export const mockRequirements = {
  "work-permit": [
    {
      id: "1",
      name: "Passport",
      required: true,
      description: "Valid passport copy",
      quantity: 1,
      existingDocuments: [
        {
          id: "doc_1",
          fileName: "passport_2023.pdf",
          issueDate: "2023-01-15",
          expiryDate: "2033-01-15",
          uploadedAt: "2024-01-10",
        },
        {
          id: "doc_2",
          fileName: "passport_2019.pdf",
          issueDate: "2019-03-20",
          expiryDate: "2029-03-20",
          uploadedAt: "2023-05-15",
        },
      ],
    },
    {
      id: "2",
      name: "Academic Certificates",
      required: true,
      description: "Educational qualifications",
      quantity: 4,
      existingDocuments: [
        {
          id: "doc_3",
          fileName: "bachelor_degree.pdf",
          issueDate: "2020-06-15",
          uploadedAt: "2024-01-05",
        },
        {
          id: "doc_4",
          fileName: "high_school_diploma.pdf",
          issueDate: "2016-05-20",
          uploadedAt: "2024-01-05",
        },
      ],
    },
    {
      id: "3",
      name: "Employment Letter",
      required: true,
      description: "Job offer letter",
      quantity: 1,
      existingDocuments: [],
    },
    {
      id: "4",
      name: "Medical Certificate",
      required: false,
      description: "Health clearance",
      quantity: 1,
      existingDocuments: [],
    },
  ],
  residence: [
    {
      id: "1",
      name: "Passport",
      required: true,
      description: "Valid passport copy",
      quantity: 1,
      existingDocuments: [],
    },
    {
      id: "2",
      name: "Proof of Income",
      required: true,
      description: "Financial statements",
      quantity: 3,
      existingDocuments: [
        {
          id: "doc_5",
          fileName: "salary_statement_2024.pdf",
          issueDate: "2024-01-01",
          uploadedAt: "2024-01-08",
        },
      ],
    },
    {
      id: "3",
      name: "Housing Contract",
      required: true,
      description: "Accommodation proof",
      quantity: 1,
      existingDocuments: [],
    },
  ],
}

export const mockWebDataFields = [
  { field: "full_name", label: "Full Name", value: "", source: "registry_individuals", editable: true },
  { field: "date_of_birth", label: "Date of Birth", value: "", source: "registry_individuals", editable: true },
  { field: "nationality", label: "Nationality", value: "", source: "passport", editable: true },
  { field: "passport_number", label: "Passport Number", value: "", source: "passport", editable: true },
  { field: "email", label: "Email Address", value: "", source: "manual", editable: true },
  { field: "phone", label: "Phone Number", value: "", source: "manual", editable: true },
]

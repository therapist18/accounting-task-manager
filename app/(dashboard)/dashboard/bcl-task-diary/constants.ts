// @ts-nocheck
import type { BDepartment } from "./types"

export const BCL_DEPARTMENTS: BDepartment[] = [
  {
    id: "immigration",
    name: "Immigration",
    color: "blue",
    bgColor: "bg-blue-100 text-blue-700",
    subdepartments: [
      {
        id: "work-permits",
        name: "Work Permits & Passes",
        departmentId: "immigration",
        classes: [
          { id: "class-g", name: "Class G Permits", subdepartmentId: "work-permits" },
          { id: "class-m", name: "Class M Permits", subdepartmentId: "work-permits" },
          { id: "dependent-pass", name: "Dependent Pass", subdepartmentId: "work-permits" },
        ],
      },
      {
        id: "visas",
        name: "Visas & Entry",
        departmentId: "immigration",
        classes: [
          { id: "business-visa", name: "Business Visa", subdepartmentId: "visas" },
          { id: "transit-visa", name: "Transit Visa", subdepartmentId: "visas" },
        ],
      },
      {
        id: "citizenship",
        name: "Citizenship & Residence",
        departmentId: "immigration",
        classes: [
          { id: "permanent-residence", name: "Permanent Residence", subdepartmentId: "citizenship" },
          { id: "naturalization", name: "Naturalization", subdepartmentId: "citizenship" },
        ],
      },
    ],
  },
  {
    id: "payroll",
    name: "Payroll",
    color: "green",
    bgColor: "bg-green-100 text-green-700",
    subdepartments: [
      {
        id: "monthly-payroll",
        name: "Monthly Payroll",
        departmentId: "payroll",
        classes: [
          { id: "payslip-generation", name: "Payslip Generation", subdepartmentId: "monthly-payroll" },
          { id: "payslip-sending", name: "Payslip Distribution", subdepartmentId: "monthly-payroll" },
          { id: "payroll-reconciliation", name: "Payroll Reconciliation", subdepartmentId: "monthly-payroll" },
        ],
      },
      {
        id: "statutory-deductions",
        name: "Statutory Deductions",
        departmentId: "payroll",
        classes: [
          { id: "nhif", name: "NHIF Processing", subdepartmentId: "statutory-deductions" },
          { id: "nssf", name: "NSSF Processing", subdepartmentId: "statutory-deductions" },
          { id: "paye", name: "PAYE Returns", subdepartmentId: "statutory-deductions" },
        ],
      },
    ],
  },
  {
    id: "banking",
    name: "Banking",
    color: "purple",
    bgColor: "bg-purple-100 text-purple-700",
    subdepartments: [
      {
        id: "daily-ops",
        name: "Daily Operations",
        departmentId: "banking",
        classes: [
          { id: "statement-downloads", name: "Statement Downloads", subdepartmentId: "daily-ops" },
          { id: "transaction-reconciliation", name: "Transaction Reconciliation", subdepartmentId: "daily-ops" },
        ],
      },
      {
        id: "bank-statements",
        name: "Bank Statements",
        departmentId: "banking",
        classes: [
          { id: "monthly-statements", name: "Monthly Statements Request", subdepartmentId: "bank-statements" },
          { id: "audit-statements", name: "Audit Statements", subdepartmentId: "bank-statements" },
        ],
      },
    ],
  },
  {
    id: "kra",
    name: "KRA",
    color: "orange",
    bgColor: "bg-orange-100 text-orange-700",
    subdepartments: [
      {
        id: "compliance",
        name: "Tax Compliance",
        departmentId: "kra",
        classes: [
          { id: "income-tax", name: "Income Tax Returns", subdepartmentId: "compliance" },
          { id: "vat-returns", name: "VAT Returns", subdepartmentId: "compliance" },
          { id: "withholding-tax", name: "Withholding Tax", subdepartmentId: "compliance" },
        ],
      },
      {
        id: "registrations",
        name: "KRA Registrations",
        departmentId: "kra",
        classes: [
          { id: "pin-registration", name: "PIN Registration", subdepartmentId: "registrations" },
          { id: "business-registration", name: "Business Registration", subdepartmentId: "registrations" },
        ],
      },
    ],
  },
  {
    id: "admin",
    name: "Administration",
    color: "slate",
    bgColor: "bg-slate-100 text-slate-700",
    subdepartments: [
      {
        id: "general-admin",
        name: "General Administration",
        departmentId: "admin",
        classes: [
          { id: "correspondence", name: "Correspondence", subdepartmentId: "general-admin" },
          { id: "filing", name: "Filing & Records", subdepartmentId: "general-admin" },
        ],
      },
      {
        id: "procurement",
        name: "Procurement",
        departmentId: "admin",
        classes: [
          { id: "vendor-management", name: "Vendor Management", subdepartmentId: "procurement" },
          { id: "office-supplies", name: "Office Supplies", subdepartmentId: "procurement" },
        ],
      },
    ],
  },
  {
    id: "hr",
    name: "Human Resources",
    color: "pink",
    bgColor: "bg-pink-100 text-pink-700",
    subdepartments: [
      {
        id: "recruitment",
        name: "Recruitment",
        departmentId: "hr",
        classes: [
          { id: "job-postings", name: "Job Postings", subdepartmentId: "recruitment" },
          { id: "onboarding", name: "Onboarding", subdepartmentId: "recruitment" },
        ],
      },
      {
        id: "employee-welfare",
        name: "Employee Welfare",
        departmentId: "hr",
        classes: [
          { id: "leave-management", name: "Leave Management", subdepartmentId: "employee-welfare" },
          { id: "performance-review", name: "Performance Reviews", subdepartmentId: "employee-welfare" },
        ],
      },
    ],
  },
]

export const TASK_STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
] as const

export const TASK_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const

export const TASK_TYPE_OPTIONS = [
  { value: "personal", label: "Personal" },
  { value: "department", label: "Department" },
  { value: "system", label: "System" },
] as const

export const RECURRENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const

export const STATUS_STYLES: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-500 border-red-200",
}

export const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-50 text-slate-500 border-slate-200",
  medium: "bg-yellow-50 text-yellow-700 border-yellow-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  urgent: "bg-red-50 text-red-700 border-red-200",
}

export const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  urgent: "bg-red-600",
}

export const DEPT_COLOR_MAP: Record<string, string> = {
  immigration: "bg-blue-100 text-blue-700 border-blue-200",
  payroll: "bg-green-100 text-green-700 border-green-200",
  banking: "bg-purple-100 text-purple-700 border-purple-200",
  kra: "bg-orange-100 text-orange-700 border-orange-200",
  admin: "bg-slate-100 text-slate-700 border-slate-200",
  hr: "bg-pink-100 text-pink-700 border-pink-200",
}

export const DEPT_HEADER_COLOR: Record<string, string> = {
  immigration: "border-l-blue-500 bg-blue-50",
  payroll: "border-l-green-500 bg-green-50",
  banking: "border-l-purple-500 bg-purple-50",
  kra: "border-l-orange-500 bg-orange-50",
  admin: "border-l-slate-400 bg-slate-50",
  hr: "border-l-pink-500 bg-pink-50",
}

export const REMINDER_PRESETS = [
  { label: "15 min before", value: 15 },
  { label: "30 min before", value: 30 },
  { label: "1 hour before", value: 60 },
  { label: "2 hours before", value: 120 },
  { label: "1 day before", value: 1440 },
  { label: "2 days before", value: 2880 },
]

export const NOTIFICATION_CHANNEL_OPTIONS = [
  { value: "in_app", label: "In-App" },
  { value: "push", label: "Push Notification" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
] as const

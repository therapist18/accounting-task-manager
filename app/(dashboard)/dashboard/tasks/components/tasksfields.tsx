import { Button } from "@/components/ui/button"
import { Upload, X } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TaskColumn {
  key: string
  header: string
  render?: (value: any, task: any) => React.ReactNode
}

interface DocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (url: string) => void
}

interface DocumentActionCellProps {
  task: any
  onDocumentUpload: (url: string) => void
}

const DocumentActionCell = ({ task, onDocumentUpload }: DocumentActionCellProps) => {
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  
  const handleUpload = (url: string) => {
    onDocumentUpload(url)
    setDocDialogOpen(false)
  }

  return (
    <div className="flex items-center">
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => setDocDialogOpen(true)}
      >
        <X className="h-4 w-4 text-red-500" />
      </Button>
      <DocumentDialog 
        open={docDialogOpen} 
        onOpenChange={setDocDialogOpen} 
        onUpload={handleUpload} 
      />
    </div>
  )
}

const DocumentDialog = ({ open, onOpenChange, onUpload }: DocumentDialogProps) => {
  const [documentUrl, setDocumentUrl] = useState("")
  
  const handleSubmit = () => {
    onUpload(documentUrl)
    setDocumentUrl("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Enter the document URL or upload a file.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="document-url" className="text-right">
              Document URL
            </Label>
            <Input
              id="document-url"
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              className="col-span-3"
              placeholder="Enter document URL"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleSubmit}>
            <Upload className="mr-2 h-4 w-4" /> Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const taskColumns: TaskColumn[] = [
  {
    key: "website",
    header: "Website",
  },
  {
    key: "job_description",
    header: "Job",
  },
  {
    key: "job_head",
    header: "Job Head",
  },
  {
    key: "class",
    header: "Class",
  },
  {
    key: "submitted_documents",
    header: "All Submitted Documents",
    render: (_, task) => (
      <DocumentActionCell 
        task={task} 
        onDocumentUpload={(url) => {
          console.log("Uploading document for task:", task.id, "URL:", url)
        }} 
      />
    ),
  },
  // Separator column
  {
    key: "separator1",
    header: "|",
    render: () => <div className="w-px bg-border mx-2 h-6" />,
  },
  {
    key: "applicant_name",
    header: "Applicant Name",
  },
  {
    key: "company_name",
    header: "Company Name",
  },
  {
    key: "dependent_name",
    header: "Dependent Name",
  },
  {
    key: "renewal_status",
    header: "New/Renewal",
  },
  // Separator column
  {
    key: "separator2",
    header: "|",
    render: () => <div className="w-px bg-border mx-2 h-6" />,
  },
  {
    key: "applied_date",
    header: "Applied Date",
    render: (value) => value || "-",
  },
  {
    key: "processing_paid_date",
    header: "Processing Paid Date",
    render: (value) => value || "-",
  },
  {
    key: "paid_ksh",
    header: "Paid KSH",
    render: (value) => value ? `KSH ${value}` : "-",
  },
  {
    key: "processing_upload_date",
    header: "Processing Upload Date",
    render: (value) => value || "-",
  },
  {
    key: "received_date",
    header: "Received Date",
    render: (value) => value || "-",
  },
  {
    key: "approved_date",
    header: "Approved Date",
    render: (value) => value || "-",
  },
  // Separator column
  {
    key: "separator3",
    header: "|",
    render: () => <div className="w-px bg-border mx-2 h-6" />,
  },
  {
    key: "kcb_paid_date",
    header: "KCB Paid Date",
    render: (value) => value || "-",
  },
  {
    key: "issuance_upload_date",
    header: "Issuance Upload Date",
    render: (value) => value || "-",
  },
  {
    key: "write_up_date",
    header: "Write Up Date",
    render: (value) => value || "-",
  },
  // Separator column
  {
    key: "separator4",
    header: "|",
    render: () => <div className="w-px bg-border mx-2 h-6" />,
  },
  {
    key: "account_used",
    header: "Account Used",
  },
  {
    key: "applied_by",
    header: "Applied by Who",
  },
  {
    key: "batch",
    header: "Batch",
  },
]

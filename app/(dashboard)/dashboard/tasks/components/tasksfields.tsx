import { Button } from "@/components/ui/button"
import { Upload, X, FileText, FileCheck, FileX, FileWarning } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

interface TaskColumn {
  key: string
  header: string
  render?: (value: any, task: any) => React.ReactNode
}

interface Requirement {
  name: string
  description?: string | null
  is_required: boolean
  submitted?: boolean
}

interface DocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpload: (url: string) => void
  requirements: Requirement[]
  task: any
}

interface DocumentActionCellProps {
  task: any
  onDocumentUpload: (url: string) => void
}

const DocumentActionCell = ({ task, onDocumentUpload }: DocumentActionCellProps) => {
  const [docDialogOpen, setDocDialogOpen] = useState(false)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  
  const handleUpload = (url: string) => {
    onDocumentUpload(url)
    setDocDialogOpen(false)
  }

  const handleClick = () => {
    // Get requirements from the subdepartment's classes
    if (task.subdepartment?.classes && task.class_name) {
      const selectedClass = Array.isArray(task.subdepartment.classes) 
        ? task.subdepartment.classes.find((c: any) => c.name === task.class_name)
        : null
      
      if (selectedClass?.requirements) {
        const reqs = Array.isArray(selectedClass.requirements) 
          ? selectedClass.requirements.map((req: any) => ({
              ...req,
              submitted: false // This would come from actual submission data
            }))
          : []
        setRequirements(reqs)
      } else {
        setRequirements([])
      }
    } else {
      setRequirements([])
    }
    setDocDialogOpen(true)
  }

  const hasRequirements = requirements.length > 0
  const requiredDocs = requirements.filter(r => r.is_required)
  const hasMissingRequired = requiredDocs.some(r => !r.submitted)

  return (
    <div className="flex items-center">
      <div className="relative">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleClick}
          className={cn(
            "relative",
            hasMissingRequired ? "text-yellow-500 hover:text-yellow-600" : 
            hasRequirements ? "text-green-500 hover:text-green-600" : 
            "text-red-500 hover:text-red-600"
          )}
        >
          {hasMissingRequired ? (
            <FileWarning className="h-4 w-4" />
          ) : hasRequirements ? (
            <FileCheck className="h-4 w-4" />
          ) : (
            <FileX className="h-4 w-4" />
          )}
        </Button>
        
        {hasMissingRequired && (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-yellow-500"></span>
        )}
      </div>
      
      <DocumentDialog 
        open={docDialogOpen} 
        onOpenChange={setDocDialogOpen} 
        onUpload={handleUpload}
        requirements={requirements}
        task={task}
      />
    </div>
  )
}

const DocumentDialog = ({ open, onOpenChange, onUpload, requirements, task }: DocumentDialogProps) => {
  const [documentUrl, setDocumentUrl] = useState("")
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set())
  
  const handleSubmit = () => {
    if (documentUrl.trim()) {
      onUpload(documentUrl)
      setDocumentUrl("")
      setSelectedRequirements(new Set())
    }
  }

  const toggleRequirement = (reqName: string) => {
    const newSet = new Set(selectedRequirements)
    if (newSet.has(reqName)) {
      newSet.delete(reqName)
    } else {
      newSet.add(reqName)
    }
    setSelectedRequirements(newSet)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Document Requirements - {task.class_name || 'General'}</DialogTitle>
          <DialogDescription>
            Review the document requirements and upload files for this task.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {requirements.length > 0 ? (
            <div className="space-y-3">
              <h4 className="font-medium">Required Documents:</h4>
              {requirements.map((req, index) => (
                <div key={index} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id={`req-${index}`}
                    checked={req.submitted || selectedRequirements.has(req.name)}
                    onCheckedChange={() => toggleRequirement(req.name)}
                    disabled={req.submitted}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor={`req-${index}`} className="font-medium">
                        {req.name}
                      </Label>
                      <Badge variant={req.is_required ? "destructive" : "secondary"}>
                        {req.is_required ? "Required" : "Optional"}
                      </Badge>
                      {req.submitted && (
                        <Badge variant="default">Submitted</Badge>
                      )}
                    </div>
                    {req.description && (
                      <p className="text-sm text-muted-foreground">{req.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              No specific document requirements found for this class.
            </div>
          )}

          <div className="space-y-3 pt-4 border-t">
            <Label htmlFor="document-url">Document URL</Label>
            <Input
              id="document-url"
              value={documentUrl}
              onChange={(e) => setDocumentUrl(e.target.value)}
              placeholder="Enter document URL or upload link"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            type="button" 
            onClick={handleSubmit}
            disabled={!documentUrl.trim()}
          >
            <Upload className="mr-2 h-4 w-4" /> 
            Upload Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export const taskColumns: TaskColumn[] = [
  {
    key: "index",
    header: "#",
    render: (_, index) => (
      <div className="font-medium text-muted-foreground">
        {(index || 0) + 1}
      </div>
    ),
  },
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
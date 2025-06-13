import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Subdepartment } from "@/lib/types"

export function TaskStages({ subdepartment }: { subdepartment: Subdepartment }) {
  const stages = (subdepartment as any)?.stages || []
  
  // Get all unique requirements from all classes
  const allRequirements = (subdepartment as any)?.classes?.flatMap((cls: any) => 
    cls.requirements?.map((req: any) => ({
      ...req,
      className: cls.name
    })) || []
  ) || []

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Job</TableHead>
            <TableHead>Job Head</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>All Submitted Documents</TableHead>
            <TableHead>Applicant Name</TableHead>
            <TableHead>Company Name</TableHead>
            <TableHead>Dependent Name</TableHead>
            <TableHead>New/Renewal</TableHead>
            {/* Dynamic stage headers */}
            {stages.map((stage: any) => (
              <TableHead key={stage.id}>
                {stage.name}
              </TableHead>
            ))}
            <TableHead>Account Used</TableHead>
            <TableHead>Applied by</TableHead>
            <TableHead>Who</TableHead>
            <TableHead>Batch</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* This is a simplified example - you would map over your tasks here */}
          <TableRow>
            <TableCell colSpan={14 + stages.length} className="text-center py-4">
              No tasks found for this class
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

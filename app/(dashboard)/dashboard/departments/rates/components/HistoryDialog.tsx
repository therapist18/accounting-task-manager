import { format } from "date-fns"
import { History, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

interface RatePeriod {
  id?: number
  departmentId: string
  effectiveFrom: Date
  effectiveTo: Date | null
  data: any[]
  exchangeRates: { usd: number; ksh: number }
  description?: string
  isActive?: boolean
  createdAt?: Date
  createdBy?: string
}

interface HistoryDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  periods: RatePeriod[]
  selectedDepartment: string
  departmentName: string
  onViewPeriod: (period: RatePeriod) => void
  isLoading: boolean
}

export function HistoryDialog({
  isOpen,
  onOpenChange,
  periods,
  selectedDepartment,
  departmentName,
  onViewPeriod,
  isLoading
}: HistoryDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Rate History - {departmentName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
              <p>Loading historical data...</p>
            </div>
          ) : periods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No historical data found for this department.
            </div>
          ) : (
            <div className="space-y-2">
              {periods.map((period) => (
                <Card 
                  key={period.id} 
                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${period.isActive ? 'border-blue-500 bg-blue-50' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {format(period.effectiveFrom, "PPP")}
                            {period.effectiveTo && ` - ${format(period.effectiveTo, "PPP")}`}
                          </span>
                          {period.isActive && (
                            <Badge variant="default" className="text-xs">Active</Badge>
                          )}
                        </div>
                        {period.description && (
                          <p className="text-sm text-muted-foreground">{period.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>USD Rate: {period.exchangeRates.usd}</span>
                          <span>Entries: {period.data.length}</span>
                          {period.createdAt && (
                            <span>Created: {format(period.createdAt, "PP")}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewPeriod(period)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

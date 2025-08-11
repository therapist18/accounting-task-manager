"use client"

import { EnquiryDialog as OriginalEnquiryDialog } from "./EnquiryDialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface EnquiryDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onEnquiryCreated: (enquiry: any) => void
    departments: any[]
    users: any[]
    officers: any[]
    activeTabId?: number
    [key: string]: any
}

export function EnquiryDialog({
    open,
    onOpenChange,
    activeTabId,
    ...props
}: EnquiryDialogProps) {
    if (activeTabId === 1) {
        return <OriginalEnquiryDialog open={open} onOpenChange={onOpenChange} {...props} />
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Other Dialog</DialogTitle>
                    <DialogDescription>
                        This is a different dialog that appears when activeTabId is not 1.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {/* Add your other dialog content here */}
                    <p>This is a placeholder for the other dialog content.</p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface ApplicantSidebarProps {
  groupedTasks: Array<{
    applicantName: string;
    tasks: any[];
  }>;
  className?: string;
}

export function ApplicantSidebar({ groupedTasks, className }: ApplicantSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedApplicant = searchParams.get('applicant');

  const handleSelectApplicant = (applicantName: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('applicant', applicantName);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className={cn("border-r h-full flex flex-col", className)}>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">Applicants</h2>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {groupedTasks.map((group, index) => (
            <Button
              key={index}
              variant={selectedApplicant === group.applicantName ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-between",
                selectedApplicant === group.applicantName ? "bg-muted" : "hover:bg-muted/50"
              )}
              onClick={() => handleSelectApplicant(group.applicantName)}
            >
              <span className="truncate">{group.applicantName}</span>
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
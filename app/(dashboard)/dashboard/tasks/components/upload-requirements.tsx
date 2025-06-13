import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Subdepartment } from "@/lib/types"

export function UploadRequirements({ subdepartment }: { subdepartment: Subdepartment }) {
  const classes = (subdepartment as any)?.classes || []
  
  if (classes.length === 0) {
    return <div>No classes found for this subdepartment</div>
  }

  return (
    <div className="space-y-4">
      {classes.map((cls: any) => (
        <Card key={cls.name}>
          <CardHeader>
            <CardTitle>{cls.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {cls.requirements?.length > 0 ? (
              <ul className="space-y-2">
                {cls.requirements.map((req: any, index: number) => (
                  <li key={index} className="flex items-center space-x-2">
                    <input 
                      type="checkbox" 
                      id={`req-${cls.name}-${index}`}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <label 
                      htmlFor={`req-${cls.name}-${index}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {req.name}
                      {req.description && (
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No requirements specified for this class.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

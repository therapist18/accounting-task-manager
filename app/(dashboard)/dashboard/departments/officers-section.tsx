'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Officer } from "./database"

interface OfficersSectionProps {
  officers: Officer[]
}

export function OfficersSection({ officers }: OfficersSectionProps) {
  if (!officers || officers.length === 0) {
    return null
  }

  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium flex items-center">
          Department Officers
          <Badge variant="outline" className="ml-2">
            {officers.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {officers.map((officer) => (
            <div key={officer.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center space-x-4">
                <Avatar>
                  <AvatarImage src={undefined} alt={officer.name || 'Officer'} />
                  <AvatarFallback>{getInitials(officer.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{officer.name || 'Unnamed Officer'}</p>
                  <p className="text-sm text-muted-foreground">{officer.email}</p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {officer.assignment_end ? (
                  <span>Left {new Date(officer.assignment_end).toLocaleDateString()}</span>
                ) : (
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    Active since {new Date(officer.assignment_start).toLocaleDateString()}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

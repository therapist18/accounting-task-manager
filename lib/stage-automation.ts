import type { Stage, Subdepartment, Task } from "./types"

export interface StageWithTiming extends Stage {
  cumulativeTime: number // Total time from start to this stage
}

export interface TaskStageProgression {
  taskId: string
  stages: StageWithTiming[]
  currentStageIndex: number
  totalEstimatedTime: number
}

export class StageAutomation {
  /**
   * Calculate stage progression for a subdepartment
   */
  static calculateStageProgression(subdepartment: Subdepartment, stages: Stage[]): StageWithTiming[] {
    const sortedStages = stages
      .filter((stage) => stage.subdepartmentId === subdepartment.id)
      .sort((a, b) => a.order - b.order)

    let cumulativeTime = 0
    return sortedStages.map((stage) => {
      const stageWithTiming: StageWithTiming = {
        ...stage,
        cumulativeTime,
      }
      cumulativeTime += stage.timeEstimate
      return stageWithTiming
    })
  }

  /**
   * Get the next stage for a task
   */
  static getNextStage(currentStageId: string, stageProgression: StageWithTiming[]): StageWithTiming | null {
    const currentIndex = stageProgression.findIndex((stage) => stage.id === currentStageId)
    if (currentIndex === -1 || currentIndex === stageProgression.length - 1) {
      return null // No next stage or stage not found
    }
    return stageProgression[currentIndex + 1]
  }

  /**
   * Calculate time remaining for current stage
   */
  static calculateTimeRemaining(
    stageStartedAt: string,
    estimatedDuration: number,
  ): {
    remainingMs: number
    isOverdue: boolean
    actualDuration: number
  } {
    const startTime = new Date(stageStartedAt).getTime()
    const now = new Date().getTime()
    const actualDuration = now - startTime
    const estimatedMs = estimatedDuration * 60 * 1000 // Convert minutes to milliseconds
    const remainingMs = estimatedMs - actualDuration

    return {
      remainingMs: Math.max(0, remainingMs),
      isOverdue: remainingMs <= 0,
      actualDuration: Math.floor(actualDuration / (1000 * 60)), // Convert back to minutes
    }
  }

  /**
   * Auto-transition to next stage if conditions are met
   */
  static shouldAutoTransition(stage: Stage, timeRemaining: number, isOverdue: boolean): boolean {
    // Auto-transition rules can be customized here
    // For now, we'll keep manual transitions only
    return false
  }

  /**
   * Generate stage timeline for a task
   */
  static generateStageTimeline(
    task: Task,
    stageProgression: StageWithTiming[],
  ): Array<{
    stage: StageWithTiming
    estimatedStartDate: Date
    estimatedEndDate: Date
    status: "pending" | "active" | "completed" | "overdue"
  }> {
    const taskStartDate = new Date(task.dateInitiated)

    return stageProgression.map((stage, index) => {
      const estimatedStartDate = new Date(taskStartDate.getTime() + stage.cumulativeTime * 60 * 1000)
      const estimatedEndDate = new Date(estimatedStartDate.getTime() + stage.timeEstimate * 60 * 1000)

      let status: "pending" | "active" | "completed" | "overdue" = "pending"

      if (task.currentStageId === stage.id) {
        const timing = this.calculateTimeRemaining(task.currentStageStartedAt || task.dateInitiated, stage.timeEstimate)
        status = timing.isOverdue ? "overdue" : "active"
      } else if (index < stageProgression.findIndex((s) => s.id === task.currentStageId)) {
        status = "completed"
      }

      return {
        stage,
        estimatedStartDate,
        estimatedEndDate,
        status,
      }
    })
  }
}

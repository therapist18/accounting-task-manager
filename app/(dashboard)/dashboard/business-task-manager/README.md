# BCL Business Task Manager

This module is intentionally isolated from the existing case/task tracking module.

Suggested production tables:

- `btm_tasks`: task instances with title, description, status, priority, type, department, creator, assignee, start date, due date, tags, and recurring template reference.
- `btm_task_reminders`: one-to-many reminders per task, with scheduled time, delivered time, and notification channels.
- `btm_recurring_task_templates`: admin-managed daily, weekly, and monthly task templates.
- `btm_notification_deliveries`: audit log for in-app, FCM, email, and WhatsApp delivery attempts.

Access control model:

- Users can read tasks they created, tasks assigned to them, and shared department/system tasks for departments in their role assignments.
- Admins can read and manage all task, reminder, template, and analytics records.
- System templates should be restricted to admin users.

Background jobs:

- `generate-recurring-tasks`: runs every 5 to 15 minutes, locks due templates, creates task instances, schedules default reminders, and advances `nextRunAt`.
- `process-task-reminders`: runs every minute, finds due undelivered reminders, creates in-app notifications, sends FCM push messages, and optionally routes email or WhatsApp delivery.

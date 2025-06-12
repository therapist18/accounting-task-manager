-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create departments table
CREATE TABLE IF NOT EXISTS public.tm_departments (
    id text PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create subdepartments table
CREATE TABLE IF NOT EXISTS public.tm_subdepartments (
    id text PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    department_id text REFERENCES public.tm_departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create users table
CREATE TABLE IF NOT EXISTS public.tm_users (
    id text PRIMARY KEY,
    clerk_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create stages table
CREATE TABLE IF NOT EXISTS public.tm_stages (
    id text PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    subdepartment_id text REFERENCES public.tm_subdepartments(id) ON DELETE CASCADE,
    order_num INTEGER NOT NULL,
    estimated_time INTEGER, -- in minutes
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(subdepartment_id, order_num)
);

-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tm_tasks (
    id text PRIMARY KEY,
    job_description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'registered',
    department_id text REFERENCES public.tm_departments(id) ON DELETE SET NULL,
    subdepartment_id text REFERENCES public.tm_subdepartments(id) ON DELETE SET NULL,
    current_stage_id text REFERENCES public.tm_stages(id) ON DELETE SET NULL,
    current_stage_started_at TIMESTAMP WITH TIME ZONE,
    task_manager_id text REFERENCES public.tm_users(id) ON DELETE SET NULL,
    task_assistant_id text REFERENCES public.tm_users(id) ON DELETE SET NULL,
    date_initiated TIMESTAMP WITH TIME ZONE,
    created_by text REFERENCES public.tm_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create task_stages table to track stage history
CREATE TABLE IF NOT EXISTS public.tm_task_stages (
    id text PRIMARY KEY,
    task_id text REFERENCES public.tm_tasks(id) ON DELETE CASCADE,
    stage_id text REFERENCES public.tm_stages(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tm_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_department_id ON public.tm_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_subdepartment_id ON public.tm_tasks(subdepartment_id);
CREATE INDEX IF NOT EXISTS idx_tasks_current_stage_id ON public.tm_tasks(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_task_stages_task_id ON public.tm_task_stages(task_id);
CREATE INDEX IF NOT EXISTS idx_task_stages_stage_id ON public.tm_task_stages(stage_id);


// @ts-nocheck
"use client"

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
    AppWindow,
    BarChart3,
    BookOpen,
    Calendar,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    Database,
    FileText,
    HelpCircle,
    LayoutDashboard,
    Mail,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    PlusCircle,
    Search,
    Settings,
    Settings2,
    Sun,
    Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "./ui/sidebar";

// Define basic User type based on the expected format
type AuthUser = {
    isSuperAdmin?: boolean;
    permissions?: string[];
    [key: string]: any;
};

// --- Nav Items ---
const navItems = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
    { title: "Email Inbox", href: "/dashboard/emails", icon: Mail, permission: "emails.view" },
    {
        title: "Task Management",
        icon: CheckSquare,
        items: [
            { title: "Tasks Requirements", href: "/dashboard/tasks-requirements", permission: "tasks_requirements.view" },
            { title: "Tasks Tracking", href: "/dashboard/tasks", permission: "tasks.view" },
            { title: "Reports Dashboard", href: "/dashboard/reports", permission: "reports.view" },
        ],
    },
    {
        title: "Administration",
        icon: Users,
        items: [{ title: "Users", href: "/dashboard/users-management", permission: "users.view" }],
    },
    {
        title: "Settings",
        icon: Settings2,
        items: [
            { title: "Departments", href: "/dashboard/departments/departments", permission: "settings.departments.view" },
            { title: "Stages", href: "/dashboard/departments/stages", permission: "settings.stages.view" },
            { title: "Rates", href: "/dashboard/departments/rates", permission: "settings.rates.view" },
            { title: "Upload Requirements", href: "/dashboard/departments/upload-requirements", permission: "settings.upload_requirements.view" },
            { title: "Guidelines", href: "/dashboard/departments/guidelines", permission: "settings.guidelines.view" },
            { title: "Documents + Fields", href: "/dashboard/departments/documents+fields", permission: "settings.documents_fields.view" },
            { title: "Automations", href: "/dashboard/departments/automation", permission: "settings.automations.view" },
            { title: "User Access", href: "/dashboard/settings/access-controls", permission: "settings.access_controls.view" }
        ],
    },
    { title: "Templates", href: "/dashboard/templates", icon: FileText, permission: "templates.view" },
    { title: "Master Fields", href: "/dashboard/master-fields", icon: Database, permission: "master_fields.view" },
    {
        title: "Letters",
        icon: Mail,
        items: [
            { title: "Letter Generation", href: "/dashboard/letters", permission: "letters.view" },
            { title: "Letterheads", href: "/dashboard/letters/letterheads", permission: "letterheads.view" },
        ],
    },
    { title: "Diary", href: "/dashboard/diary", icon: Calendar, permission: "diary.view" },
    {
        title: "BCL Task Diary",
        icon: BookOpen,
        items: [
            { title: "My Workspace", href: "/dashboard/bcl-task-diary", permission: "bcl_task_diary.view" },
            { title: "Recurring Templates", href: "/dashboard/bcl-task-diary/settings", permission: "bcl_task_diary.settings.view" },
            { title: "Admin Dashboard", href: "/dashboard/bcl-task-diary/admin", permission: "bcl_task_diary.admin.view" },
        ],
    },
    { title: "Applications", href: "/dashboard/applications", icon: AppWindow, permission: "applications.view" },
    { title: "Reports", href: "/dashboard/reports", icon: BarChart3, permission: "reports.view" },
];

// --- Access & Permission Functions ---
function hasPermission(user: AuthUser | null, permission: string) {
    if (!permission) return true;
    if (user?.isSuperAdmin) return true;
    return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

function filterNavItems(items: any[], user: AuthUser | null) {
    return items
        .map((item) => {
            if (item.items) {
                const visibleChildren = item.items.filter((sub: any) => hasPermission(user, sub.permission));
                return visibleChildren.length > 0 ? { ...item, items: visibleChildren } : null;
            }
            return hasPermission(user, item.permission) ? item : null;
        })
        .filter(Boolean);
}

function useCurrentUser() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await fetch("/api/auth/session");
                const json = await response.json();
                if (json?.authenticated && json?.user) {
                    setUser(json.user);
                } else {
                    window.location.replace("/login");
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchUser();
    }, []);

    return { user, loading };
}

// --- Dynamic Navigation Components ---
const NavGroup = ({ item, isCollapsed, setIsCollapsed, pathname }) => {
    const isActive = item.items.some((sub: any) => pathname === sub.href);
    const [isOpen, setIsOpen] = useState(isActive);

    useEffect(() => {
        if (isCollapsed) setIsOpen(false);
        else if (isActive) setIsOpen(true);
    }, [isCollapsed, isActive]);

    const handleToggle = () => {
        if (isCollapsed) {
            setIsCollapsed(false);
            setIsOpen(true);
        } else {
            setIsOpen(!isOpen);
        }
    };

    const GroupTrigger = (
        <button
            onClick={handleToggle}
            className={cn(
                "flex w-full items-center gap-3.5 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-colors duration-200 mb-1",
                "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                isActive ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))] shadow-sm" : "opacity-80",
                isCollapsed && "justify-center px-0"
            )}
        >
            <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-[hsl(var(--sidebar-accent-foreground))]" : "opacity-70")} />
            {!isCollapsed && (
                <>
                    <span className="flex-1 text-left truncate">{item.title}</span>
                    {isOpen ? <ChevronDown className="h-4 w-4 opacity-50" /> : <ChevronRight className="h-4 w-4 opacity-50" />}
                </>
            )}
        </button>
    );

    return (
        <div className="flex flex-col">
            {isCollapsed ? (
                <Tooltip>
                    <TooltipTrigger asChild>{GroupTrigger}</TooltipTrigger>
                    <TooltipContent side="right" className="bg-[hsl(var(--sidebar-background))] border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]">
                        {item.title}
                    </TooltipContent>
                </Tooltip>
            ) : (
                GroupTrigger
            )}

            {!isCollapsed && isOpen && (
                <div className="ml-[22px] mt-1 mb-2 flex flex-col space-y-1 border-l border-[hsl(var(--sidebar-border))] pl-4">
                    {item.items.map((sub: any) => {
                        const isSubActive = pathname === sub.href;
                        return (
                            <Link
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                    "py-2 text-[12px] transition-colors duration-200",
                                    isSubActive 
                                      ? "text-[hsl(var(--sidebar-accent-foreground))] font-semibold" 
                                      : "text-[hsl(var(--sidebar-foreground))] opacity-70 hover:opacity-100 hover:text-[hsl(var(--sidebar-accent-foreground))]"
                                )}
                            >
                                {sub.title}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const NavItem = ({ item, isCollapsed, pathname }) => {
    const active = pathname === item.href;
    const inner = (
        <Link
            href={item.href}
            className={cn(
                "relative flex items-center gap-3.5 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-colors duration-200 mb-1",
                "text-[hsl(var(--sidebar-foreground))] hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                active ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-accent-foreground))] font-semibold shadow-sm" : "opacity-80",
                isCollapsed && "justify-center px-0"
            )}
        >
            <item.icon className={cn("h-5 w-5 shrink-0", active ? "text-[hsl(var(--sidebar-accent-foreground))]" : "opacity-70")} />
            {!isCollapsed && (
                <span className="flex-1 truncate">{item.title}</span>
            )}
        </Link>
    );

    if (!isCollapsed) return inner;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{inner}</TooltipTrigger>
            <TooltipContent side="right" className="bg-[hsl(var(--sidebar-background))] border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]">
                {item.title}
            </TooltipContent>
        </Tooltip>
    );
};

// --- Main AppSidebar Component ---
const AppSidebar = () => {
    const pathname = usePathname();
    const router = useRouter();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { isMobileOpen, setIsMobileOpen } = useSidebar();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const { user, loading } = useCurrentUser();

    useEffect(() => setMounted(true), []);

    const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

    const filteredNavItems = useMemo(() => {
        if (!user) return [];
        const normalizedSearch = searchQuery.trim().toLowerCase();
        let authorizedItems = filterNavItems(navItems, user);

        if (normalizedSearch) {
            authorizedItems = authorizedItems.map(item => {
                if (item.items) {
                    const filteredSub = item.items.filter((sub: any) => 
                        sub.title.toLowerCase().includes(normalizedSearch)
                    );
                    if (filteredSub.length > 0) return { ...item, items: filteredSub };
                    if (item.title.toLowerCase().includes(normalizedSearch)) return item;
                    return null;
                }
                return item.title.toLowerCase().includes(normalizedSearch) ? item : null;
            }).filter(Boolean);
        }

        return authorizedItems;
    }, [user, searchQuery]);

    const utilityButtonClass = cn(
        "flex w-full items-center gap-3.5 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-all",
        "text-[hsl(var(--sidebar-foreground))] opacity-80 hover:opacity-100 hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
        isCollapsed && "justify-center px-0"
    );

    return (
        <TooltipProvider delayDuration={100}>
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-[hsl(var(--sidebar-background))] text-[hsl(var(--sidebar-foreground))] transition-all duration-300 ease-in-out lg:sticky lg:top-0 border-r border-[hsl(var(--sidebar-border))]",
                    isCollapsed ? "w-[80px]" : "w-[260px]",
                    isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                {/* Header Section */}
               <div className={cn("pt-8 transition-all duration-300", isCollapsed ? "px-4" : "px-5")}>
                    <div 
                        className={cn(
                            "flex",
                            isCollapsed ? "flex-col items-center gap-4 justify-center" : "flex-row items-center justify-between"
                        )}
                    >
                        {/* Logo and Text Wrapper */}
                        <div className="flex items-center gap-3 overflow-hidden">
                            {/* Logo */}
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--sidebar-accent))] ring-1 ring-[hsl(var(--sidebar-border))]">
                                <Image
                                    src="/BCL logo.png"
                                    alt="BCL Tasks"
                                    width={28}
                                    height={28}
                                    className="object-contain"
                                />
                            </div>

                            {/* Company Name */}
                            {!isCollapsed && (
                                <div className="flex flex-col justify-center min-w-0">
                                    <div className="truncate text-[16px] font-bold leading-tight text-[hsl(var(--sidebar-foreground))]">
                                        BCL Task Manager
                                    </div>
                                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--sidebar-primary))]">
                                        Booksmart
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Collapse Toggle Button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={cn(
                                "shrink-0 text-[hsl(var(--sidebar-foreground))] opacity-70 hover:opacity-100 hover:bg-[hsl(var(--sidebar-accent))] hover:text-[hsl(var(--sidebar-accent-foreground))]",
                                isCollapsed ? "h-10 w-10" : "h-8 w-8"
                            )}
                        >
                            {isCollapsed ? (
                                <PanelLeftOpen className="h-5 w-5" />
                            ) : (
                                <PanelLeftClose className="h-5 w-5" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Search */}
                {!isCollapsed && (
                    <div className="relative mx-5 mb-4 mt-8">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--sidebar-foreground))] opacity-50" />
                        <Input
                            type="text"
                            placeholder="Search modules..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-10 rounded-lg border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] pl-9 text-sm text-[hsl(var(--sidebar-foreground))] placeholder:text-[hsl(var(--sidebar-foreground))] placeholder:opacity-50 focus:bg-[hsl(var(--sidebar-accent))] focus:ring-[hsl(var(--sidebar-ring))] focus:border-transparent"
                        />
                    </div>
                )}

                {/* Navigation Content */}
                <div className={cn("sidebar-scroll mt-4 flex-1 overflow-y-auto px-3 pb-4", isCollapsed && "px-2")}>
                    {loading ? (
                        <div className="flex items-center justify-center py-10 opacity-50 text-sm text-[hsl(var(--sidebar-foreground))]">
                            Loading...
                        </div>
                    ) : (
                        <nav className="space-y-0.5">
                            {filteredNavItems.map((item) => 
                                item.items ? (
                                    <NavGroup 
                                        key={item.title} 
                                        item={item} 
                                        isCollapsed={isCollapsed} 
                                        setIsCollapsed={setIsCollapsed} 
                                        pathname={pathname} 
                                    />
                                ) : (
                                    <NavItem 
                                        key={item.title} 
                                        item={item} 
                                        isCollapsed={isCollapsed} 
                                        pathname={pathname} 
                                    />
                                )
                            )}
                        </nav>
                    )}
                </div>

                {/* Footer Section */}
                <div className={cn("mt-auto p-4 border-t border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))]", isCollapsed && "p-2")}>
                    <div className="flex flex-col gap-1">
                        <NavItemComponent isCollapsed={isCollapsed} href="/settings" icon={Settings} label="Settings" className={utilityButtonClass} />
                        <NavItemComponent isCollapsed={isCollapsed} href="/help" icon={HelpCircle} label="Support" className={utilityButtonClass} />

                        {mounted && (
                            <button className={utilityButtonClass} onClick={toggleTheme}>
                                {theme === "dark" ? <Sun className="h-5 w-5 opacity-70" /> : <Moon className="h-5 w-5 opacity-70" />}
                                {!isCollapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
                            </button>
                        )}
                    </div>
                </div>
            </aside>

            {isMobileOpen && (
                <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setIsMobileOpen(false)} />
            )}
        </TooltipProvider>
    );
};

const NavItemComponent = ({ isCollapsed, href, icon: Icon, label, className }) => {
    const content = (
        <Link href={href} className={className}>
            <Icon className="h-5 w-5 shrink-0 opacity-70" />
            {!isCollapsed && <span>{label}</span>}
        </Link>
    );

    if (!isCollapsed) return content;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex justify-center">{content}</div>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-[hsl(var(--sidebar-background))] border-[hsl(var(--sidebar-border))] text-[hsl(var(--sidebar-foreground))]">
                {label}
            </TooltipContent>
        </Tooltip>
    );
};

export default AppSidebar;
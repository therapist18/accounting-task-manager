// @ts-nocheck
"use client"

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
    AppWindow,
    BarChart3,
    BookOpen,
    Calendar,
    CheckSquare,
    ChevronDown,
    Database,
    FileText,
    HelpCircle,
    LayoutDashboard,
    LogOut,
    Mail,
    Moon,
    PanelLeftClose,
    PanelLeftOpen,
    Search,
    Settings,
    Settings2,
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "./ui/sidebar";

type AuthUser = {
    isSuperAdmin?: boolean;
    permissions?: string[];
    name?: string;
    displayName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
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
                    setUser({ displayName: "Super Admin", name: "SuperAdmin Admin", role: "SuperAdmin", isSuperAdmin: true });
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

const tooltipClass = "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium shadow-md rounded-md px-3 py-3 text-xs";

// --- REFINED STYLES ---
const activeGroupClass = "bg-blue-200/80 dark:bg-blue-900/10 text-blue-900 dark:text-blue-400 font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.05)] ring-1 ring-blue-100/50 dark:ring-blue-900/20";
const activeChildClass = "text-blue-900 dark:text-blue-400 font-semibold bg-blue-200/50 dark:bg-blue-900/10";
const inactiveItemClass = "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100 font-medium";

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
                "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-3 text-[11px] transition-all duration-150 outline-none mb-0.5",
                isActive ? activeGroupClass : inactiveItemClass,
                isCollapsed && "justify-center px-0"
            )}
        >
            {isActive && !isCollapsed && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-600 rounded-full" />
            )}
            
            <div className={cn(
                "flex items-center justify-center shrink-0 transition-colors duration-150",
                isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600"
            )}>
                <item.icon size={16} strokeWidth={isActive ? 2.5 : 2} />
            </div>

            {!isCollapsed && (
                <>
                    <span className="flex-1 text-left truncate tracking-tight">{item.title}</span>
                    <ChevronDown className={cn(
                        "h-3 w-3 shrink-0 transition-transform duration-200 opacity-50",
                        isOpen ? "rotate-180" : ""
                    )} />
                </>
            )}
        </button>
    );

    return (
        <div className="flex flex-col">
            {isCollapsed ? (
                <Tooltip>
                    <TooltipTrigger asChild>{GroupTrigger}</TooltipTrigger>
                    <TooltipContent side="right" className={tooltipClass} sideOffset={12}>
                        {item.title}
                    </TooltipContent>
                </Tooltip>
            ) : (
                GroupTrigger
            )}

            {!isCollapsed && (
                <div
                    className={cn(
                        "grid transition-all duration-200 ease-in-out",
                        isOpen ? "grid-rows-[1fr] opacity-100 mb-1" : "grid-rows-[0fr] opacity-0"
                    )}
                >
                    <div className="overflow-hidden">
                        <div className="ml-[18px] flex flex-col space-y-0.5 border-l border-slate-200 dark:border-slate-800/60 pl-3 py-0.5">
                            {item.items.map((sub: any) => {
                                const isSubActive = pathname === sub.href;
                                return (
                                    <Link
                                        key={sub.href}
                                        href={sub.href}
                                        className={cn(
                                            "py-3 px-2 rounded-md text-[11px] transition-all duration-150 outline-none tracking-tight",
                                            isSubActive ? activeChildClass : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                                        )}
                                    >
                                        {sub.title}
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
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
                "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-3 text-[11px] transition-all duration-150 mb-0.5 outline-none",
                active ? activeGroupClass : inactiveItemClass,
                isCollapsed && "justify-center px-0"
            )}
        >
             {active && !isCollapsed && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-600 rounded-full" />
            )}

            <div className={cn(
                "flex items-center justify-center shrink-0 transition-colors duration-150",
                active ? "text-blue-600 dark:text-blue-400" : "text-slate-400 group-hover:text-slate-600"
            )}>
                <item.icon size={16} strokeWidth={active ? 2.5 : 2} />
            </div>

            {!isCollapsed && (
                <span className="flex-1 truncate tracking-tight">{item.title}</span>
            )}
        </Link>
    );

    if (!isCollapsed) return inner;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{inner}</TooltipTrigger>
            <TooltipContent side="right" className={tooltipClass} sideOffset={12}>
                {item.title}
            </TooltipContent>
        </Tooltip>
    );
};

function getInitials(user: AuthUser | null): string {
    if (!user) return "SA";
    if (user.firstName?.[0] && user.lastName?.[0]) {
        return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    const name = user.displayName ?? user.name ?? "";
    if (name.toLowerCase() === "super admin") return "SA";
    return name.slice(0, 2).toUpperCase() || "U";
}

const AppSidebar = () => {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { isMobileOpen } = useSidebar();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSigningOut, setIsSigningOut] = useState(false);

    const { user, loading } = useCurrentUser();

    useEffect(() => setMounted(true), []);

    const filteredNavItems = useMemo(() => {
        if (!user) return [];
        const authorizedItems = filterNavItems(navItems, user);
        if (!searchQuery.trim()) return authorizedItems;

        const normalizedSearch = searchQuery.toLowerCase();
        return authorizedItems.map(item => {
            if (item.items) {
                const filteredSub = item.items.filter(sub => sub.title.toLowerCase().includes(normalizedSearch));
                return filteredSub.length > 0 ? { ...item, items: filteredSub } : null;
            }
            return item.title.toLowerCase().includes(normalizedSearch) ? item : null;
        }).filter(Boolean);
    }, [user, searchQuery]);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.replace("/login");
        } catch (error) {
            setIsSigningOut(false);
            console.error("Logout failed:", error);
        }
    };

    return (
        <TooltipProvider delayDuration={100}>
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex h-screen flex-col transition-all duration-300 ease-in-out lg:sticky lg:top-0 px-4",
                    "bg-blue-50 dark:bg-[#090E17] border-r border-slate-200/60 dark:border-slate-800/60 shadow-[1px_0_10px_rgba(0,0,0,0.03)]",
                    isCollapsed ? "w-[64px]" : "w-[240px]",
                    isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                {/* Fixed Header with Toggle Button Persistence */}
                <div className={cn("pt-8 pb-4", isCollapsed ? "px-2" : "px-4")}>
                    <div className={cn("flex items-center justify-between", isCollapsed && "flex-col gap-4")}>
                        <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="flex shrink-0 items-center justify-center bg-blue-600 rounded-md p-1 shadow-sm">
                                <Image src="/BCL logo.png" alt="Logo" width={20} height={20} className="brightness-0 invert" />
                            </div>
                            {!isCollapsed && (
                                <div className="flex flex-col min-w-0 leading-none">
                                    <span className="truncate text-[15px] font-bold text-slate-900 dark:text-white tracking-tight">
                                        BCL Task Manager
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-[0.15em] text-blue-600 mt-0.5">
                                        Booksmart
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Toggle Button Always Visible */}
                        <Button
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className={cn(
                                "h-7 w-7 shrink-0 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all",
                                isCollapsed ? "mt-1" : ""
                            )}
                        >
                            {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                {/* Search */}
                {!isCollapsed && (
                    <div className="px-3 mb-4">
                        <div className="relative group">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <Input
                                placeholder="Search modules..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-10 w-full rounded-sm border bg-slate-100/70 dark:bg-slate-800/60 pl-8 pr-8 text-[11px] focus-visible:ring-1 focus-visible:ring-blue-500/20 shadow-none"
                            />
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <div className={cn("flex-1 overflow-y-auto px-2.5 custom-scrollbar")}>
                    <nav className="flex flex-col">
                        {filteredNavItems.map((item) => (
                            item.items ? (
                                <NavGroup key={item.title} item={item} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} pathname={pathname} />
                            ) : (
                                <NavItem key={item.title} item={item} isCollapsed={isCollapsed} pathname={pathname} />
                            )
                        ))}
                    </nav>
                </div>

                {/* Footer */}
                <div className="mt-auto px-2 pb-4">
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 mb-2">
                        <NavItemComponent isCollapsed={isCollapsed} href="/settings" icon={Settings} label="Settings" />
                        <NavItemComponent isCollapsed={isCollapsed} href="/help" icon={HelpCircle} label="Support" />

                        {mounted && (
                            <button
                                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-3 text-[11px] transition-all outline-none",
                                    inactiveItemClass, isCollapsed && "justify-center px-0"
                                )}
                            >
                                <Moon size={16} className="shrink-0 text-slate-400" />
                                {!isCollapsed && (
                                    <>
                                        <span className="flex-1 text-left">Dark Mode</span>
                                        <div className={cn(
                                            "w-10 h-6 rounded-full relative transition-colors shrink-0",
                                            theme === "dark" ? "bg-blue-600" : "bg-slate-200"
                                        )}>
                                            <div className={cn(
                                                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                                                theme === "dark" ? "translate-x-4" : "translate-x-0"
                                            )} />
                                        </div>
                                    </>
                                )}
                            </button>
                        )}
                    </div>

                    {/* User Badge */}
                    {!loading && user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className={cn(
                                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors outline-none",
                                    isCollapsed && "justify-center px-0"
                                )}>
                                    <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-[10px] font-bold text-white shadow-md">
                                        {getInitials(user)}
                                    </div>
                                    {!isCollapsed && (
                                        <>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-[11px] font-semibold text-slate-900 dark:text-white truncate leading-tight">
                                                    {user.displayName || user.name}
                                                </span>
                                                <span className="text-[9px] text-slate-500 truncate uppercase tracking-tighter">
                                                    {user.role?.replace(/_/g, " ")}
                                                </span>
                                            </div>
                                            <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
                                        </>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align={isCollapsed ? "center" : "end"}
                                side="right"
                                sideOffset={10}
                                className="w-56 rounded-xl border border-slate-200 bg-white shadow-2xl p-1"
                            >
                                <DropdownMenuLabel className="font-normal px-3 py-2">
                                    <div className="flex flex-col space-y-0.5">
                                        <p className="text-xs font-semibold leading-none">{user.displayName || user.name}</p>
                                        <p className="text-[10px] leading-none text-muted-foreground">{user.email || ""}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild className="rounded-lg cursor-pointer text-xs py-2">
                                    <Link href="/dashboard/settings/access-controls" className="flex items-center gap-2.5">
                                        <Settings className="w-3.5 h-3.5" /> Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    onClick={handleSignOut}
                                    className="text-red-600 rounded-lg cursor-pointer text-xs py-2 flex items-center gap-2.5 hover:bg-red-50"
                                >
                                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </aside>

            {/* Sign out overlay */}
            {isSigningOut && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
                    <div className="flex min-w-[240px] items-center gap-3 rounded-xl border border-white/20 bg-white px-5 py-3 shadow-2xl text-slate-900 font-semibold text-sm">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Signing out...
                    </div>
                </div>
            )}
        </TooltipProvider>
    );
};

const NavItemComponent = ({ isCollapsed, href, icon: Icon, label }) => (
    <Link
        href={href}
        className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] transition-all outline-none",
            inactiveItemClass, isCollapsed && "justify-center px-0"
        )}
    >
        <Icon size={16} className="shrink-0 text-slate-400" />
        {!isCollapsed && <span className="flex-1">{label}</span>}
    </Link>
);

export default AppSidebar;
// @ts-nocheck
"use client"

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AppWindow, BarChart3, BookOpen, Calendar, CheckSquare, ChevronDown, ChevronRight, Database, FileText, HelpCircle, LayoutDashboard, LogOut, Mail, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Settings2, Sun, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

function getInitials(user: AuthUser | null): string {
    if (!user) return "U";
    if (user.firstName?.[0] && user.lastName?.[0]) {
        return (user.firstName[0] + user.lastName[0]).toUpperCase();
    }
    const name = user.displayName ?? user.name ?? "";
    if (name.toLowerCase() === "super admin") return "SA";
    return name.slice(0, 2).toUpperCase() || "U";
}

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
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-200 mb-1 group",
                isActive 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                    : "text-slate-500 hover:bg-blue-100/50 hover:text-blue-700",
                isCollapsed && "justify-center px-0"
            )}
        >
            <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-white/20" : "bg-blue-100 group-hover:bg-blue-200"
            )}>
                <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-blue-600")} />
            </div>
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
                    <TooltipContent side="right" className="bg-blue-900 text-white">
                        {item.title}
                    </TooltipContent>
                </Tooltip>
            ) : (
                GroupTrigger
            )}

            {!isCollapsed && isOpen && (
                <div className="ml-7 mt-1 mb-2 flex flex-col space-y-1 border-l-2 border-blue-100 pl-4">
                    {item.items.map((sub: any) => {
                        const isSubActive = pathname === sub.href;
                        return (
                            <Link
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                    "py-1.5 px-3 text-[12px] transition-all duration-200 rounded-lg",
                                    isSubActive 
                                      ? "text-blue-700 font-bold bg-white shadow-sm border border-blue-50" 
                                      : "text-slate-500 hover:text-blue-600 hover:bg-white/50"
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
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-200 mb-1",
                active 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                    : "text-slate-500 hover:bg-blue-100/50 hover:text-blue-700",
                isCollapsed && "justify-center px-0"
            )}
        >
            <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                active ? "bg-white/20" : "bg-blue-100 group-hover:bg-blue-200"
            )}>
                <item.icon className={cn("h-4 w-4", active ? "text-white" : "text-blue-600")} />
            </div>
            {!isCollapsed && <span className="flex-1 truncate">{item.title}</span>}
        </Link>
    );

    if (!isCollapsed) return inner;

    return (
        <Tooltip>
            <TooltipTrigger asChild>{inner}</TooltipTrigger>
            <TooltipContent side="right" className="bg-blue-900 text-white">
                {item.title}
            </TooltipContent>
        </Tooltip>
    );
};

const AppSidebar = () => {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const { isMobileOpen, setIsMobileOpen } = useSidebar();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSigningOut, setIsSigningOut] = useState(false);

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

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.replace("/login");
        } catch (error) {
            setIsSigningOut(false);
        }
    };

    return (
        <TooltipProvider delayDuration={100}>
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex h-screen flex-col border-r border-blue-100 bg-blue-50/50 backdrop-blur-xl transition-all duration-300 ease-in-out lg:sticky lg:top-0",
                    isCollapsed ? "w-[80px]" : "w-[260px]",
                    isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                )}
            >
                {/* Header */}
               <div className={cn("pt-8 pb-6 transition-all duration-300", isCollapsed ? "px-4" : "px-6")}>
                    <div className={cn("flex", isCollapsed ? "flex-col items-center gap-4" : "flex-row items-center justify-between")}>
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm border border-blue-50">
                                <Image src="/BCL logo.png" alt="Logo" width={26} height={26} className="object-contain" />
                            </div>
                            {!isCollapsed && (
                                <div className="flex flex-col">
                                    <span className="text-sm font-extrabold text-blue-900 tracking-tight">BCL Manager</span>
                                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Booksmart</span>
                                </div>
                            )}
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="h-8 w-8 text-blue-400 hover:text-blue-700 hover:bg-white"
                        >
                            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </Button>
                    </div>
                </div>

                {/* Search */}
                {!isCollapsed && (
                    <div className="relative mx-6 mb-6">
                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-blue-400" />
                        <Input
                            type="text"
                            placeholder="Find a module..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-10 rounded-xl border-blue-100 bg-white/80 pl-9 text-xs text-slate-700 placeholder:text-blue-300 focus:bg-white focus:ring-blue-500/20 transition-all shadow-sm"
                        />
                    </div>
                )}

                {/* Nav Content */}
                <div className="sidebar-scroll flex-1 overflow-y-auto px-4 pb-4">
                    {loading ? (
                        <div className="flex justify-center py-10 opacity-20"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
                    ) : (
                        <nav className="space-y-1">
                            {filteredNavItems.map((item) => 
                                item.items ? (
                                    <NavGroup key={item.title} item={item} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} pathname={pathname} />
                                ) : (
                                    <NavItem key={item.title} item={item} isCollapsed={isCollapsed} pathname={pathname} />
                                )
                            )}
                        </nav>
                    )}
                </div>

                {/* Footer Section */}
                <div className={cn("mt-auto p-4 border-t border-blue-100 bg-white/30", isCollapsed && "p-2")}>
                    <div className="flex flex-col gap-1 mb-4">
                        <NavItemComponent isCollapsed={isCollapsed} href="/help" icon={HelpCircle} label="Help & Support" />
                        {mounted && (
                            <button 
                                onClick={toggleTheme}
                                className={cn(
                                    "flex items-center gap-3.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-500 hover:bg-white hover:text-blue-700 transition-all group",
                                    isCollapsed && "justify-center px-0"
                                )}
                            >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100">
                                    {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                                </div>
                                {!isCollapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
                            </button>
                        )}
                    </div>

                    {!loading && user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className={cn(
                                    "flex w-full items-center gap-3 rounded-xl p-2 text-left bg-white/50 border border-blue-50 hover:bg-white hover:shadow-md transition-all outline-none group",
                                    isCollapsed && "justify-center p-1 border-none bg-transparent"
                                )}>
                                    <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl bg-blue-600 text-[12px] font-black text-white shadow-sm group-hover:scale-105 transition-transform">
                                        {getInitials(user)}
                                    </div>
                                    {!isCollapsed && (
                                        <>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-[12px] font-bold text-slate-900 truncate">{user.displayName || user.name}</span>
                                                <span className="text-[10px] text-blue-500 font-bold truncate uppercase tracking-tight">{user.role?.replace(/_/g, " ")}</span>
                                            </div>
                                            <ChevronDown className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-600" />
                                        </>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align={isCollapsed ? "center" : "end"} side={isCollapsed ? "right" : "top"} className="w-56 rounded-xl bg-white border-blue-100 shadow-2xl">
                                <DropdownMenuLabel className="font-normal p-3">
                                    <p className="text-sm font-bold text-slate-900">{user.displayName || user.name}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-blue-50" />
                                <DropdownMenuItem asChild className="m-1 rounded-lg py-2 focus:bg-blue-50 focus:text-blue-700 cursor-pointer text-xs font-semibold">
                                    <Link href="/dashboard/settings/access-controls" className="flex items-center gap-2.5">
                                        <Settings size={14} className="text-blue-600" /> Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-blue-50" />
                                <DropdownMenuItem onClick={handleSignOut} className="m-1 rounded-lg py-2 text-red-500 focus:bg-red-50 focus:text-red-600 cursor-pointer text-xs font-semibold">
                                    <LogOut size={14} className="mr-2" /> Sign Out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </aside>

            {isSigningOut && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-blue-900/10 backdrop-blur-sm">
                    <div className="flex items-center gap-4 rounded-2xl bg-white px-8 py-4 shadow-2xl border border-blue-100 text-blue-900">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-bold">Signing out...</span>
                    </div>
                </div>
            )}
        </TooltipProvider>
    );
};

const NavItemComponent = ({ isCollapsed, href, icon: Icon, label }) => {
    const content = (
        <Link href={href} className={cn(
            "flex items-center gap-3.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-slate-500 hover:bg-white hover:text-blue-700 transition-all group",
            isCollapsed && "justify-center px-0"
        )}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100">
                <Icon size={15} className="text-blue-600" />
            </div>
            {!isCollapsed && <span>{label}</span>}
        </Link>
    );

    if (!isCollapsed) return content;

    return (
        <Tooltip>
            <TooltipTrigger asChild><div className="flex justify-center">{content}</div></TooltipTrigger>
            <TooltipContent side="right" className="bg-blue-900 text-white">{label}</TooltipContent>
        </Tooltip>
    );
};

export default AppSidebar;
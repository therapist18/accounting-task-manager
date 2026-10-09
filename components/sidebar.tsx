// @ts-nocheck
"use client"

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AppWindow, BarChart3, BookOpen, Calendar, CheckSquare, ChevronDown, ChevronRight, Database, FileText, LayoutDashboard, LogOut, Mail, Moon, PanelLeftClose, PanelLeftOpen, PlusCircle, Search, Settings, Settings2, ShieldAlert, Sun, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSidebar } from "./ui/sidebar";
import { useCurrentUser as useSharedCurrentUser, hasPermission, type AuthUser } from "@/lib/hooks/use-current-user";

const navItems = [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
    { title: "KRA Email Center", href: "/dashboard/emails", icon: Mail, permission: "emails.view" },
    // No permission: immigration alerts are for everyone signed in.
    { title: "Immigration Alerts", href: "/dashboard/immigration-alerts", icon: ShieldAlert },
    {
        title: "Task Management",
        icon: CheckSquare,
        items: [
            // { title: "Tasks Requirements", href: "/dashboard/tasks-requirements", permission: "tasks_requirements.view" },
            { title: "Tasks Tracking", href: "/dashboard/tasks", permission: "tasks.view" },
            // { title: "Reports Dashboard", href: "/dashboard/reports", permission: "reports.view" },
            { title: "Summary Reports Dashboard", href: "/dashboard/summary-reports", permission: "summary_reports.view" },
            { title: "Passport Endorsement Tracking", href: "/dashboard/passport-endorsement", permission: "passport_endorsement.view" },
            { title: "Company Profiles", href: "/dashboard/company-profiles", permission: "company_profiles.view" },
            { title: "Task Basket", href: "/dashboard/task-basket", permission: "task_basket.view" },
            { title: "Automations", href: "/dashboard/automations", permission: "automations.view" }
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
    {
        title: "CV Generator",
        icon: FileText,
        items: [
            { title: "Build CV", href: "/dashboard/cv-generator" },
            { title: "Field Sources", href: "/dashboard/cv-generator/settings" },
        ],
    },
    {
        title: "Matrimonial Biodata",
        icon: Users,
        items: [
            { title: "Generate Biodata", href: "/dashboard/matrimonial-biodata" },
            { title: "Settings", href: "/dashboard/matrimonial-biodata/settings" },
        ],
    },
    {
        title: "Employment Contracts",
        icon: FileText,
        items: [
            { title: "Contracts & Letters", href: "/dashboard/employment-contracts" },
            { title: "Profiles & Letter Templates", href: "/dashboard/employment-contracts/job-profiles" },
            { title: "Clauses", href: "/dashboard/employment-contracts/clause-library" },
            { title: "Placeholders", href: "/dashboard/employment-contracts/placeholders" },
        ],
    },
    {
        title: "Consultancy Contracts",
        icon: FileText,
        items: [
            { title: "Generate Contracts", href: "/dashboard/consultancy-contracts" },
            { title: "Template & Placeholders", href: "/dashboard/consultancy-contracts/settings" },
        ],
    },
    { title: "Master Fields", href: "/dashboard/master-fields", icon: Database, permission: "master_fields.view" },
    {
        title: "Letters",
        icon: Mail,
        items: [
            { title: "Letter Generation", href: "/dashboard/letters", permission: "letters.view" },
            { title: "Letterheads Settings", href: "/dashboard/letters/letterheads", permission: "letterheads.view" },
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
    { title: "Applications", href: "/dashboard/applications", icon: AppWindow, permission: "applications.view" }
];

// --- Access & Permission Functions ---
// hasPermission is now shared via lib/hooks/use-current-user.ts (so page-level components can
// gate an action by the same Access Control Matrix check, not just nav-item visibility).

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

// Thin wrapper over the shared hook that adds the sidebar's own "kick to login if session
// invalid" behavior — kept local rather than in the shared hook so other consumers (e.g. a page
// checking one permission) don't also force-navigate on a transient/failed session fetch.
function useCurrentUser() {
    const { user, loading } = useSharedCurrentUser();

    useEffect(() => {
        if (!loading && !user) {
            window.location.replace("/login");
        }
    }, [loading, user]);

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

// --- Dynamic Navigation Components ---
const NavGroup = ({ item, isCollapsed, setIsCollapsed, pathname }) => {
    const isActive = item.items.some((sub: any) => pathname === sub.href || (sub.href !== "/" && pathname.startsWith(sub.href + "/")));
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
                "group flex w-full items-center gap-3.5 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-colors duration-200 mb-1",
                "text-white/90 hover:bg-white hover:text-[#376bae] hover:font-bold",
                isActive ? "bg-white text-[#376bae] shadow-md opacity-100" : "opacity-90",
                isCollapsed && "justify-center px-0"
            )}
        >
            <item.icon className={cn("h-5 w-5 shrink-0 transition-colors duration-200", isActive ? "text-[#376bae]" : "text-white/90 group-hover:text-[#376bae]")} />
            {!isCollapsed && (
                <>
                    <span className="flex-1 text-left truncate">{item.title}</span>
                    {isOpen ? <ChevronDown className="h-4 w-4 opacity-70" /> : <ChevronRight className="h-4 w-4 opacity-70" />}
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
                <div className="ml-[22px] mt-1 mb-2 flex flex-col space-y-1 border-l border-white/20 pl-4">
                    {item.items.map((sub: any) => {
                        const isSubActive = pathname === sub.href || (sub.href !== "/" && pathname.startsWith(sub.href + "/"));
                        return (
                            <Link
                                key={sub.href}
                                href={sub.href}
                                className={cn(
                                    "py-2 text-[12px] transition-all duration-200",
                                    isSubActive 
                                      ? "text-[#376bae] bg-white rounded-md pl-2 font-bold shadow-md" 
                                      : "text-white/70 hover:opacity-100 hover:bg-white/10 hover:text-white px-2 rounded-md"
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
                "group relative flex items-center gap-3.5 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-colors duration-200 mb-1",
                "text-white/90 hover:bg-white hover:text-[#376bae] hover:font-bold",
                active ? "bg-white text-[#376bae] rounded-md font-bold shadow-md opacity-100" : "opacity-90",
                isCollapsed && "justify-center px-0"
            )}
        >
            <item.icon className={cn("h-5 w-5 shrink-0 transition-colors duration-200", active ? "text-[#376bae]" : "text-white/90 group-hover:text-[#376bae]")} />
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
    const { openMobile, setOpenMobile, isMobile } = useSidebar();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSigningOut, setIsSigningOut] = useState(false);

    const { user, loading } = useCurrentUser();

    useEffect(() => setMounted(true), []);

    // Collapse-to-icon mode only makes sense for the persistent desktop sidebar;
    // never leave it applied when we fall back into the mobile off-canvas drawer.
    useEffect(() => {
        if (isMobile && isCollapsed) setIsCollapsed(false);
    }, [isMobile]);

    // Close the mobile drawer whenever the route changes.
    useEffect(() => {
        setOpenMobile(false);
    }, [pathname]);

    // Lock background scroll while the mobile drawer is open.
    useEffect(() => {
        if (!isMobile) return;
        document.body.style.overflow = openMobile ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [isMobile, openMobile]);

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
            console.error("Logout failed:", error);
        }
    };

    const utilityButtonClass = cn(
        "flex w-full items-center gap-3.5 rounded-lg px-4 py-2.5 text-[12px] font-medium transition-all",
        "text-white/80 hover:opacity-100 hover:bg-white/10 hover:text-white",
        isCollapsed && "justify-center px-0"
    );

    return (
        <TooltipProvider delayDuration={100}>
            <aside
                onClick={() => { if (!isMobile && isCollapsed) setIsCollapsed(false); }}
                className={cn(
                    "fixed inset-y-0 left-0 z-40 flex h-screen flex-col bg-gradient-to-b from-[#376bae] to-[#1a365d] text-white transition-all duration-300 ease-in-out md:sticky md:top-0 shadow-xl border-r border-[#1a365d]/50",
                    isCollapsed ? "w-[70px]" : "w-[240px]",
                    isCollapsed && "cursor-pointer",
                    openMobile ? "translate-x-0" : "-translate-x-full md:translate-x-0"
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
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                                <Image
                                    src="/BCL logo.png"
                                    alt="BCL Tasks"
                                    width={34}
                                    height={34}
                                    className="object-contain"
                                />
                            </div>

                            {/* Company Name */}
                            {!isCollapsed && (
                                <div className="flex flex-col justify-center min-w-0">
                                    <div className="truncate text-[16px] font-bold leading-tight text-white">
                                        BCL Task Manager
                                    </div>
                                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                                        Booksmart
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Collapse Toggle Button (desktop) / Close Button (mobile) */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => (isMobile ? setOpenMobile(false) : setIsCollapsed(!isCollapsed))}
                            className={cn(
                                "shrink-0 text-white hover:bg-white/20 hover:text-white transition-colors",
                                isCollapsed ? "h-10 w-10" : "h-8 w-8"
                            )}
                        >
                            {isMobile ? (
                                <X className="h-5 w-5" />
                            ) : isCollapsed ? (
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
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                        <Input
                            type="text"
                            placeholder="Search modules..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-10 rounded-lg shadow-sm border border-white/20 bg-white/10 pl-9 text-sm text-white placeholder:text-white/60 focus:bg-white/20 focus:ring-white/30 focus:border-transparent transition-all"
                        />
                    </div>
                )}

                {/* Navigation Content */}
                <div className={cn("sidebar-scroll mt-4 flex-1 overflow-y-auto px-3 pb-4", isCollapsed && "px-2")}>
                    {loading ? (
                        <div className="flex items-center justify-center py-10 opacity-70 text-sm text-white">
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
                <div className={cn("mt-auto p-4 border-t border-white/20", isCollapsed && "p-2")}>
                    <div className="flex flex-col gap-1">
                        <NavItemComponent isCollapsed={isCollapsed} href="/dashboard/settings/access-controls" icon={Settings} label="Settings" className={utilityButtonClass} />

                        {mounted && (
                            <button className={cn(utilityButtonClass, "mb-2")} onClick={toggleTheme}>
                                {theme === "dark" ? <Sun className="h-5 w-5 opacity-80" /> : <Moon className="h-5 w-5 opacity-80" />}
                                {!isCollapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
                            </button>
                        )}
                    </div>

                    {/* User Badge */}
                    {!loading && user && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className={cn(
                                    "flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/10 hover:shadow-md transition-colors outline-none",
                                    isCollapsed && "justify-center px-0"
                                )}>
                                    <div className="h-11 w-11 shrink-0 flex items-center justify-center rounded-full bg-white text-lg font-bold text-[#376bae] shadow-sm">
                                        {getInitials(user)}
                                    </div>
                                    {!isCollapsed && (
                                        <>
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="text-[12px] font-semibold text-white truncate leading-tight">
                                                    {user.displayName || user.name}
                                                </span>
                                                <span className="text-[10px] text-white/70 truncate uppercase tracking-tighter">
                                                    {user.role?.replace(/_/g, " ")}
                                                </span>
                                            </div>
                                            <ChevronDown className="h-3 w-3 text-white/60 shrink-0" />
                                        </>
                                    )}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align={isCollapsed ? "center" : "end"}
                                side={isCollapsed ? "right" : "top"}
                                sideOffset={12}
                                className="w-56 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] shadow-xl p-1"
                            >
                                <DropdownMenuLabel className="font-normal px-3 py-2">
                                    <div className="flex flex-col space-y-0.5">
                                        <p className="text-xs font-semibold leading-none text-[hsl(var(--sidebar-foreground))]">{user.displayName || user.name}</p>
                                        <p className="text-[10px] leading-none text-[hsl(var(--sidebar-foreground))] opacity-50">{user.email || ""}</p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-[hsl(var(--sidebar-border))]" />
                                <DropdownMenuItem asChild className="rounded-lg cursor-pointer text-xs py-2 focus:bg-[hsl(var(--sidebar-accent))] focus:text-[hsl(var(--sidebar-accent-foreground))]">
                                    <Link href="/dashboard/settings/access-controls" className="flex items-center gap-2.5">
                                        <Settings className="w-3.5 h-3.5 opacity-70" /> Settings
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-[hsl(var(--sidebar-border))]" />
                                <DropdownMenuItem
                                    onClick={handleSignOut}
                                    className="text-red-600 rounded-lg cursor-pointer text-xs py-2 flex items-center gap-2.5 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-950/30"
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
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="flex min-w-[240px] items-center gap-3 rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] px-5 py-3 shadow-2xl text-[hsl(var(--sidebar-foreground))] font-semibold text-sm">
                        <div className="w-4 h-4 border-2 border-[hsl(var(--sidebar-primary))] border-t-transparent rounded-full animate-spin" />
                        Signing out...
                    </div>
                </div>
            )}

            {openMobile && (
                <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setOpenMobile(false)} />
            )}
        </TooltipProvider>
    );
};

const NavItemComponent = ({ isCollapsed, href, icon: Icon, label, className }) => {
    const content = (
        <Link href={href} className={className}>
            <Icon className="h-5 w-5 shrink-0 opacity-80" />
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
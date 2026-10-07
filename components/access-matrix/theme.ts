// Visual theme for the access-matrix kit — the ONLY file that differs between apps.
// This copy: Task Manager, matching the KRA Email Center (dashboard/emails): text-base,
// h-10 controls, slate palette, custom-blue accents and the #376bae table header.

export const theme = {
  button:
    "inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-base font-medium shadow-none transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:shrink-0",
  buttonDefault: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  buttonPrimary: "border-custom-blue bg-custom-blue text-white hover:bg-custom-blue/90",
  buttonDanger: "border-red-200 text-red-700 hover:bg-red-50",
  compactButton: "h-9 rounded-full px-3 [&_svg]:h-4 [&_svg]:w-4",

  input:
    "h-10 w-full rounded-md border border-slate-200 bg-white pl-10 pr-8 text-base shadow-none outline-none placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-custom-blue",
  inputIcon: "left-3 h-5 w-5 text-slate-400",
  searchWidth: "max-w-sm",

  tabList: "inline-flex h-auto flex-wrap items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-100/90 p-1",
  tab: "group inline-flex h-10 items-center gap-2 rounded-md px-4 text-base font-medium transition-all",
  tabActive: "bg-custom-blue text-white shadow-xs",
  tabInactive: "text-slate-600 hover:bg-white/70 hover:text-slate-900",
  tabCountInBrackets: false,
  tabCount:
    "inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-slate-200 px-1.5 py-0.5 text-sm font-semibold leading-none tabular-nums text-slate-700 group-aria-selected:bg-white/20 group-aria-selected:text-white",
  subTabList: "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1",
  subTab: "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-base font-medium transition-colors",
  subTabActive: "bg-custom-blue text-white",

  pickerButton:
    "inline-flex h-10 w-80 items-center justify-between rounded-md border border-slate-200 bg-white px-3.5 text-base text-slate-700 hover:bg-slate-50",
  pickerItem: "text-base",

  tableWrap: "flex h-full min-h-[500px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white",
  toolbar: "flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/60 px-4 py-2",
  th: "select-none whitespace-nowrap border-b border-r border-white/20 bg-[#376bae] px-3 py-2.5 text-base font-semibold text-white last:border-r-0",
  thGroup:
    "whitespace-nowrap border-b border-r-2 border-white/20 bg-[#376bae] px-3 py-2 text-center text-sm font-bold uppercase tracking-wide text-white",
  controlsCell: "border-b border-r border-slate-200/80 bg-slate-50 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-slate-500 last:border-r-0",
  td: "border-b border-r border-slate-200/70 px-3 py-3 text-base text-slate-700 transition-colors last:border-r-0",
  rowEven: "bg-white",
  rowOdd: "bg-slate-50/60",
  sectionLabel: "font-semibold text-slate-900",
  sectionDetail: "text-sm text-slate-500",
  empty: "px-4 py-16 text-center text-base text-slate-400",

  footer: "flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5",
  footerText: "text-base text-slate-500",
  footerStrong: "font-semibold text-slate-900",
  footerSelect:
    "h-10 cursor-pointer rounded-md border border-slate-200 bg-white px-2 text-base font-medium text-slate-700 outline-none focus:ring-1 focus:ring-custom-blue",
  pageButton: "min-w-[40px] justify-center px-3 font-semibold",
  pageArrow: "w-10 justify-center px-0",

  checkbox: "h-5 w-5 cursor-pointer rounded accent-[#376bae] disabled:cursor-not-allowed disabled:opacity-50",
  hint: "text-base text-slate-500",
  hintStrong: "font-semibold text-slate-900",
};

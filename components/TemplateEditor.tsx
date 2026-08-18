// @ts-nocheck
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import FontSize from '@tiptap/extension-font-size';
import FontFamily from '@tiptap/extension-font-family';

// --- ROBUST IMPORTS START ---
// We import the entire module to handle different build systems (ESM vs CJS) safely
import * as ImageModule from '@tiptap/extension-image';
import * as TableModule from '@tiptap/extension-table';
import * as TableRowModule from '@tiptap/extension-table-row';
import * as TableCellModule from '@tiptap/extension-table-cell';
import * as TableHeaderModule from '@tiptap/extension-table-header';
// --- ROBUST IMPORTS END ---

import {
  Bold, Italic, Underline as UnderlineIcon, Highlighter, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Code2, Pilcrow, Heading1, Heading2,
  Image as ImageIcon, Table as TableIcon, Trash2, Plus, Minus, Split, Merge,
  PaintBucket, Palette, Ban, Type, Text, TextSize
} from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCallback, useEffect, useMemo, useState } from 'react';

interface TemplateEditorProps {
  initialContent?: string;
  headerContent?: string;
  footerContent?: string;
  onChange?: (content: {
    html: string;
    header?: string;
    footer?: string;
    placeholders?: string[];
  }) => void;
  onBlur?: () => void;
  className?: string;
  showHeaderFooterControls?: boolean;
}

const ToolbarButton = ({ onClick, isActive, tooltip, children, className = "" }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={onClick}
        className={`p-2 rounded-md transition-colors ${isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          } ${className}`}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent><p>{tooltip}</p></TooltipContent>
  </Tooltip>
);

const ToolbarSelect = ({ value, options, onChange, tooltip, className = "" }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 px-2 py-1 text-sm rounded-md border border-border bg-background text-foreground ${className}`}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </TooltipTrigger>
    <TooltipContent><p>{tooltip}</p></TooltipContent>
  </Tooltip>
);

const sanitizeClassName = (cls: string | undefined): string => {
  if (!cls) return '';
  return String(cls).replace(/\s+/g, ' ').trim();
};

export default function TemplateEditor({
  initialContent = '',
  headerContent: initialHeader = '',
  footerContent: initialFooter = '',
  onChange,
  onBlur,
  className = '',
  showHeaderFooterControls = true
}: TemplateEditorProps) {
  const [showHeader, setShowHeader] = useState(!!initialHeader);
  const [showFooter, setShowFooter] = useState(!!initialFooter);
  const [headerContent, setHeaderContent] = useState(initialHeader);
  const [footerContent, setFooterContent] = useState(initialFooter);
  const editorClassName = `template-editor border rounded-md flex flex-col h-full overflow-hidden min-h-[400px] ${sanitizeClassName(className)}`.trim();

  // Initialize header/footer from initial props
  useEffect(() => {
    if (initialHeader) setHeaderContent(initialHeader);
    if (initialFooter) setFooterContent(initialFooter);
  }, [initialHeader, initialFooter]);

  // --- SMART EXTENSION RESOLVER ---
  // This memoized block ensures we find the actual Extension object regardless of how webpack packed it
  const extensions = useMemo(() => {
    const resolve = (mod: any, name: string) => {
      if (!mod) return null;
      // 1. Try named export (e.g. TableModule.Table)
      if (mod[name]) return mod[name];
      // 2. Try default export (e.g. TableModule.default)
      if (mod.default) return mod.default;
      // 3. Fallback to module itself (CommonJS)
      return mod;
    };

    const ImageExt = resolve(ImageModule, 'Image');
    const TableExt = resolve(TableModule, 'Table');
    const TableRowExt = resolve(TableRowModule, 'TableRow');
    const TableCellExt = resolve(TableCellModule, 'TableCell');
    const TableHeaderExt = resolve(TableHeaderModule, 'TableHeader');

    // Table design tools (cell background, table border style/width/color)
    // need attributes TipTap's table extensions don't ship with - added via
    // .extend() rather than a separate extension file, since this editor is
    // their only consumer. Each renderHTML below returns just its own style
    // fragment; TipTap's mergeAttributes concatenates multiple attributes'
    // 'style' results into one combined style string automatically, so
    // these don't need to be aware of each other.
    const TableCellWithBg = TableCellExt?.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) =>
              attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
          },
        };
      },
    });

    const TableHeaderWithBg = TableHeaderExt?.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          backgroundColor: {
            default: null,
            parseHTML: (element) => element.style.backgroundColor || null,
            renderHTML: (attributes) =>
              attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
          },
        };
      },
    });

    // Border customization is table-level (applies to the whole table via
    // its own attrs) rather than per-cell - simpler to reason about and to
    // build a toolbar for than tracking borders per individual cell edge.
    const TableWithBorder = TableExt?.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          borderColor: {
            default: null,
            parseHTML: (element) => element.style.borderColor || null,
            renderHTML: (attributes) =>
              attributes.borderColor ? { style: `border-color: ${attributes.borderColor}` } : {},
          },
          borderWidthPx: {
            default: null,
            parseHTML: (element) => (element.style.borderWidth ? parseInt(element.style.borderWidth, 10) : null),
            renderHTML: (attributes) =>
              attributes.borderWidthPx ? { style: `border-width: ${attributes.borderWidthPx}px` } : {},
          },
          tableBorderStyle: {
            default: null,
            parseHTML: (element) => element.style.borderStyle || null,
            renderHTML: (attributes) =>
              attributes.tableBorderStyle ? { style: `border-style: ${attributes.tableBorderStyle}` } : {},
          },
        };
      },
    });

    return [
      StarterKit.configure({ underline: false }),
      Underline.configure({ HTMLAttributes: { class: 'underline' } }),
      // tableCell/tableHeader added so the existing align buttons also work
      // as a "column alignment" tool - selecting a column (click-drag across
      // its cells) and clicking Align Center sets textAlign on both the
      // cells and their paragraphs, not just whichever paragraph the cursor
      // happened to be in.
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start writing your letter template here…' }),

      // Text formatting extensions
      TextStyle,
      FontSize,
      FontFamily,

      // Configure Image if resolved
      ImageExt ? ImageExt.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: { class: 'rounded-lg border border-border max-w-full' },
      }) : undefined,

      // Configure Table if resolved
      TableWithBorder ? TableWithBorder.configure({
        resizable: true,
        HTMLAttributes: { class: 'border-collapse table-auto w-full' },
      }) : undefined,

      TableRowExt,
      TableHeaderWithBg,
      TableCellWithBg,
    ].filter(Boolean); // Filter out any null/undefined entries
  }, []);

  // Extract placeholders from content
  const extractPlaceholders = useCallback((content: string): string[] => {
    // Match placeholders in the format {{placeholder_name}}
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!matches.includes(match[1])) {
        matches.push(match[1]);
      }
    }
    return matches;
  }, []);

  const handleContentChange = useCallback((content: string) => {
    if (!onChange) return;

    // Extract placeholders from all content sections
    const mainPlaceholders = extractPlaceholders(content);
    const headerPlaceholders = showHeader ? extractPlaceholders(headerContent) : [];
    const footerPlaceholders = showFooter ? extractPlaceholders(footerContent) : [];

    // Combine and deduplicate placeholders
    const allPlaceholders = [
      ...new Set([...mainPlaceholders, ...headerPlaceholders, ...footerPlaceholders])
    ];

    // Notify parent component of content changes with all placeholders
    onChange({
      html: content,
      ...(showHeader && { header: headerContent }),
      ...(showFooter && { footer: footerContent }),
      placeholders: allPlaceholders
    });
  }, [onChange, showHeader, showFooter, headerContent, footerContent, extractPlaceholders]);

  const editor = useEditor({
    extensions,
    content: initialContent,
    onUpdate: ({ editor }) => {
      handleContentChange(editor.getHTML());
    },
    onBlur: () => {
      onBlur && onBlur();
    },
    editorProps: {
      attributes: {
        // Paragraph spacing is pinned to a fixed px value instead of relying
        // on prose/prose-sm's default em-based margins - those scale with
        // whatever font-size happens to be ambient at the mount point, which
        // can silently differ between contexts this same shared editor is
        // used in (a full-page Card here, a Dialog in ClauseDialog.tsx),
        // making one Enter press look like a different amount of space
        // depending on where the editor is mounted. Fixed px keeps a single
        // paragraph break visually consistent everywhere this component is
        // used. Mirrors the same override the live preview renderer
        // (TemplateGenerationDialog.tsx's EDITOR_PREVIEW_STYLES) already
        // applies for the same reason.
        class: `
          prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none px-4 pt-0 pb-4 min-h-[200px]
          [&_p]:mt-0 [&_p]:mb-3 [&_p]:leading-normal
          [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:my-4
          [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left
          [&_td]:border [&_td]:border-border [&_td]:p-2 relative
        `.replace(/\s+/g, ' ').trim(),
      },
      handleKeyDown: ({ event, editor }) => {
        // Handle Tab for indentation (like Word)
        if (event.key === 'Tab') {
          event.preventDefault();
          if (event.shiftKey) {
            // Shift+Tab = Outdent
            return editor.chain().focus().outdent().run();
          } else {
            // Tab = Indent
            return editor.chain().focus().indent().run();
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
  });

  // --- HANDLERS ---
  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL');
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;

    // CRITICAL FIX: Check if the command exists inside the editor commands object
    // "insertTable" will be undefined if the extension failed to load
    const canInsert = editor.commands.insertTable;

    if (!canInsert) {
      alert("Table functionality is not available. Please check if @tiptap/extension-table is installed.");
      console.error("Missing Table extension command. Installed extensions:", editor.extensionManager.extensions.map(e => e.name));
      return;
    }

    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  // Applies to whichever of tableCell/tableHeader the current selection
  // actually contains - updateAttributes is a no-op if the selection has no
  // node of that type, so calling both unconditionally is safe even when a
  // selection is only cells or only header cells.
  const setCellBackground = useCallback((color: string | null) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('tableCell', { backgroundColor: color }).updateAttributes('tableHeader', { backgroundColor: color }).run();
  }, [editor]);

  const setTableBorder = useCallback((patch: { borderColor?: string | null; borderWidthPx?: number | null; tableBorderStyle?: string | null }) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('table', patch).run();
  }, [editor]);

  const currentTableAttrs = editor?.getAttributes('table') || {};
  const currentCellAttrs = editor?.isActive('tableHeader')
    ? editor.getAttributes('tableHeader')
    : editor?.getAttributes('tableCell') || {};

  if (!editor) return null;

  const handleHeaderChange = (content: string) => {
    setHeaderContent(content);
    if (editor) {
      // Trigger content change to update placeholders
      handleContentChange(editor.getHTML());
    } else {
      // If editor isn't ready yet, just notify with empty content
      handleContentChange('');
    }
  };

  const handleFooterChange = (content: string) => {
    setFooterContent(content);
    if (editor) {
      // Trigger content change to update placeholders
      handleContentChange(editor.getHTML());
    } else {
      // If editor isn't ready yet, just notify with empty content
      handleContentChange('');
    }
  };

  const toggleHeader = () => {
    const newShowHeader = !showHeader;
    setShowHeader(newShowHeader);
    // If we're hiding the header, we need to update placeholders
    if (!newShowHeader && editor) {
      handleContentChange(editor.getHTML());
    }
  };

  const toggleFooter = () => {
    const newShowFooter = !showFooter;
    setShowFooter(newShowFooter);
    // If we're hiding the footer, we need to update placeholders
    if (!newShowFooter && editor) {
      handleContentChange(editor.getHTML());
    }
  };

  const toolbarItems = [
    ...(showHeaderFooterControls ? [
      {
        name: 'header',
        tooltip: showHeader ? 'Hide Header' : 'Show Header',
        icon: <span className="font-bold">H</span>,
        action: toggleHeader,
        isActive: showHeader
      },
      {
        name: 'footer',
        tooltip: showFooter ? 'Hide Footer' : 'Show Footer',
        icon: <span className="font-bold">F</span>,
        action: toggleFooter,
        isActive: showFooter
      },
      { type: 'divider' }
    ] : []),
    { name: 'bold', tooltip: 'Bold', icon: <Bold className="h-4 w-4" />, action: () => editor.chain().focus().toggleBold().run() },
    { name: 'italic', tooltip: 'Italic', icon: <Italic className="h-4 w-4" />, action: () => editor.chain().focus().toggleItalic().run() },
    { name: 'underline', tooltip: 'Underline', icon: <UnderlineIcon className="h-4 w-4" />, action: () => editor.chain().focus().toggleUnderline().run() },
    { name: 'highlight', tooltip: 'Highlight', icon: <Highlighter className="h-4 w-4" />, action: () => editor.chain().focus().toggleHighlight().run() },
    { type: 'divider' },
    { name: 'heading', level: 1, tooltip: 'Heading 1', icon: <Heading1 className="h-4 w-4" />, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { name: 'heading', level: 2, tooltip: 'Heading 2', icon: <Heading2 className="h-4 w-4" />, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { name: 'paragraph', tooltip: 'Paragraph', icon: <Pilcrow className="h-4 w-4" />, action: () => editor.chain().focus().setParagraph().run() },
    { type: 'divider' },
    { name: 'bulletList', tooltip: 'Bullet List', icon: <List className="h-4 w-4" />, action: () => editor.chain().focus().toggleBulletList().run() },
    { name: 'orderedList', tooltip: 'Numbered List', icon: <ListOrdered className="h-4 w-4" />, action: () => editor.chain().focus().toggleOrderedList().run() },
    { type: 'divider' },
    { name: 'alignLeft', tooltip: 'Align Left', icon: <AlignLeft className="h-4 w-4" />, action: () => editor.chain().focus().setTextAlign('left').run() },
    { name: 'alignCenter', tooltip: 'Align Center', icon: <AlignCenter className="h-4 w-4" />, action: () => editor.chain().focus().setTextAlign('center').run() },
    { name: 'alignRight', tooltip: 'Align Right', icon: <AlignRight className="h-4 w-4" />, action: () => editor.chain().focus().setTextAlign('right').run() },
    { type: 'divider' },
    { name: 'image', tooltip: 'Insert Image', icon: <ImageIcon className="h-4 w-4" />, action: addImage },
    { name: 'table', tooltip: 'Insert Table', icon: <TableIcon className="h-4 w-4" />, action: insertTable },
    { type: 'divider' },
    { name: 'placeholder', tooltip: 'Insert Placeholder', icon: <Code2 className="h-4 w-4" />, action: () => editor.chain().focus().insertContent('<strong>{{variable_name}}</strong> ').run() },
    { type: 'divider' },
    // Font Size Selector
    {
      name: 'fontSize',
      tooltip: 'Font Size',
      type: 'select',
      options: [
        { value: '10', label: '10px' },
        { value: '12', label: '12px' },
        { value: '14', label: '14px' },
        { value: '16', label: '16px' },
        { value: '18', label: '18px' },
        { value: '20', label: '20px' },
        { value: '24', label: '24px' },
        { value: '28', label: '28px' },
        { value: '32', label: '32px' },
        { value: '36', label: '36px' },
      ],
      getValue: () => editor.getAttributes('textStyle').fontSize || '',
      onChange: (size: string) => {
        if (size) {
          editor.chain().focus().setFontSize(size).run();
        } else {
          editor.chain().focus().unsetFontSize().run();
        }
      }
    },
    // Font Family Selector
    {
      name: 'fontFamily',
      tooltip: 'Font Family',
      type: 'select',
      options: [
        { value: 'system-ui', label: 'System UI' },
        { value: 'serif', label: 'Serif' },
        { value: 'monospace', label: 'Monospace' },
        { value: 'Georgia, serif', label: 'Georgia' },
        { value: '"Times New Roman", serif', label: 'Times New Roman' },
        { value: 'Arial, sans-serif', label: 'Arial' },
        { value: 'Helvetica, sans-serif', label: 'Helvetica' },
        { value: '"Courier New", monospace', label: 'Courier New' },
      ],
      getValue: () => editor.getAttributes('textStyle').fontFamily || '',
      onChange: (family: string) => {
        if (family) {
          editor.chain().focus().setFontFamily(family).run();
        } else {
          editor.chain().focus().unsetFontFamily().run();
        }
      }
    },
  ];

  return (
    <div className={editorClassName}>
      <TooltipProvider>
        {/* Main Toolbar */}
        <div className="flex flex-wrap items-center gap-2 p-2 border-b bg-muted/50">
          {toolbarItems.map((item, index) => {
            if (item.type === 'divider') {
              return <div key={`divider-${index}`} className="w-px h-8 bg-border mx-1" />;
            }

            // Handle select-type toolbar items
            if (item.type === 'select') {
              const currentValue = item.getValue ? item.getValue() : '';
              return (
                <div key={item.name} className="flex items-center gap-1">
                  <label className="text-xs text-muted-foreground mr-1">{item.tooltip}</label>
                  <ToolbarSelect
                    value={currentValue}
                    options={item.options}
                    onChange={item.onChange}
                    className="w-36"
                  />
                </div>
              );
            }

            const isActive = item.name === 'heading'
              ? editor.isActive('heading', { level: item.level })
              : item.name === 'header' || item.name === 'footer'
                ? item.isActive
                : editor.isActive(item.name);

            return (
              <ToolbarButton
                key={item.name + (item.level || '')}
                onClick={item.action}
                isActive={isActive}
                tooltip={item.tooltip}
              >
                {item.icon}
              </ToolbarButton>
            );
          })}
        </div>

        {/* Table Specific Toolbar (Only visible when table is active) */}
        {editor.isActive('table') && (
          <div className="p-1 flex flex-wrap items-center gap-1 bg-muted/30 border-b text-xs">
            <span className="text-muted-foreground ml-2 mr-2 font-medium text-xs">Table:</span>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnBefore().run()} tooltip="Add Column Before">
              <div className="flex"><Plus className="h-3 w-3" /><span className="text-[10px]">Col Left</span></div>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addColumnAfter().run()} tooltip="Add Column After">
              <div className="flex"><Plus className="h-3 w-3" /><span className="text-[10px]">Col Right</span></div>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteColumn().run()} tooltip="Delete Column">
              <div className="flex"><Minus className="h-3 w-3" /><span className="text-[10px]">Col</span></div>
            </ToolbarButton>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarButton onClick={() => editor.chain().focus().addRowBefore().run()} tooltip="Add Row Before">
              <div className="flex"><Plus className="h-3 w-3" /><span className="text-[10px]">Row Up</span></div>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().addRowAfter().run()} tooltip="Add Row After">
              <div className="flex"><Plus className="h-3 w-3" /><span className="text-[10px]">Row Down</span></div>
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().deleteRow().run()} tooltip="Delete Row">
              <div className="flex"><Minus className="h-3 w-3" /><span className="text-[10px]">Row</span></div>
            </ToolbarButton>
            <div className="w-[1px] h-4 bg-border mx-1" />
            <ToolbarButton onClick={() => editor.chain().focus().mergeCells().run()} tooltip="Merge Cells">
              <Merge className="h-3 w-3" />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().splitCell().run()} tooltip="Split Cell">
              <Split className="h-3 w-3" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              tooltip="Delete Table"
              className="text-red-500 hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </ToolbarButton>
            <div className="w-[1px] h-4 bg-border mx-1" />

            {/* Cell background - applies to whichever cell(s)/header(s) the
            current selection contains (see setCellBackground). Alignment for
            a selected column reuses the main toolbar's Align Left/Center/
            Right buttons - tableCell/tableHeader are now valid TextAlign
            target types (see extensions above), so those buttons already
            work here. */}
            <span className="text-muted-foreground mr-1 font-medium text-[10px] flex items-center gap-1">
              <PaintBucket className="h-3 w-3" /> Cell:
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="p-1 rounded-md cursor-pointer hover:bg-accent flex items-center">
                  <input
                    type="color"
                    value={currentCellAttrs.backgroundColor || '#ffffff'}
                    onChange={(e) => setCellBackground(e.target.value)}
                    className="w-5 h-5 rounded border border-border cursor-pointer p-0 bg-transparent"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent><p>Cell Background Color</p></TooltipContent>
            </Tooltip>
            <ToolbarButton onClick={() => setCellBackground(null)} tooltip="Clear Cell Background">
              <Ban className="h-3 w-3" />
            </ToolbarButton>
            <div className="w-[1px] h-4 bg-border mx-1" />

            {/* Table border - applies to the whole table, not per-cell. */}
            <span className="text-muted-foreground mr-1 font-medium text-[10px] flex items-center gap-1">
              <Palette className="h-3 w-3" /> Border:
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <label className="p-1 rounded-md cursor-pointer hover:bg-accent flex items-center">
                  <input
                    type="color"
                    value={currentTableAttrs.borderColor || '#94a3b8'}
                    onChange={(e) => setTableBorder({ borderColor: e.target.value })}
                    className="w-5 h-5 rounded border border-border cursor-pointer p-0 bg-transparent"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent><p>Border Color</p></TooltipContent>
            </Tooltip>
            <select
              value={currentTableAttrs.borderWidthPx || ''}
              onChange={(e) => setTableBorder({ borderWidthPx: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="h-6 text-[10px] rounded border border-border bg-background px-1"
              title="Border Width"
            >
              <option value="">Width</option>
              <option value="1">1px</option>
              <option value="2">2px</option>
              <option value="3">3px</option>
              <option value="4">4px</option>
            </select>
            <select
              value={currentTableAttrs.tableBorderStyle || ''}
              onChange={(e) => setTableBorder({ tableBorderStyle: e.target.value || null })}
              className="h-6 text-[10px] rounded border border-border bg-background px-1"
              title="Border Style"
            >
              <option value="">Style</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="double">Double</option>
            </select>
            <ToolbarButton
              onClick={() => setTableBorder({ borderColor: null, borderWidthPx: null, tableBorderStyle: null })}
              tooltip="Reset Border to Default"
            >
              <Ban className="h-3 w-3" />
            </ToolbarButton>
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          {showHeader && (
            <div className="border-b border-border">
              <div className="text-xs text-muted-foreground px-4 py-1 bg-muted/30">
                Header
              </div>
              <div
                className="p-2 min-h-[60px] max-h-[200px] overflow-auto"
                dangerouslySetInnerHTML={{ __html: headerContent }}
                onClick={() => {
                  const newContent = prompt('Edit header content:', headerContent);
                  if (newContent !== null) {
                    handleHeaderChange(newContent);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
            </div>
          )}

          <div className="flex-1 overflow-auto">
            <EditorContent editor={editor} className="h-full" />
          </div>

          {showFooter && (
            <div className="border-t border-border">
              <div className="text-xs text-muted-foreground px-4 py-1 bg-muted/30 text-right">
                Footer
              </div>
              <div
                className="p-2 min-h-[60px] max-h-[200px] overflow-auto"
                dangerouslySetInnerHTML={{ __html: footerContent }}
                onClick={() => {
                  const newContent = prompt('Edit footer content:', footerContent);
                  if (newContent !== null) {
                    handleFooterChange(newContent);
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
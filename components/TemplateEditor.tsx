// @ts-nocheck
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';

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
  Image as ImageIcon, Table as TableIcon, Trash2, Plus, Minus, Split, Merge
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

    return [
      StarterKit.configure({ underline: false }),
      Underline.configure({ HTMLAttributes: { class: 'underline' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start writing your letter template here…' }),

      // Configure Image if resolved
      ImageExt ? ImageExt.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: { class: 'rounded-lg border border-border max-w-full' },
      }) : undefined,

      // Configure Table if resolved
      TableExt ? TableExt.configure({
        resizable: true,
        HTMLAttributes: { class: 'border-collapse table-auto w-full' },
      }) : undefined,

      TableRowExt,
      TableHeaderExt,
      TableCellExt,
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
        class: `
          prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none px-4 pt-0 pb-4 min-h-[200px]
          [&_table]:border-collapse [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:my-4
          [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_th]:text-left
          [&_td]:border [&_td]:border-border [&_td]:p-2 relative
        `.replace(/\s+/g, ' ').trim(),
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
  ];

  return (
    <div className={editorClassName}>
      <TooltipProvider>
        <div className="flex flex-wrap gap-1 p-2 border-b bg-muted/50">
          {toolbarItems.map((item, index) => {
            if (item.type === 'divider') {
              return <div key={`divider-${index}`} className="w-px h-8 bg-border mx-1" />;
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
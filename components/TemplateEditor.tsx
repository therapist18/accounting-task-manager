    // @ts-nocheck
    'use client';

    import { useEditor, EditorContent } from '@tiptap/react';
    import StarterKit from '@tiptap/starter-kit';
    import TextAlign from '@tiptap/extension-text-align';
    import Highlight from '@tiptap/extension-highlight';
    import Placeholder from '@tiptap/extension-placeholder';
    import Underline from '@tiptap/extension-underline';
    import {
    Bold, Italic, Underline as UnderlineIcon, Highlighter, List, ListOrdered,
    AlignLeft, AlignCenter, AlignRight, Code2, Pilcrow, Heading1, Heading2
    } from 'lucide-react';

    import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    } from "@/components/ui/tooltip";

    interface TemplateEditorProps {
    initialContent?: string;
    onChange?: (html: string) => void;
    onBlur?: () => void; // --- MODIFICATION: Add onBlur to props ---
    className?: string;
    }

    const ToolbarButton = ({ onClick, isActive, tooltip, children }) => (
    <Tooltip>
        <TooltipTrigger asChild>
        <button
            type="button"
            onClick={onClick}
            className={`p-2 rounded-md hover:bg-accent hover:text-accent-foreground ${isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
        >
            {children}
        </button>
        </TooltipTrigger>
        <TooltipContent><p>{tooltip}</p></TooltipContent>
    </Tooltip>
    );

    export default function TemplateEditor({ initialContent = '', onChange, onBlur, className }: TemplateEditorProps) {
    const editor = useEditor({
        extensions: [
        StarterKit,
        Underline,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Highlight.configure({ multicolor: true }),
        Placeholder.configure({ placeholder: 'Start writing your letter template here…' }),
        ],
        content: initialContent,
        onUpdate: ({ editor }) => {
        onChange && onChange(editor.getHTML());
        },
        // --- MODIFICATION: Add the onBlur handler ---
        onBlur: () => {
        onBlur && onBlur();
        },
        editorProps: {
        attributes: {
            class: 'prose prose-sm sm:prose-base dark:prose-invert max-w-full focus:outline-none p-4',
        },
        },
        immediatelyRender: false,
    });

    if (!editor) return null;

    // Toolbar configuration remains the same...
    const toolbarItems = [
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
        { name: 'placeholder', tooltip: 'Insert Placeholder', icon: <Code2 className="h-4 w-4" />, action: () => editor.chain().focus().insertContent('<strong>{{variable_name}}</strong> ').run() },
    ];

    return (
        <TooltipProvider delayDuration={100}>
        <div className={`template-editor border rounded-md flex flex-col h-full ${className}`}>
            <div className="toolbar p-2 flex flex-wrap items-center gap-1 bg-muted/50 border-b rounded-t-md">
            {toolbarItems.map((item, index) => (
                item.type === 'divider' ? <div key={index} className="w-[1px] h-6 bg-border mx-1" /> :
                <ToolbarButton key={item.name} onClick={item.action} isActive={
                item.name === 'alignLeft' ? editor.isActive({ textAlign: 'left' }) :
                item.name === 'alignCenter' ? editor.isActive({ textAlign: 'center' }) :
                item.name === 'alignRight' ? editor.isActive({ textAlign: 'right' }) :
                editor.isActive(item.name, item.level ? { level: item.level } : {})
                } tooltip={item.tooltip}>
                {item.icon}
                </ToolbarButton>
            ))}
            </div>
            <div className="flex-1 overflow-auto">
            <EditorContent editor={editor} />
            </div>
        </div>
        </TooltipProvider>
    );
    }
// @ts-nocheck
// Builds a themed, standalone company letterhead .docx (header + footer only,
// no letter body) matching one of the 4 GeneralLetterLayout themes. The body
// contains a single `{BODY}` paragraph so the file plugs straight into both
// existing letterhead-consumption pipelines already in this codebase:
//   - letters/utils/letterheadMerge.ts (docxtemplater `{BODY}` tag)
//   - tasks-requirements/TemplateGenerationDialog.tsx's renderLetterheadDocxBuffer
//     (literal "{BODY}" paragraph text search in word/document.xml)
// Real Word header/footer sections (not floating body images) so they repeat
// on every page automatically.
import {
    Document, Packer, Paragraph, TextRun, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle,
    Header, Footer, ImageRun,
} from 'docx';
import type { LetterTheme } from '../components/GeneralLetterLayout';

export interface LetterheadBuildOptions {
    theme: LetterTheme;
    entityName: string;
    addressLine1?: string;
    addressLine2?: string;
    phone?: string;
    email?: string;
    kraPin?: string;
    regNumber?: string;
    logo?: { data: Uint8Array; type: 'png' | 'jpg' | 'gif' } | null;
}

const PAGE_WIDTH = 11906; // A4 in DXA
const PAGE_HEIGHT = 16838;
const SIDE_MARGIN = 1280;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;

const SLATE_900 = '0F172A';
const SLATE_500 = '64748B';
const BLUE_600 = '2563EB';
const TEAL_400 = '2DD4BF';
const VIOLET_700 = '6D28D9';
const INDIGO_600 = '4F46E5';
const STONE_900 = '1C1917';
const STONE_500 = '78716C';
const FONT = 'Times New Roman';

const safeUpper = (v?: string) => (v ?? '').toUpperCase();

const noBorderSet = () => {
    const b = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return { top: b, bottom: b, left: b, right: b };
};

function themePalette(theme: LetterTheme) {
    if (theme === 'dark-teal') return { bg: SLATE_900, title: 'FFFFFF', accent: TEAL_400, meta: 'CBD5E1', line: TEAL_400 };
    if (theme === 'bold-violet') return { bg: VIOLET_700, title: 'FFFFFF', accent: 'DDD6FE', meta: 'EDE9FE', line: INDIGO_600 };
    if (theme === 'classic-serif') return { bg: 'FFFFFF', title: STONE_900, accent: STONE_500, meta: STONE_500, line: STONE_900 };
    return { bg: 'FFFFFF', title: SLATE_900, accent: BLUE_600, meta: SLATE_500, line: BLUE_600 }; // corporate-blue
}

// ─── Image helper ───────────────────────────────────────────────────────────

export async function fetchImageBytesForLetterhead(url: string): Promise<{ data: Uint8Array; type: 'png' | 'jpg' | 'gif' } | null> {
    if (!url) return null;
    try {
        const type: 'png' | 'jpg' | 'gif' = url.includes('.png') ? 'png' : url.includes('.gif') ? 'gif' : 'jpg';
        if (url.startsWith('data:')) {
            const base64 = url.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return { data: bytes, type };
        }
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        return { data: new Uint8Array(await res.arrayBuffer()), type };
    } catch {
        return null;
    }
}

// ─── Header / Footer builders ───────────────────────────────────────────────

function buildLetterheadHeader(opts: LetterheadBuildOptions): Header {
    const { theme, entityName, addressLine1 = '', addressLine2 = '', phone = '', email = '', logo } = opts;
    const palette = themePalette(theme);

    const logoCellWidth = logo ? 1600 : 0;
    const leftW = logo ? 4400 : 6000;
    const rightW = CONTENT_WIDTH - leftW - logoCellWidth;

    const logoCell = logo
        ? new TableCell({
            width: { size: logoCellWidth, type: WidthType.DXA },
            borders: noBorderSet(),
            shading: { fill: palette.bg },
            verticalAlign: 'center',
            children: [new Paragraph({
                children: [new ImageRun({
                    data: logo.data, type: logo.type,
                    transformation: { width: 60, height: 60 },
                })],
            })],
        })
        : null;

    return new Header({
        children: [
            new Table({
                width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                borders: noBorderSet(),
                rows: [new TableRow({
                    children: [
                        ...(logoCell ? [logoCell] : []),
                        new TableCell({
                            width: { size: leftW, type: WidthType.DXA },
                            borders: noBorderSet(),
                            shading: { fill: palette.bg },
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: safeUpper(entityName || 'Company Name'), font: FONT, size: 44, bold: true, color: palette.title })],
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: rightW, type: WidthType.DXA },
                            borders: noBorderSet(),
                            shading: { fill: palette.bg },
                            children: [
                                ...(addressLine1 ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: addressLine1, font: FONT, size: 20, color: palette.meta })] })] : []),
                                ...(addressLine2 ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: addressLine2, font: FONT, size: 20, color: palette.meta })] })] : []),
                                ...(phone ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `TEL: ${phone}`, font: FONT, size: 20, color: palette.meta })] })] : []),
                                ...(email ? [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: email, font: FONT, size: 20, color: palette.accent })] })] : []),
                            ],
                        }),
                    ],
                })],
            }),
            new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: palette.line, space: 1 } },
                children: [],
            }),
        ],
    });
}

function buildLetterheadFooter(opts: LetterheadBuildOptions): Footer {
    const { theme, entityName, kraPin = '', regNumber = '', addressLine1 = '', addressLine2 = '' } = opts;
    const palette = themePalette(theme);
    const bg = theme === 'dark-teal' ? SLATE_900 : theme === 'bold-violet' ? VIOLET_700 : 'FFFFFF';
    const text = theme === 'dark-teal' || theme === 'bold-violet' ? 'FFFFFF' : theme === 'classic-serif' ? STONE_500 : SLATE_500;
    const accent = theme === 'dark-teal' ? TEAL_400 : theme === 'bold-violet' ? 'DDD6FE' : theme === 'classic-serif' ? STONE_900 : BLUE_600;
    const address = [addressLine1, addressLine2].filter(Boolean).join(', ');

    return new Footer({
        children: [
            new Table({
                width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                borders: noBorderSet(),
                rows: [new TableRow({
                    children: [
                        new TableCell({
                            borders: noBorderSet(),
                            shading: { fill: bg },
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: safeUpper(entityName || 'Company Name'), font: FONT, size: 18, bold: true, color: text })],
                                }),
                                new Paragraph({
                                    children: [new TextRun({
                                        text: [kraPin ? `PIN: ${kraPin}` : '', regNumber ? `REG: ${regNumber}` : '', address].filter(Boolean).join('  |  '),
                                        font: FONT, size: 16, color: accent,
                                    })],
                                }),
                            ],
                        }),
                    ],
                })],
            }),
        ],
    });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function buildLetterheadDocxBlob(opts: LetterheadBuildOptions): Promise<Blob> {
    const doc = new Document({
        styles: {
            default: { document: { run: { font: FONT, size: 24, color: SLATE_900 } } },
        },
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    margin: {
                        top: 1800, right: SIDE_MARGIN, bottom: 1440, left: SIDE_MARGIN,
                        header: 400, footer: 400,
                    },
                },
            },
            headers: { default: buildLetterheadHeader(opts) },
            footers: { default: buildLetterheadFooter(opts) },
            // Single body paragraph carrying the literal "{BODY}" tag that every
            // downstream consumer looks for - see file header comment.
            children: [new Paragraph({ children: [new TextRun({ text: '{BODY}', font: FONT, size: 24, color: SLATE_900 })] })],
        }],
    });

    return Packer.toBlob(doc);
}

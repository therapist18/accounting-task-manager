import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    Table,
    TableRow,
    TableCell,
    WidthType,
    BorderStyle,
    ImageRun,
    UnderlineType,
    Header,
    Footer,
} from 'docx';
import { saveAs } from 'file-saver';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signatory {
    id: string | number;
    name: string;
    position?: string;
    role?: string;
    signatureUrl?: string;
}

interface Company {
    company_name?: string;
    registration_number?: string;
    kra_email_address?: string;
    contact_details?: { email?: string; phone?: string };
}

interface Individual {
    full_name?: string;
    contact_details?: { email?: string; phone?: string };
}

interface Letterhead {
    id: string;
    name: string;
    file_path: string;
    is_default?: boolean;
}

export interface ExportOptions {
    tab: 'companies' | 'individuals';
    letterType: 'kra' | 'general';
    selectedCompany?: Company;
    selectedIndividual?: Individual;
    email: string;
    phone: string;
    letterDate: string;
    reference: string;
    recipient: string;
    subject: string;
    valediction: string;
    activeSignatory?: Signatory;
    useLetterhead?: boolean;
    headerImageUrl?: string;
    footerImageUrl?: string;
    letterheads?: Letterhead[];
    selectedLetterheadId?: string;
    generateLetterWithLetterhead?: (filePath: string, content: object) => Promise<Blob | null>;
    downloadBlob?: (blob: Blob, filename: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 11906; // A4 in DXA (1440 DXA = 1 inch)
const PAGE_HEIGHT = 16838;
const SIDE_MARGIN = 1280; // ~0.89 inch — matches the 25mm CSS p-[25mm] on paperRef
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2; // 9346 DXA

const SLATE_900 = '0F172A';
const SLATE_700 = '334155';
const SLATE_500 = '64748B';
const BLUE_600 = '2563EB';
const FONT = 'Times New Roman';

// ─── Image helpers ────────────────────────────────────────────────────────────

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) return null;
        return new Uint8Array(await res.arrayBuffer());
    } catch { return null; }
}

function guessImageType(url: string): 'png' | 'jpg' | 'gif' {
    if (url.includes('data:image/png') || url.endsWith('.png')) return 'png';
    if (url.includes('data:image/gif') || url.endsWith('.gif')) return 'gif';
    return 'jpg';
}

function dataUriToBytes(dataUri: string): Uint8Array {
    const base64 = dataUri.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function resolveImage(url: string): Promise<{ data: Uint8Array; type: 'png' | 'jpg' | 'gif' } | null> {
    if (!url) return null;
    if (url.startsWith('data:text/html')) return null; // iframe previews — skip
    const type = guessImageType(url);
    if (url.startsWith('data:')) return { data: dataUriToBytes(url), type };
    const data = await fetchImageBytes(url);
    return data ? { data, type } : null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const spacer = (afterPt = 6) =>
    new Paragraph({ spacing: { after: afterPt * 20 } });

const safeUpper = (v?: string) => (v ?? '').toUpperCase();

const noBorderSet = () => {
    const b = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    return { top: b, bottom: b, left: b, right: b };
};

// ─── KRA Word Header section ──────────────────────────────────────────────────
// Styled text — company name centred, email+phone+address below, heavy bottom border.

function buildKRAWordHeader(opts: ExportOptions): Header {
    const { tab, selectedCompany, selectedIndividual, email, phone } = opts;

    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? '')
        : (selectedIndividual?.full_name ?? '');

    const displayEmail = tab === 'companies'
        ? (selectedCompany?.kra_email_address ?? email ?? '')
        : (email ?? '');

    return new Header({
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [new TextRun({
                    text: safeUpper(entityName),
                    font: FONT, size: 52, bold: true, color: SLATE_900,
                })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40 },
                children: [new TextRun({
                    text: `EMAIL: ${displayEmail}    MOBILE NO: ${phone}`,
                    font: FONT, size: 18, bold: true, color: SLATE_700,
                })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 },
                children: [new TextRun({
                    text: 'P.O. BOX 12345 - 00100, NAIROBI, KENYA',
                    font: FONT, size: 18, bold: true, color: SLATE_700,
                })],
            }),
            // Heavy rule — mirrors the 3px border-b in KRALetterLayout
            new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 36, color: SLATE_900, space: 1 } },
                spacing: { after: 0 },
                children: [],
            }),
        ],
    });
}

// ─── General Word Header section ──────────────────────────────────────────────
// Two-column table: company name + ref left | contact details right-aligned.

function buildGeneralWordHeader(opts: ExportOptions): Header {
    const { tab, selectedCompany, selectedIndividual, email, phone, reference } = opts;

    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? '')
        : (selectedIndividual?.full_name ?? '');

    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
    const leftW = 5600;
    const rightW = CONTENT_WIDTH - leftW;

    return new Header({
        children: [
            new Table({
                width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                columnWidths: [leftW, rightW],
                borders: {
                    top: noBorder, bottom: noBorder, left: noBorder,
                    right: noBorder, insideH: noBorder, insideV: noBorder,
                },
                rows: [new TableRow({
                    children: [
                        // Left cell: company name + ref
                        new TableCell({
                            width: { size: leftW, type: WidthType.DXA },
                            borders: cellBorders,
                            margins: { top: 0, bottom: 0, left: 0, right: 100 },
                            children: [
                                new Paragraph({
                                    children: [new TextRun({
                                        text: safeUpper(entityName),
                                        font: FONT, size: 40, bold: true, color: SLATE_900,
                                    })],
                                }),
                                new Paragraph({
                                    children: [new TextRun({
                                        text: `Ref: ${reference}`,
                                        font: FONT, size: 16, bold: true, color: BLUE_600,
                                    })],
                                }),
                            ],
                        }),
                        // Right cell: contact details
                        new TableCell({
                            width: { size: rightW, type: WidthType.DXA },
                            borders: cellBorders,
                            margins: { top: 0, bottom: 0, left: 100, right: 0 },
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT, children: [
                                        new TextRun({ text: 'P.O. BOX 12345 - 00100', font: FONT, size: 16, bold: true, color: SLATE_500 }),
                                    ]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT, children: [
                                        new TextRun({ text: 'NAIROBI, KENYA', font: FONT, size: 16, bold: true, color: SLATE_500 }),
                                    ]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT, children: [
                                        new TextRun({ text: `TEL: ${phone}`, font: FONT, size: 16, bold: true, color: SLATE_500 }),
                                    ]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT, children: [
                                        new TextRun({ text: email, font: FONT, size: 16, bold: true, color: BLUE_600 }),
                                    ]
                                }),
                            ],
                        }),
                    ],
                })],
            }),
            // Light bottom border — mirrors the border-b-2 border-slate-100 in GeneralLetterLayout
            new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: 'E2E8F0', space: 1 } },
                spacing: { after: 0 },
                children: [],
            }),
        ],
    });
}

// ─── Image-based header/footer (uploaded letterhead preview images) ────────────

async function buildImageWordHeader(url: string): Promise<Header | null> {
    const img = await resolveImage(url);
    if (!img) return null;
    return new Header({
        children: [new Paragraph({
            children: [new ImageRun({
                data: img.data, type: img.type,
                transformation: { width: 630, height: 90 },
                altText: { title: 'Header', description: 'Letterhead header image', name: 'lh-header' },
            })],
        })],
    });
}

async function buildImageWordFooter(url: string): Promise<Footer | null> {
    const img = await resolveImage(url);
    if (!img) return null;
    return new Footer({
        children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 4 } },
            spacing: { before: 80 },
            children: [new ImageRun({
                data: img.data, type: img.type,
                transformation: { width: 630, height: 55 },
                altText: { title: 'Footer', description: 'Letterhead footer image', name: 'lh-footer' },
            })],
        })],
    });
}

// ─── Letter body (shared between KRA and General) ─────────────────────────────
// Everything below the header: date, your ref, recipient, RE: subject, body,
// valediction, signature block.

async function buildLetterBody(opts: ExportOptions): Promise<Paragraph[]> {
    const { tab, selectedIndividual, letterDate, reference, recipient,
        subject, valediction, activeSignatory } = opts;

    const children: Paragraph[] = [];

    // Date
    children.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: letterDate, font: FONT, size: 24, bold: true })],
    }));

    // Your Ref — right-aligned
    children.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
        children: [
            new TextRun({ text: 'Your Ref: ', font: FONT, size: 24, bold: true }),
            new TextRun({
                text: reference, font: FONT, size: 24, bold: true,
                underline: { type: UnderlineType.SINGLE }
            }),
        ],
    }));

    // Recipient (multi-line)
    for (const line of (recipient ?? '').split('\n')) {
        children.push(new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: line, font: FONT, size: 24 })],
        }));
    }
    children.push(spacer(12));

    // RE: subject
    children.push(new Paragraph({
        spacing: { after: 160 },
        children: [
            new TextRun({ text: 'RE: ', font: FONT, size: 24, bold: true }),
            new TextRun({
                text: safeUpper(subject),
                font: FONT, size: 24, bold: true,
                underline: { type: UnderlineType.SINGLE },
            }),
        ],
    }));

    // Body paragraphs
    const bodyLines = [
        'Dear Sir/Madam,',
        '',
        'I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate.',
        'All relevant returns have been filed and payments made up to date.',
        '',
        'Your prompt assistance in this matter will be highly appreciated.',
    ];
    for (const line of bodyLines) {
        children.push(new Paragraph({
            spacing: { after: 0, line: 360 },
            children: [new TextRun({ text: line, font: FONT, size: 24 })],
        }));
    }
    children.push(spacer(24));

    // Valediction
    children.push(new Paragraph({
        spacing: { after: 320 },
        children: [new TextRun({ text: valediction, font: FONT, size: 24 })],
    }));

    // Signature image
    if (tab === 'companies' && activeSignatory?.signatureUrl) {
        const img = await resolveImage(activeSignatory.signatureUrl);
        if (img) {
            children.push(new Paragraph({
                spacing: { after: 0 },
                children: [new ImageRun({
                    data: img.data, type: img.type,
                    transformation: { width: 140, height: 70 },
                    altText: { title: 'Signature', description: 'Signatory signature', name: 'sig' },
                })],
            }));
        }
    }

    // Signature underline
    children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: SLATE_900, space: 1 } },
        spacing: { after: 80 },
        children: [new TextRun({ text: '\u00A0'.repeat(40) })],
    }));

    // Signatory name
    const sigName = tab === 'companies'
        ? (activeSignatory?.name ?? '____________________')
        : (selectedIndividual?.full_name ?? '____________________');
    children.push(new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({
            text: safeUpper(sigName), font: FONT, size: 28, bold: true, color: SLATE_900,
        })],
    }));

    // Position / title
    const position = tab === 'companies'
        ? (activeSignatory?.position ?? 'Director')
        : 'Applicant';
    children.push(new Paragraph({
        children: [new TextRun({
            text: safeUpper(position), font: FONT, size: 18, italics: true, color: SLATE_500,
        })],
    }));

    return children;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function exportToWord(opts: ExportOptions): Promise<void> {
    const {
        tab, letterType, selectedCompany, selectedIndividual,
        useLetterhead, selectedLetterheadId, letterheads,
        generateLetterWithLetterhead, downloadBlob,
        headerImageUrl, footerImageUrl,
        valediction, activeSignatory, recipient, subject,
        letterDate, reference,
    } = opts;

    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? 'Letter')
        : (selectedIndividual?.full_name ?? 'Letter');

    const filename = `${entityName}_${new Date().toISOString().split('T')[0]}.docx`;

    // ── Case 1: Uploaded .docx letterhead template ────────────────────────────
    // The template's own header/footer XML is preserved untouched.
    // We inject all structured fields as placeholders in the body area.
    if (useLetterhead && selectedLetterheadId && letterheads && generateLetterWithLetterhead && downloadBlob) {
        const selectedLh = letterheads.find(lh => lh.id === selectedLetterheadId);
        if (selectedLh) {
            try {
                const mergedDoc = await generateLetterWithLetterhead(selectedLh.file_path, {
                    DATE: letterDate,
                    RECIPIENT: recipient,
                    SUBJECT: safeUpper(subject),
                    REFERENCE: reference,
                    SALUTATION: 'Dear Sir/Madam,',
                    BODY: letterType === 'kra'
                        ? 'I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate.\nAll relevant returns have been filed and payments made up to date.\n\nYour prompt assistance in this matter will be highly appreciated.'
                        : 'We are writing to request a bank statement for our account.\nKindly provide the statement for the period as indicated.\n\nThank you for your assistance.',
                    VALEDICTION: valediction,
                    SIGNATORY_NAME: activeSignatory?.name ?? '',
                    SIGNATORY_TITLE: activeSignatory?.position ?? activeSignatory?.role ?? '',
                });
                if (mergedDoc) { downloadBlob(mergedDoc, filename); return; }
            } catch (err) {
                console.error('Letterhead merge failed, falling back to styled layout:', err);
            }
        }
    }

    // ── Case 2: Styled layout — header goes into Word Header section ──────────

    // Resolve which header/footer to use
    let wordHeader: Header;
    let wordFooter: Footer | undefined;

    const hasUploadedImages =
        useLetterhead &&
        headerImageUrl &&
        !headerImageUrl.startsWith('data:text/html');

    if (hasUploadedImages) {
        // Letterhead preview images exist — embed them in the Word header/footer
        const imgHeader = await buildImageWordHeader(headerImageUrl!);
        wordHeader = imgHeader ?? (letterType === 'kra'
            ? buildKRAWordHeader(opts)
            : buildGeneralWordHeader(opts));

        if (footerImageUrl && !footerImageUrl.startsWith('data:text/html')) {
            wordFooter = (await buildImageWordFooter(footerImageUrl)) ?? undefined;
        }
    } else {
        // Pure styled layout — build text-based header matching the UI
        wordHeader = letterType === 'kra'
            ? buildKRAWordHeader(opts)
            : buildGeneralWordHeader(opts);
    }

    // Build body content
    const bodyChildren = await buildLetterBody(opts);

    const doc = new Document({
        styles: {
            default: {
                document: { run: { font: FONT, size: 24, color: SLATE_900 } },
            },
        },
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    margin: {
                        top: 1800,      // space for the header content (1.25 inch)
                        right: SIDE_MARGIN,
                        bottom: 1440,
                        left: SIDE_MARGIN,
                        header: 400,    // distance from page edge to header top
                        footer: 400,
                    },
                },
            },
            headers: { default: wordHeader },
            ...(wordFooter ? { footers: { default: wordFooter } } : {}),
            children: bodyChildren,
        }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename);
}
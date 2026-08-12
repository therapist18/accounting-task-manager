// @ts-nocheck

import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, UnderlineType, Header, Footer, } from 'docx';
import { saveAs } from 'file-saver';
import { wordHeaderPalette, wordFooterPalette, DEFAULT_GENERAL_LETTER_THEME, type GeneralLetterThemeSettings } from './letterThemeEngine';
import {
    getBclContactDetails,
    resolveCompanyGeneralEmail,
    resolveCompanyKraEmail,
    resolveCompanyKraPin,
    resolveCompanyPhone,
    resolveIndividualEmail,
    resolveIndividualKraPin,
    resolveIndividualPhone,
} from './contactDetails';

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
    kra_pin?: string;
    kra_email_address?: string;
    contact_details?: any;
}

interface Individual {
    full_name?: string;
    kra_pin?: string;
    contact_details?: any;
}

interface IndividualIdInfo {
    label: string;
    value: string;
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
    individualIdInfo?: IndividualIdInfo | null;
    kraPin?: string;
    themeSettings?: GeneralLetterThemeSettings;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_WIDTH = 11906; // A4 in DXA (1440 DXA = 1 inch)
const PAGE_HEIGHT = 16838;
const SIDE_MARGIN = 1280; // ~0.89 inch — matches the 25mm CSS p-[25mm] on paperRef
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2; // 9346 DXA

const SLATE_900 = '0F172A';
const SLATE_700 = '334155';
const SLATE_500 = '64748B';
const SLATE_200 = 'E2E8F0';
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
function buildKRAWordHeader(opts: ExportOptions): Header {
    const { tab, selectedCompany, selectedIndividual, email, phone } = opts;
    const bclContact = getBclContactDetails();
    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? '')
        : (selectedIndividual?.full_name ?? '');

    const displayEmail = tab === 'companies'
        ? resolveCompanyKraEmail(selectedCompany, email)
        : resolveIndividualEmail(selectedIndividual, email);

    return new Header({
        children: [
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                    text: safeUpper(entityName),
                    font: FONT, size: 44, bold: true, color: SLATE_900,
                })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({
                    text: `EMAIL: ${displayEmail}    MOBILE NO: ${bclContact.phone || phone}`,
                    font: FONT, size: 22, bold: true, color: SLATE_700,
                })],
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 120 },
                children: [new TextRun({
                    text: bclContact.address.toUpperCase(),
                    font: FONT, size: 22, bold: true, color: SLATE_700,
                })],
            }),
            // Bottom border line for KRA
            new Paragraph({
                border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: SLATE_900, space: 1 } },
                children: [],
            }),
        ],
    });
}

// ─── General Word Header section ──────────────────────────────────────────────
function buildGeneralWordHeader(opts: ExportOptions): Header {
    const { tab, selectedCompany, selectedIndividual, email, phone, reference, themeSettings } = opts;
    const bclContact = getBclContactDetails();
    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? '')
        : (selectedIndividual?.full_name ?? '');
    const resolvedEmail = tab === 'companies'
        ? resolveCompanyGeneralEmail(selectedCompany, email)
        : resolveIndividualEmail(selectedIndividual, email);
    const resolvedPhone = tab === 'companies'
        ? resolveCompanyPhone(selectedCompany, phone)
        : resolveIndividualPhone(selectedIndividual, phone);

    // Same palette decisions as GeneralLetterLayout.tsx's CSS - see
    // letterThemeEngine.ts's wordHeaderPalette.
    const palette = wordHeaderPalette(themeSettings || DEFAULT_GENERAL_LETTER_THEME, SLATE_900, BLUE_600);

    const leftW = 6000;
    const rightW = CONTENT_WIDTH - leftW;

    return new Header({
        children: [
            new Table({
                width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                borders: noBorderSet(),
                rows: [new TableRow({
                    children: [
                        new TableCell({
                            width: { size: leftW, type: WidthType.DXA },
                            borders: noBorderSet(),
                            shading: { fill: palette.bg },
                            children: [
                                new Paragraph({
                                    children: [new TextRun({ text: safeUpper(entityName), font: FONT, size: 44, bold: true, color: palette.title })]
                                }),
                                new Paragraph({
                                    children: [new TextRun({ text: `Ref: ${reference}`, font: FONT, size: 22, bold: true, color: palette.accent })]
                                }),
                            ],
                        }),
                        new TableCell({
                            width: { size: rightW, type: WidthType.DXA },
                            borders: noBorderSet(),
                            shading: { fill: palette.bg },
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [new TextRun({ text: bclContact.addressLine1, font: FONT, size: 20, color: palette.meta })]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [new TextRun({ text: bclContact.addressLine2, font: FONT, size: 20, color: palette.meta })]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [new TextRun({ text: `TEL: ${resolvedPhone}`, font: FONT, size: 20, color: palette.meta })]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.RIGHT,
                                    children: [new TextRun({ text: resolvedEmail, font: FONT, size: 20, color: palette.accent })]
                                }),
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

function buildGeneralWordFooter(opts: ExportOptions): Footer {
    const { tab, selectedCompany, selectedIndividual, reference, themeSettings, kraPin: kraPinProp = '' } = opts;
    const bclContact = getBclContactDetails();
    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? '')
        : (selectedIndividual?.full_name ?? '');
    const regNumber = tab === 'companies' ? (selectedCompany?.registration_number ?? '') : '';
    const kraPin = tab === 'companies'
        ? resolveCompanyKraPin(selectedCompany, kraPinProp)
        : resolveIndividualKraPin(selectedIndividual, kraPinProp);

    // Same palette decisions as GeneralLetterLayout.tsx's CSS - see
    // letterThemeEngine.ts's wordFooterPalette.
    const { bg, text, accent } = wordFooterPalette(themeSettings || DEFAULT_GENERAL_LETTER_THEME, SLATE_900, BLUE_600);

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
                                    children: [new TextRun({ text: safeUpper(entityName), font: FONT, size: 18, bold: true, color: text })],
                                }),
                                new Paragraph({
                                    children: [new TextRun({ text: [kraPin ? `PIN: ${kraPin}` : '', regNumber ? `REG: ${regNumber}` : '', bclContact.address.toUpperCase(), 'CONFIDENTIAL'].filter(Boolean).join('  |  '), font: FONT, size: 16, color: accent })],
                                }),
                            ],
                        }),
                    ],
                })],
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
// --- Updated Exporttoword.ts ---
const BODY_FONT_SIZE = 24; // 12pt (standard professional size)
const HEADING_FONT_SIZE = 24; // 12pt
const DATE_FONT_SIZE = 20; // 10pt
const REF_FONT_SIZE = 20; // 10pt
const SIGNATURE_WIDTH = 140;
const SIGNATURE_HEIGHT = 60;

async function buildLetterBody(opts: ExportOptions): Promise<Paragraph[]> {
    const { tab, selectedIndividual, letterDate, recipient, subject, valediction, activeSignatory } = opts;
    const individualIdInfo = opts.individualIdInfo;

    const children: Paragraph[] = [];

    // 1. Date (Right Aligned)
    children.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 200, after: 200 },
        children: [new TextRun({ text: letterDate, font: FONT, size: DATE_FONT_SIZE })],
    }));

    // 2. Salutation
    children.push(new Paragraph({
        spacing: { after: 400 },
        children: [new TextRun({ text: 'Dear Sir/Madam,', font: FONT, size: BODY_FONT_SIZE })],
    }));

    // 3. Recipient
    const recipientLines = (recipient ?? '').split('\n');
    recipientLines.forEach(line => {
        children.push(new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: line, font: FONT, size: BODY_FONT_SIZE })],
        }));
    });

    // 4. Subject Line (Uppercase, Bold, Underlined)
    children.push(new Paragraph({
        spacing: { before: 400, after: 400 },
        children: [
            new TextRun({ text: 'RE: ', font: FONT, size: HEADING_FONT_SIZE, bold: true }),
            new TextRun({
                text: safeUpper(subject),
                font: FONT, size: HEADING_FONT_SIZE, bold: true,
                underline: { type: UnderlineType.SINGLE },
            }),
        ],
    }));

    // 5. Body (Justified for professionalism)
    const bodyParagraphs = [
        'I am writing on behalf of the company to request for the issuance of a Tax Compliance Certificate. All relevant returns have been filed and payments made up to date.',
        'Your prompt assistance in this matter will be highly appreciated.'
    ];

    bodyParagraphs.forEach((text, i) => {
        children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { before: 200, line: 360 }, // 1.5 line spacing
            children: [new TextRun({ text, font: FONT, size: BODY_FONT_SIZE })],
        }));
    });

    // 6. Valediction
    children.push(new Paragraph({
        spacing: { before: 600, after: 200 },
        children: [new TextRun({ text: valediction, font: FONT, size: BODY_FONT_SIZE })],
    }));

    // 7. Signature Line & Details
    if (tab === 'companies' && activeSignatory?.signatureUrl) {
        const img = await resolveImage(activeSignatory.signatureUrl);
        if (img) {
            children.push(new Paragraph({
                children: [new ImageRun({
                    data: img.data, type: img.type,
                    transformation: { width: SIGNATURE_WIDTH, height: SIGNATURE_HEIGHT },
                })],
            }));
        }
    } else {
        children.push(spacer(30)); // Manual signature space
    }

    // Signature horizontal line
    children.push(new Paragraph({
        border: { top: { style: BorderStyle.SINGLE, size: 6, color: SLATE_900, space: 1 } },
        width: { size: 4000, type: WidthType.DXA },
        children: [],
    }));

    // Signatory Name
    const sigName = tab === 'companies' ? (activeSignatory?.name ?? '') : (selectedIndividual?.full_name ?? '');
    children.push(new Paragraph({
        spacing: { before: 100 },
        children: [new TextRun({ text: safeUpper(sigName), font: FONT, size: 24, bold: true })],
    }));

    // Signatory Title
    const sigTitle = tab === 'companies' ? (activeSignatory?.position ?? 'Director') : 'Applicant';
    children.push(new Paragraph({
        children: [new TextRun({ text: safeUpper(sigTitle), font: FONT, size: 18, italics: true, color: SLATE_500 })],
    }));

    // Individual ID label (e.g. "ID No: 12345678" or "Alien No: A123456")
    if (tab === 'individuals' && individualIdInfo) {
        children.push(new Paragraph({
            children: [new TextRun({
                text: `${individualIdInfo.label.toUpperCase()}: ${individualIdInfo.value}`,
                font: FONT, size: 18, color: SLATE_500,
            })],
        }));
    }

    return children;
}

export async function exportToWord(opts: ExportOptions): Promise<void> {
    console.log('[Word Export] Function called!');

    const { tab, letterType, selectedCompany, selectedIndividual, useLetterhead, selectedLetterheadId, letterheads, generateLetterWithLetterhead, downloadBlob, headerImageUrl, footerImageUrl, valediction, activeSignatory, recipient, subject, letterDate, reference, kraPin: kraPinProp = '' } = opts;

    const entityName = tab === 'companies'
        ? (selectedCompany?.company_name ?? 'Letter')
        : (selectedIndividual?.full_name ?? 'Letter');

    const filename = `${entityName}_${new Date().toISOString().split('T')[0]}.docx`;
    const kraPin = tab === 'companies'
        ? resolveCompanyKraPin(selectedCompany, kraPinProp)
        : resolveIndividualKraPin(selectedIndividual, kraPinProp);
    const resolvedEmail = tab === 'companies'
        ? (letterType === 'kra' ? resolveCompanyKraEmail(selectedCompany, opts.email) : resolveCompanyGeneralEmail(selectedCompany, opts.email))
        : resolveIndividualEmail(selectedIndividual, opts.email);
    const resolvedPhone = letterType === 'kra'
        ? getBclContactDetails().phone
        : tab === 'companies'
            ? resolveCompanyPhone(selectedCompany, opts.phone)
            : resolveIndividualPhone(selectedIndividual, opts.phone);

    // ── Case 1: Uploaded .docx letterhead template ────────────────────────────
    if (useLetterhead && selectedLetterheadId && letterheads && generateLetterWithLetterhead && downloadBlob) {
        const selectedLh = letterheads.find(lh => lh.id === selectedLetterheadId);
        if (selectedLh) {
            try {
                const mergedDoc = await generateLetterWithLetterhead(selectedLh.file_path, {
                    DATE: letterDate,
                    RECIPIENT: recipient,
                    SUBJECT: safeUpper(subject),
                    REFERENCE: reference,
                    KRA_PIN: kraPin,
                    EMAIL: resolvedEmail,
                    PHONE: resolvedPhone,
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
        headerImageUrl &&
        !headerImageUrl.startsWith('data:text/html');

    console.log('[Word Export Debug]', {
        useLetterhead,
        headerImageUrl,
        footerImageUrl,
        hasUploadedImages,
        letterType
    });

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

    if (!wordFooter && letterType === 'general') {
        wordFooter = buildGeneralWordFooter(opts);
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
    saveAs(blob, filename || 'letter.docx');
}

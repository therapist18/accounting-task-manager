// @ts-nocheck

import PizZip from 'pizzip';
import * as mammoth from 'mammoth';
import supabase from '@/lib/supabase/client';

/**
 * Extracts headers and footers from a Word document buffer
 * @param templateBuffer - ArrayBuffer of the Word document
 * @returns Object containing arrays of headers and footers with their XML and HTML representations
 */
export const extractHeadersFooters = async (templateBuffer: ArrayBuffer) => {
    const zip = new PizZip(templateBuffer);
    const headers = [];
    const footers = [];
    
    for (let i = 1; i <= 3; i++) {
        const headerFile = zip.file(`word/header${i}.xml`);
        if (headerFile) {
            const headerXml = headerFile.asText();
            headers.push({
                index: i,
                xml: headerXml,
                html: await convertWordXmlToHtml(headerXml)
            });
        }
    }
    
    for (let i = 1; i <= 3; i++) {
        const footerFile = zip.file(`word/footer${i}.xml`);
        if (footerFile) {
            const footerXml = footerFile.asText();
            footers.push({
                index: i,
                xml: footerXml,
                html: await convertWordXmlToHtml(footerXml)
            });
        }
    }

    return { headers, footers };
};

/**
 * Converts Word XML to HTML using Mammoth
 * @param xml - Word XML string
 * @returns HTML string
 */
export const convertWordXmlToHtml = async (xml: string): Promise<string> => {
    // Mammoth requires w:body inside word/document.xml.
    // Header/footer XML uses w:hdr/w:ftr as the root — swap it to w:document > w:body.
    let documentXml = xml;
    if (/<w:hdr[\s>]/.test(xml)) {
        documentXml = xml
            .replace(/<w:hdr(\s[^>]*)?>/, (_, attrs) => `<w:document${attrs || ''}><w:body>`)
            .replace(/<\/w:hdr>/, '</w:body></w:document>');
    } else if (/<w:ftr[\s>]/.test(xml)) {
        documentXml = xml
            .replace(/<w:ftr(\s[^>]*)?>/, (_, attrs) => `<w:document${attrs || ''}><w:body>`)
            .replace(/<\/w:ftr>/, '</w:body></w:document>');
    }

    const tempZip = new PizZip();
    tempZip.file('word/document.xml', documentXml);
    tempZip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="xml" ContentType="application/xml"/>
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);

    const arrayBuffer = tempZip.generate({ type: 'arraybuffer' });

    // Convert using Mammoth
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return result.value;
};

/**
 * Fetches a template buffer from Supabase storage with caching support
 * @param templateId - ID of the template for caching purposes
 * @param filePath - Path to the template file in storage
 * @param cachedBuffer - Optional cached buffer to check against
 * @param loadedTemplateId - Optional ID of the currently loaded template
 * @returns ArrayBuffer of the template or null if failed
 */
export const fetchTemplateBuffer = async (
    templateId: string,
    filePath: string,
    cachedBuffer: ArrayBuffer | null = null,
    loadedTemplateId: string | null = null
): Promise<ArrayBuffer | null> => {
    // Return cached buffer if it's the same template
    if (loadedTemplateId === templateId && cachedBuffer) {
        return cachedBuffer;
    }

    try {
        let publicUrl: string;
        if (filePath.startsWith('kyc-templates/')) {
            const { data, error } = await supabase.storage
                .from('templates')
                .createSignedUrl(filePath, 3600);
            if (error || !data?.signedUrl) throw new Error('Could not create signed URL for template');
            publicUrl = data.signedUrl;
        } else {
            publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/templates/${filePath}`;
        }

        const res = await fetch(publicUrl);
        if (!res.ok) throw new Error(`Failed to fetch template: ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();

        return arrayBuffer;
    } catch (error) {
        console.error('Error fetching template buffer:', error);
        return null;
    }
};

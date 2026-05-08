import PizZip from "pizzip";
import { EntityType } from "@/lib/constants/entity-types";
import type { JobField, Placeholder } from "./types";

export const sanitizeClassName = (cls: string | undefined): string => {
  if (!cls) return '';
  return String(cls).replace(/\s+/g, ' ').trim();
};

export const getCleanText = (str: string) => str.replace(/<[^>]+>/g, '');

export const findMatchingMasterFields = (placeholderName: string, masterFields: JobField[]): { ids: number[], sourceType?: string } => {
  if (!placeholderName || !masterFields.length) return { ids: [] };

  const normalizedPlaceholder = placeholderName.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

  const matches = masterFields.filter(field => {
    const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const normalizedKey = field.field_key.toLowerCase().replace(/[^a-z0-9]/g, '').trim();

    const isMatch = (
      normalizedPlaceholder === normalizedLabel ||
      normalizedPlaceholder === normalizedKey ||
      normalizedPlaceholder.includes(normalizedLabel) ||
      normalizedLabel.includes(normalizedPlaceholder)
    );

    if (isMatch) console.log(`  -> Match Found: "${field.label}" (${field.field_key})`);
    return isMatch;
  });

  const sourceTypes = matches.flatMap(field =>
    Array.isArray(field.sources) ? field.sources.map(s => s.source_type).filter(Boolean) : []
  );

  const mostCommonSource = sourceTypes.sort((a, b) =>
    sourceTypes.filter(v => v === a).length - sourceTypes.filter(v => v === b).length
  ).pop();

  return {
    ids: matches.map(field => field.id),
    sourceType: mostCommonSource
  };
};

export const validateTemplate = async (file: File): Promise<boolean> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const zip = new PizZip(arrayBuffer);
    let xmlContent = zip.files['word/document.xml'].asText();

    let headerContent = '';
    let footerContent = '';
    const fileList = Object.keys(zip.files);
    const hasDocumentXml = fileList.some(file =>
      file.startsWith('word/document') && file.endsWith('.xml')
    );

    if (!hasDocumentXml) {
      throw new Error('The uploaded file is not a valid Word document (missing document.xml)');
    }

    return true;
  } catch (error) {
    console.error('Template validation failed:', error);
    return false;
  }
};

export const extractPlaceholders = async (
  source: { type: 'file', content: File } | { type: 'text', content: string },
  masterFields: JobField[]
): Promise<Placeholder[]> => {
  console.group(`%c[SCANNER] Target: ${source.type}`, "color: #2563eb; font-weight: bold;");

  try {
    let rawTextContent = "";

    if (source.type === 'file') {
      const arrayBuffer = await source.content.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      let xmlContent = zip.files['word/document.xml'].asText();

      let headerContent = '';
      let footerContent = '';

      console.log('[SCANNER] Available files in zip:', Object.keys(zip.files));

      const headerFiles = Object.keys(zip.files).filter(file => file.startsWith('word/header') && file.endsWith('.xml'));
      const footerFiles = Object.keys(zip.files).filter(file => file.startsWith('word/footer') && file.endsWith('.xml'));

      console.log('[SCANNER] Found header files:', headerFiles);
      console.log('[SCANNER] Found footer files:', footerFiles);

      if (headerFiles.length > 0) {
        headerContent = headerFiles.map(file => zip.files[file].asText()).join('\n');
        console.log('[SCANNER] Header content found (first 200 chars):', headerContent.substring(0, 200));
      }

      if (footerFiles.length > 0) {
        footerContent = footerFiles.map(file => zip.files[file].asText()).join('\n');
        console.log('[SCANNER] Footer content found (first 200 chars):', footerContent.substring(0, 200));
      }

      if (headerContent) {
        xmlContent = headerContent + xmlContent;
        console.log('[SCANNER] Added header to content');
      }

      if (footerContent) {
        xmlContent = xmlContent + footerContent;
        console.log('[SCANNER] Added footer to content');
      }

      rawTextContent = xmlContent
        .replace(/<[^>]+>/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '');

      console.log('[SCANNER] Combined XML Content (first 200 chars):', xmlContent.substring(0, 200));
      console.log('[SCANNER] Combined Raw Text Content (first 200 chars):', rawTextContent.substring(0, 200));
      console.log('[SCANNER] Raw text content length:', rawTextContent.length);
    } else {
      rawTextContent = getCleanText(source.content).replace(/[\u200B-\u200D\uFEFF]/g, '');
    }

    const tagRegex = /\{([#\/%])?\s*([a-zA-Z0-9_]+)(?:\/([a-zA-Z0-9_]+))?\s*\}/g;
    const sequences = new Map();

    const results: Placeholder[] = [];
    const blockStack: string[] = [];
    const processedTags = new Set<string>();
    let _idSeq = 0;
    const uid = () => `${Date.now()}_${_idSeq++}`;

    const formatFunctions = new Set([
      'upper', 'lower', 'capital', 'capitalize', 'title', 'camel', 'snake', 'kebab',
      'date', 'time', 'datetime', 'currency', 'number', 'int', 'float', 'round',
      'prettify', 'escape', 'unescape', 'html', 'raw', 'json', 'parse', 'stringify'
    ]);

    let match;
    while ((match = tagRegex.exec(rawTextContent)) !== null) {
      const prefix = match[1];
      const tagName = match[2];
      const formatSuffix = match[3];
      const currentParent = blockStack.length > 0 ? blockStack[blockStack.length - 1] : undefined;
      const contextKey = currentParent ? `${currentParent}_${tagName}` : tagName;

      if (!prefix) {
        const digitMatch = tagName.match(/^(.+)_(\d+)$/);
        if (digitMatch) {
          const groupName = digitMatch[1];
          const index = parseInt(digitMatch[2]);

          if (!sequences.has(groupName)) {
            sequences.set(groupName, { max: index, count: 1 });
          } else {
            const seq = sequences.get(groupName);
            seq.max = Math.max(seq.max, index);
            seq.count++;
          }
          continue;
        }
      }

      if (prefix === '#') {
        console.log(`%c[ARRAY DETECTED] {#${tagName}}`, "color: #059669");
        blockStack.push(tagName);
        if (!processedTags.has(contextKey)) {
          if (tagName.startsWith('condition_')) {
            const conditionName = tagName.replace('condition_', '');
            results.push({
              id: `block_${tagName}_${uid()}`,
              name: tagName,
              type: 'conditional',
              required: true,
              entity_type: ['company', 'principal', 'director', 'shareholder', 'dependant', 'employee'],
              is_block_start: true,
              description: `Conditional block: {#${tagName}}`
            });
          } else {
            let blockEntity: EntityType = (tagName.endsWith('s') ? tagName.slice(0, -1) : tagName) as EntityType;
            let blockRelationships: string[] = [];

            if (blockEntity === 'dependant') {
              const relationshipPrefixes = ['father', 'mother', 'daughter', 'son', 'husband', 'wife', 'mother_in_law', 'father_in_law'];
              const tagNameLower = tagName.toLowerCase();

              for (const prefix of relationshipPrefixes) {
                if (tagNameLower.startsWith(prefix + '_')) {
                  blockRelationships = [prefix];
                  console.log(`[BLOCK RELATIONSHIP DETECTED] ${tagName} -> ${prefix} (dependant)`);
                  break;
                }
              }
            }

            results.push({
              id: `block_${tagName}_${uid()}`,
              name: tagName,
              type: 'array',
              required: true,
              entity_type: blockEntity,
              ...(blockRelationships.length > 0 && { dependant_relationship: blockRelationships }),
              is_block_start: true,
              description: `Repeating section: {#${tagName}}`
            });
          }
          processedTags.add(contextKey);
        }
      }
      else if (prefix === '/') {
        blockStack.pop();
      }
      else {
        if (processedTags.has(contextKey)) continue;

        if (formatSuffix) {
          console.log(`[FORMAT DETECTED] {${tagName}/${formatSuffix}} - Format function: ${formatSuffix}`);
        }

        console.log(`[FIELD DETECTED] {${tagName}${formatSuffix ? '/' + formatSuffix : ''}} ${currentParent ? `(Inside ${currentParent})` : '(Global)'}`);

        const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(tagName, masterFields);

        let inferredEntity: EntityType = 'principal';
        let inferredRelationships: string[] = [];

        if (currentParent) {
          inferredEntity = (currentParent.endsWith('s') ? currentParent.slice(0, -1) : currentParent) as EntityType;
        } else if (sourceType) {
          inferredEntity = sourceType as EntityType;
        } else {
          const relationshipPrefixes = ['father', 'mother', 'daughter', 'son', 'husband', 'wife', 'mother_in_law', 'father_in_law'];
          const tagNameLower = tagName.toLowerCase();

          for (const prefix of relationshipPrefixes) {
            if (tagNameLower.startsWith(prefix + '_')) {
              inferredEntity = 'dependant';
              inferredRelationships = [prefix];
              console.log(`[RELATIONSHIP DETECTED] ${tagName} -> ${prefix} (dependant)`);
              break;
            }
          }
        }

        const placeholder: Placeholder = {
          id: `ph_${tagName}_${uid()}`,
          name: tagName,
          parent_name: currentParent,
          type: prefix === '%' ? 'image' : 'text',
          required: true,
          entity_type: inferredEntity,
          master_field_ids: matchingFieldIds,
          ...(inferredRelationships.length > 0 && { dependant_relationship: inferredRelationships }),
          description: currentParent ? `Inside ${currentParent}` : '',
          ...(formatSuffix && formatFunctions.has(formatSuffix) && { format: formatSuffix })
        };

        if (formatSuffix && formatFunctions.has(formatSuffix)) {
          placeholder.description = placeholder.description 
            ? `${placeholder.description} (Format: ${formatSuffix})`
            : `Format: ${formatSuffix}`;
          console.log(`%c[FORMAT APPLIED] ${tagName} -> ${formatSuffix}`, "color: #8b5cf6; font-weight: bold;");
        }

        results.push(placeholder);
        processedTags.add(contextKey);
      }
    }

    sequences.forEach((data, groupName) => {
      if (data.count > 1) {
        results.push({
          id: `seq_${groupName}_${uid()}`,
          name: groupName,
          type: 'text',
          is_digit_split: true,
          digit_count: data.max,
          required: true,
          entity_type: 'company',
          description: `Grouped Sequence (${groupName}_1 to ${groupName}_${data.max})`
        });
      }
    });

    console.groupEnd();
    return results;
  } catch (err) {
    console.error("[SCANNER] Error:", err);
    console.groupEnd();
    throw err;
  }
};

export const mergePlaceholders = (
  existingPlaceholders: Placeholder[],
  newlyExtracted: Placeholder[],
  masterFields: JobField[] = []
): Placeholder[] => {
  const existingMap = new Map(existingPlaceholders.map(p => [p.name, p]));

  return newlyExtracted.map(newPh => {
    const existing = existingMap.get(newPh.name);

    if (existing) {
      console.log(`[MERGE] Preserving data for tag: {${newPh.name}}`);

      return {
        ...existing,
        parent_name: newPh.parent_name,
        is_block_start: newPh.is_block_start,
        type: (newPh.type === 'array' || newPh.type === 'conditional' || existing.type === 'image')
          ? newPh.type
          : existing.type,
        description: existing.description || newPh.description,
      };
    }

    return newPh;
  });
};

export const autoGeneratePlaceholders = (extracted: string[], masterFields: JobField[] = []): Placeholder[] => {
  const arrayPlaceholders = extracted.filter(name =>
    name.endsWith('s') &&
    extracted.includes(name.slice(0, -1))
  );

  return extracted.map((name, index) => {
    const isImage = name.startsWith('%') && name.endsWith('%');
    const cleanName = isImage ? name.substring(1, name.length - 1) : name;
    const isArray = arrayPlaceholders.includes(name) ||
      (name.endsWith('s') && extracted.includes(name.slice(0, -1)));

    const { ids: matchingFieldIds, sourceType } = findMatchingMasterFields(cleanName, masterFields);

    return {
      id: `auto_${Date.now()}_${index}`,
      name: cleanName,
      description: matchingFieldIds.length > 0
        ? `Auto-linked to ${matchingFieldIds.length} field(s)`
        : isArray ? 'Array placeholder' : '',
      type: isImage ? 'image' : isArray ? 'array' : 'text',
      required: true,
      entity_type: (sourceType as EntityType) || 'principal',
      master_field_ids: matchingFieldIds,
      default_value: ''
    };
  });
};

export const preserveFormat = (html: string) => {
  if (!html) return html;
  return html
    .replace(/ {2,}/g, (match) => '&nbsp;'.repeat(match.length))
    .replace(/\n/g, '<br />');
};

export const extractScalarFields = (templateContent: string): string[] => {
  const scalarFieldRegex = /\{#([^{}]+)\}/g;
  const fields: string[] = [];
  let match;

  console.log('[SCALAR FIELD DETECTION] Template content:', templateContent);
  console.log('[SCALAR FIELD DETECTION] Regex pattern:', scalarFieldRegex);

  while ((match = scalarFieldRegex.exec(templateContent)) !== null) {
    fields.push(match[1]);
    console.log('[SCALAR FIELD DETECTION] Found scalar field:', match[1]);
  }

  console.log('[SCALAR FIELD DETECTION] Extracted fields:', fields);
  return fields;
};

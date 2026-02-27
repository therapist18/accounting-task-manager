# Letterhead System Architecture

## Overview

This document describes the complete letterhead management and letter generation system. The system allows companies to upload Word letterhead templates once, and then automatically merge them with letter content to generate professional documents.

## System Flow

```
1. Upload Letterhead (.docx)
   ↓
2. Auto-generate Preview (HTML)
   ↓
3. Store in Database + Storage
   ↓
4. User Selects Company in Letter Module
   ↓
5. Letterhead Auto-loads
   ↓
6. User Writes Letter Content
   ↓
7. Download as Word or PDF
```

## Architecture Components

### 1. Storage Layer

**Supabase Storage Bucket: `letterheads`**

```
letterheads/
└── company-letterheads/
    └── {company_id}/
        └── {timestamp}-{random}.docx
```

**Example:**
- Bucket: `letterheads`
- Path: `company-letterheads/123/1709025600000-abc123.docx`

### 2. Database Schema

**Table: `acc_portal_company_letterheads`**

```sql
- id (uuid, primary key)
- company_id (bigint, foreign key)
- name (text)
- description (text)
- file_path (text) -- Path in storage
- file_name (text)
- file_size (bigint)
- contact_details (jsonb)
- is_default (boolean)
- is_active (boolean)
- metadata (jsonb) -- Stores preview_html
- created_at (timestamptz)
- updated_at (timestamptz)
```

**Key Fields:**
- `file_path`: Location of the .docx template
- `metadata.preview_html`: Auto-generated HTML preview for UI
- `is_default`: One default letterhead per company

### 3. API Endpoints

#### Upload Letterhead
**POST `/api/letterheads`**

Request:
```json
{
  "company_id": 123,
  "name": "Default Letterhead",
  "description": "Official company letterhead",
  "file_path": "company-letterheads/123/file.docx",
  "file_name": "letterhead.docx",
  "file_size": 52428,
  "is_default": true
}
```

Response:
```json
{
  "id": "uuid",
  "company_id": 123,
  "name": "Default Letterhead",
  ...
}
```

#### Generate Preview
**POST `/api/letterheads/generate-preview`**

Automatically called after upload. Converts .docx to HTML for UI preview.

Request:
```json
{
  "letterheadId": "uuid",
  "filePath": "company-letterheads/123/file.docx"
}
```

Response:
```json
{
  "success": true,
  "preview_html": "<html>...</html>"
}
```

#### Get Letterheads
**GET `/api/letterheads?company_id=123`**

Returns all letterheads for a company.

#### Update Letterhead
**PATCH `/api/letterheads`**

Update metadata, set default, etc.

#### Delete Letterhead
**DELETE `/api/letterheads?id=uuid`**

Soft delete (sets `is_active = false`).

### 4. Frontend Components

#### Letterheads Management Page
**Path:** `/dashboard/letters/letterheads`

Features:
- Company sidebar for selection
- Upload letterhead dialog
- Preview letterhead (iframe with HTML)
- Edit metadata
- Set default
- Delete

#### Letter Generation Page
**Path:** `/dashboard/letters`

Features:
- Company selection
- Auto-load letterhead
- Letter editor
- Download as Word
- Download as PDF

### 5. Utility Functions

#### `letterheadMerge.ts`

**Key Functions:**

1. **`downloadLetterheadTemplate(filePath: string)`**
   - Downloads .docx from Supabase Storage
   - Returns ArrayBuffer

2. **`mergeLetterWithLetterhead(letterheadBuffer, content)`**
   - Uses `docxtemplater` to merge content into template
   - Returns merged .docx Blob

3. **`generateLetterWithLetterhead(filePath, content)`**
   - Complete workflow: download + merge
   - Returns final .docx Blob

4. **`convertDocxToPdf(docxBlob)`**
   - Converts Word to PDF (requires backend service)
   - Returns PDF Blob

5. **`downloadBlob(blob, filename)`**
   - Triggers browser download

## Template Placeholders

The letterhead .docx file should contain these placeholders:

```
{{BODY}}           - Main letter content
{{RECIPIENT}}      - Recipient address
{{SUBJECT}}        - Letter subject
{{DATE}}           - Letter date
{{REFERENCE}}      - Reference number
{{SALUTATION}}     - Opening (e.g., "Dear Sir/Madam,")
{{VALEDICTION}}    - Closing (e.g., "Yours faithfully,")
{{SIGNATORY_NAME}} - Signatory name
{{SIGNATORY_TITLE}}- Signatory title
```

**Example Template Structure:**

```
[Company Logo/Header - Static in template]

Ref: {{REFERENCE}}
Date: {{DATE}}

{{RECIPIENT}}

RE: {{SUBJECT}}

{{SALUTATION}}

{{BODY}}

{{VALEDICTION}}

{{SIGNATORY_NAME}}
{{SIGNATORY_TITLE}}

[Company Footer - Static in template]
```

## User Workflows

### Workflow 1: Upload Letterhead

1. Navigate to `/dashboard/letters/letterheads`
2. Select company from sidebar
3. Click "Upload Letterhead"
4. Choose .docx file
5. Enter name and description
6. Check "Set as default" if needed
7. Click Upload
8. System automatically:
   - Uploads to storage
   - Creates database record
   - Generates HTML preview
   - Returns success

### Workflow 2: Generate Letter

1. Navigate to `/dashboard/letters`
2. Select company from sidebar
3. Letterhead auto-loads (if exists)
4. Toggle "Use Uploaded Letterhead" ON
5. Select specific letterhead from dropdown
6. Fill in letter details:
   - Recipient
   - Subject
   - Date
   - Reference
   - Body content
7. Click "Download as Word"
   - System downloads letterhead template
   - Merges content into placeholders
   - Returns .docx file
8. Or click "Download as PDF"
   - Same as Word, then converts to PDF

## Technical Implementation Details

### Auto-Preview Generation

When a letterhead is uploaded:

```typescript
// 1. Upload to storage
await supabase.storage.from('letterheads').upload(filePath, file);

// 2. Create database record
const letterhead = await fetch('/api/letterheads', { 
  method: 'POST', 
  body: JSON.stringify({...}) 
});

// 3. Auto-generate preview
await fetch('/api/letterheads/generate-preview', {
  method: 'POST',
  body: JSON.stringify({
    letterheadId: letterhead.id,
    filePath: filePath
  })
});
```

### Letter Generation with Letterhead

```typescript
import { generateLetterWithLetterhead, downloadBlob } from './utils/letterheadMerge';

// Get selected letterhead
const selectedLetterhead = letterheads.find(lh => lh.id === selectedLetterheadId);

// Prepare content
const content = {
  body: letterBody,
  recipient: recipient,
  subject: subject,
  date: letterDate,
  reference: reference,
  salutation: 'Dear Sir/Madam,',
  valediction: 'Yours faithfully,',
  signatory: {
    name: activeSignatory.name,
    title: activeSignatory.title
  }
};

// Generate merged document
const mergedDoc = await generateLetterWithLetterhead(
  selectedLetterhead.file_path,
  content
);

// Download
downloadBlob(mergedDoc, `${companyName}_Letter.docx`);
```

## Best Practices

### For Letterhead Templates

1. **Keep it Simple**
   - Use standard Word formatting
   - Avoid complex layouts
   - Test placeholders before uploading

2. **Placeholder Placement**
   - Place `{{BODY}}` where main content should go
   - Keep header/footer static (no placeholders there)
   - Use consistent formatting

3. **File Size**
   - Keep under 50MB
   - Optimize images in header/footer
   - Use compressed logos

### For Letter Generation

1. **Always Use Templates**
   - Don't hardcode letterhead in code
   - Let users manage their own branding

2. **Preview Before Download**
   - Show letterhead preview in editor
   - Let users see what they'll get

3. **Error Handling**
   - Check if letterhead exists
   - Fallback to plain letter if no letterhead
   - Show clear error messages

## Future Enhancements

### Phase 2: Advanced Features

1. **Multiple Letterhead Versions**
   - Formal vs Informal
   - Different languages
   - Seasonal variations

2. **Dynamic Contact Details**
   - Update contact info without re-uploading
   - Store in database, inject at generation time

3. **Template Variables**
   - Company-specific variables
   - Auto-fill from company data

4. **Batch Generation**
   - Generate multiple letters at once
   - Mail merge functionality

5. **PDF Conversion Service**
   - Backend service for reliable PDF conversion
   - Maintain exact Word formatting

## Troubleshooting

### Common Issues

**Issue:** Preview not generating
- **Solution:** Check file format (.docx only)
- **Solution:** Verify file isn't corrupted
- **Solution:** Check API logs

**Issue:** Placeholders not replaced
- **Solution:** Ensure exact placeholder syntax `{{PLACEHOLDER}}`
- **Solution:** Check for typos in template
- **Solution:** Verify content object has matching keys

**Issue:** Download fails
- **Solution:** Check Supabase Storage permissions
- **Solution:** Verify file path is correct
- **Solution:** Check browser console for errors

## Security Considerations

1. **File Upload Validation**
   - Only .docx and .doc files
   - Max file size: 50MB
   - Scan for malicious content

2. **Access Control**
   - RLS policies on database
   - Storage bucket permissions
   - Company-specific access

3. **Data Privacy**
   - Letterheads may contain sensitive branding
   - Ensure proper access controls
   - Audit trail for changes

## Performance Optimization

1. **Caching**
   - Cache letterhead templates in memory
   - Reduce repeated downloads

2. **Lazy Loading**
   - Load previews on demand
   - Don't load all letterheads at once

3. **Background Processing**
   - Generate previews asynchronously
   - Don't block upload on preview generation

## Conclusion

This letterhead system provides a clean, automated solution for managing company letterheads and generating professional letters. By storing the full .docx template and auto-generating previews, we achieve both perfect fidelity in output and a smooth user experience in the editor.

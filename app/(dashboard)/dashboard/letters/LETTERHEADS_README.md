# Company Letterheads Module

## Overview
The letterheads module allows you to upload, manage, and use company letterhead templates in Word format (.docx/.doc) for letter generation.

## Features
- Upload Word letterhead templates per company
- Multiple letterheads per company (Default, Formal, International, etc.)
- Set default letterhead for each company
- Edit letterhead metadata and contact details
- Automatic integration with letter generation
- Soft delete (letterheads are deactivated, not permanently deleted)

## Database Schema

### Table: `acc_portal_company_letterheads`
```sql
- id (uuid, primary key)
- company_id (bigint, foreign key to acc_portal_company_duplicate)
- name (text) - e.g., "Default", "Formal"
- description (text, optional)
- file_path (text) - Supabase Storage path
- file_name (text) - Original filename
- file_size (bigint, optional)
- contact_details (jsonb) - { phone, email, address, website }
- header_preview_url (text, optional)
- footer_preview_url (text, optional)
- is_default (boolean)
- is_active (boolean)
- metadata (jsonb, optional)
- created_at (timestamptz)
- updated_at (timestamptz)
```

## File Structure

```
letters/
├── letterheads/
│   └── page.tsx                    # Letterheads management UI
├── components/
│   ├── LetterControls.tsx          # Updated with letterhead selector
│   ├── LetterheadUploadDialog.tsx  # Upload dialog component
│   └── LetterheadEditDialog.tsx    # Edit dialog component
├── hooks/
│   └── useLetterheads.ts           # Letterheads data hook
└── LETTERHEADS_README.md           # This file

api/
└── letterheads/
    └── route.ts                    # CRUD API endpoints
```

## API Endpoints

### GET `/api/letterheads`
Fetch letterheads (optionally filtered by company)
- Query params: `company_id` (optional)
- Returns: Array of letterhead objects

### POST `/api/letterheads`
Create a new letterhead
- Body: `{ company_id, name, description, file_path, file_name, file_size, contact_details, is_default, metadata }`
- Returns: Created letterhead object

### PATCH `/api/letterheads`
Update letterhead metadata
- Body: `{ id, name, description, contact_details, is_default, is_active, metadata }`
- Returns: Updated letterhead object

### DELETE `/api/letterheads`
Soft delete a letterhead (sets is_active = false)
- Query params: `id`
- Returns: `{ success: true }`

## Usage Guide

### 1. Upload a Letterhead

1. Navigate to **Letters > Letterheads** (or `/dashboard/letters/letterheads`)
2. Select a company from the sidebar
3. Click **Upload Letterhead**
4. Fill in:
   - Company (pre-selected from sidebar)
   - Letterhead Name (e.g., "Default", "Formal")
   - Description (optional)
   - Select Word file (.docx or .doc)
   - Check "Set as default" if desired
5. Click **Upload**

### 2. Manage Letterheads

From the letterheads page, you can:
- **Set Default**: Make a letterhead the default for a company
- **Edit**: Update name, description, and contact details
- **Delete**: Deactivate a letterhead (cannot delete default)

### 3. Use Letterheads in Letters

1. Go to **Letters** page
2. Select a company
3. Choose **General Layout** (letterheads only work with general layout)
4. Toggle **Use Uploaded Letterhead** ON
5. Select desired letterhead from dropdown (if multiple exist)
6. Generate letter as usual

## Contact Details Feature

You can store contact details in letterheads for future reference:
- Phone
- Email
- Address
- Website

**Note**: Currently, these are stored for reference only. In future updates, these can be used to dynamically update letterhead content.

## File Storage

Letterhead files are stored in Supabase Storage:
- Bucket: `letterheads`
- Path: `company-letterheads/{company_id}/{timestamp}-{random}.docx`

## User Interface

### Company Sidebar Integration

The letterheads page features an integrated company sidebar:
- **Company Selection**: Click any company in the sidebar to view their letterheads
- **Letterhead Count**: See the number of letterheads per company at a glance
- **Collapsible Sidebar**: Toggle sidebar to maximize workspace
- **Default Display Filter**: Show only default companies or all companies
- **Search**: Quickly find companies by name or registration number
- **Pre-selected Upload**: When uploading, the active company is automatically selected

## Integration with Letter Generation

### Current Implementation (Phase 1)
- Letterheads are stored as complete Word files
- When generating letters, the system can reference which letterhead to use
- The letterhead file path is available for future merging/templating

### Future Enhancement (Phase 2)
- Extract header/footer from Word files
- Merge letterhead with generated letter content
- Support for placeholder-based templates (e.g., `{{company_phone}}`)
- Dynamic contact detail updates

## Best Practices

1. **Naming Convention**: Use descriptive names like "Default", "Formal", "International"
2. **File Size**: Keep letterhead files under 5MB for optimal performance
3. **Default Letterhead**: Always set one letterhead as default per company
4. **Backup**: Original Word files are preserved in storage
5. **Testing**: Test letterhead appearance before setting as default

## Troubleshooting

### No letterheads showing
- Check that company_id is correct
- Verify letterhead is active (`is_active = true`)
- Check browser console for API errors

### Upload fails
- Ensure file is .docx or .doc format
- Check file size (should be < 50MB)
- Verify Supabase Storage bucket exists and has correct permissions

### Cannot delete letterhead
- Default letterheads cannot be deleted
- Set another letterhead as default first, then delete

## Migration

To set up the database:
```bash
# Run the migration
psql -d your_database -f supabase/migrations/20250227000000_create_company_letterheads.sql
```

Or use Supabase CLI:
```bash
supabase db push
```

## Future Roadmap

- [ ] Preview letterhead before using
- [ ] Bulk upload letterheads
- [ ] Template placeholder system
- [ ] Automatic header/footer extraction
- [ ] Version history for letterheads
- [ ] Letterhead templates library
- [ ] PDF letterhead support
- [ ] Dynamic contact detail merging

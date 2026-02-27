# Letterheads Module - Integration Summary

## ✅ What's Been Created

### 1. Database Layer
- **Migration**: `supabase/migrations/20250227000000_create_company_letterheads.sql`
- **Table**: `acc_portal_company_letterheads` with full schema
- **Indexes**: Optimized for company lookups and default letterheads
- **RLS Policies**: Row-level security enabled

### 2. API Layer
- **File**: `app/api/letterheads/route.ts`
- **Endpoints**:
  - `GET` - Fetch letterheads (with optional company filter)
  - `POST` - Create new letterhead
  - `PATCH` - Update letterhead metadata
  - `DELETE` - Soft delete letterhead

### 3. UI Components
- **Management Page**: `app/(dashboard)/dashboard/letters/letterheads/page.tsx`
  - Grid view of letterheads grouped by company
  - Upload, edit, delete, set default actions
  - File size and date display
  
- **Upload Dialog**: `app/(dashboard)/dashboard/letters/components/LetterheadUploadDialog.tsx`
  - File upload with validation
  - Company ID and metadata input
  - Supabase Storage integration
  
- **Edit Dialog**: `app/(dashboard)/dashboard/letters/components/LetterheadEditDialog.tsx`
  - Update name and description
  - Edit contact details (phone, email, address, website)

### 4. Data Hooks
- **File**: `app/(dashboard)/dashboard/letters/hooks/useLetterheads.ts`
- **Features**:
  - Fetch letterheads by company
  - Get default letterhead
  - Get letterhead by ID
  - Loading and error states

### 5. Integration Components
- **Updated**: `app/(dashboard)/dashboard/letters/components/LetterControls.tsx`
  - Added letterhead selector dropdown
  - Shows available letterheads when enabled
  - Displays default letterhead indicator

### 6. Utilities
- **File**: `app/(dashboard)/dashboard/letters/utils/letterheadIntegration.ts`
- **Functions**:
  - `getLetterheadFile()` - Download letterhead as Blob
  - `getLetterheadUrl()` - Get public URL
  - `downloadLetterhead()` - Download to user's device

### 7. Documentation
- **Setup Guide**: `LETTERHEADS_SETUP.md` - Quick start guide
- **Full Documentation**: `LETTERHEADS_README.md` - Complete reference
- **This Summary**: `INTEGRATION_SUMMARY.md`

## 🔌 How to Integrate with Main Letters Page

### Option 1: Add to Existing Page (Recommended)

Update `app/(dashboard)/dashboard/letters/page.tsx`:

```typescript
import { useLetterheads } from './hooks/useLetterheads';

// Inside component
const [selectedLetterheadId, setSelectedLetterheadId] = useState<string>('');
const { letterheads, loading: letterheadsLoading, getDefaultLetterhead } = useLetterheads(
  tab === 'companies' ? parseInt(companyId) : undefined
);

// Auto-select default letterhead when company changes
useEffect(() => {
  if (letterheads.length > 0 && !selectedLetterheadId) {
    const defaultLh = getDefaultLetterhead();
    if (defaultLh) {
      setSelectedLetterheadId(defaultLh.id);
    }
  }
}, [letterheads, companyId]);

// Pass to LetterControls
<LetterControls
  // ... existing props
  availableLetterheads={letterheads}
  selectedLetterheadId={selectedLetterheadId}
  setSelectedLetterheadId={setSelectedLetterheadId}
/>
```

### Option 2: Access via Navigation

Add link to sidebar/menu:
```typescript
{
  title: "Letterheads",
  href: "/dashboard/letters/letterheads",
  icon: FileText
}
```

## 📋 Next Steps

### Immediate (Ready to Use)
1. Run database migration
2. Verify Supabase Storage bucket exists
3. Upload first letterhead via UI
4. Test letterhead selection in letters page

### Phase 2 (Future Enhancement)
1. **Template Merging**
   - Install `docxtemplater` package
   - Extract header/footer from Word files
   - Merge with generated letter content

2. **Placeholder System**
   - Define placeholder format (e.g., `{{company_phone}}`)
   - Parse Word documents for placeholders
   - Replace with actual data on generation

3. **Preview Feature**
   - Convert Word to images for preview
   - Show header/footer preview in UI
   - Preview before applying to letter

## 🎯 Current Workflow

1. **Admin uploads letterhead**
   - Navigate to `/dashboard/letters/letterheads`
   - Click "Upload Letterhead"
   - Select Word file with company header/footer
   - Set as default if desired

2. **User generates letter**
   - Go to Letters page
   - Select company
   - Choose "General Layout"
   - Toggle "Use Letterhead" ON
   - Select letterhead from dropdown
   - Generate letter (currently uses programmatic generation)

3. **Future: Merged output**
   - System downloads letterhead Word file
   - Merges with letter content
   - Outputs combined document

## 🔧 Technical Notes

### Storage Structure
```
letterheads/ (bucket)
└── company-letterheads/
    └── {company_id}/
        └── {timestamp}-{random}.docx
```

### Database Constraints
- Only one default letterhead per company (enforced by unique index)
- Soft delete (is_active flag)
- Foreign key to company table with CASCADE delete

### API Response Format
```json
{
  "id": "uuid",
  "company_id": 123,
  "name": "Default",
  "file_path": "letterheads/123/1234567890-abc.docx",
  "is_default": true,
  "contact_details": {
    "phone": "+254...",
    "email": "info@..."
  }
}
```

## 🚨 Important Notes

1. **File Format**: Only .docx and .doc files supported
2. **Storage**: Requires Supabase Storage bucket `company-documents`
3. **Permissions**: Ensure RLS policies allow user access
4. **Default**: Cannot delete default letterhead (must set another as default first)
5. **Integration**: Currently stores letterhead reference; actual merging is Phase 2

## 📞 Support & Maintenance

- All files are in `app/(dashboard)/dashboard/letters/` directory
- API routes in `app/api/letterheads/`
- Migration in `supabase/migrations/`
- Documentation in letters directory

The module is production-ready for upload/management. Letter merging functionality can be added incrementally.

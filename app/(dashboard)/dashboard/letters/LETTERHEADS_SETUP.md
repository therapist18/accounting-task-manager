# Letterheads Module - Quick Setup Guide

## 🚀 Getting Started

### Step 1: Run Database Migration

Execute the migration to create the letterheads table:

```bash
# Using Supabase CLI
supabase db push

# Or manually run the SQL file
psql -d your_database -f supabase/migrations/20250227000000_create_company_letterheads.sql
```

### Step 2: Create Storage Bucket

Create a `letterheads` bucket in Supabase Storage:

1. Go to Supabase Dashboard > Storage
2. Create a new bucket named `letterheads`
3. Set appropriate permissions (public or authenticated based on your needs)
4. Enable file upload with max file size ~50MB

### Step 3: Access Letterheads Management

Navigate to: `/dashboard/letters/letterheads`

Or add a navigation link in your sidebar/menu.

## 📝 Quick Usage Example

### Upload Your First Letterhead

1. **Prepare Your Word Document**
   - Create a Word document (.docx) with your company header and footer
   - Include logo, company name, address, contact details
   - Save the file

2. **Upload to System**
   - Go to Letterheads page
   - Select company from sidebar (left panel)
   - Click "Upload Letterhead"
   - Company will be pre-selected
   - Name it "Default"
   - Select your Word file
   - Check "Set as default"
   - Click Upload

3. **Use in Letter Generation**
   - Go to Letters page
   - Select company from sidebar
   - Choose "General Layout"
   - Toggle "Use Uploaded Letterhead" ON
   - Select your letterhead from dropdown
   - Generate letter as usual

## 🔧 Integration Points

### In Your Letters Page

The letterheads module integrates with your existing letter generation through:

1. **useLetterheads Hook**
```typescript
import { useLetterheads } from './hooks/useLetterheads';

const { letterheads, loading, getDefaultLetterhead } = useLetterheads(companyId);
```

2. **LetterControls Component**
```typescript
<LetterControls
  // ... existing props
  availableLetterheads={letterheads}
  selectedLetterheadId={selectedLetterheadId}
  setSelectedLetterheadId={setSelectedLetterheadId}
/>
```

3. **Letter Generation**
```typescript
// Get selected letterhead
const selectedLetterhead = letterheads.find(lh => lh.id === selectedLetterheadId);

// Use letterhead file path for merging (future implementation)
if (selectedLetterhead && useLetterhead) {
  // Merge letterhead with letter content
  // This is where you'd integrate docxtemplater or similar
}
```

## 🎯 Current Features

✅ Upload Word letterheads per company  
✅ Multiple letterheads per company  
✅ Set default letterhead  
✅ Edit letterhead metadata  
✅ Store contact details  
✅ Soft delete letterheads  
✅ Integration with letter controls  

## 🔮 Future Enhancements

The module is designed to support:

- **Template Merging**: Use docxtemplater to merge letterhead with content
- **Placeholder System**: Support `{{company_phone}}`, `{{company_email}}` etc.
- **Dynamic Updates**: Edit contact details and update letterhead automatically
- **Preview**: Show letterhead preview before using
- **PDF Support**: Upload PDF letterheads

## 📊 Database Structure

```
acc_portal_company_letterheads
├── id (uuid)
├── company_id (bigint) → acc_portal_company_duplicate
├── name (text)
├── file_path (text) → Supabase Storage
├── is_default (boolean)
└── contact_details (jsonb)
```

## 🛠️ API Endpoints

- `GET /api/letterheads?company_id=123` - Fetch letterheads
- `POST /api/letterheads` - Create letterhead
- `PATCH /api/letterheads` - Update letterhead
- `DELETE /api/letterheads?id=xxx` - Soft delete

## 💡 Tips

1. **File Naming**: Use descriptive names like "Default", "Formal", "International"
2. **File Size**: Keep under 5MB for best performance
3. **Default**: Always have one default letterhead per company
4. **Testing**: Test letterhead before setting as default
5. **Backup**: Original files are preserved in storage

## 🐛 Troubleshooting

**Issue**: Letterheads not showing  
**Solution**: Check company_id is correct and letterhead is active

**Issue**: Upload fails  
**Solution**: Verify file format (.docx/.doc) and size (<50MB)

**Issue**: Cannot delete  
**Solution**: Cannot delete default letterheads - set another as default first

## 📞 Support

For detailed documentation, see `LETTERHEADS_README.md`

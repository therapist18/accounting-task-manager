# Letterhead Template Creation Guide

## Quick Start

This guide shows you how to create a Word letterhead template that works with the system.

## Template Requirements

Your letterhead template must be a `.docx` file (Word 2007 or later) with specific placeholders where dynamic content will be inserted.

## Placeholder Syntax

Use double curly braces for placeholders: `{{PLACEHOLDER_NAME}}`

### Available Placeholders

| Placeholder | Description | Example |
|------------|-------------|---------|
| `{{DATE}}` | Letter date | 27th February, 2026 |
| `{{REFERENCE}}` | Reference number | REF/2026/001 |
| `{{RECIPIENT}}` | Recipient address | Kenya Revenue Authority<br>P.O. Box 48240 - 00100<br>Nairobi, Kenya |
| `{{SUBJECT}}` | Letter subject | APPLICATION FOR TAX COMPLIANCE CERTIFICATE |
| `{{SALUTATION}}` | Opening greeting | Dear Sir/Madam, |
| `{{BODY}}` | Main letter content | (Your letter content) |
| `{{VALEDICTION}}` | Closing phrase | Yours faithfully, |
| `{{SIGNATORY_NAME}}` | Signatory's name | John Doe |
| `{{SIGNATORY_TITLE}}` | Signatory's title | Managing Director |

## Template Structure

### Recommended Layout

```
┌─────────────────────────────────────────┐
│  [COMPANY LOGO]                         │
│  COMPANY NAME                           │
│  P.O. Box 12345 - 00100                │
│  NAIROBI, KENYA                         │
│  Tel: +254 700 000 000                  │
│  Email: info@company.com                │
├─────────────────────────────────────────┤
│                                         │
│  Ref: {{REFERENCE}}                     │
│  Date: {{DATE}}                         │
│                                         │
│  {{RECIPIENT}}                          │
│                                         │
│  RE: {{SUBJECT}}                        │
│                                         │
│  {{SALUTATION}}                         │
│                                         │
│  {{BODY}}                               │
│                                         │
│  {{VALEDICTION}}                        │
│                                         │
│  {{SIGNATORY_NAME}}                     │
│  {{SIGNATORY_TITLE}}                    │
│                                         │
├─────────────────────────────────────────┤
│  Company Footer                         │
│  Registration No: 12345                 │
│  www.company.com                        │
└─────────────────────────────────────────┘
```

## Step-by-Step Template Creation

### Step 1: Create Header

1. Open Microsoft Word
2. Insert your company logo
3. Add company name and contact details
4. Format as desired (fonts, colors, alignment)
5. **Do NOT use placeholders in the header** - keep it static

### Step 2: Add Dynamic Fields

After the header, add these fields in order:

```
Ref: {{REFERENCE}}
Date: {{DATE}}

{{RECIPIENT}}

RE: {{SUBJECT}}

{{SALUTATION}}

{{BODY}}

{{VALEDICTION}}

{{SIGNATORY_NAME}}
{{SIGNATORY_TITLE}}
```

### Step 3: Create Footer

1. Add footer section at the bottom
2. Include company registration, website, etc.
3. **Do NOT use placeholders in the footer** - keep it static

### Step 4: Format the Document

1. Set margins (recommended: 2.5cm all sides)
2. Set font (recommended: Calibri 11pt or Arial 11pt)
3. Set line spacing (recommended: 1.15 or 1.5)
4. Align text as needed
5. Add any borders or styling

### Step 5: Test Placeholders

1. Make sure all placeholders are spelled correctly
2. Use UPPERCASE for placeholder names
3. Ensure double curly braces `{{` and `}}`
4. No spaces inside braces: `{{BODY}}` not `{{ BODY }}`

### Step 6: Save Template

1. Save as `.docx` format
2. Use a descriptive name (e.g., "Company_Letterhead_2026.docx")
3. Keep file size under 50MB

## Example Template

Here's a simple example you can copy:

```
[Insert your logo here]

ABC COMPANY LIMITED
P.O. Box 12345 - 00100
NAIROBI, KENYA
Tel: +254 700 000 000
Email: info@abccompany.com

────────────────────────────────────────

Ref: {{REFERENCE}}
Date: {{DATE}}

{{RECIPIENT}}

RE: {{SUBJECT}}

{{SALUTATION}}

{{BODY}}

{{VALEDICTION}}

{{SIGNATORY_NAME}}
{{SIGNATORY_TITLE}}

────────────────────────────────────────

ABC Company Limited | Registration No: PVT-123456
www.abccompany.com | info@abccompany.com
```

## Best Practices

### DO:

✅ Keep header and footer simple and static
✅ Use standard Word formatting
✅ Test the template before uploading
✅ Use high-quality logo images (PNG or JPG)
✅ Maintain consistent spacing
✅ Use professional fonts
✅ Keep file size reasonable

### DON'T:

❌ Use placeholders in header or footer
❌ Use complex tables or layouts
❌ Include macros or scripts
❌ Use non-standard fonts
❌ Make file size too large (>50MB)
❌ Use special characters in placeholders
❌ Forget to test placeholders

## Common Mistakes

### Mistake 1: Wrong Placeholder Syntax

**Wrong:**
```
{BODY}           // Single braces
[BODY]           // Square brackets
<BODY>           // Angle brackets
{{body}}         // Lowercase
{{ BODY }}       // Spaces inside
```

**Correct:**
```
{{BODY}}         // Double braces, uppercase, no spaces
```

### Mistake 2: Placeholders in Header/Footer

**Wrong:**
```
[Header]
{{COMPANY_NAME}}     // Don't use placeholders here
Tel: {{PHONE}}       // Don't use placeholders here
```

**Correct:**
```
[Header]
ABC COMPANY LIMITED  // Static text
Tel: +254 700 000    // Static text
```

### Mistake 3: Missing Required Placeholders

Make sure to include at least:
- `{{BODY}}` - Essential for letter content
- `{{DATE}}` - Usually needed
- `{{RECIPIENT}}` - Usually needed

## Testing Your Template

### Before Uploading:

1. **Visual Check**
   - Open the template in Word
   - Check all placeholders are visible
   - Verify formatting looks good

2. **Placeholder Check**
   - Search for `{{` to find all placeholders
   - Ensure they match the available list
   - Check for typos

3. **File Check**
   - Confirm it's saved as `.docx`
   - Check file size is reasonable
   - Test opening on different computers

### After Uploading:

1. **Preview Check**
   - View the auto-generated preview
   - Verify layout looks correct
   - Check logo and images display

2. **Generation Test**
   - Create a test letter
   - Download as Word
   - Open and verify placeholders were replaced
   - Check formatting is maintained

## Troubleshooting

### Problem: Placeholders not replaced

**Solution:**
- Check placeholder spelling
- Ensure double curly braces
- Verify placeholder is in the available list
- Check for extra spaces

### Problem: Formatting lost

**Solution:**
- Use simpler formatting
- Avoid complex tables
- Use standard fonts
- Check Word version compatibility

### Problem: Images not showing

**Solution:**
- Embed images (don't link)
- Use supported formats (PNG, JPG)
- Compress large images
- Check file paths

### Problem: File too large

**Solution:**
- Compress images
- Remove unused elements
- Save as newer .docx format
- Remove embedded fonts

## Advanced Tips

### Multiple Letterhead Versions

You can create different versions for different purposes:

- **Formal:** For official government correspondence
- **Informal:** For internal memos
- **International:** With different contact details
- **Seasonal:** With seasonal branding

Upload each as a separate letterhead and name them clearly.

### Dynamic Contact Details

While header/footer should be static, you can store contact details in the database and update them without re-uploading:

1. Upload letterhead with static contact info
2. Use "Edit" to update contact details in metadata
3. Future enhancement: inject these at generation time

### Version Control

When updating letterheads:

1. Upload new version with updated name (e.g., "Letterhead_v2")
2. Set as default if needed
3. Keep old version for historical letters
4. Delete old version when no longer needed

## Support

If you encounter issues:

1. Check this guide first
2. Review the System Architecture documentation
3. Test with a simple template
4. Contact system administrator

## Example Templates

### Minimal Template

```
COMPANY NAME

Ref: {{REFERENCE}}
Date: {{DATE}}

{{RECIPIENT}}

RE: {{SUBJECT}}

{{SALUTATION}}

{{BODY}}

{{VALEDICTION}}

{{SIGNATORY_NAME}}
{{SIGNATORY_TITLE}}
```

### Professional Template

```
┌─────────────────────────────────────────┐
│  [LOGO]        ABC COMPANY LIMITED      │
│                P.O. Box 12345 - 00100   │
│                NAIROBI, KENYA           │
│                Tel: +254 700 000 000    │
│                info@abccompany.com      │
└─────────────────────────────────────────┘

Our Ref: {{REFERENCE}}
Date: {{DATE}}

{{RECIPIENT}}

Dear Sir/Madam,

RE: {{SUBJECT}}

{{SALUTATION}}

{{BODY}}

{{VALEDICTION}}

_____________________
{{SIGNATORY_NAME}}
{{SIGNATORY_TITLE}}

┌─────────────────────────────────────────┐
│  ABC Company Limited                    │
│  Registration No: PVT-123456            │
│  www.abccompany.com                     │
└─────────────────────────────────────────┘
```

## Conclusion

Creating a letterhead template is straightforward:

1. Design header and footer (static)
2. Add placeholders for dynamic content
3. Format professionally
4. Save as .docx
5. Upload and test

The system handles the rest automatically!

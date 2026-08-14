import { redirect } from 'next/navigation';

// Merged into the Contract Template page - the placeholders pane now sits
// beside the editor, so a separate route is no longer needed. Keep this URL
// working for anyone with an old bookmark/link.
export default function ConsultancyPlaceholdersPage() {
  redirect('/dashboard/consultancy-contracts/settings');
}

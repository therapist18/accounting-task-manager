import { useState, useEffect } from 'react';
import supabase from '@/lib/supabase/client';

const LETTERHEAD_HEADER_ID = 'ecba00ea-4201-4cba-8395-105d3e784e04';
const LETTERHEAD_FOOTER_ID = '29f45665-2445-4bcf-8f5b-abf73e1762ad';

interface LetterheadDocument {
    id: string;
    file_path: string;
    document_id: string;
}

export function useLetterheadData(companyId: string) {
    const [headerUrl, setHeaderUrl] = useState<string | null>(null);
    const [footerUrl, setFooterUrl] = useState<string | null>(null);
    const [hasLetterhead, setHasLetterhead] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!companyId) {
            setHeaderUrl(null);
            setFooterUrl(null);
            setHasLetterhead(false);
            return;
        }

        const fetchLetterhead = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('acc_portal_kyc_uploads')
                    .select('id, file_path, document_id')
                    .eq('company_id', companyId)
                    .in('document_id', [LETTERHEAD_HEADER_ID, LETTERHEAD_FOOTER_ID]);

                if (error) throw error;

                if (data && data.length > 0) {
                    const header = data.find((d: LetterheadDocument) => d.document_id === LETTERHEAD_HEADER_ID);
                    const footer = data.find((d: LetterheadDocument) => d.document_id === LETTERHEAD_FOOTER_ID);

                    if (header?.file_path) {
                        const headerImageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${header.file_path}`;
                        setHeaderUrl(headerImageUrl);
                    }

                    if (footer?.file_path) {
                        const footerImageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/kyc-documents/${footer.file_path}`;
                        setFooterUrl(footerImageUrl);
                    }

                    setHasLetterhead(!!(header || footer));
                } else {
                    setHeaderUrl(null);
                    setFooterUrl(null);
                    setHasLetterhead(false);
                }
            } catch (error) {
                console.error('Error fetching letterhead:', error);
                setHeaderUrl(null);
                setFooterUrl(null);
                setHasLetterhead(false);
            } finally {
                setIsLoading(false);
            }
        };

        fetchLetterhead();
    }, [companyId]);

    return { headerUrl, footerUrl, hasLetterhead, isLoading };
}

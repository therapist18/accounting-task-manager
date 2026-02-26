import { useState, useEffect, useMemo } from 'react';
import supabase from '@/lib/supabase/client';
import { fetchCompanies, type Company } from '../../companies/database';
import { fetchIndividuals, type Individual } from '../../individuals/database';

const SIGNATURE_DOC_TYPE_ID = "67d9f93a-6b2b-4e19-86a3-ea7925c3d6ab";

const getSupabaseImageUrl = (filePath: string | null): string | null => {
    if (!filePath) return null;
    if (filePath.startsWith('http')) return filePath;
    const bucketName = 'kyc-documents';
    const fullPath = filePath.startsWith(bucketName) ? filePath : `${bucketName}/${filePath}`;
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${fullPath}`;
};

export interface Signatory {
    id: string;
    name: string;
    position: string;
    signatureUrl: string | null;
    associations: any[];
    foundSignature: boolean;
    employment_data?: any;
}

export function useLetterData(tab: 'companies' | 'individuals', companyId: string) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [individuals, setIndividuals] = useState<Individual[]>([]);
    const [signatures, setSignatures] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [companiesData, individualsData, signaturesData] = await Promise.all([
                    fetchCompanies(),
                    fetchIndividuals(),
                    supabase.from('acc_portal_directors_documents').select('*').eq('document_id', SIGNATURE_DOC_TYPE_ID)
                ]);

                setCompanies(companiesData);
                setIndividuals(individualsData);
                setSignatures(signaturesData.data || []);
            } catch (e) {
                console.error('Failed to fetch data:', e);
            }
        };
        fetchData();
    }, []);

    const availableSignatories = useMemo(() => {
        if (tab !== 'companies' || !companyId) return [];

        const signatoryList = individuals.map(ind => {
            const associations = ind.employment_data?.associations?.filter(
                (assoc: any) => assoc.company_id?.toString() === companyId
            ) || [];

            if (associations.length === 0) return null;

            // Only include directors and shareholders, exclude employees and principals
            const validAssociation = associations.find((a: any) => {
                const type = a.individual_type?.toLowerCase() || '';
                return type.includes('director') || type.includes('shareholder');
            });

            // If no valid director/shareholder association found, exclude this individual
            if (!validAssociation) return null;

            const sigDoc = signatures.find(s => s.director_id?.toString() === ind.id?.toString());

            return {
                id: ind.id,
                name: ind.full_name || 'Unknown',
                position: validAssociation.individual_type || 'Director',
                signatureUrl: sigDoc ? getSupabaseImageUrl(sigDoc.file_path) : null,
                associations: associations,
                foundSignature: !!sigDoc,
                employment_data: ind.employment_data
            };
        }).filter(Boolean) as Signatory[];

        return signatoryList;
    }, [companyId, individuals, signatures, tab]);

    return {
        companies,
        individuals,
        signatures,
        availableSignatories
    };
}

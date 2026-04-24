"use client";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import supabase from "@/lib/supabase/client";
import type { JobField, JobQuestion, Requirement, DocumentTemplate } from "../types";

export function useTemplateData(isOpen: boolean, jobLevel: any | null) {
  const { toast } = useToast();
  const [masterFields, setMasterFields] = useState<JobField[]>([]);
  const [jobQuestions, setJobQuestions] = useState<JobQuestion[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [kycDocuments, setKycDocuments] = useState<any[]>([]);
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);

  const fetchMasterFields = async () => {
    try {
      const { data, error } = await supabase.from('tm_job_fields').select('*').order('label');
      if (error) throw error;
      setMasterFields(data || []);
    } catch (error) {
      console.error('Error fetching master fields:', error);
      toast({ title: 'Could not load master fields', variant: 'destructive' });
    }
  };

  const fetchJobQuestions = async () => {
    try {
      if (jobLevel?.level) {
        const jobLevelObject = {
          level: jobLevel.level,
          department_id: jobLevel.department_id,
          subdepartment_id: jobLevel.subdepartment_id,
          class_id: jobLevel.class_id,
          subclass_id: jobLevel.subclass_id
        };

        const { data, error } = await supabase
          .from('tm_class_requirements')
          .select('*')
          .filter('job_level', 'eq', JSON.stringify(jobLevelObject))
          .maybeSingle();

        if (error) {
          console.error('Error fetching job-specific questions:', error);
        } else {
          setJobQuestions(data?.job_specific_questions || []);
          setRequirements(data?.requirements || []);
        }
      } else {
        const { data, error } = await supabase.from('tm_class_requirements').select('job_specific_questions, requirements');
        if (error) throw error;

        const allQuestions = data?.flatMap(r => r.job_specific_questions || []) || [];
        const uniqueQuestions = Array.from(new Map(allQuestions.map(q => [q.label, q])).values());
        setJobQuestions(uniqueQuestions);

        const allRequirements = data?.flatMap(r => r.requirements || []) || [];
        const uniqueRequirements = Array.from(new Map(allRequirements.map(r => [r.label, r])).values());
        setRequirements(uniqueRequirements);
      }
    } catch (error) {
      console.error('Error fetching job questions:', error);
      toast({ title: 'Could not load job questions', variant: 'destructive' });
    }
  };

  const fetchKycDocuments = async () => {
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('*').order('name');
      if (error) throw error;
      setKycDocuments(data || []);
    } catch (error) {
      console.error('Error fetching KYC documents:', error);
      setKycDocuments([]);
    }
  };

  const fetchDocumentTypes = async () => {
    try {
      const { data, error } = await supabase.from('acc_portal_kyc').select('*').order('display_name');
      if (error) throw error;
      setDocumentTypes(data || []);
    } catch (error) {
      console.error('Error fetching document types:', error);
      setDocumentTypes([]);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMasterFields();
      fetchJobQuestions();
      fetchKycDocuments();
      fetchDocumentTypes();
    }
  }, [isOpen, jobLevel]);

  return {
    masterFields,
    jobQuestions,
    requirements,
    kycDocuments,
    documentTypes,
    refetch: () => {
      fetchMasterFields();
      fetchJobQuestions();
      fetchKycDocuments();
      fetchDocumentTypes();
    }
  };
}

// @ts-nocheck
"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Search, FileText, Download, User, Building2, Briefcase } from 'lucide-react'
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { saveAs } from 'file-saver'
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'

import supabase from "@/lib/supabase/client"
import { letterCategories, letterFormats, getLetterFormat } from './letterFormats'

const templateTypes = {
  'special_pass': 'KSP APPLICATION LETTER - PHARMACY',
  'special_pass1': 'KSP APPLICATION LETTER - IT',
  'template2': 'CLASS G BUSINESS PERMIT - APPLICATION',
  'power_ace': 'CLASS D - APPLICATION LETTER',
};

export default function DocumentGeneratorPage() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [applicants, setApplicants] = useState([])
  
  // Data States
  const [selectedIndividual, setSelectedIndividual] = useState(null)
  const [relatedCompanies, setRelatedCompanies] = useState([])
  const [selectedCompany, setSelectedCompany] = useState(null)
  
  const [selectedLetterType, setSelectedLetterType] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [generatedText, setGeneratedText] = useState('')
  const [letterDate, setLetterDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedCheckboxes, setSelectedCheckboxes] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  // 1. Initial Load: Fetch Individuals
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('registry_individuals').select('id, full_name').order('full_name', { ascending: true });
      setApplicants(data || []);
    };
    fetchUsers();
  }, []);

  // 2. Main Logic: Fetch Individual + Related Companies via employment_data
  const handleIndividualChange = async (userId) => {
    try {
      setRelatedCompanies([]);
      setSelectedCompany(null);

      // Fetch the individual
      const { data: individual, error: indError } = await supabase
        .from('registry_individuals')
        .select('*')
        .eq('id', userId)
        .single();

      if (indError) throw indError;
      setSelectedIndividual(individual);

      // Extract Company IDs from employment_data.associations
      const associations = individual.employment_data?.associations || [];
      const companyIds = [...new Set(associations.map(a => a.company_id).filter(id => !!id))];

      if (companyIds.length > 0) {
        // Fetch all related companies
        const { data: companies, error: compError } = await supabase
          .from('acc_portal_company_duplicate')
          .select('*')
          .in('id', companyIds);

        if (compError) throw compError;
        setRelatedCompanies(companies || []);
        
        // Auto-select the first company if only one exists
        if (companies?.length === 1) {
          handleCompanySelect(companies[0].id.toString(), companies);
        }
      }
    } catch (error) {
      console.error('Error fetching individual/companies:', error);
    }
  };

  const handleCompanySelect = (companyId, companiesList = relatedCompanies) => {
    const company = companiesList.find(c => c.id.toString() === companyId);
    if (!company) return;

    // Find the specific role this individual has in THIS company from the employment_data
    const association = selectedIndividual.employment_data?.associations?.find(
      a => a.company_id.toString() === companyId
    );

    setSelectedCompany({
      ...company,
      individualRole: association?.role || association?.individual_type || 'Director'
    });
  };

  // 3. AI Text Generation
 const generateAIText = async () => {
    if (!selectedIndividual || !selectedCompany) return;
    setIsGenerating(true);

    const letterFormat = getLetterFormat(selectedLetterType);
    
    // We send a structured prompt to our API
    const payload = {
      modelType: "gemini-2.5-flash", // Signal to the backend to use Gemini logic
      prompt: `
        Context: You are a professional immigration and legal consultant.
        Task: Write a professional application letter for ${letterFormat?.title || selectedLetterType}.
        
        Details for the letter:
        - Date: ${letterDate}
        - Applicant Name: ${selectedIndividual.full_name}
        - Gender: ${selectedIndividual.gender}
        - Applicant R-Number: ${selectedIndividual.r_number}
        - Sponsoring Company: ${selectedCompany.company_name}
        - Individual's Role in Company: ${selectedCompany.individualRole}
        - Company Activity: ${selectedCompany.activity}
        - Company Physical Address: ${selectedCompany.physical_address}
        - Included Dependants: ${selectedCheckboxes.length > 0 ? selectedCheckboxes.join(', ') : 'None'}
        
        Requirements:
        1. Use a formal, professional tone.
        2. Include placeholders for addresses at the top.
        3. Ensure the content is brief and follows the standard format for ${selectedLetterType}.
      `
    };

    try {
      const response = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      // The backend returns the text in data.text
      setGeneratedText(data.text || 'Generation failed.');
    } catch (error) {
      console.error("Gemini Error:", error);
      setGeneratedText('Error connecting to AI service.');
    } finally {
      setIsGenerating(false);
    }
  };

  // 4. Word Generation
  const handleGenerateDocument = async () => {
    if (!selectedTemplate || !selectedIndividual || !selectedCompany) return;
    setIsDownloading(true);

    try {
      const response = await fetch(`/${selectedTemplate}.docx`);
      const arrayBuffer = await response.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      doc.setData({
        date: new Date(letterDate).toLocaleDateString('en-GB'),
        fullname: selectedIndividual.full_name.toUpperCase(),
        company: selectedCompany.company_name,
        position: selectedCompany.individualRole,
        activity: selectedCompany.activity,
        salutation: selectedIndividual.gender === "Male" ? "Mr." : "Ms.",
      });

      doc.render();
      const output = doc.getZip().generate({ type: 'blob' });
      saveAs(output, `${selectedTemplate}_${selectedIndividual.full_name}.docx`);
    } catch (error) {
      console.error(error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* INPUTS */}
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-slate-50/50">
            <h2 className="text-lg font-bold flex items-center gap-2"><User className="h-5 w-5" /> Individual Registry</h2>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            
            {/* 1. Select Individual */}
            <div className="space-y-2">
              <Label>Search Individual</Label>
              <Select onValueChange={handleIndividualChange}>
                <SelectTrigger><SelectValue placeholder="Select Person..." /></SelectTrigger>
                <SelectContent>
                  <div className="flex items-center px-3 pb-2"><Search className="mr-2 h-4 w-4" />
                    <Input placeholder="Filter..." className="h-8 border-none" onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  {applicants.filter(a => a.full_name.toLowerCase().includes(searchTerm.toLowerCase())).map(a => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Select Company (Filtered by Employment Data) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Associated Company</Label>
              <Select 
                disabled={relatedCompanies.length === 0} 
                onValueChange={handleCompanySelect}
                value={selectedCompany?.id?.toString()}
              >
                <SelectTrigger>
                  <SelectValue placeholder={relatedCompanies.length === 0 ? "No companies found" : "Select Company..."} />
                </SelectTrigger>
                <SelectContent>
                  {relatedCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCompany && (
                <p className="text-[11px] text-blue-600 font-medium">Role: {selectedCompany.individualRole}</p>
              )}
            </div>

            {/* Letter Logic & Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Letter Type</Label>
                <Select onValueChange={setSelectedLetterType}>
                   <SelectTrigger><SelectValue placeholder="Type..." /></SelectTrigger>
                   <SelectContent>
                    {Object.entries(letterCategories).map(([cat, items]) => (
                      <SelectGroup key={cat}>
                        <SelectLabel>{cat}</SelectLabel>
                        {items.map(i => <SelectItem key={i.key} value={i.key}>{i.title}</SelectItem>)}
                      </SelectGroup>
                    ))}
                   </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={letterDate} onChange={e => setLetterDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
                <Label>Word Template</Label>
                <Select onValueChange={setSelectedTemplate}>
                  <SelectTrigger><SelectValue placeholder="Choose Template..." /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(templateTypes).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
            </div>

            <Button 
              onClick={generateAIText} 
              className="w-full bg-blue-600" 
              disabled={isGenerating || !selectedCompany}
            >
              {isGenerating ? <Loader2 className="animate-spin mr-2" /> : <FileText className="mr-2" />}
              Generate AI Draft
            </Button>
          </CardContent>
        </Card>

        {/* PREVIEW */}
        <Card className="flex flex-col h-full">
          <CardHeader className="border-b bg-slate-50/50">
            <h2 className="text-lg font-bold flex items-center gap-2"><Building2 className="h-5 w-5" /> Letter Preview</h2>
          </CardHeader>
          <CardContent className="pt-6 flex-1 flex flex-col space-y-4">
            <Textarea
              value={generatedText}
              onChange={e => setGeneratedText(e.target.value)}
              className="flex-1 min-h-[400px] font-serif p-6"
            />
            <Button 
              onClick={handleGenerateDocument} 
              className="w-full bg-emerald-600 hover:bg-emerald-700 h-12"
              disabled={isDownloading || !selectedTemplate || !generatedText}
            >
              {isDownloading ? <Loader2 className="animate-spin" /> : <Download className="mr-2" />}
              Download Word Document
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
// @ts-nocheck

import React, { useState, useEffect, useRef } from 'react';
import { gpt } from "gpti";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { saveAs } from 'file-saver';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Loader2 } from 'lucide-react';
import { letterCategories, letterFormats, getLetterFormat } from './letterFormats';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"



const supabase = createClient(
  'https://wcmrsrnjtkrmfcjxmxpc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbXJzcm5qdGtybWZjanhteHBjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcwMjcwNTA2NywiZXhwIjoyMDE4MjgxMDY3fQ.FNNRgt4R-lWE9OWRkO22DbdaKy9Y3HKYs2U1u6XvSXI'
);

const templateTypes = {
  'special_pass': 'KSP APPLICATION LETTER - PHARMACY',
  'special_pass1': 'KSP APPLICATION LETTER - IT',
  'special_pass2': 'KSP APPLICATION LETTER - HARDWARE',
  'special_pass3': 'KSP APPLICATION LETTER - ACCOUNTING',
  'special_pass4': 'KSP APPLICATION LETTER - MANUFACTURING',
  'special_pass5': 'KSP APPLICATION LETTER - RESTAURANT',
  'template2': 'CLASS G BUSINESS PERMIT - APPLICATION LETTER',
  'template3': 'CLASS G BUSINESS PERMIT - RENEWAL  LETTER',
  'power_ace': 'CLASS D - POWER ACE MACHINERY (K) LIMITED - APPLICATION LETTER  ',
  'template5': 'CLASS D WORK PERMIT - RENEWAL  LETTER',
  'template6': 'E-VISA SPONSORSHIP LETTER',
  'template7': 'PERMANENT RESIDENCE RENEWAL  LETTER  ',
};

export function DocGen() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [applicants, setApplicants] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedLetterType, setSelectedLetterType] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [generatedText, setGeneratedText] = useState('');
  const [letterDate, setLetterDate] = useState('');
  const [selectedCheckboxes, setSelectedCheckboxes] = useState([]);

  const viewer = useRef(null);


  const handleLetterTypeChange = (value) => {
    setSelectedLetterType(value);
    if (value === 'KDP_EFNS') {
      setSelectedCheckboxes([]);
    } else {
      setSelectedCheckboxes([]);
    }
  };


  useEffect(() => {
    const fetchUsers = async () => {
      const { data: users, error } = await supabase.from('applicantdetails').select('*');
      if (error) {
        console.error('Error fetching users:', error);
      } else {
        setApplicants(users);
      }
    };

    fetchUsers();
  }, []);

  useEffect(() => {
    if (!viewer.current || !selectedTemplate) return;

    const viewerElement = document.createElement('viewer');
    viewer.current.appendChild(viewerElement);

    const filePath = `/${selectedTemplate}.docx`;
    import('@pdftron/webviewer').then(({ default: WebViewer }) => {
      WebViewer(
        {
          path: '/lib',
          initialDoc: filePath,
          enableOfficeEditing: true,
          licenseKey: 'demo:1707308193460:7f48ce1c0300000000468a5651c04454231af51ebf116c98b2da860542'
        },
        viewerElement
      ).then((instance) => {
        instance.Core.documentViewer.zoomTo(0.75);
      });
    });

    return () => {
      if (viewer.current) {
        viewer.current.removeChild(viewerElement);
      }
    };
  }, [selectedTemplate]);

  const handleUserChange = async (e) => {
    const selectedUserName = e.target.value;
    const user = applicants.find(applicant => applicant.fullname === selectedUserName);

    if (user) {
      const { data: companyDetails, error: companyDetailsError } = await supabase
        .from('companyinformation')
        .select('*')
        .eq('applicantid', user.applicantid)
        .single();

      if (companyDetailsError) {
        console.error('Error fetching company details:', companyDetailsError);
      } else {
        setSelectedUser({ ...user, companyDetails });
      }
    } else {
      setSelectedUser(null);
    }
  };

  const handleCheckboxChange = (checkbox) => {
    setSelectedCheckboxes((prevCheckboxes) => {
      if (prevCheckboxes.includes(checkbox)) {
        return prevCheckboxes.filter((item) => item !== checkbox);
      } else {
        return [...prevCheckboxes, checkbox];
      }
    });
  };

  const generateText = async () => {
    if (!selectedUser) return;
    setIsGenerating(true);

    const letterFormat = getLetterFormat(selectedLetterType);
    if (!letterFormat) {
      console.error('Invalid letter type selected');
      setIsGenerating(false);
      return;
    }

    const selectedDependants = selectedCheckboxes;
    console.log(selectedDependants);

    let history = [
      {
        role: "user",
        content: `Write an application letter for ${letterFormat.title} using the applicant's details. The letter should be short and brief. Include both the "From" and "To" addresses in the application. Do not include section headers in the letter.`
      },
      {
        role: "user",
        content: `Use this format as a guide:\n${letterFormat.formatGuide}`
      },
      {
        role: "user",
        content: `Here's an example:\n${letterFormat.example}`
      },
      {
        role: "user",
        content: `APPLICANT DETAILS:
                Full Name: ${selectedUser.fullname}
                Gender: ${selectedUser.gender}
                Company: ${selectedUser.companyDetails?.companyfullname}
                Industry: ${selectedUser.companyDetails?.companyactivity}
                Position: ${selectedUser.companyDetails?.directorname}
                Company Description: ${selectedUser.companyDetails?.companydescription}
                Application Date: ${letterDate} in DD/MM/YYYY format
                R Number: ${selectedUser.filernumber}
                Physical Address: ${selectedUser.companyDetails?.fullphysicaladdress}
                Postal Address: ${selectedUser.companyDetails?.postaladdress}
                Email: ${selectedUser.companyDetails?.emailcommunication}
                Mobile: ${selectedUser.companyDetails?.mobilenumberkenya}
                Selected Dependants: ${selectedDependants.join(', ')} - only for KDP- IF MORE THAN ONE DEPENDANT GENERATE DIFFERENT LETTERS USING THE FORMAT GUIDE ...SEPARATE USING A LINE and use the conditions for each dependant reason why`
      }
    ];

    try {
      const data = await new Promise((resolve, reject) => {
        gpt.v1({
          messages: history,
          prompt: "Generate the application letter based on the provided details.",
          model: "GPT-4",
          markdown: false
        }, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      setGeneratedText(data.gpt);
      console.log(data.gpt);

      // Parse the generated letter into structured sections
      const parseLetter = (generatedText) => {
        // Helper function to safely execute regex and return null if no match
        const safeMatch = (regex, text, flags = '') => {
          const match = text.match(new RegExp(regex, flags));
          return match ? match[1].trim() : null;
        };

        // Define regular expressions for each section
        const fromAddressRegex = '^([^]+?)(?=\\d{1,2}/\\d{1,2}/\\d{4})';
        const dateRegex = '(\\d{1,2}/\\d{1,2}/\\d{4})';
        const toAddressRegex = 'TO:\\s*\\n([^]+?)(?=Dear Sir/Madam,)';
        const salutationAndRefRegex = '(Dear Sir/Madam,\\s*\\nRE: [^\\n]+)';
        const bodyRegex = '(?:RE: [^\\n]+\\s*\\n\\n)([^]+)';

        // Execute each regex on the letter text
        const fromAddress = safeMatch(fromAddressRegex, generatedText, 's');
        const date = safeMatch(dateRegex, generatedText);
        const toAddress = safeMatch(toAddressRegex, generatedText, 's');
        const salutationAndRef = safeMatch(salutationAndRefRegex, generatedText, 's');
        const body = safeMatch(bodyRegex, generatedText, 's');

        // Construct the object with parsed sections
        const parsedLetter = {
          fromAddress,
          date,
          toAddress,
          salutationAndRef,
          body
        };

        console.log(parsedLetter);
        return parsedLetter;
      };

      parseLetter(data.gpt);

    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDocument = () => {
    if (!selectedTemplate || !selectedUser) return;

    const salutation = selectedUser.gender === "Male" ? "Mr. " : "Mrs. ";
    const prefix = selectedUser.gender === "Male" ? "He" : "She";

    fetch(`/${selectedTemplate}.docx`)
      .then(response => response.arrayBuffer())
      .then(data => {
        const zip = new PizZip(data);
        const doc = new Docxtemplater(zip);

        const templateData = {
          date: letterDate || new Date().toDateString(),
          fullname: selectedUser.fullname.toUpperCase(),
          company: selectedUser.companyDetails.companyfullname,
          fullName: selectedUser.fullname,
          activity: selectedUser.companyDetails.companyactivity,
          companyDescription: selectedUser.companyDetails.companydescription,
          position: selectedUser.companyDetails.directorname,
          mainTask: selectedUser.companyDetails.companyactivity,
          salutation,
          prefix,
        };

        doc.setData(templateData);
        doc.render();

        const output = doc.getZip().generate({ type: 'blob' });
        saveAs(output, `${selectedTemplate}_${selectedUser.fullname}.docx`);
      })
      .catch(error => console.error('Error:', error));
  };




  return (
    <div className="flex flex-col w-full h-full bg-white dark:bg-gray-900">
      <Label htmlFor="applicantSelect" className="p-4 justify-start text-2xl font-semibold text-gray-900">
        Document Generator
      </Label>
      <div className="flex justify-start w-full gap-6">
        <div className="flex flex-col w-[800px] p-4 h-full bg-white border-2 border-black/75 rounded-lg shadow">
          <div className="mb-4">
            <label className="block mb-2 text-md uppercase font-bold" htmlFor="user-select">
              Select User
            </label>
            <select onChange={handleUserChange} className="w-full p-2 border rounded-md">
              <option value="">Select a user</option>
              {applicants.map((applicant) => (
                <option key={applicant?.applicantid} value={applicant?.fullname}>
                  {applicant?.fullname}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <div className="mb-2">
              <span className="block text-md uppercase font-bold">User Details</span>
            </div>
            {['Name', 'Company', 'Industry', 'Job Position'].map((field) => (
              <div key={field} className="mb-2">
                <label className="block mb-1 text-sm uppercase font-bold" htmlFor={field.toLowerCase()}>
                  {field}:
                </label>
                <Input
                  className="bg-gray-200"
                  id={field.toLowerCase()}
                  value={
                    field === 'Name' ? selectedUser?.fullname :
                      field === 'Company' ? selectedUser?.companyDetails?.companyfullname :
                        field === 'Industry' ? selectedUser?.companyDetails?.companyactivity :
                          selectedUser?.companyDetails?.directorname
                  }
                  readOnly
                />
              </div>
            ))}
          </div>
          <div className="mb-4">
            <Label htmlFor="letter-type-select" className="block mb-2 text-md uppercase font-bold">
              Select Letter Type
            </Label>
            <Select onValueChange={handleLetterTypeChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a letter type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(letterCategories).map(([category, items]) => (
                  <SelectGroup key={category}>
                    <SelectLabel className='bg-sky-200'>{category}</SelectLabel>
                    {items.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {selectedLetterType === 'KDP_EFNS' && (
              <div className="mb-4 pt-3">
                <Label className="block mb-2 text-md uppercase font-bold">
                  Select Dependant
                </Label>
                <div className=" space-y-2 grid grid-cols-2">
                  {['Son', 'Mother', 'Daughter', 'Spouse', 'Father', 'Mother-in-law', 'Father-in-law'].map((relationship) => (
                    <div key={relationship} className="flex items-center space-x-2">
                      <Checkbox
                        id={relationship}
                        checked={selectedCheckboxes.includes(relationship)}
                        onCheckedChange={() => handleCheckboxChange(relationship)}
                      />
                      <label htmlFor={relationship} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {relationship}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mb-4">
            <label className="block mb-2 text-md uppercase font-bold" htmlFor="template-select">
              Select Template
            </label>
            <select onChange={(e) => setSelectedTemplate(e.target.value)} className="w-full p-2 border rounded-md">
              <option value="">Select a template</option>
              {Object.entries(templateTypes).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block mb-2 text-md uppercase font-bold" htmlFor="letter-date">
              Letter Date
            </label>
            <Input
              type="date"
              id="letter-date"
              value={letterDate}
              onChange={(e) => setLetterDate(e.target.value)}
              className="w-full p-2 border rounded-md"
            />
          </div>
          <Button
            onClick={generateText}
            className="w-full bg-stone-900 text-white mb-3"
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Text'
            )}
          </Button>
        </div>
        <div className="flex flex-col w-[800px] p-4 h-[700px] bg-white border-2 border-black/75 rounded-lg shadow">
          <Textarea
            value={generatedText}
            onChange={(e) => setGeneratedText(e.target.value)}
            className="w-full h-full bg-stone-30"
            placeholder="Generated Output"
          />
        </div>
        <div className="flex flex-col w-full h-[800px] ml-8 p-4 bg-white rounded-lg shadow">
          <div className="flex-1 mb-4 border-2 border-dashed rounded-lg p-4">
            <div className="h-full w-full flex items-center justify-center">
              {selectedTemplate ? (
                <div className="webviewer w-full h-full" ref={viewer} id='viewer'></div>
              ) : (
                <div className='flex flex-col items-center'>
                  <span className="text-sm italic font-bold">No document selected</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleGenerateDocument} className="w-1/3 bg-stone-900 text-white">Generate Document</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
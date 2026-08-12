// @ts-nocheck
"use client";

import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RecommenderSelect } from "./RecommenderSelect";

interface SendCvModalProps {
  cvData: any;
  showSendCvModal: boolean;
  setShowSendCvModal: (v: boolean) => void;
  sendMethod: 'email' | 'whatsapp';
  setSendMethod: (m: 'email' | 'whatsapp') => void;
  recommenderContactId: string | null;
  setRecommenderContactId: (id: string | null) => void;
  selectedRecommender: any;
  setSelectedRecommender: (rec: any) => void;
  sendCvRecipients: Record<string, boolean>;
  setSendCvRecipients: (updater: any) => void;
  thirdParties: { name: string; email: string; role: string }[];
  setThirdParties: (updater: any) => void;
  coverLetterText: string;
  setCoverLetterText: (v: string) => void;
}

export function SendCvModal({
  cvData,
  showSendCvModal,
  setShowSendCvModal,
  sendMethod,
  setSendMethod,
  recommenderContactId,
  setRecommenderContactId,
  selectedRecommender,
  setSelectedRecommender,
  sendCvRecipients,
  setSendCvRecipients,
  thirdParties,
  setThirdParties,
  coverLetterText,
  setCoverLetterText,
}: SendCvModalProps) {
  if (!showSendCvModal) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowSendCvModal(false); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0"><MessageSquare className="h-4 w-4 text-white" /></div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Send CV</h3>
              <p className="text-xs text-slate-400">Email or WhatsApp the candidate CV</p>
            </div>
          </div>
          <button onClick={() => setShowSendCvModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        {/* Send method */}
        <div className="flex gap-2">
          {(['email', 'whatsapp'] as const).map(m => (
            <button key={m} onClick={() => setSendMethod(m)}
              className={`flex-1 py-2 rounded-lg border-2 text-sm font-bold capitalize transition-all ${sendMethod === m ? (m === 'whatsapp' ? 'border-green-500 bg-green-50 text-green-700' : 'border-custom-blue bg-blue-50 text-custom-blue') : 'border-slate-200 text-slate-500'}`}
            >{m === 'whatsapp' ? '📱 WhatsApp' : '✉️ Email'}</button>
          ))}
        </div>

        {/* Recommender details */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recommender / Referrer</h4>
          <RecommenderSelect
            value={recommenderContactId}
            onChange={(rec) => { setRecommenderContactId(rec ? rec.id : null); setSelectedRecommender(rec); }}
            placeholder="Search recommender..."
          />
          <p className="text-[10px] text-slate-400">Select an existing recommender or create a new one.</p>
        </div>

        {/* Recipients */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Recipients</h4>
          <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
            {[
              { key: 'sandip', label: 'Sandip Patel (BCL)', detail: sendMethod === 'email' ? 'info@booksmartconsult.com' : '+254 700 505275' },
              { key: 'applicant', label: 'Applicant', detail: cvData.personalInfo?.email || cvData.personalInfo?.phone || 'No contact set' },
              { key: 'recommender', label: 'Recommender', detail: selectedRecommender?.email_address || selectedRecommender?.personal_mobile || 'Select a recommender' },
            ].map(r => (
              <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={sendCvRecipients[r.key]} onCheckedChange={v => setSendCvRecipients(p => ({ ...p, [r.key]: !!v }))} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-slate-700">{r.label}</span>
                  <span className="text-xs text-slate-400 ml-2 truncate">{r.detail}</span>
                </div>
              </label>
            ))}
          </div>

          {/* Third-party contacts */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Additional Recipients</span>
              <button onClick={() => setThirdParties(p => [...p, { name: '', email: '', role: 'recruiter' }])} className="text-xs text-custom-blue font-bold hover:underline">+ Add</button>
            </div>
            {thirdParties.map((tp, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <Input placeholder="Name" value={tp.name} onChange={e => setThirdParties(p => p.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} className="h-7 text-xs flex-1" />
                <Input placeholder="Email / Phone" value={tp.email} onChange={e => setThirdParties(p => p.map((x, xi) => xi === i ? { ...x, email: e.target.value } : x))} className="h-7 text-xs flex-1" />
                <select value={tp.role} onChange={e => setThirdParties(p => p.map((x, xi) => xi === i ? { ...x, role: e.target.value } : x))} className="h-7 text-xs border border-slate-200 rounded-md px-1 bg-white">
                  <option value="recruiter">Recruiter (To)</option>
                  <option value="applicant">Applicant (CC)</option>
                  <option value="cc">CC</option>
                </select>
                <button onClick={() => setThirdParties(p => p.filter((_, xi) => xi !== i))} className="text-slate-400 hover:text-red-500 shrink-0"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>

        {/* Cover letter */}
        {sendMethod === 'email' && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Cover Letter / Message Body</h4>
            <Textarea
              rows={5}
              placeholder={`Dear Hiring Manager,\n\nI am pleased to submit the CV of ${cvData.personalInfo?.fullName || 'the applicant'} for the position of ${cvData.personalInfo?.title || 'the role in question'}.\n\n${thirdParties[0]?.name ? `This applicant was referred by ${thirdParties[0].name}${thirdParties[0]?.company ? ` of ${thirdParties[0].company}` : ''}.` : ''}\n\nKind regards,\nBCL Recruitment Team`}
              value={coverLetterText}
              onChange={e => setCoverLetterText(e.target.value)}
              className="text-xs"
            />
            <p className="text-xs text-slate-400">Subject: CV Submission – {cvData.personalInfo?.fullName || 'Applicant'} – {cvData.personalInfo?.title || 'Role'}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => setShowSendCvModal(false)}>Cancel</Button>
          <Button
            className="flex-1 h-9 text-sm font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={async () => {
              const name = cvData.personalInfo?.fullName || 'Applicant';
              const role = cvData.personalInfo?.title || '';

              // Recommender is already saved when selected via RecommenderSelect component
              // No need to save again here

              if (sendMethod === 'whatsapp') {
                const toSandip = sendCvRecipients.sandip;
                const phone = toSandip ? '+254700505275' : (cvData.personalInfo?.phone || '');
                const msg = encodeURIComponent(`Hi Sandip, please find attached the CV of ${name}${role ? ` for the ${role} position` : ''}.${recommender.name ? ` Referred by ${recommender.name}${recommender.company ? ` (${recommender.company})` : ''}.` : ''}`);
                window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${msg}`, '_blank');
              } else {
                const recipients = [
                  sendCvRecipients.sandip ? 'info@booksmartconsult.com' : '',
                  sendCvRecipients.applicant ? (cvData.personalInfo?.email || '') : '',
                  sendCvRecipients.recommender ? recommender.email : '',
                  ...thirdParties.filter(t => t.role === 'recruiter').map(t => t.email),
                ].filter(Boolean).join(',');
                const cc = thirdParties.filter(t => t.role !== 'recruiter').map(t => t.email).filter(Boolean).join(',');
                const subject = encodeURIComponent(`CV Submission – ${name}${role ? ` – ${role}` : ''}`);
                const body = encodeURIComponent(coverLetterText || `Dear Hiring Manager,\n\nPlease find attached the CV of ${name}${role ? ` for the ${role} position` : ''}.\n\nKind regards,\nBCL Recruitment Team`);
                const ccParam = cc ? `&cc=${cc}` : '';
                window.open(`mailto:${recipients}?subject=${subject}${ccParam}&body=${body}`, '_blank');
              }
              toast.success(`Opening ${sendMethod === 'whatsapp' ? 'WhatsApp' : 'email client'}…`);
              setShowSendCvModal(false);
            }}
          >
            {sendMethod === 'whatsapp' ? '📱 Send via WhatsApp' : '✉️ Open Email Client'}
          </Button>
        </div>
      </div>
    </div>
  );
}

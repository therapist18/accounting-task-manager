-- Seed default clauses for all 21 contract sections.
-- These are global (company_id = NULL), marked as defaults.
-- Each uses {{placeholders}} that resolve from employee data and job profile settings.
-- Kenyan Employment Act, 2007 compliant.

INSERT INTO ec_clauses (section_key, clause_key, label, content, is_default, company_id, suggest_conditions, suggest_priority) VALUES

-- ─── 1. HEADING ───────────────────────────────────────────────────────────────
('heading', 'standard_heading', 'Standard Employment Contract Heading',
'<div class="contract-heading">
  <h1 class="contract-title">EMPLOYMENT CONTRACT</h1>
  <p class="contract-ref">Ref: {{company_name}}/HR/{{employee_id}}</p>
</div>',
true, NULL, '[]'::jsonb, 0),

-- ─── 2. PARTIES ───────────────────────────────────────────────────────────────
('parties', 'standard_parties', 'Standard Parties',
'<p>This Employment Contract ("<strong>Contract</strong>") is entered into on <strong>{{contract_date}}</strong> between:</p>
<ol class="parties-list">
  <li><strong>{{company_name}}</strong>, a company incorporated under the laws of the Republic of Kenya (Company No. {{company_registration_number}}), with its registered office at {{company_address}} (hereinafter referred to as "<strong>the Employer</strong>"); and</li>
  <li><strong>{{employee_name}}</strong>, an adult of sound mind, holder of Kenya National Identity Card No. <strong>{{national_id}}</strong> / Passport No. <strong>{{passport_number}}</strong>, KRA PIN <strong>{{kra_pin}}</strong>, of <strong>{{employee_address}}</strong> (hereinafter referred to as "<strong>the Employee</strong>").</li>
</ol>
<p>The Employer and the Employee are individually referred to as a "<strong>Party</strong>" and collectively as the "<strong>Parties</strong>".</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 3. APPOINTMENT ──────────────────────────────────────────────────────────
('appointment', 'standard_appointment', 'Standard Appointment',
'<p>The Employer hereby engages the Employee in the capacity of <strong>{{job_title}}</strong> under the following terms and conditions:</p>
<table class="details-table">
  <tr><td class="label-cell">Position</td><td>{{job_title}}</td></tr>
  <tr><td class="label-cell">Department</td><td>{{department}}</td></tr>
  <tr><td class="label-cell">Reports To</td><td>{{reports_to}}</td></tr>
  <tr><td class="label-cell">Employment Type</td><td>{{employment_type}}</td></tr>
  <tr><td class="label-cell">Job Level</td><td>{{job_level}}</td></tr>
  <tr><td class="label-cell">Commencement Date</td><td>{{start_date}}</td></tr>
  {{#if end_date}}<tr><td class="label-cell">End Date (Fixed Term)</td><td>{{end_date}}</td></tr>{{/if}}
  <tr><td class="label-cell">Probation Period</td><td>{{probation_period}}</td></tr>
  <tr><td class="label-cell">Probation Notice Period</td><td>{{probation_notice}}</td></tr>
</table>',
true, NULL, '[]'::jsonb, 0),

-- ─── 4. PLACE OF WORK ────────────────────────────────────────────────────────
('place_of_work', 'standard_place_of_work', 'Standard Place of Work',
'<p>The Employee''s primary place of work shall be <strong>{{work_location}}</strong>. The Employer reserves the right to temporarily or permanently reassign the Employee to any other office or work site within Kenya, subject to reasonable notice and consideration of the Employee''s personal circumstances, in accordance with Section 10 of the Employment Act, 2007.</p>
<p>The Employee acknowledges that the nature of their role may require occasional travel to other locations within Kenya or internationally as reasonably required by the Employer.</p>',
true, NULL, '[{"work_arrangement": "office"}]'::jsonb, 10),

('place_of_work', 'remote_place_of_work', 'Remote / Hybrid Place of Work',
'<p>The Employee''s primary place of work shall be <strong>{{work_location}}</strong> (Remote / Hybrid arrangement). The Employee is expected to be available at the Employer''s designated office or client sites as and when reasonably required, subject to <strong>{{notice_period}}</strong> prior written notice.</p>
<p>The Employee acknowledges that the nature of the role may require occasional travel to other locations within Kenya or internationally as reasonably required by the Employer.</p>',
false, NULL, '[{"work_arrangement": "remote"}, {"work_arrangement": "hybrid"}]'::jsonb, 20),

-- ─── 5. DUTIES ───────────────────────────────────────────────────────────────
('duties', 'standard_duties', 'Standard Duties and Responsibilities',
'<p>The Employee shall perform the duties and responsibilities as set out in the Job Description attached hereto as <strong>Appendix A</strong>, and such other duties as may be reasonably assigned by the Employer from time to time consistent with the Employee''s position and skill level.</p>
<p>The Employee shall:</p>
<ul>
  <li>Perform all duties to the best of their ability and in accordance with the Employer''s reasonable instructions;</li>
  <li>Comply with all lawful and reasonable directions and policies of the Employer;</li>
  <li>Devote their full time, attention, and abilities to the performance of their duties;</li>
  <li>Not engage in any occupation, business, or other employment without the prior written consent of the Employer;</li>
  <li>Maintain the standards of conduct, efficiency, and discipline reasonably required by the Employer.</li>
</ul>',
true, NULL, '[]'::jsonb, 0),

-- ─── 6. WORKING HOURS ────────────────────────────────────────────────────────
('working_hours', 'standard_office_hours', 'Standard Office Hours',
'<p>The Employee shall work <strong>{{working_days}}</strong> per week, between the hours of <strong>{{start_time}}</strong> and <strong>{{end_time}}</strong>, with a break of <strong>{{break_duration}}</strong> per day, amounting to <strong>{{working_hours}}</strong> per week.</p>
<p>Any hours worked beyond the normal working hours shall be subject to the Employer''s overtime policy and shall be compensated in accordance with the Employment Act, 2007 and the applicable Collective Bargaining Agreement, if any.</p>',
true, NULL, '[{"work_arrangement": "office"}]'::jsonb, 10),

('working_hours', 'flexible_hours', 'Flexible / Shift Hours',
'<p>The Employee shall work <strong>{{working_days}}</strong> per week, for a total of <strong>{{working_hours}}</strong> per week, on a flexible schedule as may be agreed with the Employee''s line manager. The Employee shall maintain a minimum of <strong>{{start_time}}</strong> to <strong>{{end_time}}</strong> core hours unless otherwise arranged.</p>
<p>Any hours worked beyond the normal working hours shall be subject to the Employer''s overtime policy and shall be compensated in accordance with the Employment Act, 2007.</p>',
false, NULL, '[{"work_arrangement": "flexible"}, {"work_arrangement": "shift"}]'::jsonb, 15),

('working_hours', 'remote_hours', 'Remote Working Hours',
'<p>The Employee shall work <strong>{{working_days}}</strong> per week, for a total of <strong>{{working_hours}}</strong> per week. The Employee shall be available and responsive during core hours of <strong>{{start_time}}</strong> to <strong>{{end_time}}</strong> via electronic communication.</p>
<p>The Employee shall attend the Employer''s office or client site as reasonably required, subject to <strong>{{notice_period}}</strong> prior notice.</p>',
false, NULL, '[{"work_arrangement": "remote"}]'::jsonb, 15),

-- ─── 7. REMUNERATION ─────────────────────────────────────────────────────────
('remuneration', 'standard_remuneration', 'Standard Remuneration',
'<p>In consideration of the services to be rendered hereunder, the Employer shall pay the Employee a gross monthly salary of <strong>KES {{gross_salary}}</strong> (Kenya Shillings {{gross_salary_words}}), payable <strong>{{payment_frequency}}</strong> on or before the <strong>{{payment_day}}</strong> of each payment period by direct credit to the Employee''s designated bank account.</p>
<p>The salary shall be subject to statutory deductions including but not limited to PAYE, NHIF, and NSSF as required by law. The salary is inclusive of any allowances unless otherwise specified in <strong>Appendix B – Salary Breakdown</strong>.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 8. BENEFITS ─────────────────────────────────────────────────────────────
('benefits', 'standard_benefits', 'Standard Benefits',
'<p>In addition to the basic salary, the Employee shall be entitled to the following benefits as set out in the Benefits Schedule at <strong>Appendix C</strong>:</p>
<ul class="benefits-list">
  <li><strong>Medical Cover:</strong> {{medical_cover}}</li>
  <li><strong>Pension Scheme:</strong> {{pension_scheme}}</li>
  <li><strong>Housing Allowance:</strong> {{housing_allowance}}</li>
  <li><strong>Transport Allowance:</strong> {{transport_allowance}}</li>
  <li><strong>Telephone Allowance:</strong> {{telephone_allowance}}</li>
  <li><strong>Meal Allowance:</strong> {{meal_allowance}}</li>
</ul>
<p>The benefits set out above are subject to review and may be amended by the Employer from time to time, provided that no amendment shall result in a reduction of benefits without the Employee''s written consent, save where such reduction is necessitated by law or business necessity.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 9. STATUTORY DEDUCTIONS ─────────────────────────────────────────────────
('statutory_deductions', 'standard_statutory_deductions', 'Standard Statutory Deductions',
'<p>The following statutory deductions shall be made from the Employee''s gross salary in accordance with applicable Kenyan law:</p>
<table class="details-table">
  <tr><td class="label-cell">PAYE</td><td>As per the Kenya Income Tax Act and KRA regulations</td></tr>
  <tr><td class="label-cell">NHIF</td><td>As per the National Hospital Insurance Act</td></tr>
  <tr><td class="label-cell">NSSF</td><td>As per the National Social Security Fund Act</td></tr>
</table>
<p>The Employee shall provide all necessary documentation, including a valid KRA PIN, to enable the Employer to process statutory deductions. The Employer shall remit all statutory contributions to the respective authorities within the timeframes prescribed by law.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 10. LEAVE ───────────────────────────────────────────────────────────────
('leave', 'standard_leave', 'Standard Leave Entitlements',
'<p>The Employee shall be entitled to the following leave entitlements, subject to the Leave Policy and applicable provisions of the Employment Act, 2007:</p>
<table class="details-table">
  <tr><td class="label-cell">Annual Leave</td><td>{{annual_leave_days}} working days per year, cumulative</td></tr>
  <tr><td class="label-cell">Sick Leave</td><td>As per the Employment Act, 2007</td></tr>
  <tr><td class="label-cell">Compassionate Leave</td><td>As per the Company policy</td></tr>
  <tr><td class="label-cell">Maternity / Paternity Leave</td><td>As per the Employment Act, 2007</td></tr>
  <tr><td class="label-cell">Public Holidays</td><td>As gazetted by the Government of Kenya</td></tr>
</table>
<p>Leave requests shall be submitted in writing in accordance with the Company''s leave application procedure and are subject to approval by the Employee''s line manager.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 11. EMPLOYEE OBLIGATIONS ────────────────────────────────────────────────
('employee_obligations', 'standard_employee_obligations', 'Standard Employee Obligations',
'<p>The Employee shall:</p>
<ol>
  <li>Perform their duties faithfully, diligently, and to the best of their ability;</li>
  <li>Comply with all lawful and reasonable instructions, rules, and policies of the Employer;</li>
  <li>Maintain the confidentiality of all proprietary and confidential information of the Employer, both during and after the term of employment;</li>
  <li>Not disclose or use any trade secrets, client lists, business strategies, or other confidential information for any purpose other than the performance of their duties;</li>
  <li>Not engage in any activity that constitutes a conflict of interest or that competes with the Employer''s business;</li>
  <li>Notify the Employer immediately of any material change in personal circumstances that may affect their ability to perform their duties;</li>
  <li>Return all property, documents, and materials of the Employer upon termination of employment or upon the Employer''s request;</li>
  <li>Comply with all applicable laws, regulations, and professional standards in the performance of their duties.</li>
</ol>',
true, NULL, '[]'::jsonb, 0),

-- ─── 12. PERFORMANCE ─────────────────────────────────────────────────────────
('performance', 'standard_performance', 'Standard Performance Expectations',
'<p>The Employee shall be subject to periodic performance reviews in accordance with the Employer''s Performance Management Policy. The performance review cycle shall be conducted annually unless otherwise communicated in writing.</p>
<p>The Employee acknowledges that:</p>
<ul>
  <li>Performance expectations will be communicated at the commencement of each review period;</li>
  <li>The Employer may provide training and support to assist the Employee in meeting performance expectations;</li>
  <li>Failure to meet performance standards may result in disciplinary action in accordance with the Employer''s Disciplinary Policy;</li>
  <li>Performance appraisals will be conducted fairly and in accordance with the principles of natural justice.</li>
</ul>',
true, NULL, '[]'::jsonb, 0),

-- ─── 13. TERMINATION ─────────────────────────────────────────────────────────
('termination', 'standard_termination', 'Standard Termination',
'<p>This Contract may be terminated as follows:</p>
<p><strong>(a) By Either Party:</strong> Either party may terminate this Contract by giving the other party <strong>{{notice_period}}</strong> written notice, or payment in lieu of notice, in accordance with Section 35 of the Employment Act, 2007.</p>
<p><strong>(b) During Probation:</strong> During the probation period, either party may terminate this Contract by giving <strong>{{probation_notice}}</strong> written notice.</p>
<p><strong>(c) By the Employer for Cause:</strong> The Employer may terminate this Contract without notice in accordance with Section 44 of the Employment Act, 2007, for gross misconduct including but not limited to:</p>
<ul>
  <li>Gross insubordination or willful disobedience of lawful orders;</li>
  <li>Gross misconduct or behavior incompatible with the Employee''s duties;</li>
  <li>Conviction of a criminal offense involving moral turpitude;</li>
  <li>Fraud, dishonesty, or breach of trust;</li>
  <li>Material breach of the terms of this Contract.</li>
</ul>
<p><strong>(d) Constructive Dismissal:</strong> If the Employer commits a fundamental breach of this Contract, the Employee may treat the Contract as terminated and claim constructive dismissal in accordance with applicable law.</p>
<p><strong>(e) Upon Expiry:</strong> If this is a fixed-term contract, it shall automatically expire on <strong>{{end_date}}</strong> unless renewed in writing by the Employer.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 14. GENERAL PROVISIONS ──────────────────────────────────────────────────
('general_provisions', 'standard_general_provisions', 'Standard General Provisions',
'<p><strong>Governing Law:</strong> This Contract shall be governed by and construed in accordance with the laws of the Republic of Kenya.</p>
<p><strong>Entire Agreement:</strong> This Contract (together with any schedules, appendices, and amendments hereto) constitutes the entire agreement between the Parties and supersedes all prior negotiations, representations, and agreements relating to the subject matter hereof.</p>
<p><strong>Amendments:</strong> No amendment to this Contract shall be valid unless made in writing and signed by both Parties.</p>
<p><strong>Severability:</strong> If any provision of this Contract is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</p>
<p><strong>Notices:</strong> All notices under this Contract shall be in writing and delivered to the addresses specified herein, or to such other address as either Party may notify the other in writing.</p>
<p><strong>Dispute Resolution:</strong> Any dispute arising out of or in connection with this Contract shall first be subject to mediation. If mediation fails within 30 days, the dispute shall be referred to arbitration in accordance with the Arbitration Act, 1995 of Kenya, or such other mechanism as the Parties may agree.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 15. ACCEPTANCE ──────────────────────────────────────────────────────────
('acceptance', 'standard_acceptance', 'Standard Acceptance',
'<p>The Employee confirms that they have read, understood, and accepted the terms and conditions set out in this Contract. The Employee acknowledges that they have been given the opportunity to seek independent legal advice before signing this Contract.</p>',
true, NULL, '[]'::jsonb, 0),

-- ─── 16. SIGNATURES ──────────────────────────────────────────────────────────
('signatures', 'standard_signatures', 'Standard Signatures',
'<div class="signatures-section">
  <table class="signature-table">
    <tr>
      <td class="sig-cell">
        <p class="sig-label">FOR AND ON BEHALF OF THE EMPLOYER:</p>
        <br/>
        <p class="sig-name">____________________________</p>
        <p class="sig-detail">Name: {{signatory_name}}</p>
        <p class="sig-detail">Title: {{signatory_title}}</p>
        <p class="sig-detail">Date: ______________________</p>
      </td>
      <td class="sig-cell">
        <p class="sig-label">THE EMPLOYEE:</p>
        <br/>
        <p class="sig-name">____________________________</p>
        <p class="sig-detail">Name: {{employee_name}}</p>
        <p class="sig-detail">Date: ______________________</p>
      </td>
    </tr>
  </table>
</div>',
true, NULL, '[]'::jsonb, 0),

-- ─── 17. APPENDIX A – JOB DESCRIPTION ────────────────────────────────────────
('appendix_job_description', 'standard_job_description', 'Standard Job Description Appendix',
'<div class="appendix">
  <h2>APPENDIX A – DETAILED JOB DESCRIPTION</h2>
  <table class="details-table">
    <tr><td class="label-cell">Job Title</td><td>{{job_title}}</td></tr>
    <tr><td class="label-cell">Department</td><td>{{department}}</td></tr>
    <tr><td class="label-cell">Reports To</td><td>{{reports_to}}</td></tr>
    <tr><td class="label-cell">Job Level</td><td>{{job_level}}</td></tr>
    <tr><td class="label-cell">Employment Type</td><td>{{employment_type}}</td></tr>
  </table>
  <p class="appendix-note"><em>Detailed job description and key performance indicators to be discussed and agreed upon at commencement and documented in the Employee''s first performance plan.</em></p>
</div>',
true, NULL, '[]'::jsonb, 0),

-- ─── 18. APPENDIX B – SALARY BREAKDOWN ───────────────────────────────────────
('appendix_salary_breakdown', 'standard_salary_breakdown', 'Standard Salary Breakdown Appendix',
'<div class="appendix">
  <h2>APPENDIX B – SALARY BREAKDOWN</h2>
  <table class="details-table salary-table">
    <tr><th>Component</th><th>Monthly (KES)</th><th>Annual (KES)</th></tr>
    <tr><td>Basic Salary</td><td>{{basic_salary}}</td><td>{{basic_salary_annual}}</td></tr>
    <tr><td>Housing Allowance</td><td>{{housing_allowance}}</td><td>{{housing_allowance_annual}}</td></tr>
    <tr><td>Transport Allowance</td><td>{{transport_allowance}}</td><td>{{transport_allowance_annual}}</td></tr>
    <tr><td>Telephone Allowance</td><td>{{telephone_allowance}}</td><td>{{telephone_allowance_annual}}</td></tr>
    <tr><td>Meal Allowance</td><td>{{meal_allowance}}</td><td>{{meal_allowance_annual}}</td></tr>
    <tr class="total-row"><td><strong>Gross Salary</strong></td><td><strong>{{gross_salary}}</strong></td><td><strong>{{gross_salary_annual}}</strong></td></tr>
  </table>
  <p class="appendix-note"><em>All allowances are inclusive of statutory deductions. The breakdown may be revised by the Employer from time to time in accordance with the terms of this Contract.</em></p>
</div>',
true, NULL, '[]'::jsonb, 0),

-- ─── 19. APPENDIX C – BENEFITS SCHEDULE ──────────────────────────────────────
('appendix_benefits_schedule', 'standard_benefits_schedule', 'Standard Benefits Schedule Appendix',
'<div class="appendix">
  <h2>APPENDIX C – BENEFITS SCHEDULE</h2>
  <table class="details-table">
    <tr><td class="label-cell">Medical Cover</td><td>{{medical_cover}}</td></tr>
    <tr><td class="label-cell">Pension Scheme</td><td>{{pension_scheme}}</td></tr>
    <tr><td class="label-cell">Annual Leave Days</td><td>{{annual_leave_days}} working days per year</td></tr>
    <tr><td class="label-cell">Rest Days</td><td>{{rest_days}}</td></tr>
  </table>
  <p class="appendix-note"><em>Benefits are subject to the terms and conditions of the relevant benefit providers and may be amended from time to time in accordance with Company policy.</em></p>
</div>',
true, NULL, '[]'::jsonb, 0),

-- ─── 20. APPENDIX D – COMPANY POLICIES ───────────────────────────────────────
('appendix_company_policies', 'standard_company_policies', 'Standard Company Policies Appendix',
'<div class="appendix">
  <h2>APPENDIX D – COMPANY POLICIES</h2>
  <p>The Employee acknowledges receipt of, and agrees to comply with, the following Company policies as may be amended from time to time:</p>
  <ul>
    <li>Code of Conduct and Ethics Policy</li>
    <li>Anti-Fraud and Corruption Policy</li>
    <li>Health and Safety Policy</li>
    <li>Data Protection and Privacy Policy</li>
    <li>Information Security Policy</li>
    <li>Disciplinary Policy and Procedure</li>
    <li>Grievance Handling Policy</li>
    <li>Leave Policy</li>
    <li>Remote / Hybrid Working Policy (if applicable)</li>
  </ul>
  <p class="appendix-note"><em>Current versions of all Company policies are available on the Company intranet or from the Human Resources Department.</em></p>
</div>',
true, NULL, '[]'::jsonb, 0),

-- ─── 21. APPENDIX E – EQUIPMENT ISSUED ───────────────────────────────────────
('appendix_equipment_issued', 'standard_equipment_issued', 'Standard Equipment Issued Appendix',
'<div class="appendix">
  <h2>APPENDIX E – EQUIPMENT ISSUED</h2>
  <p>The following equipment has been issued to the Employee for the performance of their duties and remains the property of the Employer:</p>
  <table class="details-table equipment-table">
    <tr><th>Item</th><th>Make / Model</th><th>Serial No.</th><th>Date Issued</th></tr>
    <tr><td>________________________</td><td>________________________</td><td>________________________</td><td>________________________</td></tr>
    <tr><td>________________________</td><td>________________________</td><td>________________________</td><td>________________________</td></tr>
  </table>
  <p>The Employee shall be responsible for the safekeeping and proper use of all issued equipment. Upon termination of employment, all equipment must be returned in good working condition (fair wear and tear excepted). Loss or damage to equipment due to negligence or misuse shall be deducted from the Employee''s final salary or recovered separately.</p>
</div>',
true, NULL, '[]'::jsonb, 0);

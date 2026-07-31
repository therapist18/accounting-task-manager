-- Contract structure change: 'remuneration' and 'statutory_deductions' are
-- merged into one 'salary_statutory_deductions' section (contract wording now
-- only says salary is subject to "applicable statutory deductions" rather than
-- freezing PAYE/NSSF/NITA/Housing Levy rules and rates into the contract text
-- itself - those are Payroll's job to compute, and NITA is an employer levy,
-- not an employee deduction, so it never belonged in this clause). 'benefits'
-- is rewritten to render only the benefits actually active for an employee via
-- {{applicable_benefits}} (see buildApplicableBenefitsList in
-- utils/standardPlaceholders.ts) instead of listing every possible benefit
-- field unconditionally.
--
-- Deliberately NOT touching the old 'remuneration' / 'statutory_deductions' /
-- 'appendix_salary_breakdown' / 'appendix_benefits_schedule' clause rows or
-- any job profile / offer that still references them by section_key - per
-- repo owner's decision, those get reassigned or deleted manually via the
-- Clause Library UI, since section_key is data the code can't safely rewrite
-- on someone else's behalf (a company may have customized those clauses).

INSERT INTO ec_clauses (section_key, clause_key, label, content, is_default, company_id, suggest_conditions, suggest_priority) VALUES
('salary_statutory_deductions', 'standard_salary_statutory_deductions', 'Standard Salary and Statutory Deductions',
'<p>
In consideration of the services to be rendered by the Employee under this
Contract, the Employer shall pay the Employee a gross monthly salary of
<strong>KES {{gross_salary}}</strong>
(Kenya Shillings <strong>{{gross_salary_words}}</strong>).
The salary shall be payable <strong>{{payment_frequency}}</strong> on or
before the <strong>{{payment_day}}</strong> of each applicable payment
period by direct credit to the Employee''s designated bank account.
</p>
<p>
The Employee''s gross salary shall be subject to all statutory deductions and
contributions applicable under the laws of the Republic of Kenya from time
to time. The Employer shall make such deductions from the Employee''s
remuneration and remit them to the relevant statutory authorities in
accordance with applicable law.
</p>
<p>
The Employee''s remuneration and applicable statutory deductions shall be
reflected in the Employee''s payroll and itemised pay statement in accordance
with applicable law.
</p>
<p>
The detailed salary structure applicable to the Employee, including the
basic salary and any applicable allowances or other salary components, shall
be determined from the Employee''s approved remuneration arrangement.
</p>',
true, NULL, '[]'::jsonb, 0);

UPDATE ec_clauses
SET content = '<p>
In addition to the salary provided for under this Contract, the Employee
shall be entitled to such benefits and allowances as are applicable to
their employment and approved by the Employer.
</p>
<p>
The benefits applicable to the Employee shall be determined based on the
Employee''s approved employment and remuneration arrangements and may
include, where applicable:
</p>
<ul class="benefits-list">
    {{applicable_benefits}}
</ul>
<p>
Any benefit provided by the Employer shall be subject to the applicable
terms, eligibility requirements, Company policies and rules of the relevant
benefit scheme. Benefits that are discretionary or provided under a Company
scheme may be amended or withdrawn in accordance with the applicable scheme
rules, Company policies and applicable law.
</p>',
    updated_at = now()
WHERE section_key = 'benefits' AND clause_key = 'standard_benefits';
-- Adds an illustrative statutory deductions breakdown table to the standard
-- salary_statutory_deductions clause, rendered via the new
-- {{statutory_deductions_table}} placeholder (computed per-employee from
-- gross_salary at generation time - see statutoryDeductions.ts /
-- standardPlaceholders.ts). This does NOT reverse the decision in
-- 20260731000000_ec_salary_statutory_deductions_dynamic_benefits.sql to keep
-- statutory rates out of frozen contract text: the clause still states
-- deductions are "subject to applicable law from time to time", and the
-- table's figures are computed fresh from one canonical formula (updated
-- centrally when rates change) rather than typed into each contract by hand.
UPDATE ec_clauses
SET content = '<p>
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
For illustration, the table below sets out the statutory deductions
applicable to the Employee''s gross salary, computed at the rates in force as
at the date of this Contract. The Employer''s payroll system shall determine
the actual amounts withheld in each pay period in accordance with applicable
law, which may vary if statutory rates change after the date of this
Contract.
</p>
{{statutory_deductions_table}}
<p>
The detailed salary structure applicable to the Employee, including the
basic salary and any applicable allowances or other salary components, shall
be determined from the Employee''s approved remuneration arrangement.
</p>',
    updated_at = now()
WHERE section_key = 'salary_statutory_deductions' AND clause_key = 'standard_salary_statutory_deductions';

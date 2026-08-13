-- Seeds the standard Consultancy Agreement content (converted from the
-- sample doc: "AAA - MAIN - SAMPLE - BCL + CLIENT - BOOKKEEPING &
-- CONSULTANCY CONTRACT - IN HOUSE - 2025.docx"). Company-identity tokens use
-- ec_placeholders' existing keys (company_name, company_kra_pin,
-- company_address, company_registration_number) so linking a master field
-- once serves both Employment Contracts and this module - see the note in
-- 20260813000000_consultancy_contract_engine.sql. Only tokens with no EC
-- equivalent get new ec_placeholders rows here.
-- Guarded with NOT EXISTS / ON CONFLICT so re-running this migration against
-- a DB that already has app-created rows is a no-op.

INSERT INTO cc_templates (name, content, is_default)
SELECT
  'Standard Bookkeeping & Consultancy Agreement',
  $tpl$<h1>CONSULTANCY AGREEMENT<br/>FOR<br/>BOOKKEEPING, ACCOUNTANCY AND FINANCIAL ADVISORY SERVICES<br/>BETWEEN<br/>BOOKSMART CONSULTANCY LIMITED<br/>AND<br/>{{company_name}}</h1>

<p style="text-align:right;">REF: {{contract_ref}}<br/>Date: {{effective_date}}</p>

<h2>Introduction</h2>
<p>The Director(s)<br/>{{company_name}}</p>
<p>Dear Director(s),</p>
<p><strong>RE: CONSULTANCY FOR BOOKKEEPING, ACCOUNTANCY, TAXATION, AND FINANCIAL ADVISORY ENGAGEMENT LETTER</strong></p>
<p>Following our appointment, a Tax and Financial Advisors: Consultants, we set out here below the basis on which we are to act as so and the respective areas of responsibility of the director and ourselves. This Consultancy Agreement (the &ldquo;Agreement&rdquo;) is made and entered into on {{effective_date}} (the &ldquo;Effective Date&rdquo;) by and between {{company_name}} (herein referred to as &ldquo;the Company&rdquo;), KRA PIN {{company_kra_pin}}, with its principal place of business located at {{company_address}}, and BOOKSMART CONSULTANCY LIMITED with its principal place of business located at Pursuits Building, Parklands, Nairobi City (the &ldquo;Consultant&rdquo;) (hereinafter referred to individually as a &ldquo;Party&rdquo; and collectively as &ldquo;the Parties&rdquo;).</p>
<p>WHEREAS, the Company, {{company_business_description}}.</p>
<p>WHEREAS, the Consultant has expertise in the area of Bookkeeping, Accounting, Taxation and Financial Advisory.</p>
<p>WHEREAS, the Company desires to engage the Consultant to provide certain services in the area of the Consultant's expertise and the Consultant is willing to provide such services to the Company;</p>
<p>NOW, THEREFORE, the Parties hereby agree as follows:</p>

<h2>Responsibilities of the Director</h2>
<p>As the director of the Company, you are responsible for the safeguarding of assets, for the substantial accuracy of the financial records, and for the full and accurate disclosure of all relevant facts affecting the maintenance of accounting records, for the selection and application of appropriate accounting policies, and for preparing financial statements in conformity with International Financial Reporting Standards, which give a true and fair view of the state of the financial affairs of the Company. You are also responsible for making available to us, as and when required, all the Company's accounting and other records and information, including minutes of all management meetings, and information and explanations which we consider necessary for the performance of our duties as Accountants, Tax, and Financial Advisors.</p>
<p>You represent that the information you are supplying to us is accurate and complete to the best of your knowledge and that expenses are supported by records as required by law. Where deductions cannot be substantiated, we will exclude them from the tax return.</p>
<p>You are responsible for making all management decisions and performing all management functions, for designating an individual with suitable skills, knowledge, or experience to oversee the bookkeeping and tax services we provide, and for evaluating the adequacy and results of the services performed.</p>
<p>You have the final responsibility for the income tax returns and, therefore, you should review them carefully before you sign. You also have the final responsibility to assign a responsible person to use the accounting software and frequently make backups. The Company shall have an Accountant stationed at the Company's premises during the Company's working hours for the duration of this engagement.</p>

<h2>Responsibilities of the Consultant</h2>
<ul>
<li>It is the responsibility of the Consultant to prepare a proper recording of transactions in the books of accounts, from the information made available to us, and to maintain the documentation necessary to support the data used in preparing your tax returns.</li>
<li>To prepare the Company's books in readiness for audit. All relevant information and documents must be made available to us within two months from the end of the financial year.</li>
<li>The Consultant shall conduct tax compliance checks, determine the practical applications of newly issued Kenya Revenue Authority regulations, and coordinate complex corporate structure and operations with appropriate tax planning, ensuring that tax strategies are favorable to all parties and pose no threat to the organization. These services shall be provided from the Consultant's premises.</li>
<li>The Consultant shall scrutinize the audited books of accounts and conduct accounting for taxation to ensure that the Company minimizes its tax exposure.</li>
<li>The Consultant shall provide qualified staff to work at the Company's premises as agreed, responsible for posting and updating accounting entries and performing other bookkeeping services as required by the Company.</li>
</ul>

<h2>Scope of Engagement</h2>
<ul>
<li>To ensure appropriate accounting policies and International Financial Reporting Standards are followed as per the regulations.</li>
<li>To undertake all bookkeeping and accountancy assignments and provide relevant financial reports as required by the business.</li>
<li>General tax advisory, preparation and filing of monthly VAT, NSSF, NHIF, PAYE returns, NITA, Housing Levy, Withholding Tax, Withholding VAT, Instalment Taxes, Advance Taxes, Fringe Benefit Taxes, Final Corporation Tax and other taxes as may be applicable from time to time.</li>
<li>To arrange for payment plans and the process of a Tax Compliance Certificate where the Company has not paid taxes.</li>
<li>To prepare annual income tax computations, complete and submit returns, and secure refunds where applicable.</li>
<li>To conduct health checks on taxes and coordinate complex corporate structure and operations with appropriate tax planning.</li>
<li>To update the Company's KRA iTax platform to include Booksmart Consultancy Limited as its appointed, authorized tax agent.</li>
</ul>

<h2>Exemption</h2>
<p>The following services are exempted from the scope of this engagement, being non-regular transactions arising from factors beyond our control. Where they arise, they shall be billed separately: securing tax refunds when they fall due; overseeing tax cases; verification or investigation by a government entity or industry regulator; and tax dispute resolution.</p>

<h2>Consultancy Period</h2>
<p>This Agreement shall commence on {{effective_date}} (the "Effective Date") and shall remain effective indefinitely until the completion of the Services or earlier termination as provided in the Termination clause. The completion time for every assignment shall be communicated in writing and may vary depending on the nature of the assignment.</p>

<h2>Confidentiality</h2>
<p>Any information pertaining to the operations of the Company will be held in the strictest confidence. We require strict adherence by all our staff to the ethical rules of our profession, and the firm and its employees maintain complete independence of interest and mental attitude in relationships with clients.</p>

<h2>Indemnification &amp; Non-Disclosure</h2>
<p>The Company agrees to release, indemnify and hold Booksmart Consultancy Limited harmless from any and all liability and costs resulting from any known misrepresentations or fraud by management, or errors resulting from incomplete or inaccurate information provided by management - an indemnity that is ongoing even after the contract's termination.</p>
<p>Booksmart Consultancy Limited undertakes to keep any information it comes into contact with confidential, subject to governing law, and the Company agrees that no action can be taken against Booksmart Consultancy Limited for such contact unless it fails to honor this undertaking.</p>

<h2>Fees</h2>
<p>Our fees are based on the knowledge and skills used in the course of the assignment and the professional judgment made during the engagement, exclusive of Value Added Tax and disbursements.</p>
<p><strong>a) Bookkeeping, Accountancy, and filing of statutory returns - Per Month</strong></p>
<table>
<thead><tr><th>Net Amount (Kshs)</th><th>VAT Amount (Kshs)</th><th>Gross Amount (Kshs)</th><th>Terms of Payment</th></tr></thead>
<tbody><tr><td>{{monthly_net_fee}}</td><td>{{monthly_vat_fee}}</td><td>{{monthly_gross_fee}}</td><td>Upon issuance of our fee note per month, 1st of each month.</td></tr></tbody>
</table>
<p><strong>Per Quarter</strong> (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec)</p>
<table>
<thead><tr><th>Net Amount (Kshs)</th><th>VAT Amount (Kshs)</th><th>Gross Amount (Kshs)</th><th>Terms of Payment</th></tr></thead>
<tbody><tr><td>{{quarterly_net_fee}}</td><td>{{quarterly_vat_fee}}</td><td>{{quarterly_gross_fee}}</td><td>Upon issuance of our fee note per quarter, 1st of each quarter.</td></tr></tbody>
</table>
<p>Fees are subject to annual review and will vary with several factors, including developments in the business. We shall require progress payments as our work progresses, payable on rendering of our fee note. Any other provision of consultancy outside the above during the year shall be billed separately.</p>

<h2>Complete Agreement</h2>
<p>This letter supersedes any existing, previous, express or inferred terms of engagement the Company had with us before the Effective Date and shall remain effective until replaced or terminated. Termination of our appointment by the Company will require a formal resolution at a validly convened meeting, or a resolution signed by all directors/shareholders.</p>

<h2>Termination</h2>
<p>This is an indefinite engagement and either party may terminate this relationship on ninety (90) days' written notice to the other, including email notification. Where the Company provides less than ninety (90) days' notice, the average of one quarter's applicable billings will be payable in lieu of notice. The fee shall be payable up to the date of termination. During the notice period, projects in process shall be completed if possible, and no other work shall be undertaken unless the parties agree in writing to specific terms for the additional work.</p>

<h2>Applicable Law</h2>
<p>This engagement letter shall be governed by, and construed in accordance with, the Laws of Kenya.</p>

<h2>Arbitration</h2>
<p>The parties will make every reasonable effort to settle amicably any disputes or differences arising out of this engagement. Failing agreement on an arbitrator within 14 days of application by either party, the dispute shall be resolved in accordance with the governing laws of Kenya, executed by the courts.</p>

<h2>Acknowledgment Clause</h2>
<p>The engagement will be confirmed upon signing the letter in the space provided and initialing all pages of the letter, and returning it to us.</p>

<p>Yours faithfully,</p>
<p><strong>{{signatory_name}}</strong><br/>{{signatory_title}}<br/>Booksmart Consultancy Limited</p>

<h2>Company Directors Acknowledgement and Acceptance</h2>
<p>We have reviewed the engagement letter and agree to the terms and conditions therein.</p>
<p>For and on behalf of: {{company_name}}</p>
<p>Director's Name: ____________________________________</p>
<p>Sign: __________________________ Date: __________________________</p>
<p>Director's Name: ____________________________________</p>
<p>Sign: __________________________ Date: __________________________</p>
$tpl$,
  true
WHERE NOT EXISTS (SELECT 1 FROM cc_templates WHERE is_default = true);

-- Tokens with no ec_placeholders equivalent - company_name/company_kra_pin/
-- company_address are NOT reinserted here, the template above references
-- those existing keys directly. master_field_id is left NULL (same "not
-- linked yet" convention as 20260723000003_seed_ec_placeholders.sql) since
-- none of these have a sensible master-field source; they resolve from
-- default_value / cc_engagements.placeholder_overrides only.
INSERT INTO ec_placeholders (key, label, group_label, source_kind, entity_type, default_value, description, required, editable) VALUES
  ('company_business_description', 'Company Business Description', 'Consultancy Contract', 'master_field', ARRAY['company'], NULL, 'One sentence describing what the client company does, used in the WHEREAS clause.', false, true),
  ('contract_ref', 'Reference Number', 'Consultancy Contract', 'master_field', ARRAY['company'], 'BCL/AAEL/02-24', NULL, false, true),
  ('effective_date', 'Effective Date', 'Consultancy Contract', 'master_field', ARRAY['company'], NULL, NULL, true, true),
  ('monthly_net_fee', 'Monthly Net Fee', 'Consultancy Contract', 'master_field', ARRAY['company'], '30,000', 'VAT and Gross are calculated automatically at 16%.', true, true),
  ('quarterly_net_fee', 'Quarterly Net Fee', 'Consultancy Contract', 'master_field', ARRAY['company'], '90,000', 'VAT and Gross are calculated automatically at 16%.', false, true),
  ('signatory_name', 'BCL Signatory Name', 'Consultancy Contract', 'master_field', ARRAY['company'], 'Sandip Patel', NULL, false, true),
  ('signatory_title', 'BCL Signatory Title', 'Consultancy Contract', 'master_field', ARRAY['company'], 'Managing Director', NULL, false, true)
ON CONFLICT (key) DO NOTHING;

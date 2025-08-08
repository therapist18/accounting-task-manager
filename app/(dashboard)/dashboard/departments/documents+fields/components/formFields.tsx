// formFields.tsx
export interface FormField {
    name: string;
    label: string;
    type: string;
    placeholder?: string;
    showInTable?: boolean;
    showInDialog?: boolean;
    tableHeader?: string;
    disabled?: boolean;
    className?: string;
    colSpan?: number;
    callback?: string;
    dataSource?: any;
    dependsOn?: string;
    hasDependent?: boolean;
    staticOptions?: string;
    onChange?: (value: any) => FormField[];
}

export interface FormSection {
    title: string;
    fields: FormField[];
}

export interface PlatformCredentials {
    [key: string]: FormSection;
}

export interface FormSections {
    [key: string]: FormSection;
}

export const companyFields = {
    platformCredentials: {
        itax: {
            title: "iTax Credentials",
            fields: [
                { name: "kra_pin", label: "KRA Pin No", type: "text", placeholder: "Enter KRA Pin", showInTable: true, showInDialog: true, tableHeader: "KRA Pin No" },
                { name: "kra_password", label: "KRA Password", type: "password", placeholder: "Enter KRA Password", showInTable: true, showInDialog: true, tableHeader: "KRA Password" },
                { name: "kra_email_address", label: "KRA Email Address", type: "email", placeholder: "Enter KRA Email Address", showInTable: true, showInDialog: true, tableHeader: "KRA Email Address" },
                { name: "kra_email_password", label: "KRA Email Address Password", type: "password", placeholder: "Enter KRA Email Address Password", showInTable: true, showInDialog: true, tableHeader: "KRA Email Address Password" },
                { name: "kra_mobile_number", label: "KRA Mobile Number", type: "text", placeholder: "Enter KRA Mobile Number", showInTable: true, showInDialog: true, tableHeader: "KRA Mobile Number" },
            ]
        },
        nssf: {
            title: "NSSF Credentials",
            fields: [
                { name: "nssf_id", label: "NSSF ID", type: "text", placeholder: "Enter NSSF ID", showInTable: true, showInDialog: true, tableHeader: "NSSF ID" },
                { name: "nssf_password", label: "NSSF Password", type: "password", placeholder: "Enter NSSF Password", showInTable: true, showInDialog: true, tableHeader: "NSSF Password" },
                { name: "nssf_email_address", label: "NSSF Email Address", type: "email", placeholder: "Enter NSSF Email Address", showInTable: true, showInDialog: true, tableHeader: "NSSF Email Address" },
                { name: "nssf_email_password", label: "NSSF Email Address Password", type: "password", placeholder: "Enter NSSF Email Address Password", showInTable: true, showInDialog: true, tableHeader: "NSSF Email Address Password" },
                { name: "nssf_mobile_number", label: "NSSF Mobile Number", type: "text", placeholder: "Enter NSSF Mobile Number", showInTable: true, showInDialog: true, tableHeader: "NSSF Mobile Number" },
                { name: "nssf_otp_code", label: "OTP Code", type: "text", placeholder: "Enter OTP Code", showInTable: true, showInDialog: true, tableHeader: "OTP Code" },
                { name: "nssf_otp_recovery_email_address", label: "OTP Recovery Email Address", type: "email", placeholder: "Enter OTP Recovery Email Address", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Email Address" },
                { name: "nssf_otp_recovery_mobile_number", label: "OTP Recovery Mobile Number", type: "text", placeholder: "Enter OTP Recovery Mobile Number", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Mobile Number" },
            ]
        },
        nhif: {
            title: "NHIF Credentials",
            fields: [
                { name: "nhif_id", label: "NHIF ID", type: "text", placeholder: "Enter NHIF ID", showInTable: true, showInDialog: true, tableHeader: "NHIF ID" },
                { name: "nhif_password", label: "NHIF Password", type: "password", placeholder: "Enter NHIF Password", showInTable: true, showInDialog: true, tableHeader: "NHIF Password" },
                { name: "nhif_email_address", label: "NHIF Email Address", type: "email", placeholder: "Enter NHIF Email Address", showInTable: true, showInDialog: true, tableHeader: "NHIF Email Address" },
                { name: "nhif_email_password", label: "NHIF Email Address Password", type: "password", placeholder: "Enter NHIF Email Address Password", showInTable: true, showInDialog: true, tableHeader: "NHIF Email Address Password" },
                { name: "nhif_mobile_number", label: "NHIF Mobile Number", type: "text", placeholder: "Enter NHIF Mobile Number", showInTable: true, showInDialog: true, tableHeader: "NHIF Mobile Number" },
                { name: "nhif_otp_code", label: "OTP Code", type: "text", placeholder: "Enter OTP Code", showInTable: true, showInDialog: true, tableHeader: "OTP Code" },
                { name: "nhif_otp_recovery_email_address", label: "OTP Recovery Email Address", type: "email", placeholder: "Enter OTP Recovery Email Address", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Email Address" },
                { name: "nhif_otp_recovery_mobile_number", label: "OTP Recovery Mobile Number", type: "text", placeholder: "Enter OTP Recovery Mobile Number", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Mobile Number" },
            ]
        },
        shif: {
            title: "SHIF Credentials",
            fields: [
                { name: "shif_id", label: "SHIF ID", type: "text", placeholder: "Enter SHIF ID", showInTable: true, showInDialog: true, tableHeader: "SHIF ID" },
                { name: "shif_password", label: "SHIF Password", type: "password", placeholder: "Enter SHIF Password", showInTable: true, showInDialog: true, tableHeader: "SHIF Password" },
                { name: "shif_email_address", label: "SHIF Email Address", type: "email", placeholder: "Enter SHIF Email Address", showInTable: true, showInDialog: true, tableHeader: "SHIF Email Address" },
                { name: "shif_email_password", label: "SHIF Email Address Password", type: "password", placeholder: "Enter SHIF Email Address Password", showInTable: true, showInDialog: true, tableHeader: "SHIF Email Address Password" },
                { name: "shif_mobile_number", label: "SHIF Mobile Number", type: "text", placeholder: "Enter SHIF Mobile Number", showInTable: true, showInDialog: true, tableHeader: "SHIF Mobile Number" },
                { name: "shif_otp_code", label: "OTP Code", type: "text", placeholder: "Enter OTP Code", showInTable: true, showInDialog: true, tableHeader: "OTP Code" },
                { name: "shif_otp_recovery_email_address", label: "OTP Recovery Email Address", type: "email", placeholder: "Enter OTP Recovery Email Address", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Email Address" },
                { name: "shif_otp_recovery_mobile_number", label: "OTP Recovery Mobile Number", type: "text", placeholder: "Enter OTP Recovery Mobile Number", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Mobile Number" },
            ]
        },
        ecitizen: {
            title: "eCitizen Credentials",
            fields: [
                { name: "ecitizen_id", label: "eCitizen ID", type: "text", placeholder: "Enter eCitizen ID", showInTable: true, showInDialog: true, tableHeader: "eCitizen ID" },
                { name: "ecitizen_password", label: "eCitizen Password", type: "password", placeholder: "Enter eCitizen Password", showInTable: true, showInDialog: true, tableHeader: "eCitizen Password" },
                { name: "ecitizen_email_address", label: "eCitizen Email Address", type: "email", placeholder: "Enter eCitizen Email Address", showInTable: true, showInDialog: true, tableHeader: "eCitizen Email Address" },
                { name: "ecitizen_email_password", label: "eCitizen Email Address Password", type: "password", placeholder: "Enter eCitizen Email Address Password", showInTable: true, showInDialog: true, tableHeader: "eCitizen Email Address Password" },
                { name: "ecitizen_mobile_number", label: "eCitizen Mobile Number", type: "text", placeholder: "Enter eCitizen Mobile Number", showInTable: true, showInDialog: true, tableHeader: "eCitizen Mobile Number" },
                { name: "ecitizen_otp_code", label: "OTP Code", type: "text", placeholder: "Enter OTP Code", showInTable: true, showInDialog: true, tableHeader: "OTP Code" },
                { name: "ecitizen_otp_recovery_email_address", label: "OTP Recovery Email Address", type: "email", placeholder: "Enter OTP Recovery Email Address", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Email Address" },
                { name: "ecitizen_otp_recovery_mobile_number", label: "OTP Recovery Mobile Number", type: "text", placeholder: "Enter OTP Recovery Mobile Number", showInTable: true, showInDialog: true, tableHeader: "OTP Recovery Mobile Number" },
            ]
        },
        efns: {
            title: "EFNS Credentials",
            fields: [
                { name: "efns_id", label: "EFNS ID", type: "text", placeholder: "Enter EFNS ID", showInTable: true, showInDialog: true, tableHeader: "EFNS ID" },
                { name: "efns_password", label: "EFNS Password", type: "password", placeholder: "Enter EFNS Password", showInTable: true, showInDialog: true, tableHeader: "EFNS Password" },
                { name: "efns_email_address", label: "EFNS Email Address", type: "email", placeholder: "Enter EFNS Email Address", showInTable: true, showInDialog: true, tableHeader: "EFNS Email Address" },
                { name: "efns_email_password", label: "EFNS Email Address Password", type: "password", placeholder: "Enter EFNS Email Address Password", showInTable: true, showInDialog: true, tableHeader: "EFNS Email Address Password" },
                { name: "efns_mobile_number", label: "EFNS Mobile Number", type: "text", placeholder: "Enter EFNS Mobile Number", showInTable: true, showInDialog: true, tableHeader: "EFNS Mobile Number" }
            ]
        },
        quickbooks: {
            title: "QuickBooks Credentials",
            fields: [
                { name: "quickbooks_id", label: "QuickBooks ID", type: "text", placeholder: "Enter QuickBooks ID", showInTable: true, showInDialog: true, tableHeader: "QuickBooks ID" },
                { name: "quickbooks_password", label: "QuickBooks Password", type: "password", placeholder: "Enter QuickBooks Password", showInTable: true, showInDialog: true, tableHeader: "QuickBooks Password" },
                { name: "quickbooks_email_address", label: "QuickBooks Email Address", type: "email", placeholder: "Enter QuickBooks Email Address", showInTable: true, showInDialog: true, tableHeader: "QuickBooks Email Address" },
                { name: "quickbooks_email_password", label: "QuickBooks Email Address Password", type: "password", placeholder: "Enter QuickBooks Email Address Password", showInTable: true, showInDialog: true, tableHeader: "QuickBooks Email Address Password" },
                { name: "quickbooks_mobile_number", label: "QuickBooks Mobile Number", type: "text", placeholder: "Enter QuickBooks Mobile Number", showInTable: true, showInDialog: true, tableHeader: "QuickBooks Mobile Number" },
            ]
        },
        kebs: {
            title: "KEBS Credentials",
            fields: [
                { name: "kebs_id", label: "KEBS ID", type: "text", placeholder: "Enter KEBS ID", showInTable: true, showInDialog: true, tableHeader: "KEBS ID" },
                { name: "kebs_password", label: "KEBS Password", type: "password", placeholder: "Enter KEBS Password", showInTable: true, showInDialog: true, tableHeader: "KEBS Password" },
                { name: "kebs_email_address", label: "KEBS Email Address", type: "email", placeholder: "Enter KEBS Email Address", showInTable: true, showInDialog: true, tableHeader: "KEBS Email Address" },
                { name: "kebs_email_password", label: "KEBS Email Address Password", type: "password", placeholder: "Enter KEBS Email Address Password", showInTable: true, showInDialog: true, tableHeader: "KEBS Email Address Password" },
                { name: "kebs_mobile_number", label: "KEBS Mobile Number", type: "text", placeholder: "Enter KEBS Mobile Number", showInTable: true, showInDialog: true, tableHeader: "KEBS Mobile Number" },
            ]
        },
        nita: {
            title: "NITA Credentials",
            fields: [
                { name: "nita_identifier", label: "NITA Identifier", type: "text", placeholder: "Enter NITA Identifier", showInTable: true, showInDialog: true, tableHeader: "NITA Identifier" },
                { name: "nita_password", label: "NITA Password", type: "password", placeholder: "Enter NITA Password", showInTable: true, showInDialog: true, tableHeader: "NITA Password" },
                { name: "nita_email_address", label: "NITA Email Address", type: "email", placeholder: "Enter NITA Email Address", showInTable: true, showInDialog: true, tableHeader: "NITA Email Address" },
                { name: "nita_email_password", label: "NITA Email Address Password", type: "password", placeholder: "Enter NITA Email Address Password", showInTable: true, showInDialog: true, tableHeader: "NITA Email Address Password" },
                { name: "nita_mobile_number", label: "NITA Mobile Number", type: "text", placeholder: "Enter NITA Mobile Number", showInTable: true, showInDialog: true, tableHeader: "NITA Mobile Number" },
            ]
        },
        ncc: {
            title: "NCC Credentials",
            fields: [
                { name: "ncc_id", label: "NCC ID", type: "text", placeholder: "Enter NCC ID", showInTable: true, showInDialog: true, tableHeader: "NCC ID" },
                { name: "ncc_password", label: "NCC Password", type: "password", placeholder: "Enter NCC Password", showInTable: true, showInDialog: true, tableHeader: "NCC Password" },
                { name: "ncc_mobile_number", label: "NCC Mobile Number", type: "text", placeholder: "Enter NCC Mobile Number", showInTable: true, showInDialog: true, tableHeader: "NCC Mobile Number" },
                { name: "ncc_email_address", label: "NCC Email Address", type: "email", placeholder: "Enter NCC Email Address", showInTable: true, showInDialog: true, tableHeader: "NCC Email Address" },
                { name: "ncc_email_password", label: "NCC Email Address Password", type: "password", placeholder: "Enter NCC Email Address Password", showInTable: true, showInDialog: true, tableHeader: "NCC Email Address Password" },
            ]
        },
        nea: {
            title: "NEA Credentials",
            fields: [
                { name: "nea_id", label: "NEA ID", type: "text", placeholder: "Enter NEA ID", showInTable: true, showInDialog: true, tableHeader: "NEA ID" },
                { name: "nea_password", label: "NEA Password", type: "password", placeholder: "Enter NEA Password", showInTable: true, showInDialog: true, tableHeader: "NEA Password" },
                { name: "nea_mobile_number", label: "NEA Mobile Number", type: "text", placeholder: "Enter NEA Mobile Number", showInTable: true, showInDialog: true, tableHeader: "NEA Mobile Number" },
                { name: "nea_email_address", label: "NEA Email Address", type: "email", placeholder: "Enter NEA Email Address", showInTable: true, showInDialog: true, tableHeader: "NEA Email Address" },
                { name: "nea_email_password", label: "NEA Email Address Password", type: "password", placeholder: "Enter NEA Email Address Password", showInTable: true, showInDialog: true, tableHeader: "NEA Email Address Password" },
            ]
        }
    } as PlatformCredentials,

    formSections: {
        generalInformation: {
            title: "General Information",
            fields: [
                { name: "company_name", label: "Company Name", type: "text", placeholder: "Enter company name", showInTable: true, showInDialog: true, tableHeader: "Company Name" },
                { name: "company_prefix", label: "Company Prefix", type: "text", placeholder: "Enter Company Prefix", showInTable: true, showInDialog: true, tableHeader: "Company Prefix" },
                { name: "company_type", label: "Company Type", type: "select", placeholder: "Select Company Type", showInTable: true, showInDialog: true, tableHeader: "Company Type", staticOptions: "companyTypeOptions" },
                { name: "registration_number", label: "Registration Number", type: "text", placeholder: "Enter Registration Number", showInTable: true, showInDialog: true, tableHeader: "Registration Number" },
                { name: "company_classification", label: "Company Classification", type: "text", placeholder: "Enter Company Classification", showInTable: true, showInDialog: true, tableHeader: "Company Classification" },
                { name: "business_commencement_date", label: "Business Commencement Date", type: "date", placeholder: "Select Business Commencement Date", showInTable: true, showInDialog: true, tableHeader: "Business Commencement Date" },
                { name: "registration_date", label: "Registration Date", type: "date", placeholder: "Enter Registration Date", showInTable: true, showInDialog: true, tableHeader: "Registration Date" },
            ]
        },
        contactInformation: {
            title: "Contact Information",
            fields: [
                { name: "office_phone_number", label: "Office Phone Number", type: "text", placeholder: "Enter Phone", showInTable: true, showInDialog: true, tableHeader: "Office Phone Number" },
                { name: "broadcast_whatsapp_number", label: "Broadcast WhatsApp Number", type: "text", placeholder: "Enter WhatsApp Number", showInTable: true, showInDialog: true, tableHeader: "Broadcast WhatsApp Number" },
                { name: "current_communication_email", label: "Current Communication Email", type: "email", placeholder: "Enter Email", showInTable: true, showInDialog: true, tableHeader: "Current Communication Email" },
                { name: "alternative_email_address", label: "Alternative Email Address", type: "email", placeholder: "Enter Alt Email", showInTable: true, showInDialog: true, tableHeader: "Alternative Email Address" },
            ]
        },
        addressDetails: {
            title: "Physical Address Details",
            fields: [
                { name: "country", label: "Country", type: "select", placeholder: "Select country", dataSource: { application: "BCL", category: "Countries" }, showInTable: true, showInDialog: true, tableHeader: "Country" },
                { name: "city", label: "City", type: "select", placeholder: "Select city", dataSource: { application: "BCL", category: "Cities" }, showInTable: true, showInDialog: true, tableHeader: "City" },
                { name: "town", label: "Town", type: "text", placeholder: "Enter town", showInTable: true, showInDialog: true, tableHeader: "Town" },
                { name: "county", label: "County", type: "select", placeholder: "Select county", dataSource: { application: "eFNS Permits", category: "Counties + Sub Counties", subOptionsField: "sub_options" }, hasDependent: true, showInTable: true, showInDialog: true, tableHeader: "County" },
                { name: "sub_county", label: "Sub County", type: "select", placeholder: "Select sub county", dependsOn: "county", dataSource: { application: "eFNS Permits", category: "Counties + Sub Counties", subOptionsField: "sub_options" }, showInTable: true, showInDialog: true, tableHeader: "Sub County" },
                { name: "road_name", label: "Road Name", type: "text", placeholder: "Enter Road Name", showInTable: true, showInDialog: true, tableHeader: "Road Name" },
                { name: "building_number", label: "Building Number", type: "text", placeholder: "Enter Building Number", showInTable: true, showInDialog: true, tableHeader: "Building Number" },
                { name: "office_number", label: "Office Number", type: "text", placeholder: "Enter Office Number", showInTable: true, showInDialog: true, tableHeader: "Office Number" },
            ]
        },
               postalAddress: {
            title: "Postal Address",
            fields: [
                { name: "postal_address", label: "P.O. Box", type: "text", placeholder: "Enter P.O. Box number", callback: "updateFullPostalAddress", showInTable: true, showInDialog: true, tableHeader: "P.O. Box" },
                { name: "postal_code", label: "Postal Code", type: "text", placeholder: "Enter postal code", callback: "updateFullPostalAddress", showInTable: true, showInDialog: true, tableHeader: "Postal Code" },
                { name: "postal_town", label: "Postal Town", type: "text", placeholder: "Enter postal town", callback: "updateFullPostalAddress", showInTable: true, showInDialog: true, tableHeader: "Postal Town" },
                { name: "full_postal_address", label: "Full Postal Address (Auto-generated)", type: "text", placeholder: "Full postal address will be generated", disabled: true, className: "bg-gray-50", colSpan: 2, showInTable: true, showInDialog: true, tableHeader: "Full Postal Address" }
            ]
        },
        additionalInformation: {
            title: "Additional Information",
            fields: [
                { name: "website", label: "Website", type: "text", placeholder: "Enter Website", showInTable: true, showInDialog: true, tableHeader: "Website" },
                { name: "industry", label: "Industry", type: "text", placeholder: "Enter Industry", showInTable: true, showInDialog: true, tableHeader: "Industry" },
                { name: "source_of_income_employment", label: "Source Of Income Employment", type: "text", placeholder: "Enter Source of Income", showInTable: true, showInDialog: true, tableHeader: "Source Of Income Employment" },
                { name: "nature_of_business", label: "Nature Of Business", type: "text", placeholder: "Enter Nature of Business", showInTable: true, showInDialog: true, tableHeader: "Nature Of Business" },
            ]
        }
    } as FormSections
};

export const individualFields = {
    platformCredentials: {
        // Same as company but for individuals
        ...companyFields.platformCredentials
    } as PlatformCredentials,

    formSections: {
        personalInformation: {
            title: "Personal Information",
            fields: [
                { name: "first_name", label: "First Name", type: "text", placeholder: "Enter first name", showInTable: true, showInDialog: true, tableHeader: "First Name" },
                { name: "middle_name", label: "Middle Name", type: "text", placeholder: "Enter middle name", showInTable: true, showInDialog: true, tableHeader: "Middle Name" },
                { name: "last_name", label: "Last Name", type: "text", placeholder: "Enter last name", showInTable: true, showInDialog: true, tableHeader: "Last Name" },
                { name: "date_of_birth", label: "Date of Birth", type: "date", placeholder: "Select date of birth", showInTable: true, showInDialog: true, tableHeader: "Date of Birth" },
                { name: "national_id", label: "National ID", type: "text", placeholder: "Enter National ID", showInTable: true, showInDialog: true, tableHeader: "National ID" },
                { name: "passport_number", label: "Passport Number", type: "text", placeholder: "Enter Passport Number", showInTable: true, showInDialog: true, tableHeader: "Passport Number" },
                {
                    name: "gender", label: "Gender", type: "select", placeholder: "Select Gender", showInTable: true, showInDialog: true, tableHeader: "Gender", dataSource: [
                        { id: "1", value: "Male", label: "Male" },
                        { id: "2", value: "Female", label: "Female" },
                        { id: "3", value: "Other", label: "Other" },
                    ]
                },
            ]
        },
        contactInformation: {
            title: "Contact Information",
            fields: [
                { name: "kenyan_mobile_number_1", label: "Kenyan Mobile Number 1", type: "text", placeholder: "Enter Kenyan Mobile Number 1", showInTable: true, showInDialog: true, tableHeader: "Kenyan Mobile Number 1" },
                { name: "kenyan_mobile_number_2", label: "Kenyan Mobile Number 2", type: "text", placeholder: "Enter Kenyan Mobile Number 2", showInTable: true, showInDialog: true, tableHeader: "Kenyan Mobile Number 2" },
                { name: "abroad_mobile_number_1", label: "Abroad Mobile Number 1", type: "text", placeholder: "Enter Abroad Mobile Number 1", showInTable: true, showInDialog: true, tableHeader: "Abroad Mobile Number 1" },
                { name: "abroad_mobile_number_2", label: "Abroad Mobile Number 2", type: "text", placeholder: "Enter Abroad Mobile Number 2", showInTable: true, showInDialog: true, tableHeader: "Abroad Mobile Number 2" },
                { name: "whatsapp_number", label: "WhatsApp Number", type: "text", placeholder: "Enter WhatsApp Number", showInTable: true, showInDialog: true, tableHeader: "WhatsApp Number" },
                { name: "email_address", label: "Current Communication Email", type: "email", placeholder: "Enter Email", showInTable: true, showInDialog: true, tableHeader: "Current Communication Email" },
                { name: "alternative_email", label: "Alternative Email", type: "email", placeholder: "Enter Alt Email", showInTable: true, showInDialog: true, tableHeader: "Alternative Email" },
            ]
        },
        addressDetails: {
            title: "Address Details",
            fields: [
                { name: "country", label: "Country", type: "select", placeholder: "Select country", dataSource: { application: "BCL", category: "Countries" }, showInTable: true, showInDialog: true, tableHeader: "Country" },
                { name: "city", label: "City", type: "select", placeholder: "Select city", dataSource: { application: "BCL", category: "Cities" }, showInTable: true, showInDialog: true, tableHeader: "City" },
                { name: "town", label: "Town", type: "text", placeholder: "Enter town", showInTable: true, showInDialog: true, tableHeader: "Town" },
                { name: "county", label: "County", type: "select", placeholder: "Select county", dataSource: { application: "eFNS Permits", category: "Counties + Sub Counties", subOptionsField: "sub_options" }, hasDependent: true, showInTable: true, showInDialog: true, tableHeader: "County" },
                { name: "sub_county", label: "Sub County", type: "select", placeholder: "Select sub county", dependsOn: "county", dataSource: { application: "eFNS Permits", category: "Counties + Sub Counties", subOptionsField: "sub_options" }, showInTable: true, showInDialog: true, tableHeader: "Sub County" },
                { name: "road_name", label: "Road Name", type: "text", placeholder: "Enter Road Name", showInTable: true, showInDialog: true, tableHeader: "Road Name" },
                { name: "building_number", label: "Building Number", type: "text", placeholder: "Enter Building Number", showInTable: true, showInDialog: true, tableHeader: "Building Number" },
                { name: "apartment_number", label: "Apartment Number", type: "text", placeholder: "Enter Apartment Number", showInTable: true, showInDialog: true, tableHeader: "Apartment Number" },
            ]
        },
        postalAddress: {
            title: "Postal Address",
            fields: [
                { name: "postal_address", label: "P.O. Box", type: "text", placeholder: "Enter P.O. Box number", callback: "updateFullPostalAddress", showInTable: true, showInDialog: true, tableHeader: "P.O. Box" },
                { name: "postal_code", label: "Postal Code", type: "text", placeholder: "Enter postal code", callback: "updateFullPostalAddress", showInTable: true, showInDialog: true, tableHeader: "Postal Code" },
                { name: "postal_town", label: "Postal Town", type: "text", placeholder: "Enter postal town", callback: "updateFullPostalAddress", showInTable: true, showInDialog: true, tableHeader: "Postal Town" },
                { name: "full_postal_address", label: "Full Postal Address (Auto-generated)", type: "text", placeholder: "Full postal address will be generated", disabled: true, className: "bg-gray-50", colSpan: 2, showInTable: true, showInDialog: true, tableHeader: "Full Postal Address" }
            ]
        },
    } as FormSections
};

// Helper function to get all fields that should show in table for a given form type
export const getTableFields = (formType: 'company' | 'individual'): FormField[] => {
    const fields = formType === 'company' ? companyFields : individualFields;
    const allFields: FormField[] = [];

    // Add form section fields
    Object.values(fields.formSections).forEach(section => {
        section.fields.forEach(field => {
            if (field.showInTable) {
                allFields.push(field);
            }
        });
    });

    // Add platform credential fields
    Object.values(fields.platformCredentials).forEach(platform => {
        platform.fields.forEach(field => {
            if (field.showInTable) {
                allFields.push(field);
            }
        });
    });

    return allFields;
};

// Helper function to get grouped fields for rendering
export const getGroupedFields = (formType: 'company' | 'individual') => {
    const fields = formType === 'company' ? companyFields : individualFields;
    return {
        formSections: fields.formSections,
        platformCredentials: fields.platformCredentials
    };
};
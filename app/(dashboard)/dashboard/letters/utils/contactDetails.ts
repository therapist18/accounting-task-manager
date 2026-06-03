type ContactRecord = Record<string, any> | null | undefined;

const BCL_CONTACT = {
    phone: '+254700298298',
    addressLine1: 'P.O. BOX 12345 - 00100',
    addressLine2: 'NAIROBI, KENYA',
    address: 'P.O. BOX 12345 - 00100, NAIROBI, KENYA',
};

function firstContact(contactDetails: any): ContactRecord {
    if (Array.isArray(contactDetails)) return contactDetails[0] || null;
    return contactDetails || null;
}

function firstString(...values: any[]): string {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

export function getBclContactDetails() {
    return BCL_CONTACT;
}

export function resolveCompanyGeneralEmail(company: any, fallback = ''): string {
    const cd = firstContact(company?.contact_details);
    return firstString(
        cd?.current_communication_email,
        cd?.alternative_email_address,
        cd?.email,
        cd?.email_address,
        fallback
    );
}

export function resolveCompanyKraEmail(company: any, fallback = ''): string {
    const cd = firstContact(company?.contact_details);
    return firstString(
        company?.kra_email_address,
        cd?.kra_email_address,
        fallback
    );
}

export function resolveCompanyPhone(company: any, fallback = ''): string {
    const cd = firstContact(company?.contact_details);
    return firstString(
        cd?.phone,
        cd?.mobile,
        cd?.telephone,
        cd?.office_phone,
        company?.phone,
        company?.office_phone,
        fallback
    );
}

export function resolveIndividualEmail(individual: any, fallback = ''): string {
    const cd = firstContact(individual?.contact_details);
    return firstString(
        cd?.email?.primary,
        cd?.email?.alternative,
        cd?.current_communication_email,
        cd?.alternative_email_address,
        cd?.email,
        individual?.email,
        individual?.alternative_email,
        fallback
    );
}

export function resolveIndividualPhone(individual: any, fallback = ''): string {
    const cd = firstContact(individual?.contact_details);
    return firstString(
        cd?.phone?.kenyan?.primary,
        cd?.phone?.kenyan?.secondary,
        cd?.phone?.abroad?.primary,
        cd?.phone?.abroad?.secondary,
        cd?.phone?.whatsapp,
        cd?.phone,
        cd?.mobile,
        cd?.telephone,
        individual?.phone,
        fallback
    );
}

export function resolveCompanyKraPin(company: any, fallback = ''): string {
    const cd = firstContact(company?.contact_details);
    return firstString(company?.kra_pin, cd?.kra_pin, cd?.kraPin, fallback);
}

export function resolveIndividualKraPin(individual: any, fallback = ''): string {
    const cd = firstContact(individual?.contact_details);
    return firstString(
        individual?.kra_pin,
        individual?.kraPin,
        cd?.kra_pin,
        cd?.kraPin,
        cd?.kra?.pin,
        cd?.tax?.kra_pin,
        fallback
    );
}

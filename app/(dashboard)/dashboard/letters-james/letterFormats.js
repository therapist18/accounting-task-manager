export const letterCategories = {
  'E-FNS': [  
    { key: 'VISA_EXT_EFNS', title: 'Visa-Ext-Efns' },
    { key: 'KSP_EFNS', title: 'KSP-Efns' },
    { key: 'KEP_G_EFNS', title: 'KEP - G-Efns' },
    { key: 'KEP_D_EFNS', title: 'KEP - D-Efns' },
    { key: 'KPP_EFNS', title: 'KPP-Efns' },
    { key: 'KDP_EFNS', title: 'KDP-Efns' },
    { key: 'PR_CT_B_EFNS', title: 'PR - CT B-Efns - Lawful - 7 Years Permit' },
    { key: 'PR_KDP_EFNS', title: 'PR - KDP-Efns - For dependent (Category D)' },
    { key: 'PR_SPOUSE_EFNS', title: 'PR-Efns - Spouse' },
    { key: 'INTERNSHIP_PASS_EFNS', title: 'INTERNSHIP PASS-Efns (Category C)' },
    { key: 'DUAL_CITIZENSHIP_EFNS', title: 'DUAL CITIZENSHIP-Efns' },
    { key: 'PR_CHILD_EFNS', title: 'PR-Efns - Child endorsement-Efns' },
    { key: 'KEP_B_EFNS', title: 'KEP - B-Efns' },
    { key: 'KEP_C_EFNS', title: 'KEP - C-Efns' },
    { key: 'LAWFUL_RESIDENTS_CTZ_EFNS', title: 'lawful residents - CTZ-Efns' },
    { key: 'CTZ_SPOUSE_KENYAN_EFNS', title: 'CTZ - spouse of a Kenyan citizen-Efns' },
    { key: 'CTZ_REGISTRATION_KENYAN_CHILD_EFNS', title: 'CTZ - registration KENYAN CHILD -Efns' },
    { key: 'CTZ_WIDOW_WIDOWER_KENYAN_EFNS', title: 'CTZ - widow widower of a Kenyan citiz-Efns' }
  ],
  'E-Citizen': [
    { key: 'KENYAN_PASSPORT_ECITIZEN', title: 'KENYAN PASSPORT-E-ecitizen (Category B)' },
  ],
  'ETA': [
    { key: 'ETA', title: 'ETA- ETA Website' }
  ],
  'IHC': [
    { key: 'IHC_PASSPORT', title: 'IHC PASSPORT - IHC Website' },
  ],
};

export const letterFormats = {
    VISA_EXT_EFNS: {
      title: "Visa Extension E-FNS",
      template: "visa_extension_template",
      requiredFields: ["fullName", "passportNumber", "currentVisaExpiry"],
      formatGuide: `
      {Company Name}
        {Physical Address}
        {Postal Address}
        {Email}
        {Mobile}

        {Application Date in DD/MM/YYYY}

        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA

        Dear Sir/Madam,

        RE: APPLICATION FOR VISA EXTENSION – [FULL NAME] - [PASSPORT NUMBER]

        [Reason for extension]
        [Current visa details]
        [Extension request]
        [Closing]

        Yours Truly,

        ________________
        [Applicant Name]`,
      example: `
      ABC Corporation Ltd.
      123 Business Street, Nairobi
      P.O. Box 789, Nairobi 00100
      info@abccorp.com
      +254 123 456789

      01/08/2023

      TO:
      THE DIRECTOR
      IMMIGRATION SERVICES
      P.O. BOX: 30191-00100
      NAIROBI, KENYA

      Dear Sir/Madam,

      RE: APPLICATION FOR VISA EXTENSION – MR. JOHN DOE - PASSPORT NO. AB123456

      I am writing to request an extension of my current visa, which is set to expire on 15/08/2023. As the Marketing Director of ABC Corporation Ltd., I am involved in crucial ongoing projects that require my continued presence in Kenya.

      My current visa was issued on 15/02/2023 for a period of six months. I am seeking a three-month extension to complete my assigned tasks and ensure a smooth transition of responsibilities.

      We kindly request your consideration of this application for a visa extension. Your approval would greatly benefit our company's operations in Kenya.

      If you require any additional information, please do not hesitate to contact me.

      Yours Truly,

      ________________
      John Doe
      Marketing Director`
    },
    KSP_EFNS: {
      title: "KSP E-FNS",
      template: "ksp_template",
      requiredFields: ["fullName", "companyName", "jobPosition"],
      formatGuide: `
      {Company Name}
      {Physical Address}
      {Postal Address}
      {Email}
      {Mobile}

      {Application Date in DD/MM/YYYY}

      TO:
      THE DIRECTOR
      IMMIGRATION SERVICES
      P.O. BOX: 30191-00100
      NAIROBI, KENYA

      Dear Sir/Madam,

      RE: APPLICATION FOR A SPECIAL PASS FOR {1/2/3} MONTHS – [FULL NAME] - [R NUMBER]

      [Company introduction]
      [Company impact]
      [Application request]
      [Closing]

      Yours Truly,

      ________________
      Director`,
      example: `
        Digital Regenesys Ltd.
        Delta Corner Tower, Chiromo Road, 07th Floor,
        PO Box 456, Town 2, 00200
        digital234@gmail.com
        +254 797 421421

        26/05/2022

        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA

        Dear Sir/Madam,

        RE: APPLICATION FOR A SPECIAL PASS FOR 3 MONTHS – MR. VISHAL PAWANKUMAR GUPTA - R No. KE123456789

        We would like to begin with introducing our company operations to your distinguished department. We are a limited company and we are importers and distributors of fresh vegetables, grains, and other consumable products in Nairobi, Kenya.

        The firm has a direct impact on the people of Kenya because currently it has employed over eleven employees of Kenyan nationalities directly and indirectly. The firm gives high consideration in terms of employment opportunities to the needy in Limuru Road, Nairobi where our firm is located.

        We hereby wish to apply for a special pass for three months for Mr. Vishal Pawankumar Gupta as our Managing Director. He possesses the relevant experience and expertise required to carry out our business operations currently based in Nairobi, Kenya.

        In case of any further inquiries feel free to call my offices on the address provided.

        Yours Truly,

        ________________
        Paheer Faritha
        Director`
    },
    KEP_G_EFNS: {
      title: "KEP - G-Efns",
      template: "kep_g_template",
      requiredFields: ["companyName", "physicalAddress", "postalAddress", "email", "mobile", "applicationDate", "fullName", "rNumber"],
      formatGuide: `
        {Company Name}
        {Physical Address}
        {Postal Address}
        {Email}
        {Mobile}
    
        {Application Date in DD/MM/YYYY}
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        DEAR SIR / MADAM,
    
        REF: APPLICATION FOR RENEWAL BUSINESS PERMIT UNDER THE CLASS “G” – [FULL NAME] - [R NUMBER]
    
        [Company introduction]
        [Company impact]
        [Application request]
    
        THANKING YOU IN ADVANCE
    
        YOURS FAITHFULLY,
    
        ________________
        [Applicant Name]`,
      example: `
        Taran Hardware Trading Company Limited
        Eldama Ravine, Kenya
        P.O. Box 12345, Eldama Ravine
        info@taranhardware.com
        +254 789 123456
    
        01/07/2023
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        DEAR SIR / MADAM,
    
        REF: APPLICATION FOR RENEWAL BUSINESS PERMIT UNDER THE CLASS “G” – MR. DILEEP SINGH - R NO. 1562506
    
        We at Taran Hardware Trading Company Limited would like to introduce our operations to the Immigration Department. We are registered institution dealing in hardware and construction items, plastic wares, sanitary wares, and ceramic tiles in Eldama Ravine, Kenya. The company currently employs over twelve local nationalities at financial, operational, and management levels. We wish to apply for a renewal of business permit under the "Class G" for Mr. Dileep Singh for a period of two years. Mr. Dileep Singh is a financial director and a shareholder in our company and possesses the relevant experience and expertise required to carry out our business operations currently based in Eldama Ravine, Kenya.
    
        THANKING YOU IN ADVANCE
    
        YOURS FAITHFULLY,
    
        ________________
        Rajwinder Singh
        Managing Director`
    },
    KEP_D_EFNS: {
      title: "KEP - D-Efns",
      template: "kep_d_template",
      requiredFields: ["companyName", "physicalAddress", "postalAddress", "email", "mobile", "applicationDate", "fullName", "rNumber"],
      formatGuide: `
        {Company Name}
        {Physical Address}
        {Postal Address}
        {Email}
        {Mobile}
    
        {Application Date in DD/MM/YYYY}
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        DEAR SIR / MADAM,
    
        RE: APPLICATION FOR A RENEWAL WORK PERMIT FOR TWO YEARS UNDER CLASS D – [FULL NAME] - [R NUMBER]
    
        [Company introduction]
        [Company impact]
        [Application request]
    
        YOUR EARLY RESPONSE IN THIS MATTER WILL BE HIGHLY RESPECTED.
    
        THANKING YOU
    
        YOURS TRULY,
    
        ________________
        [Applicant Name]`,
      example: `
        Platnum Hardware Limited
        Nairobi, Kenya
        P.O. Box 5678, Nairobi
        info@platnumhardware.com
        +254 789 456789
    
        15/07/2023
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        DEAR SIR / MADAM,
    
        RE: APPLICATION FOR A RENEWAL WORK PERMIT FOR TWO YEARS UNDER CLASS D – MR. BHARAT SUMARIYA - R NO. 2011962
    
        We at Platnum Hardware Limited would like to take this privilege to introduce our operations to the Immigration Department. We are one of the major merchants for branded plastic ware, hardware, sanitary ware products in Nairobi, Kenya. We presently employ over twenty-two local Kenyan nationalities in different departments like management, engineering, and finance and wish to increase this number with further future growth.
    
        To gain a competitive edge in the local market, we are expanding our operations and have invested in a vast capital cycle. Hence, we are in serious need to recruit experienced staff with adequate skills and expertise to maintain our daily operations effectively. We hereby request you to issue Mr. Bharat Sumariya with a renewal work permit for two years. Mr. Bharat Sumariya is qualified and experienced in the specific business field we are in. We look forward to appointing him as our branch manager to ensure the sustainability of our specialized unit.
    
        YOUR EARLY RESPONSE IN THIS MATTER WILL BE HIGHLY RESPECTED.
    
        THANKING YOU
    
        YOURS TRULY,
    
        ________________
        Rahul Sumariya
        Managing Director`
    },
    KDP_EFNS: {
      title: "KDP-Efns",
      template: "kdp_template",
      requiredFields: ["applicantName", "postalAddressApplicant", "physicalAddressApplicant", "applicationDate", "dependentRelation", "childName", "rNumber", "widowedStatus"],
      formatGuide: `
        {Applicant Name}
        {Postal Address Applicant}
        {Physical Address Applicant}
    
        {Application Date in DD/MM/YYYY}
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        RE: APPLICATION FOR DEPENDENT PASS FOR [{SPOUSE/SON/DAUGHTER/FATHER/MOTHER/MOTHERINLAW/FATHERINLAW/FATHER-WIDOWER/MOTHER-WIDOW}] - [CHILD NAME] - R. NO - [R NUMBER]
    
        I, [Applicant Name], hereby wish to apply for a dependent pass for my [Dependent Relation] named [Child Name] under my status. I am currently working at [Your Company] and hold a valid work permit.
    
        IF (Dependent Relation === "SON" || Dependent Relation === "DAUGHTER"):
        My [Dependent Relation.toLowerCase()] has recently relocated to Kenya due to my employment, and I wish to ensure [his/her] legal status here by applying for a dependent pass. As [my/our] child, [he/she] will accompany me during my tenure in Kenya and intends to actively engage in various community activities and gain a well-developed educational background.
    
        IF (Dependent Relation === "SPOUSE"):
        My spouse has recently relocated to Kenya due to my employment, and I wish to ensure [his/her] legal status here by applying for a dependent pass. [He/She] will accompany me during my tenure in Kenya.
    
        IF (Dependent Relation === "FATHER" || Dependent Relation === "MOTHER" || Dependent Relation === "MOTHERINLAW" || Dependent Relation === "FATHERINLAW"):
          My [Dependent Relation.toLowerCase()] has recently relocated to Kenya due to my employment,  He is solely dependent on me due to his old age, retirement he has no one to support him/her  financially beside me.
    
          IF (widowedStatus === true && (Dependent Relation === "FATHER" || Dependent Relation === "FATHERINLAW")):
            He is solely dependent on me due to his old age, retirement, and being a widower; he has no one to support him emotionally or financially beside me.
    
          IF (widowedStatus === true && (Dependent Relation === "MOTHER" || Dependent Relation === "MOTHERINLAW")):
            She is solely dependent on me due to her old age, retirement, and being a widow; she has no one to support her emotionally or financially beside me.
    
          IF (widowedStatus === false && (Dependent Relation === "FATHER" || Dependent Relation === "FATHERINLAW")):
            He has relocated to Kenya due to my employment and wishes to accompany me during my tenure here. He intends to engage in various community activities and support our family's integration.
    
          IF (widowedStatus === false && (Dependent Relation === "MOTHER" || Dependent Relation === "MOTHERINLAW")):
            She has relocated to Kenya due to my employment and wishes to accompany me during my tenure here. She intends to engage in various community activities and support our family's integration.
    
        I hereby oblige to cater for [his/her] food, education, accommodation, medical, and travel expenses during [his/her] stay in Kenya.
    
        THANK YOU FOR YOUR TIME AND ATTENTION TO THIS MATTER.
    
        YOURS SINCERELY,
    
        ----------------------
        [Applicant Name]`,
      example: `
        Hafiza Zulfiqar Sadrudin Mohamed
        P.O. Box 789, Nairobi
        123 Main Street, Nairobi
    
        10/07/2023
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        RE: APPLICATION FOR DEPENDENT PASS FOR SON - RIDHAM HARDAS CHUDASAMA - R. NO - 231930
    
        I, Hafiza Zulfiqar Sadrudin Mohamed, hereby wish to apply for a dependent pass for my son named Ridham Hardas Chudasama under my status. I am currently working at [Your Company] and hold a valid work permit.
    
        My son has recently relocated to Kenya due to my employment, and I wish to ensure his legal status here by applying for a dependent pass. As my child, he will accompany me during my tenure in Kenya and intends to actively engage in various community activities and gain a well-developed educational background.
    
        I hereby oblige to cater for his food, education, accommodation, medical, and travel expenses during his stay in Kenya.
    
        THANK YOU FOR YOUR TIME AND ATTENTION TO THIS MATTER.
    
        YOURS SINCERELY,
    
        ----------------------
        Hafiza Zulfiqar Sadrudin Mohamed`
    },
    KPP_EFNS: {
      title: "KPP-Efns",
      template: "kpp_template",
      requiredFields: ["applicantName", "postalAddressApplicant", "physicalAddressApplicant", "applicationDate", "childName", "rNumber"],
      formatGuide: `
        {Applicant Name}
        {Postal Address Applicant}
        {Physical Address Applicant}
    
        {Application Date in DD/MM/YYYY}
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        RE: APPLICATION FOR PUPIL PASS FOR MY SON/DAUGHTER - [CHILD NAME] - R. NO - [R NUMBER]
    
        I, [Applicant Name], hereby wish to apply for a dependent pass for my son/daughter named [Child Name] under my status. I am currently working at [Your Company] and hold a valid work permit.
    
        [Reason for dependent pass]
        [Intentions during stay in Kenya]
    
        THANK YOU FOR YOUR TIME AND ATTENTION TO THIS MATTER.
    
        YOURS SINCERELY,
    
        ----------------------
        [Applicant Name]`,
      example: `
        Hafiza Zulfiqar Sadrudin Mohamed
        P.O. Box 789, Nairobi
        123 Main Street, Nairobi
    
        10/07/2023
    
        TO:
        THE DIRECTOR
        IMMIGRATION SERVICES
        P.O. BOX: 30191-00100
        NAIROBI, KENYA
    
        RE: APPLICATION FOR PUPIL PASS FOR MY SON - RIDHAM HARDAS CHUDASAMA - R. NO - 231930
    
        I, Hafiza Zulfiqar Sadrudin Mohamed, hereby wish to apply for a dependent pass for my son named Ridham Hardas Chudasama under my status. I am currently working at [Your Company] and hold a valid work permit.
    
        My son has recently relocated to Kenya due to my employment, and I wish to ensure his legal status here by applying for a dependent pass. As my child, he will accompany me during my tenure in Kenya and intends to actively engage in various community activities and gain a well-developed educational background.
    
        I hereby oblige to cater for his food, education, accommodation, medical, and travel expenses during his stay in Kenya.
    
        THANK YOU FOR YOUR TIME AND ATTENTION TO THIS MATTER.
    
        YOURS SINCERELY,
    
        ----------------------
        Hafiza Zulfiqar Sadrudin Mohamed`
    },
    
  };
  
  export const getLetterFormat = (type) => {
    return letterFormats[type] || null;
  };
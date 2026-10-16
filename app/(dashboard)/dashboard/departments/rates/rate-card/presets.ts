// Generated from "Rates - 02.10.2026 - Acc + Imm Rates.xlsx" (sheets "Imm Rates" and "Acc Rates").
// Presets only: picking one copies its values into a job level's rate row, which is then edited and
// saved like any other. Nothing here is read at quotation time.

import type { ImmigrationPreset, JobPreset } from "./types"

export const IMMIGRATION_PRESETS: ImmigrationPreset[] = [
  {
    "id": "L",
    "label": "ETA · Urgent 24 Hours",
    "components": {
      "processing": {
        "on": true,
        "amount": 35,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 15000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "advance_no_deposit",
      "installments": []
    },
    "sheetTotal": 17000,
    "note": ""
  },
  {
    "id": "M",
    "label": "ETA · Within 2 Days",
    "components": {
      "processing": {
        "on": true,
        "amount": 35,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 8000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "advance_no_deposit",
      "installments": []
    },
    "sheetTotal": 10000,
    "note": ""
  },
  {
    "id": "N",
    "label": "ETA · Within 5 Days",
    "components": {
      "processing": {
        "on": true,
        "amount": 35,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 6000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 8000,
    "note": ""
  },
  {
    "id": "O",
    "label": "ETA + Border-Cross · Within 5 Days",
    "components": {
      "processing": {
        "on": true,
        "amount": 35,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 27000,
    "note": ""
  },
  {
    "id": "Q",
    "label": "Regularization",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 10000,
    "note": ""
  },
  {
    "id": "R",
    "label": "Visa Exention",
    "components": {
      "processing": {
        "on": true,
        "amount": 51,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 8000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 15000,
    "note": ""
  },
  {
    "id": "T",
    "label": "Special Pass",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 200,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 1,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 23000,
    "note": ""
  },
  {
    "id": "U",
    "label": "Special Pass",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 400,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 2,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 23000,
    "note": ""
  },
  {
    "id": "V",
    "label": "Special Pass",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 600,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 3,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 23000,
    "note": ""
  },
  {
    "id": "X",
    "label": "Dependent Pass · Citizenship · Adult (18+)",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 40000
      },
      "discount": {
        "on": true,
        "amount": 7000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 60000,
    "note": ""
  },
  {
    "id": "Y",
    "label": "Dependent Pass · Permit Holder · Adult (18+)",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 10000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 40000
      },
      "discount": {
        "on": true,
        "amount": 7000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 50000,
    "note": ""
  },
  {
    "id": "Z",
    "label": "Dependent Pass · Citizenship · Child (Below 18)",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 30000
      },
      "discount": {
        "on": true,
        "amount": 8000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 50000,
    "note": ""
  },
  {
    "id": "AA",
    "label": "Dependent Pass · Permit Holder · Child (Below 18)",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 10000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 30000
      },
      "discount": {
        "on": true,
        "amount": 8000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 40000,
    "note": ""
  },
  {
    "id": "AC",
    "label": "Pupil Pass · Adult (18+) · 1 Year",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 100,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 40000
      },
      "discount": {
        "on": true,
        "amount": 5500
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 50000,
    "note": ""
  },
  {
    "id": "AD",
    "label": "Pupil Pass · Adult (18+) · 2 Years",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 200,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 40000
      },
      "discount": {
        "on": true,
        "amount": 4000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 65000,
    "note": ""
  },
  {
    "id": "AE",
    "label": "Pupil Pass · Child (Below 18) · 1 Year",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 100,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 30000
      },
      "discount": {
        "on": true,
        "amount": 6500
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 40000,
    "note": ""
  },
  {
    "id": "AF",
    "label": "Pupil Pass · Child (Below 18) · 2 Years",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 200,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 30000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": true,
        "amount": 1000
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 55000,
    "note": ""
  },
  {
    "id": "AH",
    "label": "Investors/ Business · G Class · Fresh · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 500000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 175000
      },
      "discount": {
        "on": true,
        "amount": 10000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 192000,
    "note": ""
  },
  {
    "id": "AI",
    "label": "Investors/ Business · G Class · Renewal · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 500000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 175000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 152000,
    "note": ""
  },
  {
    "id": "AK",
    "label": "Work · D Class · Fresh/ Renewal · 1 Year",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 500000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 175000
      },
      "discount": {
        "on": true,
        "amount": 27000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 175000,
    "note": ""
  },
  {
    "id": "AL",
    "label": "Work · D Class · Fresh/ Renewal · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 1000000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 175000
      },
      "discount": {
        "on": true,
        "amount": 27000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 175000,
    "note": ""
  },
  {
    "id": "AN",
    "label": "Gratis (East African) · R Class · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 175000
      },
      "discount": {
        "on": true,
        "amount": 25000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": true,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 177000,
    "note": ""
  },
  {
    "id": "AO",
    "label": "Nomad · N Class · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 201,
        "currency": "USD"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 2000,
        "currency": "USD"
      },
      "facilitation": {
        "on": true,
        "amount": 225000
      },
      "discount": {
        "on": true,
        "amount": 25000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 235000,
    "note": ""
  },
  {
    "id": "AP",
    "label": "Prescribed Profession · C Class · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": true,
        "amount": 5000
      },
      "issuance": {
        "on": true,
        "amount": 500000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 175000
      },
      "discount": {
        "on": true,
        "amount": 10000
      },
      "h1": {
        "on": true,
        "amount": 2000
      },
      "h2": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h3": {
        "on": false,
        "amount": null,
        "optional": true
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        100000
      ]
    },
    "sheetTotal": 192000,
    "note": ""
  },
  {
    "id": "AR",
    "label": "PR · App for PR by Ex-Citizen of Kenya · Cat - A · Permanent",
    "components": {
      "processing": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 100000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "permanent"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        150000,
        200000
      ]
    },
    "sheetTotal": 350000,
    "note": ""
  },
  {
    "id": "AS",
    "label": "PR · App for PR by Holders of Permit · Cat - B · Permanent",
    "components": {
      "processing": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 750000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 1300000
      },
      "discount": {
        "on": true,
        "amount": 100000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "permanent"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        650000,
        600000
      ]
    },
    "sheetTotal": 1250000,
    "note": ""
  },
  {
    "id": "AT",
    "label": "PR · Spouse / Child (3 Years Marriage) · Cat - B · If Spouse is PR Holder · Permanent",
    "components": {
      "processing": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 750000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "permanent"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        150000,
        200000
      ]
    },
    "sheetTotal": 350000,
    "note": ""
  },
  {
    "id": "AU",
    "label": "PR · Spouse (3 Years Marriage) · Cat - D · If Spouse is a Kenyan Citizen · Permanent",
    "components": {
      "processing": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 150000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "permanent"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        150000,
        200000
      ]
    },
    "sheetTotal": 350000,
    "note": ""
  },
  {
    "id": "AV",
    "label": "PR · Child Below 21 · Cat - C · If Father is a Kenyan Citizen · Permanent",
    "components": {
      "processing": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 750000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "permanent"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        150000,
        200000
      ]
    },
    "sheetTotal": 350000,
    "note": ""
  },
  {
    "id": "AW",
    "label": "PR · Child Over 21 · Cat - C · If Father is a Kenyan Citizen · Permanent",
    "components": {
      "processing": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 750000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 450000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "permanent"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        150000,
        300000
      ]
    },
    "sheetTotal": 450000,
    "note": ""
  },
  {
    "id": "AY",
    "label": "Citizenship · Lawful (7 Years Permit) · No Cat · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 1000000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 1300000
      },
      "discount": {
        "on": true,
        "amount": 100000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        620000,
        600000
      ]
    },
    "sheetTotal": 1220000,
    "note": ""
  },
  {
    "id": "AZ",
    "label": "Citizenship · Spouse (7 Years Marriage) If Wife is Foreigner Passport Holder · No Cat · If Spouse is a Kenyan Citizen · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 100000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        220000,
        100000
      ]
    },
    "sheetTotal": 320000,
    "note": ""
  },
  {
    "id": "BA",
    "label": "Citizenship · Spouse (7 Years Marriage) If Wife is East African Passport Holder · No Cat · If Spouse is a Kenyan Citizen · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 50000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        220000,
        100000
      ]
    },
    "sheetTotal": 320000,
    "note": ""
  },
  {
    "id": "BB",
    "label": "Citizenship · Child Below 21 · If Father is a Kenyan Citizen · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 100000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 350000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        220000,
        100000
      ]
    },
    "sheetTotal": 320000,
    "note": ""
  },
  {
    "id": "BC",
    "label": "Citizenship · Child Over 21 · If Father is a Kenyan Citizen",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": true,
        "amount": 100000,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 450000
      },
      "discount": {
        "on": true,
        "amount": 50000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": true,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "installments",
      "installments": [
        220000,
        200000
      ]
    },
    "sheetTotal": 420000,
    "note": ""
  },
  {
    "id": "BE",
    "label": "Citizenship · Re-Gaining (Depends on Case Ref to Constitution) · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": null,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 50000
      },
      "discount": {
        "on": true,
        "amount": 10000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 90000,
    "note": ""
  },
  {
    "id": "BF",
    "label": "Citizenship · Dual Declaration · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": null,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 30000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 35000,
    "note": ""
  },
  {
    "id": "BG",
    "label": "Citizenship · Endorsement · Life-Time",
    "components": {
      "processing": {
        "on": true,
        "amount": 20000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": null,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 20000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "lifetime"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 25000,
    "note": ""
  },
  {
    "id": "BI",
    "label": "Alien · Depedent · Nairobi Resident · 1 Year",
    "components": {
      "processing": {
        "on": true,
        "amount": 5000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 0
      },
      "discount": {
        "on": false,
        "amount": 0
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  },
  {
    "id": "BJ",
    "label": "Alien · Depedent · Nairobi Resident · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 10000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 0
      },
      "discount": {
        "on": false,
        "amount": 0
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 10000,
    "note": ""
  },
  {
    "id": "BK",
    "label": "Alien · Depedent · Up-Country · 1 Year",
    "components": {
      "processing": {
        "on": true,
        "amount": 5000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 0
      },
      "discount": {
        "on": false,
        "amount": 0
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  },
  {
    "id": "BL",
    "label": "Alien · Depedent · Up-Country · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 10000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 0
      },
      "discount": {
        "on": false,
        "amount": 0
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 10000,
    "note": ""
  },
  {
    "id": "BN",
    "label": "Re-Entry · Depedent · Nairobi Resident · 1 Year",
    "components": {
      "processing": {
        "on": true,
        "amount": 5000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 4000
      },
      "discount": {
        "on": true,
        "amount": 2000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 7000,
    "note": ""
  },
  {
    "id": "BO",
    "label": "Re-Entry · Depedent · Nairobi Resident · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 10000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 4000
      },
      "discount": {
        "on": true,
        "amount": 2000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 12000,
    "note": ""
  },
  {
    "id": "BP",
    "label": "Re-Entry · Depedent · Up-Country · 1 Year",
    "components": {
      "processing": {
        "on": true,
        "amount": 5000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 4000
      },
      "discount": {
        "on": true,
        "amount": 2000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 12,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 7000,
    "note": ""
  },
  {
    "id": "BQ",
    "label": "Re-Entry · Depedent · Up-Country · 2 Years",
    "components": {
      "processing": {
        "on": true,
        "amount": 10000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 4000
      },
      "discount": {
        "on": true,
        "amount": 2000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 24,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 12000,
    "note": ""
  },
  {
    "id": "BS",
    "label": "Cert of Good Conduct · Within 5 Days After Biometrix · Kenya",
    "components": {
      "processing": {
        "on": true,
        "amount": 1000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 12000
      },
      "discount": {
        "on": true,
        "amount": 3000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 10000,
    "note": ""
  },
  {
    "id": "BT",
    "label": "Cert of Good Conduct · Within 5 Days After Biometrix · Abroad",
    "components": {
      "processing": {
        "on": true,
        "amount": 1000,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 20000
      },
      "discount": {
        "on": true,
        "amount": 6000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 15000,
    "note": ""
  },
  {
    "id": "BV",
    "label": "Kenyan Passport · ? Pages",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 20000,
    "note": ""
  },
  {
    "id": "BW",
    "label": "Kenyan Passport · ? Pages",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 20000,
    "note": ""
  },
  {
    "id": "BX",
    "label": "Kenyan Passport · 72 Jumbo Pages",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 25000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 20000,
    "note": ""
  },
  {
    "id": "BZ",
    "label": "IHC Passport · 36 Pages",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  },
  {
    "id": "CA",
    "label": "IHC Passport · 60 Pages",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": null,
      "unit": "one_off"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  },
  {
    "id": "CC",
    "label": "IHC Visa Online · Online 6 Months · 6 Months",
    "components": {
      "processing": {
        "on": true,
        "amount": 40,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 6,
      "unit": "months"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  },
  {
    "id": "CD",
    "label": "IHC Visa Online · Online 1 Year · 1 Year",
    "components": {
      "processing": {
        "on": true,
        "amount": 120,
        "currency": "USD"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 1,
      "unit": "years"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  },
  {
    "id": "CE",
    "label": "IHC Visa Online · Online 3 Years · 3 Years",
    "components": {
      "processing": {
        "on": false,
        "amount": null,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 3,
      "unit": "years"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": "Processing fee: check online"
  },
  {
    "id": "CF",
    "label": "IHC Visa Physical · Passport Sticker · 1 Year",
    "components": {
      "processing": {
        "on": false,
        "amount": null,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 1,
      "unit": "years"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": "Processing fee: check online"
  },
  {
    "id": "CH",
    "label": "IHC OCI · Passport Sticker · 10 Years",
    "components": {
      "processing": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "bond": {
        "on": false,
        "amount": null
      },
      "issuance": {
        "on": false,
        "amount": 0,
        "currency": "KES"
      },
      "facilitation": {
        "on": true,
        "amount": 10000
      },
      "discount": {
        "on": true,
        "amount": 5000
      },
      "h1": {
        "on": false,
        "amount": null
      },
      "h2": {
        "on": false,
        "amount": null
      },
      "h3": {
        "on": false,
        "amount": null
      },
      "h4": {
        "on": false,
        "amount": null
      }
    },
    "issuancePaidAtBank": false,
    "gratis": false,
    "validity": {
      "count": 10,
      "unit": "years"
    },
    "payment": {
      "mode": "all_advance",
      "installments": []
    },
    "sheetTotal": 5000,
    "note": ""
  }
]

export const JOB_PRESETS: JobPreset[] = [
  {
    "id": "R10",
    "department": "Primary Findings/ Checks",
    "category": "Primary Findings/ Checks",
    "job": "Directors & Their Associated Companies - KRA Liability Status Check - Per Director",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R11",
    "department": "Primary Findings/ Checks",
    "category": "Primary Findings/ Checks",
    "job": "Directors Mobile Number Change to Correct - Per Director",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R12",
    "department": "Primary Findings/ Checks",
    "category": "Primary Findings/ Checks",
    "job": "Directors Email Address Change to Correct - Per Director",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R14",
    "department": "BRS",
    "category": "Company Registration",
    "job": "Company registration - Limited Company - With Share Capital upto 5 Million",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Company Name ?",
    "officialFee": 10750,
    "officialNote": "",
    "consultancyFee": 35000
  },
  {
    "id": "R15",
    "department": "BRS",
    "category": "Company Registration",
    "job": "Company registration - Limited Company - 1. With Share Capital Over 5 Million - Pay Stamp (In case there is need for Capital funds from Abroad over 5 Million)",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Share Capital Amount?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R16",
    "department": "BRS",
    "category": "Company Registration",
    "job": "-Company registration - Limited Company -Company Secretary Appointment -For Company Over 5 Million Shares OR For ALL NON-Resident Directors (Foreigners).",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Non Resident Directors Names ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 15000
  },
  {
    "id": "R17",
    "department": "BRS",
    "category": "Company Registration",
    "job": "Company registration - Sole proprietorship (BN)",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Proprietorship Name ?",
    "officialFee": 1300,
    "officialNote": "",
    "consultancyFee": 25000
  },
  {
    "id": "R18",
    "department": "BRS",
    "category": "Changes",
    "job": "Cessation of a Business Name (BN) (Sole proprietorship & Partnership)",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Proprietorship/Partnership Name ?",
    "officialFee": null,
    "officialNote": "?",
    "consultancyFee": 15000
  },
  {
    "id": "R19",
    "department": "BRS",
    "category": "Changes",
    "job": "Removal of director/shareholder",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Company specific",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 45000
  },
  {
    "id": "R20",
    "department": "BRS",
    "category": "Changes",
    "job": "Director/shareholder - Email Change at BRS - Per Director",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Director & Email Address (Old to New)",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R21",
    "department": "BRS",
    "category": "Changes",
    "job": "Director/shareholder - Mobile Number at BRS - Per Director",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Director & Mobile Number (Old to New)",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R22",
    "department": "BRS",
    "category": "Changes",
    "job": "Addition of director/shareholder",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Company specific",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 45000
  },
  {
    "id": "R23",
    "department": "BRS",
    "category": "Changes",
    "job": "Removal and addition of director/shareholder",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Company specific",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 45000
  },
  {
    "id": "R24",
    "department": "BRS",
    "category": "Changes",
    "job": "Resign as director and remain as shareholder",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 45000
  },
  {
    "id": "R25",
    "department": "BRS",
    "category": "Company Registration",
    "job": "Company registration - Partnership (BN)",
    "basis": "fixed",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "Partnership Name ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 25000
  },
  {
    "id": "R26",
    "department": "BRS",
    "category": "Strike-Off",
    "job": "Strike-Off - of company - Limited / Proprietorship / Partnership",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R28",
    "department": "KRA",
    "category": "PIN Registration",
    "job": "PIN Registration - Company - With Resident Director (Auto)",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Company",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R29",
    "department": "KRA",
    "category": "PIN Registration",
    "job": "PIN Registration - Company - With Any Non-Resident Director",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Company",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": 10000
  },
  {
    "id": "R30",
    "department": "KRA",
    "category": "PIN Registration",
    "job": "PIN Registration - Individual - For Non-Resident Director",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Individual",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 35000
  },
  {
    "id": "R32",
    "department": "KRA",
    "category": "E-Tims Registration",
    "job": "eTIMS registration Online",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Company",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R34",
    "department": "KRA",
    "category": "Amendments",
    "job": "Change of iTax email address",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Name & Email (Old to New)",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R35",
    "department": "KRA",
    "category": "Amendments",
    "job": "De-associating of Directors in KRA (When Any or More Directors has resigned)",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Name of Resigning Director",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 15000
  },
  {
    "id": "R37",
    "department": "KRA",
    "category": "Obligation Addition",
    "job": "Obligation Addition - VAT",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "VAT Reg Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 45000
  },
  {
    "id": "R38",
    "department": "KRA",
    "category": "Obligation Addition",
    "job": "Obligation Addition - PAYE",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "PAYE Reg Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R39",
    "department": "KRA",
    "category": "Obligation Addition",
    "job": "Obligation Addition - TOT (Turn over Tax)",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "TOT Reg Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 20000
  },
  {
    "id": "R40",
    "department": "KRA",
    "category": "Obligation Addition",
    "job": "Obligation Addition - MRI (Monthly Rental Income - Residential",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "MRI Reg Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 10000
  },
  {
    "id": "R42",
    "department": "KRA",
    "category": "Obligation Cancellation / Dormancy",
    "job": "Obligation Cancellation / Dormancy - VAT - If No Liability",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "VAT Cancellation / Dormancy Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 100000
  },
  {
    "id": "R43",
    "department": "KRA",
    "category": "Obligation Cancellation / Dormancy",
    "job": "Obligation Cancellation / Dormancy - PAYE - - If No Liability",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "PAYE Cancellation / Dormancy Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 20000
  },
  {
    "id": "R44",
    "department": "KRA",
    "category": "Obligation Cancellation / Dormancy",
    "job": "Obligation Cancellation / Dormancy - TOT (Turn over Tax) - - If No Liability",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "TOT Cancellation / Dormancy Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 20000
  },
  {
    "id": "R45",
    "department": "KRA",
    "category": "Obligation Cancellation / Dormancy",
    "job": "Obligation Cancellation / Dormancy - MRI (Monthly Rental Income - Residential - - If No Liability",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "MRI Cancellation / Dormancy Date - ?",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 20000
  },
  {
    "id": "R47",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Findings",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R48",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Demand",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R49",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Special Table",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R50",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Assessments",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R51",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Objection",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R52",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Late - Objection",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R53",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Appeal",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R54",
    "department": "KRA",
    "category": "KRA Matters",
    "job": "Late - Appeal",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "case_based",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R56",
    "department": "KRA",
    "category": "Retrival",
    "job": "KRA PIN Retrival - Company or Individual",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "COMPANY /INDIVUAL",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R57",
    "department": "KRA",
    "category": "Retrival",
    "job": "P9 Form - Retrival - Individual - Less than 3 Years (5k) + More than 3 Years (8k)",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Individual & Year",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R58",
    "department": "KRA",
    "category": "Tax Comliance",
    "job": "Tax Comliance - Company or Individual",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "COMPANY /INDIVUAL",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R59",
    "department": "KRA",
    "category": "Income Tax Return Filling",
    "job": "Income Tax Return Filling - Individual",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "Individual",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R60",
    "department": "KRA",
    "category": "Income Tax Return Filling",
    "job": "Income Tax Return Filling - Company - Per Year",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "COMPANY",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 15000
  },
  {
    "id": "R61",
    "department": "KRA",
    "category": "PIN Dormancy",
    "job": "PIN Dormancy / Cancellation",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R63",
    "department": "SHA",
    "category": "Registration",
    "job": "Registration - SHA - Company/Organisation/Employer",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R64",
    "department": "SHA",
    "category": "Registration",
    "job": "Registration - SHA - Employee/Individual",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R66",
    "department": "NSSF",
    "category": "Registration",
    "job": "Registration - NSSF - Company/Organisation/Employer",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R67",
    "department": "NSSF",
    "category": "Registration",
    "job": "Registration - NSSF - Employee/Individual",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": 3000
  },
  {
    "id": "R69",
    "department": "City Council",
    "category": "UBP (Nairobi County) (SBP + Fire)",
    "job": "UBP (United Business Permit) Depends (on Sq FT + Employees + Industry + County Rates) (Estimated 15,000 to 120,000)",
    "basis": "estimated",
    "estimateNote": "Estimated 15-120 k",
    "frequency": null,
    "requirement": "must",
    "detailsPrompt": "Premises /Branch Name",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 15000
  },
  {
    "id": "R70",
    "department": "City Council",
    "category": "(SBP + Fire)",
    "job": "(SBP + Fire) Depends (on Sq FT + Employees + Industry + County Rates) (Estimated 15,000 to 120,000)",
    "basis": "estimated",
    "estimateNote": "Estimated 15-120 k",
    "frequency": null,
    "requirement": "must",
    "detailsPrompt": "Premises /Branch Name",
    "officialFee": null,
    "officialNote": "Depends",
    "consultancyFee": 25000
  },
  {
    "id": "R71",
    "department": "Specific Licences",
    "category": "Specific Licences",
    "job": "Specific Licences - Refer to Checklist",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": null,
    "requirement": "must",
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R73",
    "department": "Bank",
    "category": "Bank 1 + 2",
    "job": "Bank Account Opening Form - Company - KSH - 20,000 - Min Deposit",
    "basis": "exact",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": "must",
    "detailsPrompt": "",
    "officialFee": 20000,
    "officialNote": "",
    "consultancyFee": 2000
  },
  {
    "id": "R74",
    "department": "Bank",
    "category": "Bank 1 + 2",
    "job": "Bank Account Opening Form - Company - USD - 100 Min Deposit - (For Importers + Others)",
    "basis": "exact",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": "must",
    "detailsPrompt": "",
    "officialFee": 13500,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R75",
    "department": "Bank",
    "category": "Bank 1 Only",
    "job": "Bank Account Opening Form - Director - KSH - 20,000 - Min Deposit",
    "basis": "exact",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": "must",
    "detailsPrompt": "",
    "officialFee": 20000,
    "officialNote": "",
    "consultancyFee": 1000
  },
  {
    "id": "R76",
    "department": "Bank",
    "category": "Bank 1 Only",
    "job": "Bank Account Opening Form - Director - USD - 100 Min Deposit - Not a Must",
    "basis": "exact",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": "optional",
    "detailsPrompt": "",
    "officialFee": 13500,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R78",
    "department": "Bank",
    "category": "Company",
    "job": "Company - i-Click - Site Accountant Email Address (From Domain)",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R79",
    "department": "Bank",
    "category": "Company",
    "job": "Company - Debit Card - Linked to Currrent account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R80",
    "department": "Bank",
    "category": "Company",
    "job": "Company - Credit Card",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R81",
    "department": "Bank",
    "category": "Company",
    "job": "Company - Petty Cash Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R82",
    "department": "Bank",
    "category": "Company",
    "job": "Company - Bank Short Code",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R83",
    "department": "Bank",
    "category": "Company",
    "job": "Company - Cheque Book - 25+50+100 Pages",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R84",
    "department": "Bank",
    "category": "Company",
    "job": "To Add by Div",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R86",
    "department": "Bank",
    "category": "Individual",
    "job": "Individual - Debit Card - Linked to Current account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R87",
    "department": "Bank",
    "category": "Individual",
    "job": "Individual - Credit Card - Principal Card Holder",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R88",
    "department": "Bank",
    "category": "Individual",
    "job": "Individual - Credit Card - Suplimentary Card - For Spouse",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R89",
    "department": "Bank",
    "category": "Individual",
    "job": "Individual - Cheque Book - 25+50+100 Pages",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R90",
    "department": "Bank",
    "category": "Individual",
    "job": "To Add by Div",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R92",
    "department": "Loan Facilites",
    "category": "Bank + Third Credit Party",
    "job": "DIV TO ADD - To Add by Friday + Valuers + Advocates",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R93",
    "department": "Loan Facilites",
    "category": "Bank + Third Credit Party",
    "job": "DIV TO ADD - To Add by Friday + Valuers + Advocates",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R95",
    "department": "IT Devices",
    "category": "IT - Softwares",
    "job": "Company Domain - Zoho Mail - Fresh 3 Users - Info+Accounts+One Director Personal - 50 GB Per User",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": "must",
    "detailsPrompt": "",
    "officialFee": 8300,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R96",
    "department": "IT Devices",
    "category": "IT - Softwares",
    "job": "Company Consol / Domain - Migration to Zoho if existing Domain",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": "optional",
    "detailsPrompt": "",
    "officialFee": 3375,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R98",
    "department": "IT Devices",
    "category": "IT - Hardware",
    "job": "Server + CCTV + Printers + Computers + Network Switch + Wifi + ETC - Refer to List with Speficifation/Model",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R101",
    "department": "Hardware",
    "category": "",
    "job": "Hardware + Furniture - Refer to List with Speficifation/Model",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R102",
    "department": "Hardware",
    "category": "",
    "job": "Refer to P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R104",
    "department": "Hardware",
    "category": "",
    "job": "ERP - Odoo + Zoho - Etc - X",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R105",
    "department": "Hardware",
    "category": "",
    "job": "Accounting Software - Tally - X",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R106",
    "department": "Hardware",
    "category": "Accounting Software - QB",
    "job": "Accounting Software - QB - Desktop - Enterprise",
    "basis": "exact",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 15000
  },
  {
    "id": "R107",
    "department": "Hardware",
    "category": "",
    "job": "Payrol & HR Software - Features List",
    "basis": "exact",
    "estimateNote": "",
    "frequency": "yearly",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R108",
    "department": "Hardware",
    "category": "Accounting Software - QB",
    "job": "Accounting Software - QB - Desktop - Accountant Version - Preffered",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R109",
    "department": "Hardware",
    "category": "Accounting Software - QB",
    "job": "Accounting Software - QB - Online",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R110",
    "department": "Hardware",
    "category": "",
    "job": "eTIMS Enabled device - Har",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R111",
    "department": "4.IT",
    "category": "Devices",
    "job": "eTIMS integration with ERP or Accounting Software",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": "one_off",
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 50000
  },
  {
    "id": "R113",
    "department": "Monthly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R114",
    "department": "Monthly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R115",
    "department": "Monthly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R117",
    "department": "Quarterly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R118",
    "department": "Quarterly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R119",
    "department": "Quarterly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R121",
    "department": "Yearly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R122",
    "department": "Yearly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R123",
    "department": "Yearly",
    "category": "",
    "job": "P & L Account",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R125",
    "department": "Contract",
    "category": "",
    "job": "Bookkeeping & Accounting Contract - Yearly - Lyn",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R126",
    "department": "Contract",
    "category": "",
    "job": "Audit Contract - - Yearly - Lyn",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R127",
    "department": "Contract",
    "category": "",
    "job": "Employee Contract - BCL",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 5000
  },
  {
    "id": "R128",
    "department": "Contract",
    "category": "",
    "job": "Clearing Agent - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R129",
    "department": "Contract",
    "category": "",
    "job": "Forex/ Hawala Account - For Importers - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R130",
    "department": "Contract",
    "category": "",
    "job": "HR Agency - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 0
  },
  {
    "id": "R131",
    "department": "Contract",
    "category": "",
    "job": "Lease Agreement - Registered with Land regitsry + Advocate - Stamp Duty Seeperate",
    "basis": "estimated",
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": 0,
    "officialNote": "",
    "consultancyFee": 35000
  },
  {
    "id": "R132",
    "department": "Contract",
    "category": "",
    "job": "Insurance - General Insurance - Agent - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R133",
    "department": "Contract",
    "category": "",
    "job": "Insurance - Medical Insurance - AAR - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R134",
    "department": "Contract",
    "category": "",
    "job": "Advocates - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  },
  {
    "id": "R135",
    "department": "Contract",
    "category": "",
    "job": "Real Estate - B to B",
    "basis": null,
    "estimateNote": "",
    "frequency": null,
    "requirement": null,
    "detailsPrompt": "",
    "officialFee": null,
    "officialNote": "",
    "consultancyFee": null
  }
]

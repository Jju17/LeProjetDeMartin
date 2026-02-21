export interface FSMACompartment {
  cisCode: string;
  cisKbo: string;
  cisNameFR: string;
  cisNameNL: string;
  cisLicense: string;
  cisNationality: string;
  cisLegalForm: string;
  cisLegalFormFR: string;
  cisLegalFormNL: string;
  cisManagementType: string;
  cisManagementCompanyFR: string;
  cisManagementCompanyNL: string;
  compartmentCode: string;
  compartmentNameFR: string;
  compartmentNameNL: string;
  shareClassCode: string;
  shareClassNameFR: string;
  shareClassNameNL: string;
  shareClassType: string;
  shareClassCurrency: string;
  shareClassISIN: string;
}

export interface FSMAResponse {
  compartments: FSMACompartment[];
  count: number;
}

export type FSMASortKey = "name" | "nationality" | "management" | "code";

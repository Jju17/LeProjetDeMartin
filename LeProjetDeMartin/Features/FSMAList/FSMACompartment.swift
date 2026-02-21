import Foundation

struct FSMACompartment: Equatable, Identifiable, Decodable, Sendable {
    var id: String { compartmentCode }

    // CIS (umbrella fund) info
    let cisCode: String
    let cisNameFR: String
    let cisNameNL: String
    let cisNationality: String
    let cisLegalFormFR: String
    let cisManagementType: String
    let cisManagementCompanyFR: String

    // Compartment (sub-fund) info
    let compartmentCode: String
    let compartmentNameFR: String
    let compartmentNameNL: String

    // Share class info
    let shareClassCode: String
    let shareClassNameFR: String
    let shareClassType: String
    let shareClassCurrency: String
    let shareClassISIN: String
}

// MARK: - API Response

struct FSMAResponse: Decodable, Sendable {
    let compartments: [FSMACompartment]
    let count: Int
}

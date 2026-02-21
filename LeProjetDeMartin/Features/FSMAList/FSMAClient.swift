import ComposableArchitecture
import Foundation

@DependencyClient
struct FSMAClient {
    var fetch: @Sendable () async throws -> [FSMACompartment]
}

extension FSMAClient: TestDependencyKey {
    static let previewValue = Self(
        fetch: {
            [
                FSMACompartment(
                    cisCode: "00991", cisNameFR: "iShares", cisNameNL: "iShares",
                    cisNationality: "IE", cisLegalFormFR: "ICAV", cisManagementType: "Self-managed",
                    cisManagementCompanyFR: "BlackRock Asset Management Ireland",
                    compartmentCode: "00991-0001", compartmentNameFR: "iShares $ Corp Bond Ucits Etf",
                    compartmentNameNL: "iShares $ Corp Bond Ucits Etf",
                    shareClassCode: "", shareClassNameFR: "", shareClassType: "",
                    shareClassCurrency: "", shareClassISIN: ""
                ),
                FSMACompartment(
                    cisCode: "01829", cisNameFR: "Vanguard Funds", cisNameNL: "Vanguard Funds",
                    cisNationality: "IE", cisLegalFormFR: "ICAV", cisManagementType: "Self-managed",
                    cisManagementCompanyFR: "Vanguard Group (Ireland) Limited",
                    compartmentCode: "01829-0001", compartmentNameFR: "Vanguard Global Stock Index Fund",
                    compartmentNameNL: "Vanguard Global Stock Index Fund",
                    shareClassCode: "", shareClassNameFR: "", shareClassType: "",
                    shareClassCurrency: "", shareClassISIN: ""
                ),
            ]
        }
    )

    static let testValue = Self()
}

extension FSMAClient: DependencyKey {
    static let cloudFunctionURL = "https://europe-west1-leprojetdemartin.cloudfunctions.net/getFSMA"

    static let liveValue = Self(
        fetch: {
            guard let url = URL(string: cloudFunctionURL) else {
                throw FSMAClientError.invalidURL
            }

            var request = URLRequest(url: url)
            request.timeoutInterval = 30

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw FSMAClientError.serverError
            }

            let decoded = try JSONDecoder().decode(FSMAResponse.self, from: data)

            guard !decoded.compartments.isEmpty else {
                throw FSMAClientError.emptyResponse
            }

            return decoded.compartments
        }
    )
}

enum FSMAClientError: LocalizedError {
    case invalidURL
    case serverError
    case emptyResponse

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "URL de la Cloud Function invalide."
        case .serverError:
            return "Le serveur a retourné une erreur."
        case .emptyResponse:
            return "Aucun compartiment FSMA retourné."
        }
    }
}

extension DependencyValues {
    var fsmaClient: FSMAClient {
        get { self[FSMAClient.self] }
        set { self[FSMAClient.self] = newValue }
    }
}

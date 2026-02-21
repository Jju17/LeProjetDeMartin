import ComposableArchitecture
import Foundation

@DependencyClient
struct ETFClient {
    var fetch: @Sendable () async throws -> [ETF]
}

extension ETFClient: TestDependencyKey {
    static let previewValue = Self(
        fetch: {
            [
                ETF(name: "iShares Core S&P 500 UCITS ETF", isin: "IE00B5BMR087", ticker: "SXR8", index: "S&P 500", type: .accumulating, ter: 0.07, fundSize: "114 Mrd EUR", domicile: "Ireland", provider: "iShares", currency: "USD", replication: "Full replication", fsmaCode: "00991"),
                ETF(name: "iShares Core MSCI World UCITS ETF", isin: "IE00B4L5Y983", ticker: "EUNL", index: "MSCI World", type: .accumulating, ter: 0.20, fundSize: "111 Mrd EUR", domicile: "Ireland", provider: "iShares", currency: "USD", replication: "Optimized sampling", fsmaCode: "00991"),
                ETF(name: "Vanguard FTSE All-World UCITS ETF", isin: "IE00BK5BQT80", ticker: "VWCE", index: "FTSE All-World", type: .accumulating, ter: 0.22, fundSize: "30 Mrd EUR", domicile: "Ireland", provider: "Vanguard", currency: "USD", replication: "Optimized sampling"),
            ]
        }
    )

    static let testValue = Self()
}

extension ETFClient: DependencyKey {
    // Replace with your deployed Cloud Function URL after running:
    //   firebase deploy --only functions
    static let cloudFunctionURL = "https://us-central1-leprojetdemartin.cloudfunctions.net/getETFs"

    static let liveValue = Self(
        fetch: {
            guard let url = URL(string: cloudFunctionURL) else {
                throw ETFClientError.invalidURL
            }

            var request = URLRequest(url: url)
            request.timeoutInterval = 15

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw ETFClientError.serverError
            }

            let decoded = try JSONDecoder().decode(ETFResponse.self, from: data)

            guard !decoded.etfs.isEmpty else {
                throw ETFClientError.emptyResponse
            }

            return decoded.etfs
        }
    )
}

enum ETFClientError: LocalizedError {
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
            return "Aucun ETF retourné par le serveur."
        }
    }
}

extension DependencyValues {
    var etfClient: ETFClient {
        get { self[ETFClient.self] }
        set { self[ETFClient.self] = newValue }
    }
}

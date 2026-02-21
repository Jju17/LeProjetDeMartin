import Foundation

struct ETF: Equatable, Identifiable, Decodable, Sendable {
    var id: String { isin }
    let name: String
    let isin: String
    let ticker: String
    let index: String
    let type: ETFType
    let ter: Double
    let fundSize: String
    let domicile: String
    let provider: String
    let currency: String
    let replication: String
    let latestQuote: Double?
    let quoteDate: String?
    let fsmaCode: String?

    enum CodingKeys: String, CodingKey {
        case name, isin, ticker, index, type, ter, fundSize, domicile
        case provider, currency, replication, latestQuote, quoteDate, fsmaCode
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        isin = try c.decode(String.self, forKey: .isin)
        ticker = try c.decode(String.self, forKey: .ticker)
        index = try c.decode(String.self, forKey: .index)
        ter = try c.decode(Double.self, forKey: .ter)
        fundSize = try c.decode(String.self, forKey: .fundSize)
        domicile = try c.decode(String.self, forKey: .domicile)
        provider = try c.decode(String.self, forKey: .provider)
        currency = try c.decode(String.self, forKey: .currency)
        replication = try c.decode(String.self, forKey: .replication)
        latestQuote = try c.decodeIfPresent(Double.self, forKey: .latestQuote)
        quoteDate = try c.decodeIfPresent(String.self, forKey: .quoteDate)
        fsmaCode = try c.decodeIfPresent(String.self, forKey: .fsmaCode)

        let typeString = try c.decode(String.self, forKey: .type)
        type = typeString.lowercased().contains("accum") ? .accumulating : .distributing
    }

    init(
        name: String, isin: String, ticker: String, index: String,
        type: ETFType, ter: Double, fundSize: String, domicile: String,
        provider: String, currency: String, replication: String,
        latestQuote: Double? = nil, quoteDate: String? = nil,
        fsmaCode: String? = nil
    ) {
        self.name = name
        self.isin = isin
        self.ticker = ticker
        self.index = index
        self.type = type
        self.ter = ter
        self.fundSize = fundSize
        self.domicile = domicile
        self.provider = provider
        self.currency = currency
        self.replication = replication
        self.latestQuote = latestQuote
        self.quoteDate = quoteDate
        self.fsmaCode = fsmaCode
    }
}

// MARK: - ETFType

enum ETFType: String, CaseIterable, Identifiable, Sendable {
    case all = "Tous"
    case accumulating = "Capitalisant"
    case distributing = "Distribuant"

    var id: String { rawValue }

    var shortLabel: String {
        switch self {
        case .all: return "Tous"
        case .accumulating: return "Acc"
        case .distributing: return "Dist"
        }
    }
}

// MARK: - FSMAFilter

enum FSMAFilter: String, CaseIterable, Identifiable, Sendable {
    case all = "Tous"
    case fsmaOnly = "FSMA"
    case excludeFSMA = "Hors FSMA"

    var id: String { rawValue }
}

// MARK: - SortOption

enum SortOption: String, CaseIterable, Identifiable, Sendable {
    case name = "Nom"
    case fundSizeDesc = "Taille ↓"
    case fundSizeAsc = "Taille ↑"
    case terAsc = "TER ↑"
    case terDesc = "TER ↓"
    case domicile = "Pays"
    case providerFirst = "Avec provider"
    case providerLast = "Sans provider"

    var id: String { rawValue }
}

// MARK: - Fund Size Parsing

extension ETF {
    /// Parses fund size strings like "114 Mrd EUR", "30 M EUR" into a numeric value (in millions) for sorting.
    var fundSizeNumeric: Double {
        let parts = fundSize.trimmingCharacters(in: .whitespaces).split(separator: " ")
        guard parts.count >= 2, let value = Double(parts[0]) else { return 0 }

        switch String(parts[1]).lowercased() {
        case "mrd": return value * 1_000
        case "m": return value
        default: return value
        }
    }
}

// MARK: - API Response

struct ETFResponse: Decodable, Sendable {
    let etfs: [ETF]
    let count: Int
}

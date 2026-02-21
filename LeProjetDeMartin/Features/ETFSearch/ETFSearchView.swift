import ComposableArchitecture
import SwiftUI

struct ETFSearchView: View {
    @Bindable var store: StoreOf<ETFSearchFeature>

    var body: some View {
        List {
            Section {
                Picker("Index", selection: $store.selectedIndex) {
                    ForEach(store.availableIndices, id: \.self) { index in
                        Text(index).tag(index)
                    }
                }

                Picker("Type", selection: $store.selectedType) {
                    ForEach(ETFType.allCases) { type in
                        Text(type.rawValue).tag(type)
                    }
                }

                Picker("FSMA", selection: $store.selectedFSMA) {
                    ForEach(FSMAFilter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }

                Picker("Tri", selection: $store.selectedSort) {
                    ForEach(SortOption.allCases) { option in
                        Text(option.rawValue).tag(option)
                    }
                }
            }

            if store.isLoading {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Chargement des ETFs...")
                        Spacer()
                    }
                }
            } else if let errorMessage = store.errorMessage {
                Section {
                    ContentUnavailableView {
                        Label("Connexion impossible", systemImage: "wifi.slash")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Réessayer") {
                            store.send(.retryButtonTapped)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            } else if store.allETFs.isEmpty {
                Section {
                    ContentUnavailableView {
                        Label("Aucun ETF", systemImage: "chart.line.downtrend.xyaxis")
                    } description: {
                        Text("Impossible de charger les ETFs.\nVérifiez votre connexion internet.")
                    } actions: {
                        Button("Réessayer") {
                            store.send(.retryButtonTapped)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            } else {
                Section {
                    if store.filteredETFs.isEmpty {
                        ContentUnavailableView.search(text: store.searchText)
                    } else {
                        ForEach(store.filteredETFs) { etf in
                            ETFRow(etf: etf)
                        }
                    }
                } header: {
                    Text("\(store.filteredETFs.count) résultat(s)")
                }
            }
        }
        .searchable(text: $store.searchText, prompt: "Nom, ISIN, ticker, index...")
        .refreshable { await store.send(.pullToRefresh).finish() }
        .onAppear { store.send(.onAppear) }
    }
}

private struct ETFRow: View {
    let etf: ETF

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(etf.name)
                .font(.subheadline)
                .fontWeight(.semibold)

            HStack(spacing: 8) {
                TagView(text: etf.ticker, color: .blue)
                TagView(text: etf.type == .accumulating ? "Acc" : "Dist",
                        color: etf.type == .accumulating ? .green : .orange)
                if !etf.index.isEmpty {
                    TagView(text: etf.index, color: .purple)
                }
                if etf.fsmaCode != nil {
                    TagView(text: "FSMA", color: .teal)
                }
            }

            HStack {
                InfoItem(label: "ISIN", value: etf.isin)
                Spacer()
                InfoItem(label: "TER", value: String(format: "%.2f%%", etf.ter))
            }

            HStack {
                InfoItem(label: "Taille", value: etf.fundSize)
                Spacer()
                InfoItem(label: "Domicile", value: etf.domicile)
            }

            HStack {
                InfoItem(label: "Provider", value: etf.provider.isEmpty ? "-" : etf.provider)
                Spacer()
                InfoItem(label: "Devise", value: etf.currency)
            }

            HStack {
                InfoItem(label: "Réplication", value: etf.replication)
                Spacer()
                if let quote = etf.latestQuote {
                    InfoItem(label: "Cours", value: String(format: "%.2f EUR", quote))
                }
            }

            if let date = etf.quoteDate {
                InfoItem(label: "Date cours", value: date)
            }

            if let fsmaCode = etf.fsmaCode {
                InfoItem(label: "FSMA Code", value: fsmaCode)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct TagView: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption2)
            .fontWeight(.medium)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

private struct InfoItem: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption)
        }
    }
}

#Preview {
    NavigationStack {
        ETFSearchView(
            store: Store(initialState: ETFSearchFeature.State()) {
                ETFSearchFeature()
            }
        )
        .navigationTitle("ETF Finder")
    }
}

import ComposableArchitecture
import SwiftUI

struct FSMAListView: View {
    @Bindable var store: StoreOf<FSMAListFeature>

    var body: some View {
        List {
            if store.isLoading {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Chargement de la liste FSMA...")
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
            } else if store.allCompartments.isEmpty {
                Section {
                    ContentUnavailableView {
                        Label("Aucune donnée", systemImage: "doc.text.magnifyingglass")
                    } description: {
                        Text("Impossible de charger la liste FSMA.\nVérifiez votre connexion internet.")
                    } actions: {
                        Button("Réessayer") {
                            store.send(.retryButtonTapped)
                        }
                        .buttonStyle(.bordered)
                    }
                }
            } else {
                Section {
                    if store.filteredCompartments.isEmpty {
                        ContentUnavailableView.search(text: store.searchText)
                    } else {
                        ForEach(store.filteredCompartments) { compartment in
                            FSMARow(compartment: compartment)
                        }
                    }
                } header: {
                    Text("\(store.filteredCompartments.count) compartiment(s)")
                }
            }
        }
        .searchable(text: $store.searchText, prompt: "Nom, code FSMA, nationalité...")
        .refreshable { await store.send(.pullToRefresh).finish() }
        .onAppear { store.send(.onAppear) }
    }
}

private struct FSMARow: View {
    let compartment: FSMACompartment

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(compartment.compartmentNameFR)
                .font(.subheadline)
                .fontWeight(.semibold)

            HStack(spacing: 8) {
                FSMATagView(text: compartment.compartmentCode, color: .teal)
                FSMATagView(text: compartment.cisNationality, color: .blue)
            }

            HStack {
                FSMAInfoItem(label: "CIS", value: compartment.cisNameFR)
                Spacer()
                FSMAInfoItem(label: "Code CIS", value: compartment.cisCode)
            }

            HStack {
                FSMAInfoItem(label: "Société de gestion", value: compartment.cisManagementCompanyFR)
            }

            HStack {
                FSMAInfoItem(label: "Forme juridique", value: compartment.cisLegalFormFR)
                Spacer()
                FSMAInfoItem(label: "Gestion", value: compartment.cisManagementType)
            }

            if !compartment.shareClassISIN.isEmpty {
                HStack {
                    FSMAInfoItem(label: "ISIN", value: compartment.shareClassISIN)
                    Spacer()
                    if !compartment.shareClassCurrency.isEmpty {
                        FSMAInfoItem(label: "Devise", value: compartment.shareClassCurrency)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }
}

private struct FSMATagView: View {
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

private struct FSMAInfoItem: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value.isEmpty ? "-" : value)
                .font(.caption)
        }
    }
}

#Preview {
    NavigationStack {
        FSMAListView(
            store: Store(initialState: FSMAListFeature.State()) {
                FSMAListFeature()
            }
        )
        .navigationTitle("FSMA")
    }
}

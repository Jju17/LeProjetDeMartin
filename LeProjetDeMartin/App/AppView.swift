//
//  AppView.swift
//  LeProjetDeMartin
//

import ComposableArchitecture
import SwiftUI

struct AppView: View {
    @Bindable var store: StoreOf<AppFeature>

    var body: some View {
        TabView {
            NavigationStack {
                ETFSearchView(
                    store: store.scope(
                        state: \.etfSearch,
                        action: \.etfSearch
                    )
                )
                .navigationTitle("ETF Finder")
            }
            .tabItem {
                Label("ETFs", systemImage: "chart.line.uptrend.xyaxis")
            }

            NavigationStack {
                FSMAListView(
                    store: store.scope(
                        state: \.fsmaList,
                        action: \.fsmaList
                    )
                )
                .navigationTitle("FSMA")
            }
            .tabItem {
                Label("FSMA", systemImage: "building.columns")
            }
        }
    }
}

#Preview {
    AppView(
        store: Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    )
}

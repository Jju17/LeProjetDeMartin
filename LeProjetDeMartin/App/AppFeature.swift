//
//  AppFeature.swift
//  LeProjetDeMartin
//

import ComposableArchitecture

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var etfSearch = ETFSearchFeature.State()
        var fsmaList = FSMAListFeature.State()
    }

    enum Action {
        case etfSearch(ETFSearchFeature.Action)
        case fsmaList(FSMAListFeature.Action)
    }

    var body: some Reducer<State, Action> {
        Scope(state: \.etfSearch, action: \.etfSearch) {
            ETFSearchFeature()
        }
        Scope(state: \.fsmaList, action: \.fsmaList) {
            FSMAListFeature()
        }
    }
}

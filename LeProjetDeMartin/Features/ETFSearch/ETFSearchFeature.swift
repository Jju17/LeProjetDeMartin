import ComposableArchitecture
import Foundation

@Reducer
struct ETFSearchFeature {
    @ObservableState
    struct State: Equatable {
        var allETFs: [ETF] = []
        var filteredETFs: [ETF] = []
        var searchText = ""
        var selectedIndex = "Tous"
        var selectedType: ETFType = .all
        var selectedFSMA: FSMAFilter = .all
        var selectedSort: SortOption = .fundSizeDesc
        var isLoading = false
        var errorMessage: String?

        /// Unique index names found in the data, sorted by count descending.
        var availableIndices: [String] {
            let counts = Dictionary(grouping: allETFs, by: \.index)
                .mapValues(\.count)
            let sorted = counts.sorted { $0.value > $1.value }.map(\.key)
            return ["Tous"] + sorted
        }
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case onAppear
        case etfsLoaded([ETF])
        case etfsLoadingFailed(String)
        case retryButtonTapped
        case pullToRefresh
        case filterETFs
    }

    @Dependency(\.etfClient) var etfClient

    var body: some Reducer<State, Action> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .binding:
                return .send(.filterETFs)

            case .onAppear:
                guard state.allETFs.isEmpty else { return .none }
                state.isLoading = true
                state.errorMessage = nil
                return .run { send in
                    let etfs = try await etfClient.fetch()
                    await send(.etfsLoaded(etfs))
                } catch: { error, send in
                    await send(.etfsLoadingFailed(error.localizedDescription))
                }

            case let .etfsLoaded(etfs):
                state.allETFs = etfs
                state.isLoading = false
                return .send(.filterETFs)

            case let .etfsLoadingFailed(message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .retryButtonTapped:
                state.allETFs = []
                return .send(.onAppear)

            case .pullToRefresh:
                state.errorMessage = nil
                return .run { send in
                    let etfs = try await etfClient.fetch()
                    await send(.etfsLoaded(etfs))
                } catch: { error, send in
                    await send(.etfsLoadingFailed(error.localizedDescription))
                }

            case .filterETFs:
                let query = state.searchText.lowercased()
                let selectedIndex = state.selectedIndex
                let fsmaFilter = state.selectedFSMA
                var results = state.allETFs.filter { etf in
                    let matchesIndex = selectedIndex == "Tous" || etf.index == selectedIndex
                    let matchesType = state.selectedType == .all || etf.type == state.selectedType
                    let matchesFSMA: Bool
                    switch fsmaFilter {
                    case .all: matchesFSMA = true
                    case .fsmaOnly: matchesFSMA = etf.fsmaCode != nil
                    case .excludeFSMA: matchesFSMA = etf.fsmaCode == nil
                    }
                    let matchesSearch = query.isEmpty
                        || etf.name.lowercased().contains(query)
                        || etf.isin.lowercased().contains(query)
                        || etf.ticker.lowercased().contains(query)
                        || etf.provider.lowercased().contains(query)
                        || etf.index.lowercased().contains(query)
                    return matchesIndex && matchesType && matchesFSMA && matchesSearch
                }

                switch state.selectedSort {
                case .name:
                    results.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                case .fundSizeDesc:
                    results.sort { $0.fundSizeNumeric > $1.fundSizeNumeric }
                case .fundSizeAsc:
                    results.sort { $0.fundSizeNumeric < $1.fundSizeNumeric }
                case .terAsc:
                    results.sort { $0.ter < $1.ter }
                case .terDesc:
                    results.sort { $0.ter > $1.ter }
                case .domicile:
                    results.sort {
                        if $0.domicile == $1.domicile {
                            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                        }
                        return $0.domicile.localizedCaseInsensitiveCompare($1.domicile) == .orderedAscending
                    }
                case .providerFirst:
                    results.sort {
                        let hasP0 = !$0.provider.isEmpty
                        let hasP1 = !$1.provider.isEmpty
                        if hasP0 != hasP1 { return hasP0 }
                        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                    }
                case .providerLast:
                    results.sort {
                        let hasP0 = !$0.provider.isEmpty
                        let hasP1 = !$1.provider.isEmpty
                        if hasP0 != hasP1 { return !hasP0 }
                        return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                    }
                }

                state.filteredETFs = results
                return .none
            }
        }
    }
}

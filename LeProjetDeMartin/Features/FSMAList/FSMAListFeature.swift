import ComposableArchitecture
import Foundation

@Reducer
struct FSMAListFeature {
    @ObservableState
    struct State: Equatable {
        var allCompartments: [FSMACompartment] = []
        var filteredCompartments: [FSMACompartment] = []
        var searchText = ""
        var isLoading = false
        var errorMessage: String?
    }

    enum Action: BindableAction {
        case binding(BindingAction<State>)
        case onAppear
        case compartmentsLoaded([FSMACompartment])
        case loadingFailed(String)
        case retryButtonTapped
        case pullToRefresh
        case filterCompartments
    }

    @Dependency(\.fsmaClient) var fsmaClient

    var body: some Reducer<State, Action> {
        BindingReducer()
        Reduce { state, action in
            switch action {
            case .binding:
                return .send(.filterCompartments)

            case .onAppear:
                guard state.allCompartments.isEmpty else { return .none }
                state.isLoading = true
                state.errorMessage = nil
                return .run { send in
                    let compartments = try await fsmaClient.fetch()
                    await send(.compartmentsLoaded(compartments))
                } catch: { error, send in
                    await send(.loadingFailed(error.localizedDescription))
                }

            case let .compartmentsLoaded(compartments):
                state.allCompartments = compartments
                state.isLoading = false
                return .send(.filterCompartments)

            case let .loadingFailed(message):
                state.isLoading = false
                state.errorMessage = message
                return .none

            case .retryButtonTapped:
                state.allCompartments = []
                return .send(.onAppear)

            case .pullToRefresh:
                state.errorMessage = nil
                return .run { send in
                    let compartments = try await fsmaClient.fetch()
                    await send(.compartmentsLoaded(compartments))
                } catch: { error, send in
                    await send(.loadingFailed(error.localizedDescription))
                }

            case .filterCompartments:
                let query = state.searchText.lowercased()
                state.filteredCompartments = state.allCompartments.filter { c in
                    guard !query.isEmpty else { return true }
                    return c.compartmentNameFR.lowercased().contains(query)
                        || c.compartmentCode.lowercased().contains(query)
                        || c.cisNameFR.lowercased().contains(query)
                        || c.cisNationality.lowercased().contains(query)
                        || c.cisManagementCompanyFR.lowercased().contains(query)
                }
                return .none
            }
        }
    }
}

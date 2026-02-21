//
//  LeProjetDeMartinApp.swift
//  LeProjetDeMartin
//
//  Created by Julien on 21/02/2026.
//

import ComposableArchitecture
import SwiftUI

@main
struct LeProjetDeMartinApp: App {
    let store = Store(initialState: AppFeature.State()) {
        AppFeature()
    }

    var body: some Scene {
        WindowGroup {
            AppView(store: store)
        }
    }
}

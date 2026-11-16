import SwiftUI
import Combine

@main
struct TigerSportsLiveApp: App {
    @StateObject private var store = SportsStore()
    @Environment(\.scenePhase) private var scenePhase
    @State private var scorePollCount = 0

    private let timer = Timer.publish(every: 20, on: .main, in: .common).autoconnect()

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
                .preferredColorScheme(.dark)
                .tint(.tigerOrange)
                .task { await store.refreshAll() }
                .onReceive(timer) { _ in
                    guard scenePhase == .active else { return }
                    scorePollCount += 1
                    Task {
                        await store.refreshScores()
                        if scorePollCount.isMultiple(of: 3) { await store.refreshLive() }
                        if scorePollCount.isMultiple(of: 15) { await store.refreshTeams() }
                    }
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        Task { await store.refreshAll() }
                    }
                }
        }
    }
}

enum AppTab: Hashable {
    case home, gameDay, scores, teams, more
}

struct RootView: View {
    @ObservedObject var store: SportsStore
    @State private var tab: AppTab = .home

    var body: some View {
        TabView(selection: $tab) {
            NavigationStack {
                HomeView(store: store, selectedTab: $tab)
            }
            .tabItem { Label("Home", systemImage: "house.fill") }
            .tag(AppTab.home)

            NavigationStack {
                GameDayView(store: store)
            }
            .tabItem { Label("Game Day", systemImage: "play.rectangle.fill") }
            .tag(AppTab.gameDay)

            NavigationStack {
                ScoresView(store: store)
            }
            .tabItem { Label("Scores", systemImage: "chart.bar.fill") }
            .tag(AppTab.scores)

            NavigationStack {
                TeamsView(store: store)
            }
            .tabItem { Label("Teams", systemImage: "person.3.fill") }
            .tag(AppTab.teams)

            NavigationStack {
                MoreView()
            }
            .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
            .tag(AppTab.more)
        }
        .toolbarBackground(.visible, for: .tabBar)
        .toolbarBackground(Color.tigerBlack, for: .tabBar)
    }
}

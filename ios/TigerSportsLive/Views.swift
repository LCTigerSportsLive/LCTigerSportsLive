import SwiftUI

private struct TigerCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(Color.tigerPanel, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.tigerOrange.opacity(0.34)))
    }
}

private struct PageHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TIGER SPORTS LIVE")
                .font(.caption.bold())
                .tracking(2)
                .foregroundStyle(Color.tigerOrange)
            Text(title)
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(.white)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.gray)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct FeatureRow: View {
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundStyle(Color.tigerOrange)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.headline).foregroundStyle(.white)
                Text(subtitle).font(.caption).foregroundStyle(.gray)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right")
                .font(.caption.bold())
                .foregroundStyle(Color.tigerOrange)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

struct HomeView: View {
    @ObservedObject var store: SportsStore
    @Binding var selectedTab: AppTab

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                PageHeader(
                    title: "Liberty Center Tigers",
                    subtitle: "Your home for Liberty Center Tiger Sports — live broadcasts, scores, rosters and highlights."
                )
                TigerCard {
                    HStack {
                        Image(systemName: "dot.radiowaves.left.and.right")
                            .foregroundStyle(Color.tigerOrange)
                        Text(store.live?.verifiedVideoID != nil ? "LIVE NOW" : "GAME DAY")
                            .font(.caption.bold())
                            .tracking(1)
                            .foregroundStyle(Color.tigerOrange)
                    }
                    Text(store.live?.verifiedVideoID != nil
                         ? (store.live?.title ?? "Watch the Tigers live")
                         : "Watch the next Tigers broadcast")
                        .font(.title3.bold())
                        .foregroundStyle(.white)
                    Button {
                        selectedTab = .gameDay
                    } label: {
                        Label("Go to Game Day", systemImage: "play.fill")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.tigerOrange)
                }

                if store.scores?.isLive == true, let snapshot = store.scores?.feed?.snapshot {
                    Text("LIVE SCORE").font(.headline).foregroundStyle(Color.tigerOrange)
                    ScoreboardCard(snapshot: snapshot)
                }

                Text("Explore Tiger Sports")
                    .font(.title2.bold())
                TigerCard {
                    Button { selectedTab = .scores } label: {
                        FeatureRow(title: "Live Scores", subtitle: "Press Row game scoreboard", icon: "chart.bar.fill")
                    }
                    .buttonStyle(.plain)
                    Divider()
                    Button { selectedTab = .teams } label: {
                        FeatureRow(title: "Team Rosters", subtitle: "Liberty Center teams", icon: "person.3.fill")
                    }
                    .buttonStyle(.plain)
                    Divider()
                    NavigationLink {
                        WebPageView(title: "News & Events", url: AppConfig.page("/athletic-news-events.html"))
                    } label: {
                        FeatureRow(title: "News & Events", subtitle: "Game recaps and Tiger stories", icon: "newspaper.fill")
                    }
                    .buttonStyle(.plain)
                    Divider()
                    NavigationLink {
                        WebPageView(title: "Tiger Sports Trivia", url: AppConfig.page("/tiger-trivia.html"))
                    } label: {
                        FeatureRow(title: "Tiger Sports Trivia", subtitle: "Liberty Center sports records", icon: "brain.head.profile")
                    }
                    .buttonStyle(.plain)
                }
                ShareLink(item: AppConfig.baseURL) {
                    Label("Share Tiger Sports Live", systemImage: "square.and.arrow.up")
                        .font(.subheadline.bold())
                }
                .foregroundStyle(Color.tigerOrange)
            }
            .padding(18)
        }
        .background(Color.tigerBlack)
        .navigationTitle("Tiger Sports Live")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshAll() }
    }
}

struct GameDayView: View {
    @ObservedObject var store: SportsStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageHeader(title: "Game Day", subtitle: "Liberty Center Tigers live coverage and game replays")
                TigerCard {
                    if let videoID = store.live?.verifiedVideoID {
                        Label("LIVE NOW", systemImage: "circle.fill")
                            .font(.caption.bold())
                            .foregroundStyle(Color.tigerOrange)
                        Text(store.live?.title ?? "Tiger Sports Live")
                            .font(.title3.bold())
                        YouTubeEmbedView(videoID: videoID)
                            .frame(height: 210)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        Image(systemName: "video.slash")
                            .font(.system(size: 36))
                            .foregroundStyle(Color.tigerOrange)
                        Text("No confirmed live broadcast")
                            .font(.title3.bold())
                        Text(store.lastError ?? "When a Tigers broadcast goes live, the video player will appear here.")
                            .font(.subheadline)
                            .foregroundStyle(.gray)
                    }
                    Link(destination: AppConfig.watchURL) {
                        Label("Watch on YouTube", systemImage: "play.rectangle.fill")
                            .frame(maxWidth: .infinity)
                            .padding(12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.tigerOrange)
                }
                if store.scores?.isLive == true, let snapshot = store.scores?.feed?.snapshot {
                    Text("PRESS ROW LIVE SCORE")
                        .font(.headline)
                        .foregroundStyle(Color.tigerOrange)
                    ScoreboardCard(snapshot: snapshot)
                }
                TigerCard {
                    Text("Next broadcast & full schedule").font(.headline)
                    Text("Check the Tiger Sports Live site for scheduled YouTube broadcasts and upcoming games.")
                        .font(.subheadline)
                        .foregroundStyle(.gray)
                    NavigationLink {
                        WebPageView(title: "Scheduled Games", url: AppConfig.baseURL)
                    } label: {
                        Label("View upcoming games", systemImage: "calendar")
                    }
                }
            }
            .padding(18)
        }
        .background(Color.tigerBlack)
        .navigationTitle("Game Day")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshAll() }
    }
}

struct ScoreboardCard: View {
    let snapshot: GameSnapshot

    var body: some View {
        TigerCard {
            HStack(spacing: 0) {
                team(name: snapshot.awayTeam?.shortName ?? snapshot.awayTeam?.name ?? "Away",
                     score: snapshot.awayScore)
                Rectangle().fill(Color.tigerOrange.opacity(0.35))
                    .frame(width: 1, height: 100)
                team(name: snapshot.homeTeam?.shortName ?? snapshot.homeTeam?.name ?? "Home",
                     score: snapshot.homeScore)
            }
            Divider()
            HStack(spacing: 12) {
                if let quarter = snapshot.quarter, quarter > 0 {
                    Text(quarter <= 4 ? "Q\(quarter)" : "OT \(quarter - 4)")
                }
                if let clock = snapshot.gameTime { Text(clock) }
                Spacer()
            }
            .font(.subheadline.bold())
            .foregroundStyle(.white)
            if let situation = snapshot.downDistanceText, !situation.isEmpty {
                Text([situation, snapshot.yardLineDisplay].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.gray)
            }
        }
    }

    private func team(name: String, score: Int?) -> some View {
        VStack(spacing: 8) {
            Text(name)
                .font(.subheadline.bold())
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(height: 42)
            Text(score.map(String.init) ?? "—")
                .font(.system(size: 46, weight: .black, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(Color.tigerOrange)
        }
        .frame(maxWidth: .infinity)
    }
}

struct ScoresView: View {
    @ObservedObject var store: SportsStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageHeader(title: "Live Scores", subtitle: "Press Row Gridiron · Refreshes every 20 seconds during active use")
                if store.scores?.isLive == true, let snapshot = store.scores?.feed?.snapshot {
                    ScoreboardCard(snapshot: snapshot)
                } else {
                    TigerCard {
                        Image(systemName: "sportscourt")
                            .font(.largeTitle)
                            .foregroundStyle(Color.tigerOrange)
                        Text("No active game right now")
                            .font(.title3.bold())
                        Text("The live scoreboard appears automatically when Press Row reports an active game.")
                            .font(.subheadline)
                            .foregroundStyle(.gray)
                    }
                }
                if let checked = store.lastScoreCheck {
                    Text("Last checked \(checked.formatted(date: .omitted, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.gray)
                }
                NavigationLink {
                    WebPageView(title: "Live Scores Website", url: AppConfig.page("/live-scores.html"))
                } label: {
                    Label("Open full scoreboard page", systemImage: "arrow.up.right.square")
                        .font(.subheadline.bold())
                }
                .foregroundStyle(Color.tigerOrange)
            }
            .padding(18)
        }
        .background(Color.tigerBlack)
        .navigationTitle("Scores")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshScores() }
    }
}

struct TeamsView: View {
    @ObservedObject var store: SportsStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                PageHeader(title: "Team Rosters", subtitle: "Liberty Center Tigers athletics")
                TigerCard {
                    if store.teams.isEmpty {
                        Text("Loading team directory…")
                            .foregroundStyle(.gray)
                    }
                    ForEach(store.teams) { team in
                        if team.hasRoster, let roster = team.rosterUrl {
                            NavigationLink {
                                WebPageView(title: team.name, url: AppConfig.page(roster))
                            } label: {
                                FeatureRow(title: team.name, subtitle: team.season.map(String.init) ?? "Current school year", icon: "sportscourt")
                            }
                            .buttonStyle(.plain)
                        } else {
                            HStack {
                                FeatureRow(title: team.name, subtitle: "Roster coming soon", icon: "sportscourt")
                            }
                            .opacity(0.6)
                        }
                        if team.id != store.teams.last?.id { Divider() }
                    }
                }
                NavigationLink {
                    WebPageView(title: "All Team Rosters", url: AppConfig.page("/team-rosters.html"))
                } label: {
                    Label("See all sports and rosters", systemImage: "list.bullet")
                        .font(.headline)
                }
                .foregroundStyle(Color.tigerOrange)
            }
            .padding(18)
        }
        .background(Color.tigerBlack)
        .navigationTitle("Teams")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await store.refreshTeams() }
    }
}

struct MoreView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                PageHeader(title: "More Tiger Sports", subtitle: "Stories, trivia, schedules and videos")
                TigerCard {
                    page("News & Events", "Football recaps and athletics stories", "newspaper.fill", "/athletic-news-events.html")
                    Divider()
                    page("Tiger Sports Trivia", "Records and daily trivia", "brain.head.profile", "/tiger-trivia.html")
                    Divider()
                    page("Athletics Calendar", "Upcoming Liberty Center events", "calendar", "/athletics-calendar.html")
                    Divider()
                    page("Members Area", "Exclusive member coverage", "lock.fill", "/members.html")
                }
                TigerCard {
                    Link(destination: AppConfig.videosURL) {
                        FeatureRow(title: "YouTube Videos", subtitle: "Highlights and game replays", icon: "play.rectangle.fill")
                    }
                    Divider()
                    Link(destination: AppConfig.baseURL) {
                        FeatureRow(title: "Tiger Sports Live Website", subtitle: "Open the full site", icon: "globe")
                    }
                }
                Text("Tiger Sports Live · Liberty Center, Ohio")
                    .font(.caption)
                    .foregroundStyle(.gray)
            }
            .padding(18)
        }
        .background(Color.tigerBlack)
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func page(_ title: String, _ subtitle: String, _ icon: String, _ path: String) -> some View {
        NavigationLink {
            WebPageView(title: title, url: AppConfig.page(path))
        } label: {
            FeatureRow(title: title, subtitle: subtitle, icon: icon)
        }
        .buttonStyle(.plain)
    }
}

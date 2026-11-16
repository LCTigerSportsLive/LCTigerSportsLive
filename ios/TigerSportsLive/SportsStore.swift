import Foundation
import Combine

@MainActor
final class SportsStore: ObservableObject {
    @Published private(set) var live: LiveBroadcast?
    @Published private(set) var scores: ScoreResponse?
    @Published private(set) var teams: [TigerTeam] = []
    @Published private(set) var lastError: String?
    @Published private(set) var lastScoreCheck: Date?

    private func request<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        var request = URLRequest(url: AppConfig.page(path))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200...299).contains(response.statusCode)
        else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func refreshLive() async {
        do {
            live = try await request("/api/live", as: LiveBroadcast.self)
            lastError = nil
        } catch {
            live = nil
            lastError = "Live broadcast status is temporarily unavailable."
        }
    }

    func refreshScores() async {
        do {
            scores = try await request("/api/v1/pressrow/gridiron", as: ScoreResponse.self)
            lastScoreCheck = Date()
        } catch {
            // Never show an old score as if it were live when the connection fails.
            scores = nil
            lastScoreCheck = Date()
        }
    }

    func refreshTeams() async {
        do {
            let directory = try await request("/api/v1/teams", as: TeamDirectory.self)
            teams = directory.teams
        } catch {
            // Existing directory remains available; website rosters can still be opened.
        }
    }

    func refreshAll() async {
        async let liveUpdate: Void = refreshLive()
        async let scoreUpdate: Void = refreshScores()
        async let teamUpdate: Void = refreshTeams()
        _ = await (liveUpdate, scoreUpdate, teamUpdate)
    }
}

import Foundation

struct LiveBroadcast: Decodable {
    let live: Bool?
    let videoId: String?
    let title: String?
    let status: String?

    var verifiedVideoID: String? {
        guard live == true, let videoId,
              videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil
        else { return nil }
        return videoId
    }
}

struct ScoreResponse: Decodable {
    let connected: Bool?
    let activeGame: Bool?
    let sport: String?
    let fetchedAt: String?
    let feed: GridironFeed?

    var isLive: Bool { connected == true && activeGame == true && sport == "football" }
}

struct GridironFeed: Decodable {
    let title: String?
    let snapshot: GameSnapshot?
    let updatedAt: Double?
}

struct GameSnapshot: Decodable {
    let homeTeam: ScoreTeam?
    let awayTeam: ScoreTeam?
    let homeScore: Int?
    let awayScore: Int?
    let quarter: Int?
    let gameTime: String?
    let downDistanceText: String?
    let yardLineDisplay: String?
}

struct ScoreTeam: Decodable {
    let name: String?
    let shortName: String?
}

struct TeamDirectory: Decodable {
    let teams: [TigerTeam]
}

struct TigerTeam: Decodable, Identifiable {
    let id: String
    let name: String
    let season: Int?
    let rosterUrl: String?
    let rosterStatus: String?

    var hasRoster: Bool { rosterStatus == "available" && rosterUrl != nil }
}

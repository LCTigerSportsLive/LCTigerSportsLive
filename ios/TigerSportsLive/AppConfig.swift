import Foundation
import SwiftUI

enum AppConfig {
    // The live Tiger Sports Live backend. Change here if the production domain moves.
    static let baseURL = URL(string: "https://lctigersportslive-live-production-fdef.up.railway.app")!
    static let channelURL = URL(string: "https://www.youtube.com/@LCTigerSportsLive")!
    static let watchURL = URL(string: "https://www.youtube.com/@LCTigerSportsLive/live")!
    static let videosURL = URL(string: "https://www.youtube.com/@LCTigerSportsLive/videos")!

    static func page(_ path: String) -> URL {
        URL(string: path, relativeTo: baseURL)!.absoluteURL
    }
}

extension Color {
    static let tigerOrange = Color(red: 1, green: 62.0 / 255, blue: 35.0 / 255)
    static let tigerBlack = Color(red: 5.0 / 255, green: 5.0 / 255, blue: 5.0 / 255)
    static let tigerPanel = Color(red: 22.0 / 255, green: 22.0 / 255, blue: 22.0 / 255)
}

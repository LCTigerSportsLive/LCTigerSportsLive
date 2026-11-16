import SwiftUI
import WebKit
import UIKit

struct WebPageView: View {
    let title: String
    let url: URL

    var body: some View {
        SiteWebView(url: url)
            .background(Color.tigerBlack)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}

struct SiteWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView(frame: .zero)
        view.navigationDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.02, green: 0.02, blue: 0.02, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            // Subframes (including embedded YouTube video) are handled by WebKit.
            if navigationAction.targetFrame?.isMainFrame == false {
                decisionHandler(.allow)
                return
            }
            if url.scheme == "about" || url.host == AppConfig.baseURL.host {
                decisionHandler(.allow)
                return
            }
            if url.scheme == "https" || url.scheme == "http" {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }
}

struct YouTubeEmbedView: UIViewRepresentable {
    let videoID: String

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.loadHTMLString(html, baseURL: URL(string: "https://www.youtube-nocookie.com"))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {}

    private var html: String {
        """
        <!doctype html><html><head>
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <style>html,body{margin:0;background:#000;height:100%;overflow:hidden}
        iframe{border:0;width:100%;height:100%}</style>
        </head><body><iframe
        src="https://www.youtube-nocookie.com/embed/\(videoID)?playsinline=1&rel=0"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen title="Tiger Sports Live broadcast"></iframe></body></html>
        """
    }
}

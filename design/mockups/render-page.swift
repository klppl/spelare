// Renders an HTML page to a PNG with WebKit, at twice its size (Retina):
//   swift render-page.swift page.html out.png width height
// The page may load files from the repository, so mockups can use the
// extension's real CSS.
import AppKit
import WebKit

let args = CommandLine.arguments
let page = URL(fileURLWithPath: args[1])
let output = URL(fileURLWithPath: args[2])
let width = CGFloat(Double(args[3])!)
let height = CGFloat(Double(args[4])!)
let root = page.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

final class Renderer: NSObject, WKNavigationDelegate {
    let view: WKWebView

    override init() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: height),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        view = WKWebView(frame: window.contentView!.bounds)
        // Light, as on a Mac in light mode, whatever this Mac is set to.
        view.appearance = NSAppearance(named: .aqua)
        window.contentView!.addSubview(view)
        super.init()
        view.navigationDelegate = self
        view.loadFileURL(page, allowingReadAccessTo: root)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Fonts and SVG images settle a moment after the load event.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            let config = WKSnapshotConfiguration()
            config.rect = NSRect(x: 0, y: 0, width: width, height: height)
            // In points: on a Retina screen the image comes out at twice this.
            config.snapshotWidth = NSNumber(value: Double(width))
            webView.takeSnapshot(with: config) { image, error in
                guard let image, let tiff = image.tiffRepresentation,
                      let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:])
                else { fatalError("snapshot failed: \(String(describing: error))") }
                try! png.write(to: output)
                exit(0)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fatalError("load failed: \(error)")
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer = Renderer()
app.run()

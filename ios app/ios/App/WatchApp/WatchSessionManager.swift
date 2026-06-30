import Foundation
import WatchConnectivity
import Combine

public class WatchSessionManager: NSObject, WCSessionDelegate, ObservableObject {
    public static let shared = WatchSessionManager()
    
    @Published public var messages: [[String: Any]] = []
    @Published public var currentStatus: String = "online"
    
    private var session: WCSession?
    
    private override init() {
        super.init()
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            session?.activate()
            print("WatchSessionManager: WCSession activated")
        }
    }
    
    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        print("WatchSessionManager: WCSession activation state \(activationState.rawValue)")
    }
    
    public func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        DispatchQueue.main.async {
            self.handleIncomingData(message)
        }
    }
    
    public func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
        DispatchQueue.main.async {
            self.handleIncomingData(applicationContext)
        }
    }
    
    private func handleIncomingData(_ data: [String: Any]) {
        if let type = data["type"] as? String, let payload = data["payload"] as? [String: Any] {
            if type == "presence" {
                if let status = payload["status"] as? String {
                    self.currentStatus = status
                }
            } else if type == "message" {
                self.messages.append(payload)
                if self.messages.count > 30 {
                    self.messages.removeFirst()
                }
            }
        }
    }
    
    public func updateStatusOnPhone(status: String) {
        guard let session = session else { return }
        if session.isReachable {
            session.sendMessage(["type": "status_change", "status": status], replyHandler: nil) { error in
                print("WatchSessionManager: Send status failed: \(error.localizedDescription)")
            }
        } else {
            // Also try fallback application context update
            do {
                try session.updateApplicationContext(["type": "status_change", "status": status])
            } catch {
                print("WatchSessionManager: App context update status failed: \(error.localizedDescription)")
            }
        }
    }
}

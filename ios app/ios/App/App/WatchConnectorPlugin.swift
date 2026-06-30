import Foundation
import Capacitor
import WatchConnectivity

@objc(WatchConnectorPlugin)
public class WatchConnectorPlugin: CAPPlugin, WCSessionDelegate {
    private var session: WCSession?

    override public func load() {
        super.load()
        if WCSession.isSupported() {
            session = WCSession.default
            session?.delegate = self
            session?.activate()
            print("WatchConnectorPlugin: WCSession activated")
        } else {
            print("WatchConnectorPlugin: WCSession not supported on this device")
        }
    }

    @objc func sendToWatch(_ call: CAPPluginCall) {
        guard let data = call.getObject("data") else {
            call.reject("Missing 'data' object in parameters")
            return
        }

        guard let session = session else {
            call.reject("WCSession not initialized")
            return
        }

        if session.isReachable {
            session.sendMessage(data, replyHandler: nil) { error in
                call.reject("Send to watch failed: \(error.localizedDescription)")
            }
            call.resolve()
        } else {
            // Context fall-back if watch is not reachable right now (e.g. background sync)
            do {
                try session.updateApplicationContext(data)
                call.resolve()
            } catch {
                call.reject("Watch not reachable and failed to update application context: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - WCSessionDelegate Methods

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error = error {
            print("WatchConnectorPlugin: WCSession activation failed: \(error.localizedDescription)")
        } else {
            print("WatchConnectorPlugin: WCSession activation completed with state: \(activationState.rawValue)")
        }
    }

    #if os(iOS)
    public func sessionDidBecomeInactive(_ session: WCSession) {
        print("WatchConnectorPlugin: WCSession became inactive")
    }

    public func sessionDidDeactivate(_ session: WCSession) {
        print("WatchConnectorPlugin: WCSession deactivated, reactivating...")
        self.session?.activate()
    }
    #endif
    
    // Receive messages from watch (e.g. status changes, quick replies)
    public func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        print("WatchConnectorPlugin: Received message from Watch: \(message)")
        self.notifyListeners("watchMessageReceived", data: message)
    }
}

import SwiftUI

struct WatchContentView: View {
    @ObservedObject var sessionManager = WatchSessionManager.shared
    @State private var showingStatusSheet = false
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    // Header Status card
                    Button(action: { showingStatusSheet = true }) {
                        HStack(spacing: 8) {
                            Circle()
                                .fill(statusColor(sessionManager.currentStatus))
                                .frame(width: 10, height: 10)
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Online-Status")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.gray)
                                Text(statusLabel(sessionManager.currentStatus))
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.purple)
                        }
                        .padding(10)
                        .background(Color.white.opacity(0.06))
                        .cornerRadius(12)
                    }
                    .buttonStyle(.plain)
                    
                    // Messages Feed
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Softspace Chats")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.purple)
                            .padding(.leading, 4)
                        
                        if sessionManager.messages.isEmpty {
                            VStack(spacing: 6) {
                                Image(systemName: "bubble.left.and.bubble.right.fill")
                                    .font(.system(size: 22))
                                    .foregroundColor(.purple.opacity(0.6))
                                Text("Keine Nachrichten")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(.gray)
                                Text("Nachrichten vom iPhone werden hier angezeigt.")
                                    .font(.system(size: 9))
                                    .foregroundColor(.gray.opacity(0.7))
                                    .multilineTextAlignment(.center)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Color.white.opacity(0.03))
                            .cornerRadius(12)
                        } else {
                            ForEach(sessionManager.messages.indices, id: \.self) { index in
                                let msg = sessionManager.messages[index]
                                let sender = msg["sender"] as? String ?? "Unbekannt"
                                let content = msg["content"] as? String ?? ""
                                
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(sender)
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(.teal)
                                        Spacer()
                                        Text("Jetzt")
                                            .font(.system(size: 8))
                                            .foregroundColor(.gray)
                                    }
                                    
                                    Text(content)
                                        .font(.system(size: 13))
                                        .foregroundColor(.white)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .padding(8)
                                .background(Color.white.opacity(0.06))
                                .cornerRadius(10)
                            }
                        }
                    }
                }
                .padding(.horizontal, 4)
            }
            .navigationTitle("Softspace")
            .sheet(isPresented: $showingStatusSheet) {
                StatusPickerView(isPresented: $showingStatusSheet, currentStatus: $sessionManager.currentStatus) { newStatus in
                    sessionManager.updateStatusOnPhone(status: newStatus)
                }
            }
        }
    }
    
    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "online": return .green
        case "idle": return .orange
        case "dnd": return .red
        default: return .gray
        }
    }
    
    private func statusLabel(_ status: String) -> String {
        switch status.lowercased() {
        case "online": return "Online"
        case "idle": return "Abwesend"
        case "dnd": return "Bitte nicht stören"
        default: return "Offline"
        }
    }
}

struct StatusPickerView: View {
    @Binding var isPresented: Bool
    @Binding var currentStatus: String
    var onSelect: (String) -> Void
    
    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Status ändern")
                    .font(.system(size: 13, weight: .bold))
                    .padding(.bottom, 4)
                
                statusButton(name: "Online", key: "online", color: .green)
                statusButton(name: "Abwesend", key: "idle", color: .orange)
                statusButton(name: "Bitte nicht stören", key: "dnd", color: .red)
                statusButton(name: "Unsichtbar", key: "offline", color: .gray)
            }
            .padding(.horizontal, 4)
        }
    }
    
    private func statusButton(name: String, key: String, color: Color) -> some View {
        Button(action: {
            currentStatus = key
            onSelect(key)
            isPresented = false
        }) {
            HStack {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                if currentStatus.lowercased() == key {
                    Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.purple)
                }
            }
            .padding(10)
            .background(Color.white.opacity(0.06))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}
#Preview {
    WatchContentView()
}

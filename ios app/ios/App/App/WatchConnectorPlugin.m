#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchConnectorPlugin, "WatchConnector",
           CAP_PLUGIN_METHOD(sendToWatch, CAPPluginReturnPromise);
)

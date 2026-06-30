#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchConnectorPlugin, "WatchConnector",
           CAP_PLUGIN_METHOD(sendToWatch, CAP_PROVIDER_DELAY_NONE);
)

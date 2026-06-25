import admin from 'firebase-admin';
import prisma from './prisma.js';
import fs from 'fs';
import path from 'path';

let fcmInitialized = false;

try {
  let serviceAccount = null;

  if (process.env.FCM_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON);
  } else {
    // Look for fcm-credentials.json in the server root
    const credentialPath = path.resolve(process.cwd(), 'fcm-credentials.json');
    if (fs.existsSync(credentialPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    }
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    fcmInitialized = true;
    console.log('[FCM] Firebase Admin SDK initialized successfully for Push Notifications.');
  } else {
    console.warn('[FCM] No Firebase credentials found (FCM_SERVICE_ACCOUNT_JSON env var or fcm-credentials.json file). Push notifications will log but not send.');
  }
} catch (error) {
  console.error('[FCM] Failed to initialize Firebase Admin SDK:', error.message);
}

export async function sendPushNotification(userIds, { title, body, data }) {
  if (!userIds || userIds.length === 0) return;

  try {
    // Get all registered push tokens for the target users
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true, userId: true },
    });

    if (tokens.length === 0) {
      console.log(`[FCM] No registered push tokens found for users: ${userIds.join(', ')}`);
      return;
    }

    const registrationTokens = tokens.map((t) => t.token);

    if (!fcmInitialized) {
      console.log(`[FCM-Mock] Firebase not initialized. Would send push notification:
        Target Users: ${userIds.join(', ')}
        Tokens: ${registrationTokens.join(', ')}
        Title: ${title}
        Body: ${body}
        Data: ${JSON.stringify(data || {})}`);
      return;
    }

    // FCM sendEachForMulticast payload
    const payload = {
      notification: { title, body },
      data: data ? Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])
      ) : {},
      tokens: registrationTokens,
    };

    console.log(`[FCM] Sending push notification to ${registrationTokens.length} devices...`);
    const response = await admin.messaging().sendEachForMulticast(payload);
    console.log(`[FCM] Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);

    // Clean up invalid/expired tokens returned by FCM
    if (response.failureCount > 0) {
      const tokensToDelete = [];
      response.responses.forEach((res, index) => {
        if (!res.success) {
          const errorCode = res.error?.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            tokensToDelete.push(registrationTokens[index]);
          }
        }
      });

      if (tokensToDelete.length > 0) {
        console.log(`[FCM] Cleaning up ${tokensToDelete.length} stale/invalid tokens...`);
        await prisma.pushToken.deleteMany({
          where: { token: { in: tokensToDelete } },
        });
      }
    }
  } catch (error) {
    console.error('[FCM] Error sending push notification:', error.message);
  }
}

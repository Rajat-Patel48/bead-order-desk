import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Ask for notification permission and send this phone's push token to the server.
 * Needs a development or store build with an EAS projectId (app.json -> extra.eas.projectId).
 * Silently does nothing on web, simulators, or if the person says no.
 */
export async function registerForPush() {
  try {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Orders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId || (Constants as any).easConfig?.projectId;
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api('/me/push-token', { method: 'PUT', body: { token: data } });
  } catch (e) {
    console.warn('push registration skipped', e);
  }
}

/** Tapping a notification opens that order. */
export function listenForNotificationTaps() {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const id = (resp.notification.request.content.data as any)?.orderId;
    if (typeof id === 'string') router.push(`/order/${id}`);
  });
  return () => sub.remove();
}

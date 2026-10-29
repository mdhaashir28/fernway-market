import { Alert, Platform } from 'react-native';

/**
 * Asks a yes/no question. Resolves to true if the user confirms.
 * (Alert.alert doesn't work in web browsers, so the web preview uses window.confirm.)
 * Pass already-translated texts.
 */
export function confirm(title: string, message: string, confirmLabel = 'OK', destructive = false, cancelLabel = 'Cancel'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

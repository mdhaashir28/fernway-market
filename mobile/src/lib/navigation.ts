import { router } from 'expo-router';

/** Goes back a screen, or to the home screen if there's nothing to go back to. */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

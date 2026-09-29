import { env } from '../config/env';

export interface PushPayload {
  title: string;
  body?: string;
  data?: Record<string, string>;
}

export interface PushProvider {
  name: string;
  /** Deliver a push to the given device tokens. Never throws for transport issues. */
  send(userId: string, tokens: string[], payload: PushPayload): Promise<void>;
}

/** Default provider: does nothing, honestly. Used when no push keys are configured. */
export class NoopPushProvider implements PushProvider {
  name = 'noop';
  async send(_userId: string, _tokens: string[], _payload: PushPayload): Promise<void> {
    // intentionally no-op — no push credentials configured
  }
}

/**
 * Resolve the push provider. FCM/APNs wiring only activates when
 * PUSH_PROVIDER is set AND credentials exist; otherwise Noop.
 */
export function getPushProvider(): PushProvider {
  const configured =
    env.PUSH_PROVIDER !== 'noop' && (env.FCM_SERVER_KEY !== '' || env.APNS_KEY_ID !== '');
  if (configured) {
    // Real FCM/APNs transports are not bundled in this build; surface as noop
    // rather than pretending to deliver.
    // eslint-disable-next-line no-console
    console.warn('[push] provider requested but native transports are not bundled; using noop');
  }
  return new NoopPushProvider();
}

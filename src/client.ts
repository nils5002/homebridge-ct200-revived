import { EasyControlClient } from 'bosch-xmpp';
import { processResponse, globalLogger } from './platform';

type CT200Credentials = {
    serialNumber: number;
    accessKey: string;
    password: string;
};

let XMPP_CLIENT: EasyControlClient | undefined;
let CT200_CREDENTIALS: CT200Credentials | undefined;
let CONNECTING_PROMISE: Promise<void> | undefined;
let OPERATION_QUEUE: Promise<unknown> = Promise.resolve();
let LAST_RECONNECT_AT = 0;

const RETRY_DELAY_SECONDS = 30;
const RECONNECT_COOLDOWN_MS = 15000;

function delay(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1000 * seconds));
}

function delayMs(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function connectAPI(serialNumber: number, accessKey: string, password: string) {
    CT200_CREDENTIALS = { serialNumber: serialNumber, accessKey: accessKey, password: password };

    // Retry forever instead of exiting; the Bosch backend is regularly
    // unreachable for short periods and a failed connect must not kill
    // the (child) bridge. The client caches a rejected connect() promise,
    // so a fresh instance is needed on every attempt.
    for (;;) {
        try {
            await buildClient();
            break;
        } catch (e) {
            globalLogger.error('Failed to connect client, retrying in ' + RETRY_DELAY_SECONDS + 's: ' + e);
            await delay(RETRY_DELAY_SECONDS);
        }
    }
}

async function buildClient(): Promise<void> {
    if (!CT200_CREDENTIALS) {
        throw new Error('CT200 credentials missing');
    }

    const client = EasyControlClient({
        serialNumber: CT200_CREDENTIALS.serialNumber,
        accessKey: CT200_CREDENTIALS.accessKey,
        password: CT200_CREDENTIALS.password,
    });

    attachClientHandlers(client);
    await client.connect();

    // bosch-xmpp 2.x stops @xmpp/client's auto-reconnect before the first
    // connect and never re-enables it, so a dropped connection would leave
    // the client offline forever.
    if (client.client && client.client.reconnect) {
        client.client.reconnect.start();
    }

    XMPP_CLIENT = client;
}

function attachClientHandlers(client: EasyControlClient): void {
    // bosch-xmpp keeps no 'error' listener on the XMPP client once the
    // connection is established. Without a persistent listener, any later
    // socket/stream error is an unhandled 'error' event and crashes the process.
    client.on('error', (e: Error) => {
        globalLogger.error('XMPP client error: ' + (e && e.message ? e.message : e));
        if (client === XMPP_CLIENT && shouldReconnect(e)) {
            reconnectClient('async XMPP error: ' + getErrorMessage(e)).catch(error => {
                globalLogger.error('CT200 reconnect failed: ' + getErrorMessage(error));
            });
        }
    });

    // Responses are routed by comparing against the full JID, whose resource
    // changes on reconnect; keep it current or every request would time out.
    client.on('online', (jid) => {
        client.jid = jid.toString();
        globalLogger.info('XMPP client connected');
    });
    client.on('disconnect', () => {
        globalLogger.warn('XMPP client disconnected, waiting for automatic reconnect');
    });
}

async function reconnectClient(reason: string): Promise<void> {
    if (!CT200_CREDENTIALS) {
        return;
    }

    if (!CONNECTING_PROMISE) {
        CONNECTING_PROMISE = (async () => {
            const sinceLastReconnect = Date.now() - LAST_RECONNECT_AT;
            if (sinceLastReconnect < RECONNECT_COOLDOWN_MS) {
                await delayMs(RECONNECT_COOLDOWN_MS - sinceLastReconnect);
            }

            LAST_RECONNECT_AT = Date.now();
            globalLogger.warn('Rebuilding CT200 XMPP client after ' + reason);
            await stopClient(XMPP_CLIENT);
            XMPP_CLIENT = undefined;

            for (;;) {
                try {
                    await buildClient();
                    return;
                } catch (e) {
                    globalLogger.error('Failed to rebuild CT200 XMPP client, retrying in '
                        + RETRY_DELAY_SECONDS + 's: ' + getErrorMessage(e));
                    await delay(RETRY_DELAY_SECONDS);
                }
            }
        })().finally(() => {
            CONNECTING_PROMISE = undefined;
        });
    }

    return CONNECTING_PROMISE;
}

async function stopClient(client: EasyControlClient | undefined): Promise<void> {
    if (!client) {
        return;
    }

    try {
        if (client.client && client.client.reconnect) {
            client.client.reconnect.stop();
        }
    } catch (e) {
        globalLogger.debug('Failed to stop XMPP reconnect helper: ' + getErrorMessage(e));
    }

    try {
        if (typeof client.end === 'function') {
            await client.end();
        } else if (client.client && typeof client.client.stop === 'function') {
            await client.client.stop();
        }
    } catch (e) {
        globalLogger.debug('Failed to stop old XMPP client cleanly: ' + getErrorMessage(e));
    }
}

function shouldReconnect(error: unknown): boolean {
    const message = getErrorMessage(error).toLowerCase();
    return message.includes('max_retries_reached')
        || message.includes('request_timeout')
        || message.includes('etimedout')
        || message.includes('stream was destroyed')
        || message.includes('econnreset')
        || message.includes('epipe')
        || message.includes('not connected')
        || message.includes('connection closed');
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message || String(error);
    }
    return String(error);
}

async function withClientOperation<T>(
    action: string,
    endpoint: string,
    operation: (client: EasyControlClient) => Promise<T>,
): Promise<T | undefined> {
    const run = async (): Promise<T | undefined> => {
        try {
            if (CONNECTING_PROMISE) {
                await CONNECTING_PROMISE;
            }

            if (!XMPP_CLIENT) {
                await reconnectClient('missing XMPP client before ' + action + ' ' + endpoint);
            }

            if (!XMPP_CLIENT) {
                return undefined;
            }

            return await operation(XMPP_CLIENT);
        } catch (e) {
            if (e instanceof Error) {
                checkError(e);
                if (shouldReconnect(e)) {
                    try {
                        await reconnectClient(action + ' ' + endpoint + ': ' + getErrorMessage(e));
                    } catch (reconnectError) {
                        globalLogger.error('CT200 reconnect failed: ' + getErrorMessage(reconnectError));
                    }
                }
            }
            return undefined;
        }
    };

    OPERATION_QUEUE = OPERATION_QUEUE.then(run, run);
    return OPERATION_QUEUE as Promise<T | undefined>;
}

export async function getEndpoint(endpoint: string) {
    return withClientOperation('GET', endpoint, async client => {
        const response = await client.get(endpoint);
        processResponse(response);
        return response;
    });
}

export async function setEndpoint(endpoint: string, value: string) {
    const command: string = '{"value":' + value + '}';
    globalLogger.debug('Setting', endpoint, 'to', command);

    return withClientOperation('PUT', endpoint, async client => {
        return await client.put(endpoint, command);
    });
}

function checkError(error: Error) {
    if (error instanceof SyntaxError) {
        globalLogger.error('SyntaxError encountered while sending request! Double-check login details!');
    } else if (error.message === 'HTTP_TOO_MANY_REQUESTS') {
        globalLogger.warn('Spawning too many requests!');
    } else {
        globalLogger.error((error.stack || error) as string);
    }
}

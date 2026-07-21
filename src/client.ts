import { EasyControlClient } from 'bosch-xmpp';
import { processResponse, globalLogger } from './platform';

let XMPP_CLIENT: EasyControlClient;

const RETRY_DELAY_SECONDS = 30;

function delay(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 1000 * seconds));
}

export async function connectAPI(serialNumber: number, accessKey: string, password: string) {
    // Retry forever instead of exiting; the Bosch backend is regularly
    // unreachable for short periods and a failed connect must not kill
    // the (child) bridge. The client caches a rejected connect() promise,
    // so a fresh instance is needed on every attempt.
    for (;;) {
        XMPP_CLIENT = EasyControlClient({ serialNumber: serialNumber, accessKey: accessKey, password: password });
        try {
            await XMPP_CLIENT.connect();
            break;
        } catch (e) {
            globalLogger.error('Failed to connect client, retrying in ' + RETRY_DELAY_SECONDS + 's: ' + e);
            await delay(RETRY_DELAY_SECONDS);
        }
    }

    // bosch-xmpp keeps no 'error' listener on the XMPP client once the
    // connection is established. Without a persistent listener, any later
    // socket/stream error is an unhandled 'error' event and crashes the process.
    XMPP_CLIENT.on('error', (e: Error) => {
        globalLogger.error('XMPP client error: ' + (e && e.message ? e.message : e));
    });

    // bosch-xmpp 2.x stops @xmpp/client's auto-reconnect before the first
    // connect and never re-enables it, so a dropped connection would leave
    // the client offline forever.
    if (XMPP_CLIENT.client && XMPP_CLIENT.client.reconnect) {
        XMPP_CLIENT.client.reconnect.start();
    }

    // Responses are routed by comparing against the full JID, whose resource
    // changes on reconnect; keep it current or every request would time out.
    XMPP_CLIENT.on('online', (jid) => {
        XMPP_CLIENT.jid = jid.toString();
        globalLogger.info('XMPP client connected');
    });
    XMPP_CLIENT.on('disconnect', () => {
        globalLogger.warn('XMPP client disconnected, waiting for automatic reconnect');
    });
}

export async function getEndpoint(endpoint: string) {
    try {
        processResponse(await XMPP_CLIENT.get(endpoint));
    } catch(e) {
        if (e instanceof Error) {
            checkError(e);
        }
    }
}

export async function setEndpoint(endpoint: string, value: string) {
    const command: string = '{"value":' + value + '}';
    globalLogger.debug('Setting', endpoint, 'to', command);

    try {
        return await XMPP_CLIENT.put(endpoint, command);
    } catch (e) {
        if (e instanceof Error) {
            checkError(e);
        }
    }
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

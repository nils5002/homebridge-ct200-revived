# Homebridge CT200 Revived

## Homebridge plugin for Bosch Easycontrol CT200

This is a maintained fork of [homebridge-ct200](https://github.com/lynxcs/homebridge-ct200) by Domas Kalinauskas, which was archived in September 2025. All credit for the original implementation goes to the original author.

### What this fork fixes
- **Works on current Node.js (v20/v22/v24)**: the plugin now uses bosch-xmpp 2.x built on the modern, maintained [@xmpp/client](https://github.com/xmppjs/xmpp.js) stack. The old node-xmpp-client stack crashed on recent Node versions with `TypeError ... at encode64` and took the (child) bridge down with it (`Child bridge ended (code 1)`).
- **Homebridge 2.0 support**.
- **No more crash loops**: connection failures are retried every 30 seconds instead of exiting the process.
- **Survives connection drops**: automatic reconnect is re-enabled after login and responses are routed correctly after a reconnect.

### Migrating from homebridge-ct200
Uninstall `homebridge-ct200`, install `homebridge-ct200-revived`. Your existing `config.json` platform block keeps working unchanged (the platform name is still `CT200`). Accessories are re-created under the new plugin; if you had them assigned to rooms/automations in the Home app you may need to reassign them once.

### Introduction
This homebridge plugin exposes CT200 status allowing for heater control

**Note:** The thermostat accessory in Home app shows a single button to change the control mode. On is the same as 'Auto' mode in the bosch EasyControl App. Off is the same as 'manual'.

Changing the temperature when set on 'Auto', only changes the setpoint until the next defined setpoint is reached.

### Compatibility
While I haven't tested this for myself, the plugin apparently also works with the Buderus TC100 v2 as well as bosch radiator valves, and probably other smart thermostats that make use of boschs' EasyControl API.

### Installation
To install homebridge ct200 revived:
- Install the plugin through Homebridge Config UI X (search for `ct200`) or manually by:
```
$ sudo npm -g i homebridge-ct200-revived
```
- Configure within Homebridge Config UI X or edit `config.json` manually e.g:
```
"platforms": [
    {
        "access": "ACCESS_KEY",
        "serial": "SERIAL_KEY",
        "password": "PASSWORD",
        "zones": [
            {
                "index": 1,
                "name": "NAME1"
            },
            {
                "index": 2,
                "name": "NAME2"
            }
        ],
        "platform": "CT200"
    }
]
```
#### Configuration settings
- `access` is the access key (found in bosch EasyControl app)
- `serial` is the serial key (found in bosch EasyControl app)
- `password` is the password used to login.
For each device you want to control, add a zone, where:
- `index` is the zone id (from 1 to X)
- `name` is what will show up in the Home app.

##### Optional settings
- `away` if set to false, removes the `Away` mode switch. (default: true)
- `zoneInterval` how often to query all zones (in minutes, default: 2)
- `auxInterval` how often to refresh humidity and localization (in minutes, default: 5)

#### Troubleshooting
List of problems you might encounter and how to fix them
- **"SyntaxError ... Double-check login details!"** If you encounter this error, then most likely you are using the wrong password. You need to set and use the password that is in 'Settings' -> 'Personal' -> 'Change Password', not the BOSCH ID password. More details [here](https://github.com/lynxcs/homebridge-ct200/issues/22).

#### Getting help
If you need help troubleshooting, [create an issue](https://github.com/nils5002/homebridge-ct200-revived/issues) and I'll try to help you fix it.

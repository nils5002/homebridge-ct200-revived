# Release Notes

## 2.3.5 - Stable CT200 XMPP Handling

This release focuses on making CT200 updates more reliable in Homebridge and Apple Home.

### Highlights

- Bosch XMPP calls are now processed one at a time to avoid overloading the CT200/Bosch backend.
- If the XMPP stream becomes unhealthy, the plugin rebuilds the client instead of continuing to write to a broken stream.
- HomeKit reads now use cached values, so opening the Home app no longer creates extra live Bosch requests.
- Cached accessory values are refreshed at a controlled interval for humidity, localization, away mode, target temperatures, and zone modes.

### Recommended Config

For most installations, these refresh intervals are a good stability baseline:

```json
{
  "zoneInterval": 5,
  "auxInterval": 15
}
```

### Notes

- The TLS warning from `bosch-xmpp` is expected because Bosch XMPP uses self-signed certificates.
- If values still stop updating after this release, power-cycling the CT200 once can clear a stuck thermostat-side session.
- If repeated timeouts continue after a CT200 power cycle, the likely bottleneck is the Bosch cloud/XMPP path or the CT200 device connection, not Homebridge itself.
